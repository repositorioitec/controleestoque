import os
import datetime
import psycopg2
from dotenv import load_dotenv

# Carregar variáveis de ambiente do arquivo .env (só tem efeito localmente)
load_dotenv()

def get_db_url():
    """Retorna a URL do banco de dados a partir de variáveis de ambiente."""
    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise ValueError(
            "Variável de ambiente DATABASE_URL não encontrada!\n"
            "Configure DATABASE_URL no painel do Render (ou no arquivo .env para uso local).\n"
            "Exemplo: postgresql://postgres:SENHA@db.projeto.supabase.co:5432/postgres"
        )
    return url.strip()

def get_db_connection():
    """Retorna uma conexão ativa com o banco PostgreSQL."""
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    return conn

def init_db():
    """Inicializa tabelas e dados padrões caso não existam no Supabase."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Tabela de Unidades Operacionais
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_unidades_operacionais (
                id_unidade SERIAL PRIMARY KEY,
                nome_unidade VARCHAR(150) NOT NULL UNIQUE,
                endereco VARCHAR(255),
                cnpj VARCHAR(30)
            );
        """)

        # 2. Tabela de Usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_usuarios (
                id_usuario SERIAL PRIMARY KEY,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                senha VARCHAR(100) NOT NULL,
                nome_usuario VARCHAR(100) NOT NULL,
                nivel_acesso VARCHAR(30) DEFAULT 'Operador',
                id_unidade INT REFERENCES tbl_unidades_operacionais(id_unidade) ON DELETE SET NULL,
                status_aprovacao VARCHAR(20) DEFAULT 'Pendente'
            );
        """)

        # 3. Tabela de Categorias
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_categorias (
                id_categoria SERIAL PRIMARY KEY,
                nome_categoria VARCHAR(100) NOT NULL UNIQUE
            );
        """)

        # 4. Tabela de Fornecedores
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_fornecedores (
                id_fornecedor SERIAL PRIMARY KEY,
                nome_fornecedor VARCHAR(150) NOT NULL,
                cnpj_cpf VARCHAR(20),
                telefone VARCHAR(20),
                email VARCHAR(100)
            );
        """)

        # 5. Tabela de Produtos
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_produtos (
                id_produto SERIAL PRIMARY KEY,
                codigo_barras VARCHAR(50),
                nome_produto VARCHAR(150) NOT NULL,
                id_categoria INT REFERENCES tbl_categorias(id_categoria) ON DELETE SET NULL,
                id_fornecedor INT REFERENCES tbl_fornecedores(id_fornecedor) ON DELETE SET NULL,
                id_unidade INT REFERENCES tbl_unidades_operacionais(id_unidade) ON DELETE SET NULL,
                estoque_minimo INT DEFAULT 5,
                preco_custo NUMERIC(12, 2) DEFAULT 0.00,
                preco_venda NUMERIC(12, 2) DEFAULT 0.00,
                data_cadastro TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 6. Tabela de Movimentações
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_movimentacoes (
                id_movimentacao SERIAL PRIMARY KEY,
                id_produto INT NOT NULL REFERENCES tbl_produtos(id_produto) ON DELETE CASCADE,
                tipo_movimentacao VARCHAR(10) NOT NULL,
                quantidade INT NOT NULL,
                valor_unitario NUMERIC(12, 2) DEFAULT 0.00,
                data_movimentacao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                observacao TEXT,
                id_unidade INT REFERENCES tbl_unidades_operacionais(id_unidade) ON DELETE SET NULL,
                id_fornecedor INT REFERENCES tbl_fornecedores(id_fornecedor) ON DELETE SET NULL
            );
        """)

        # Migração de esquema: garantir que id_fornecedor exista em tbl_movimentacoes
        cursor.execute("""
            ALTER TABLE tbl_movimentacoes 
            ADD COLUMN IF NOT EXISTS id_fornecedor INT REFERENCES tbl_fornecedores(id_fornecedor) ON DELETE SET NULL;
        """)

        # --- SEED DE DADOS PADRÕES ---

        # 1. Unidade Operacional Matriz
        cursor.execute("SELECT COUNT(*) FROM tbl_unidades_operacionais")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO tbl_unidades_operacionais (nome_unidade, endereco, cnpj)
                VALUES (%s, %s, %s)
                ON CONFLICT (nome_unidade) DO NOTHING
            """, ('Unidade Matriz', 'Av. Principal, 1000 - Centro', '00.000.000/0001-00'))
            print("[SUPABASE DB] Unidade Matriz criada.")

        # Buscar ID da unidade matriz
        cursor.execute("SELECT id_unidade FROM tbl_unidades_operacionais ORDER BY id_unidade ASC LIMIT 1")
        row_unid = cursor.fetchone()
        id_unid_matriz = row_unid[0] if row_unid else 1

        # 2. Usuário Admin
        cursor.execute("SELECT COUNT(*) FROM tbl_usuarios")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO tbl_usuarios (usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (usuario) DO NOTHING
            """, ('admin', 'admin123', 'Administrador do Sistema', 'Administrador', id_unid_matriz, 'Aprovado'))
            print("[SUPABASE DB] Usuário 'admin' criado.")

        # 3. Categorias Padrão
        cursor.execute("SELECT COUNT(*) FROM tbl_categorias")
        if cursor.fetchone()[0] == 0:
            for cat in ['Eletrônicos', 'Escritório', 'Informática']:
                cursor.execute("INSERT INTO tbl_categorias (nome_categoria) VALUES (%s) ON CONFLICT DO NOTHING", (cat,))
            print("[SUPABASE DB] Categorias padrão inseridas.")

        # 4. Fornecedor Padrão
        cursor.execute("SELECT COUNT(*) FROM tbl_fornecedores")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO tbl_fornecedores (nome_fornecedor, cnpj_cpf, telefone, email)
                VALUES (%s, %s, %s, %s)
            """, ('Tech Brasil LTDA', '12.345.678/0001-90', '(11) 98888-7777', 'contato@techbrasil.com'))
            print("[SUPABASE DB] Fornecedor padrão inserido.")

        # 5. Tentar migrar dados de bancos locais se houver
        migrar_dados_locais(cursor)

        cursor.close()
        conn.close()
        print("[DB] Banco de dados inicializado com sucesso.")
    except ValueError as ve:
        # Erro de configuração: relança para travar a inicialização e aparecer nos logs
        print(f"[DB CONFIG ERROR] {ve}")
        raise
    except Exception as e:
        # Erro de conexão: relança para aparecer nos logs do Render/Heroku
        print(f"[DB CONNECTION ERROR] Erro ao conectar/inicializar o banco: {e}")
        raise

def migrar_dados_locais(postgres_cursor):
    """Migra dados do arquivo SQLite local para o Supabase se os produtos estiverem vazios."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sqlite_path = os.path.join(base_dir, "ControleEstoque.db")
    
    postgres_cursor.execute("SELECT COUNT(*) FROM tbl_produtos")
    if postgres_cursor.fetchone()[0] > 0:
        return

    # Tentar do SQLite local primeiro
    if os.path.exists(sqlite_path):
        try:
            import sqlite3
            sq_conn = sqlite3.connect(sqlite_path)
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("""
                SELECT id_produto, codigo_barras, nome_produto, id_categoria, id_fornecedor, id_unidade, estoque_minimo, preco_custo, preco_venda, data_cadastro
                FROM tbl_Produtos
            """)
            prods = sq_cursor.fetchall()
            for p in prods:
                postgres_cursor.execute("""
                    INSERT INTO tbl_produtos (codigo_barras, nome_produto, id_categoria, id_fornecedor, id_unidade, estoque_minimo, preco_custo, preco_venda, data_cadastro)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (p[1], p[2], p[3], p[4], p[5], p[6] or 5, float(p[7] or 0), float(p[8] or 0), p[9]))
            if prods:
                print(f"[MIGRAÇÃO SQLITE] {len(prods)} produtos migrados para o Supabase.")
            sq_conn.close()
            return
        except Exception as e:
            print(f"[MIGRAÇÃO SQLITE WARNING] {e}")

# --- UNIDADES OPERACIONAIS ---

def listar_unidades():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id_unidade, nome_unidade, endereco, cnpj FROM tbl_unidades_operacionais ORDER BY nome_unidade ASC")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [
        {
            "id_unidade": r[0],
            "nome_unidade": r[1],
            "endereco": r[2] or "",
            "cnpj": r[3] or ""
        }
        for r in rows
    ]

def cadastrar_unidade(nome_unidade, endereco="", cnpj=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tbl_unidades_operacionais (nome_unidade, endereco, cnpj)
        VALUES (%s, %s, %s)
        ON CONFLICT (nome_unidade) DO NOTHING
    """, (nome_unidade, endereco, cnpj))
    cursor.close()
    conn.close()
    return True

def atualizar_unidade(id_unidade, nome_unidade, endereco="", cnpj=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE tbl_unidades_operacionais
        SET nome_unidade = %s, endereco = %s, cnpj = %s
        WHERE id_unidade = %s
    """, (nome_unidade, endereco, cnpj, id_unidade))
    cursor.close()
    conn.close()
    return True

def obter_unidade_por_id(id_unidade):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id_unidade, nome_unidade, endereco, cnpj FROM tbl_unidades_operacionais WHERE id_unidade = %s", (id_unidade,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if row:
        return {
            "id_unidade": row[0],
            "nome_unidade": row[1],
            "endereco": row[2] or "",
            "cnpj": row[3] or ""
        }
    return None

# --- AUTENTICAÇÃO E USUÁRIOS ---

def autenticar_usuario(usuario, senha):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id_usuario, u.usuario, u.senha, u.nome_usuario, u.nivel_acesso, u.id_unidade, u.status_aprovacao, un.nome_unidade
        FROM tbl_usuarios u
        LEFT JOIN tbl_unidades_operacionais un ON u.id_unidade = un.id_unidade
        WHERE u.usuario = %s AND u.senha = %s
    """, (usuario, senha))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if row:
        status = row[6] or "Aprovado"
        if status != "Aprovado":
            raise Exception("Sua conta aguarda aprovação do administrador.")
        
        return {
            "id_usuario": row[0],
            "usuario": row[1],
            "nome_usuario": row[3],
            "nivel_acesso": row[4],
            "id_unidade": row[5],
            "status_aprovacao": status,
            "nome_unidade": row[7] or "Não Atrelado"
        }
    return None

def cadastrar_usuario(usuario, senha, nome_usuario, nivel_acesso="Operador", id_unidade=None, status_aprovacao="Pendente"):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id_usuario FROM tbl_usuarios WHERE usuario = %s", (usuario,))
    if cursor.fetchone():
        cursor.close()
        conn.close()
        raise Exception("Nome de usuário já está em uso!")
        
    cursor.execute("""
        INSERT INTO tbl_usuarios (usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao))
    cursor.close()
    conn.close()
    return True

def listar_usuarios():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id_usuario, u.usuario, u.nome_usuario, u.nivel_acesso, u.status_aprovacao, u.id_unidade, un.nome_unidade
        FROM tbl_usuarios u
        LEFT JOIN tbl_unidades_operacionais un ON u.id_unidade = un.id_unidade
        ORDER BY u.nome_usuario ASC
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [
        {
            "id_usuario": r[0],
            "usuario": r[1],
            "nome_usuario": r[2],
            "nivel_acesso": r[3],
            "status_aprovacao": r[4] or "Aprovado",
            "id_unidade": r[5],
            "nome_unidade": r[6] or "Sem Unidade"
        }
        for r in rows
    ]

def aprovar_usuario(id_usuario, id_unidade, nivel_acesso="Operador"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE tbl_usuarios
        SET status_aprovacao = 'Aprovado', id_unidade = %s, nivel_acesso = %s
        WHERE id_usuario = %s
    """, (id_unidade, nivel_acesso, id_usuario))
    cursor.close()
    conn.close()
    return True

def atualizar_usuario(id_usuario, id_unidade, nivel_acesso="Operador"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE tbl_usuarios
        SET id_unidade = %s, nivel_acesso = %s
        WHERE id_usuario = %s
    """, (id_unidade, nivel_acesso, id_usuario))
    cursor.close()
    conn.close()
    return True

def rejeitar_usuario(id_usuario):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE tbl_usuarios
        SET status_aprovacao = 'Rejeitado'
        WHERE id_usuario = %s
    """, (id_usuario,))
    cursor.close()
    conn.close()
    return True

# --- CATEGORIAS E FORNECEDORES ---

def listar_categorias():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id_categoria, nome_categoria FROM tbl_categorias ORDER BY nome_categoria ASC")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [
        {"id_categoria": r[0], "nome_categoria": r[1]}
        for r in rows
    ]

def cadastrar_categoria(nome_categoria):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO tbl_categorias (nome_categoria) VALUES (%s) ON CONFLICT DO NOTHING", (nome_categoria,))
    cursor.close()
    conn.close()
    return True

def listar_fornecedores():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id_fornecedor, nome_fornecedor, cnpj_cpf, telefone, email FROM tbl_fornecedores ORDER BY nome_fornecedor ASC")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [
        {"id_fornecedor": r[0], "nome_fornecedor": r[1], "cnpj_cpf": r[2], "telefone": r[3], "email": r[4]}
        for r in rows
    ]

def cadastrar_fornecedor(nome, cnpj_cpf="", telefone="", email=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tbl_fornecedores (nome_fornecedor, cnpj_cpf, telefone, email)
        VALUES (%s, %s, %s, %s)
    """, (nome, cnpj_cpf, telefone, email))
    cursor.close()
    conn.close()
    return True

# --- PRODUTOS & SALDO DE ESTOQUE ---

def calcular_estoque_produto(id_produto, id_unidade=None, conn=None):
    """Calcula o saldo atual de estoque de um produto para uma unidade específica ou geral."""
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    cursor = conn.cursor()

    if id_unidade:
        sql = """
            SELECT 
                COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'ENTRADA' THEN quantidade ELSE 0 END), 0) AS total_entradas,
                COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'SAIDA' THEN quantidade ELSE 0 END), 0) AS total_saidas
            FROM tbl_movimentacoes
            WHERE id_produto = %s AND id_unidade = %s
        """
        cursor.execute(sql, (id_produto, id_unidade))
    else:
        sql = """
            SELECT 
                COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'ENTRADA' THEN quantidade ELSE 0 END), 0) AS total_entradas,
                COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'SAIDA' THEN quantidade ELSE 0 END), 0) AS total_saidas
            FROM tbl_movimentacoes
            WHERE id_produto = %s
        """
        cursor.execute(sql, (id_produto,))
    
    row = cursor.fetchone()
    total_entradas = row[0] if row and row[0] is not None else 0
    total_saidas = row[1] if row and row[1] is not None else 0
    estoque_atual = total_entradas - total_saidas

    cursor.close()
    if close_conn:
        conn.close()
        
    return estoque_atual

def obter_ultimo_custo_produto(id_produto, conn=None):
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    cursor = conn.cursor()
    cursor.execute("""
        SELECT valor_unitario
        FROM tbl_movimentacoes
        WHERE id_produto = %s AND UPPER(tipo_movimentacao) = 'ENTRADA' AND valor_unitario > 0
        ORDER BY data_movimentacao DESC, id_movimentacao DESC
        LIMIT 1
    """, (id_produto,))

    row = cursor.fetchone()
    val = float(row[0]) if row and row[0] is not None else 0.0

    cursor.close()
    if close_conn:
        conn.close()

    return val

def listar_produtos(filtro_busca="", id_categoria=None, id_unidade=None):
    conn = get_db_connection()
    cursor = conn.cursor()

    sql = """
        SELECT p.id_produto, p.codigo_barras, p.nome_produto, p.id_categoria, c.nome_categoria,
               p.estoque_minimo, p.preco_custo, p.preco_venda, p.data_cadastro,
               p.id_unidade, u.nome_unidade
        FROM tbl_produtos p
        LEFT JOIN tbl_categorias c ON p.id_categoria = c.id_categoria
        LEFT JOIN tbl_unidades_operacionais u ON p.id_unidade = u.id_unidade
        WHERE 1=1
    """
    params = []

    if filtro_busca:
        sql += " AND (p.nome_produto ILIKE %s OR p.codigo_barras ILIKE %s)"
        params.extend([f"%{filtro_busca}%", f"%{filtro_busca}%"])
        
    if id_categoria:
        sql += " AND p.id_categoria = %s"
        params.append(id_categoria)

    if id_unidade:
        sql += " AND (p.id_unidade = %s OR p.id_unidade IS NULL)"
        params.append(id_unidade)

    sql += " ORDER BY p.nome_produto ASC"
    cursor.execute(sql, params)
    rows = cursor.fetchall()

    produtos = []
    for r in rows:
        prod_id = r[0]
        estoque_atual = calcular_estoque_produto(prod_id, id_unidade=id_unidade, conn=conn)
        estoque_min = r[5] if r[5] is not None else 0
        preco_custo = float(r[6]) if r[6] else 0.0
        preco_venda = float(r[7]) if r[7] else 0.0

        status = "Normal"
        if estoque_atual <= 0:
            status = "Zerado"
        elif estoque_atual <= estoque_min:
            status = "Baixo"

        produtos.append({
            "id_produto": prod_id,
            "codigo_barras": r[1] or "",
            "nome_produto": r[2],
            "id_categoria": r[3],
            "nome_categoria": r[4] or "Sem Categoria",
            "estoque_minimo": estoque_min,
            "preco_custo": preco_custo,
            "preco_venda": preco_venda,
            "data_cadastro": str(r[8]) if r[8] else "",
            "id_unidade": r[9],
            "nome_unidade": r[10] or "Sem Unidade",
            "estoque_atual": estoque_atual,
            "status_estoque": status
        })

    cursor.close()
    conn.close()
    return produtos

def obter_produto_por_id(id_produto, id_unidade=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id_produto, codigo_barras, nome_produto, id_categoria,
               estoque_minimo, preco_custo, preco_venda, id_unidade
        FROM tbl_produtos
        WHERE id_produto = %s
    """, (id_produto,))
    r = cursor.fetchone()
    if not r:
        cursor.close()
        conn.close()
        return None

    estoque_atual = calcular_estoque_produto(id_produto, id_unidade=id_unidade, conn=conn)

    cursor.close()
    conn.close()

    return {
        "id_produto": r[0],
        "codigo_barras": r[1] or "",
        "nome_produto": r[2],
        "id_categoria": r[3],
        "estoque_minimo": r[4] or 0,
        "preco_custo": float(r[5]) if r[5] else 0.0,
        "preco_venda": float(r[6]) if r[6] else 0.0,
        "id_unidade": r[7],
        "estoque_atual": estoque_atual
    }

def salvar_produto(data):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.datetime.now()

    id_prod = data.get("id_produto")
    id_produto = int(id_prod) if id_prod and str(id_prod).isdigit() else None
    codigo_barras = str(data.get("codigo_barras") or "").strip()
    nome_produto = str(data.get("nome_produto") or "").strip()
    
    id_cat = data.get("id_categoria")
    id_categoria = int(id_cat) if id_cat and str(id_cat).isdigit() else None
    
    id_unid = data.get("id_unidade")
    id_unidade = int(id_unid) if id_unid and str(id_unid).isdigit() else None
    
    estoque_minimo = int(data.get("estoque_minimo") or 5)
    preco_custo = float(data.get("preco_custo") or 0.0)
    preco_venda = float(data.get("preco_venda") or 0.0)

    if id_produto:
        cursor.execute("""
            UPDATE tbl_produtos
            SET codigo_barras = %s, nome_produto = %s, id_categoria = %s,
                estoque_minimo = %s, preco_custo = %s, preco_venda = %s, id_unidade = %s
            WHERE id_produto = %s
        """, (codigo_barras, nome_produto, id_categoria, estoque_minimo, preco_custo, preco_venda, id_unidade, id_produto))
    else:
        cursor.execute("""
            INSERT INTO tbl_produtos (codigo_barras, nome_produto, id_categoria, estoque_minimo, preco_custo, preco_venda, data_cadastro, id_unidade)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (codigo_barras, nome_produto, id_categoria, estoque_minimo, preco_custo, preco_venda, now, id_unidade))
    
    cursor.close()
    conn.close()
    return True

def excluir_produto(id_produto):
    id_produto = int(id_produto)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tbl_movimentacoes WHERE id_produto = %s", (id_produto,))
    cursor.execute("DELETE FROM tbl_produtos WHERE id_produto = %s", (id_produto,))
    cursor.close()
    conn.close()
    return True

# --- MOVIMENTAÇÕES DE ESTOQUE ---

def registrar_movimentacao(id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao="", data_movimentacao=None, id_unidade=None, id_fornecedor=None):
    if not id_produto:
        raise Exception("Selecione um produto para registrar a movimentação.")

    id_produto = int(id_produto)

    if id_unidade is not None and str(id_unidade).strip() != "" and str(id_unidade).isdigit():
        id_unidade = int(id_unidade)
    else:
        id_unidade = None

    if id_fornecedor is not None and str(id_fornecedor).strip() != "" and str(id_fornecedor).isdigit():
        id_fornecedor = int(id_fornecedor)
    else:
        id_fornecedor = None

    quantidade = int(quantidade)
    valor_unitario = float(valor_unitario or 0.0)
    tipo_movimentacao = str(tipo_movimentacao).upper()

    if tipo_movimentacao not in ["ENTRADA", "SAIDA"]:
        raise Exception("Tipo de movimentação inválido! Use ENTRADA ou SAIDA.")

    if quantidade <= 0:
        raise Exception("A quantidade deve ser maior que zero!")

    conn = get_db_connection()
    cursor = conn.cursor()

    if tipo_movimentacao == "SAIDA":
        estoque_atual = calcular_estoque_produto(id_produto, id_unidade=id_unidade, conn=conn)
        if quantidade > estoque_atual:
            cursor.close()
            conn.close()
            msg_unid = " nesta unidade" if id_unidade else ""
            raise Exception(f"Estoque insuficiente{msg_unid}! Saldo disponível: {estoque_atual} unidade(s). Tentativa de saída: {quantidade}.")

    data_movimentacao = data_movimentacao or datetime.datetime.now()

    cursor.execute("""
        INSERT INTO tbl_movimentacoes (id_produto, tipo_movimentacao, quantidade, valor_unitario, data_movimentacao, observacao, id_unidade, id_fornecedor)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (id_produto, tipo_movimentacao, quantidade, valor_unitario, data_movimentacao, observacao, id_unidade, id_fornecedor))
    cursor.close()
    conn.close()
    return True

def listar_movimentacoes(limit=1000, id_unidade=None, data_inicio=None, data_fim=None, id_produto=None, tipo_movimentacao=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    where_conditions = []
    params = []

    if id_unidade:
        where_conditions.append("m.id_unidade = %s")
        params.append(id_unidade)

    if id_produto:
        where_conditions.append("m.id_produto = %s")
        params.append(id_produto)

    if tipo_movimentacao:
        tipo_upper = str(tipo_movimentacao).upper()
        if tipo_upper in ['TRANSFERENCIA', 'TRANSFERENCIAS']:
            where_conditions.append("m.observacao LIKE %s")
            params.append('%Transfer%')
        else:
            where_conditions.append("UPPER(m.tipo_movimentacao) = %s")
            params.append(tipo_upper)

    if data_inicio:
        s_inicio = str(data_inicio).strip()
        if len(s_inicio) == 10:
            s_inicio = f"{s_inicio} 00:00:00"
        where_conditions.append("m.data_movimentacao >= %s")
        params.append(s_inicio)

    if data_fim:
        s_fim = str(data_fim).strip()
        if len(s_fim) == 10:
            s_fim = f"{s_fim} 23:59:59"
        where_conditions.append("m.data_movimentacao <= %s")
        params.append(s_fim)

    where_clause = ""
    if where_conditions:
        where_clause = " WHERE " + " AND ".join(where_conditions)

    query = f"""
        SELECT m.id_movimentacao, m.id_produto, p.nome_produto, m.tipo_movimentacao,
               m.quantidade, m.valor_unitario, m.data_movimentacao, m.observacao, m.id_unidade, u.nome_unidade,
               m.id_fornecedor, f.nome_fornecedor
        FROM tbl_movimentacoes m
        INNER JOIN tbl_produtos p ON m.id_produto = p.id_produto
        LEFT JOIN tbl_unidades_operacionais u ON m.id_unidade = u.id_unidade
        LEFT JOIN tbl_fornecedores f ON m.id_fornecedor = f.id_fornecedor
        {where_clause}
        ORDER BY m.data_movimentacao DESC, m.id_movimentacao DESC
    """
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return [
        {
            "id_movimentacao": r[0],
            "id_produto": r[1],
            "nome_produto": r[2],
            "tipo_movimentacao": r[3],
            "quantidade": r[4],
            "valor_unitario": float(r[5]) if r[5] else 0.0,
            "data_movimentacao": str(r[6]) if r[6] else "",
            "observacao": r[7] or "",
            "id_unidade": r[8],
            "nome_unidade": r[9] or "Sem Unidade",
            "id_fornecedor": r[10],
            "nome_fornecedor": r[11] or "Sem Fornecedor"
        }
        for r in rows
    ]

# --- DASHBOARD & METRICAS ---

def obter_dados_dashboard(id_unidade=None):
    produtos = listar_produtos(id_unidade=id_unidade)
    
    total_produtos = len(produtos)
    total_estoque_itens = sum(p["estoque_atual"] for p in produtos)
    valor_total_custo = sum(p["estoque_atual"] * p["preco_custo"] for p in produtos if p["estoque_atual"] > 0)
    valor_total_venda = sum(p["estoque_atual"] * p["preco_venda"] for p in produtos if p["estoque_atual"] > 0)
    
    produtos_baixo_estoque = [p for p in produtos if p["status_estoque"] in ["Baixo", "Zerado"]]
    
    movimentacoes_recentes = listar_movimentacoes(limit=10, id_unidade=id_unidade)

    return {
        "total_produtos": total_produtos,
        "total_estoque_itens": total_estoque_itens,
        "valor_total_custo": valor_total_custo,
        "valor_total_venda": valor_total_venda,
        "qtd_baixo_estoque": len(produtos_baixo_estoque),
        "produtos_baixo_estoque": produtos_baixo_estoque[:5],
        "movimentacoes_recentes": movimentacoes_recentes
    }
