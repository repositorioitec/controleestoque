const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

function getDbUrl() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "Variável de ambiente DATABASE_URL não encontrada!\n" +
      "Configure DATABASE_URL no painel do Render (ou no arquivo .env para uso local).\n" +
      "Exemplo: postgresql://postgres:SENHA@db.projeto.supabase.co:5432/postgres"
    );
  }
  return url.trim();
}

const pool = new Pool({
  connectionString: getDbUrl()
});

async function init_db() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_unidades_operacionais (
          id_unidade SERIAL PRIMARY KEY,
          nome_unidade VARCHAR(150) NOT NULL UNIQUE,
          endereco VARCHAR(255),
          cnpj VARCHAR(30)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_usuarios (
          id_usuario SERIAL PRIMARY KEY,
          usuario VARCHAR(50) NOT NULL UNIQUE,
          senha VARCHAR(100) NOT NULL,
          nome_usuario VARCHAR(100) NOT NULL,
          nivel_acesso VARCHAR(30) DEFAULT 'Operador',
          id_unidade INT REFERENCES tbl_unidades_operacionais(id_unidade) ON DELETE SET NULL,
          status_aprovacao VARCHAR(20) DEFAULT 'Pendente',
          senha_pendente VARCHAR(100),
          menus_permitidos JSONB DEFAULT NULL
      );
    `);

    await client.query(`
      ALTER TABLE tbl_usuarios 
      ADD COLUMN IF NOT EXISTS senha_pendente VARCHAR(100),
      ADD COLUMN IF NOT EXISTS menus_permitidos JSONB DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_categorias (
          id_categoria SERIAL PRIMARY KEY,
          nome_categoria VARCHAR(100) NOT NULL UNIQUE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_usuario_categorias (
          id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE CASCADE,
          id_categoria INT REFERENCES tbl_categorias(id_categoria) ON DELETE CASCADE,
          PRIMARY KEY (id_usuario, id_categoria)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_usuario_unidades (
          id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE CASCADE,
          id_unidade INT REFERENCES tbl_unidades_operacionais(id_unidade) ON DELETE CASCADE,
          PRIMARY KEY (id_usuario, id_unidade)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_fornecedores (
          id_fornecedor SERIAL PRIMARY KEY,
          nome_fornecedor VARCHAR(150) NOT NULL,
          cnpj_cpf VARCHAR(20),
          telefone VARCHAR(20),
          email VARCHAR(100)
      );
    `);

    await client.query(`
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
    `);

    await client.query(`
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
    `);

    await client.query(`
      ALTER TABLE tbl_movimentacoes 
      ADD COLUMN IF NOT EXISTS id_fornecedor INT REFERENCES tbl_fornecedores(id_fornecedor) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE tbl_movimentacoes 
      ADD COLUMN IF NOT EXISTS id_centro_custo INT REFERENCES tbl_centros_custo(id_centro_custo) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE tbl_movimentacoes 
      ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(50) DEFAULT NULL;
    `);


    await client.query(`
      ALTER TABLE tbl_produtos 
      ADD COLUMN IF NOT EXISTS inativo BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE SET NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_centros_custo (
          id_centro_custo SERIAL PRIMARY KEY,
          codigo VARCHAR(30) NOT NULL UNIQUE,
          nome VARCHAR(150) NOT NULL,
          descricao TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_estagios_lancamentos (
          id_lancamento SERIAL PRIMARY KEY,
          data_lancamento DATE NOT NULL,
          status VARCHAR(50) NOT NULL,
          nome_aluno VARCHAR(150) NOT NULL,
          unidade VARCHAR(100) NOT NULL,
          curso VARCHAR(150) NOT NULL,
          turma VARCHAR(50),
          horas_totais NUMERIC(6, 2) DEFAULT 0,
          protocolo_ew VARCHAR(50),
          observacoes TEXT,
          data_cadastro TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE tbl_estagios_lancamentos 
      ADD COLUMN IF NOT EXISTS horas_campo NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_capacitacao NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_laboratorio NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_evento NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_enf_cirurgica NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_enf_medica NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_saude_mulher NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_saude_mental NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_saude_publica NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS horas_emergencia NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS validado_coordenacao BOOLEAN DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE tbl_estagios_lancamentos
      ADD COLUMN IF NOT EXISTS nome_usuario_registro VARCHAR(150) DEFAULT NULL;
    `);

    // Atualiza variações de "Tecnico de Enfermagem" para "Tecnico em Enfermagem"
    await client.query(`
      UPDATE tbl_estagios_lancamentos
      SET curso = 'Tecnico em Enfermagem'
      WHERE LOWER(curso) = 'tecnico de enfermagem' 
         OR LOWER(curso) = 'técnico de enfermagem' 
         OR LOWER(curso) = 'tecnicos de enfermagem'
         OR LOWER(curso) = 'técnicos de enfermagem'
         OR LOWER(curso) LIKE '%tecnico%de%enfermagem%'
         OR LOWER(curso) LIKE '%técnico%de%enfermagem%';
    `);

    // --- INDEXES FOR PERFORMANCE OPTIMIZATION ---
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mov_produto ON tbl_movimentacoes(id_produto);
      CREATE INDEX IF NOT EXISTS idx_mov_tipo ON tbl_movimentacoes(tipo_movimentacao);
      CREATE INDEX IF NOT EXISTS idx_mov_data ON tbl_movimentacoes(data_movimentacao);
      CREATE INDEX IF NOT EXISTS idx_mov_unidade ON tbl_movimentacoes(id_unidade);
      CREATE INDEX IF NOT EXISTS idx_mov_usuario ON tbl_movimentacoes(id_usuario);
      CREATE INDEX IF NOT EXISTS idx_mov_fornecedor ON tbl_movimentacoes(id_fornecedor);
      CREATE INDEX IF NOT EXISTS idx_mov_cc ON tbl_movimentacoes(id_centro_custo);
      
      CREATE INDEX IF NOT EXISTS idx_prod_codigo ON tbl_produtos(codigo_barras);
      CREATE INDEX IF NOT EXISTS idx_prod_categoria ON tbl_produtos(id_categoria);
      CREATE INDEX IF NOT EXISTS idx_prod_fornecedor ON tbl_produtos(id_fornecedor);
      CREATE INDEX IF NOT EXISTS idx_prod_unidade ON tbl_produtos(id_unidade);
      CREATE INDEX IF NOT EXISTS idx_prod_usuario ON tbl_produtos(id_usuario);
      
      CREATE INDEX IF NOT EXISTS idx_estagio_data ON tbl_estagios_lancamentos(data_lancamento);
      CREATE INDEX IF NOT EXISTS idx_estagio_status ON tbl_estagios_lancamentos(status);
      CREATE INDEX IF NOT EXISTS idx_estagio_aluno ON tbl_estagios_lancamentos(nome_aluno);
      CREATE INDEX IF NOT EXISTS idx_estagio_unidade ON tbl_estagios_lancamentos(unidade);
      
      CREATE INDEX IF NOT EXISTS idx_usr_unidade ON tbl_usuarios(id_unidade);
    `);

    let res = await client.query("SELECT COUNT(*) FROM tbl_unidades_operacionais");
    if (parseInt(res.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO tbl_unidades_operacionais (nome_unidade, endereco, cnpj)
        VALUES ($1, $2, $3)
        ON CONFLICT (nome_unidade) DO NOTHING
      `, ['Unidade Matriz', 'Av. Principal, 1000 - Centro', '00.000.000/0001-00']);
      console.log("[DB] Unidade Matriz criada.");
    }

    res = await client.query("SELECT id_unidade FROM tbl_unidades_operacionais ORDER BY id_unidade ASC LIMIT 1");
    const id_unid_matriz = res.rows.length > 0 ? res.rows[0].id_unidade : 1;

    res = await client.query("SELECT COUNT(*) FROM tbl_usuarios");
    if (parseInt(res.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO tbl_usuarios (usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (usuario) DO NOTHING
      `, ['admin@itec.com', 'admin123', 'Administrador do Sistema', 'Administrador', id_unid_matriz, 'Aprovado']);
      console.log("[DB] Usuário 'admin@itec.com' criado.");
    } else {
      await client.query("UPDATE tbl_usuarios SET usuario = 'admin@itec.com' WHERE LOWER(usuario) = 'admin'");
    }

    res = await client.query("SELECT COUNT(*) FROM tbl_categorias");
    if (parseInt(res.rows[0].count) === 0) {
      const cats = ['Eletrônicos', 'Escritório', 'Informática'];
      for (const cat of cats) {
        await client.query("INSERT INTO tbl_categorias (nome_categoria) VALUES ($1) ON CONFLICT DO NOTHING", [cat]);
      }
      console.log("[DB] Categorias padrão inseridas.");
    }

    res = await client.query("SELECT COUNT(*) FROM tbl_fornecedores");
    if (parseInt(res.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO tbl_fornecedores (nome_fornecedor, cnpj_cpf, telefone, email)
        VALUES ($1, $2, $3, $4)
      `, ['Tech Brasil LTDA', '12.345.678/0001-90', '(11) 98888-7777', 'contato@techbrasil.com']);
      console.log("[DB] Fornecedor padrão inserido.");
    }

    console.log("[DB] Banco de dados inicializado com sucesso.");
  } catch (e) {
    console.error("[DB CONNECTION ERROR] Erro ao conectar/inicializar o banco:", e.message);
    throw e;
  } finally {
    client.release();
  }
}

async function listar_unidades() {
  const res = await pool.query("SELECT id_unidade, nome_unidade, endereco, cnpj FROM tbl_unidades_operacionais ORDER BY nome_unidade ASC");
  return res.rows.map(r => ({
    id_unidade: r.id_unidade,
    nome_unidade: r.nome_unidade,
    endereco: r.endereco || "",
    cnpj: r.cnpj || ""
  }));
}

async function cadastrar_unidade(nome_unidade, endereco = "", cnpj = "") {
  await pool.query(`
    INSERT INTO tbl_unidades_operacionais (nome_unidade, endereco, cnpj)
    VALUES ($1, $2, $3)
    ON CONFLICT (nome_unidade) DO NOTHING
  `, [nome_unidade, endereco, cnpj]);
  return true;
}

async function atualizar_unidade(id_unidade, nome_unidade, endereco = "", cnpj = "") {
  await pool.query(`
    UPDATE tbl_unidades_operacionais
    SET nome_unidade = $1, endereco = $2, cnpj = $3
    WHERE id_unidade = $4
  `, [nome_unidade, endereco, cnpj, id_unidade]);
  return true;
}

async function autenticar_usuario(usuario, senha) {
  const res = await pool.query(`
    SELECT u.id_usuario, u.usuario, u.senha, u.nome_usuario, u.nivel_acesso, u.id_unidade, u.status_aprovacao, un.nome_unidade, u.menus_permitidos
    FROM tbl_usuarios u
    LEFT JOIN tbl_unidades_operacionais un ON u.id_unidade = un.id_unidade
    WHERE (
      LOWER(u.usuario) = LOWER($1)
      OR ($1 IN ('admin', 'admin@itec.com') AND LOWER(u.usuario) IN ('admin', 'admin@itec.com'))
    ) AND u.senha = $2
  `, [usuario, senha]);

  const row = res.rows[0];
  if (row) {
    const status = row.status_aprovacao || "Aprovado";
    if (status !== "Aprovado") {
      throw new Error("Sua conta aguarda aprovação do administrador.");
    }
    if (row.ativo === false) {
      throw new Error("Sua conta foi inativada pelo administrador. Entre em contato para reativação.");
    }
    // Buscar unidades vinculadas
    const unidRes = await pool.query(`
      SELECT uu.id_unidade, un2.nome_unidade
      FROM tbl_usuario_unidades uu
      LEFT JOIN tbl_unidades_operacionais un2 ON uu.id_unidade = un2.id_unidade
      WHERE uu.id_usuario = $1
      ORDER BY un2.nome_unidade ASC
    `, [row.id_usuario]);
    const unidades_acesso = unidRes.rows.map(r => ({ id_unidade: r.id_unidade, nome_unidade: r.nome_unidade }));
    return {
      id_usuario: row.id_usuario,
      usuario: row.usuario,
      nome_usuario: row.nome_usuario,
      nivel_acesso: row.nivel_acesso,
      id_unidade: row.id_unidade,
      status_aprovacao: status,
      nome_unidade: row.nome_unidade || "Não Atrelado",
      menus_permitidos: row.menus_permitidos,
      unidades_acesso
    };
  }
  return null;
}

async function cadastrar_usuario(usuario, senha, nome_usuario, nivel_acesso = "Operador", id_unidade = null, status_aprovacao = "Pendente") {
  const res = await pool.query("SELECT id_usuario FROM tbl_usuarios WHERE usuario = $1", [usuario]);
  if (res.rows.length > 0) {
    throw new Error("Nome de usuário já está em uso!");
  }
  await pool.query(`
    INSERT INTO tbl_usuarios (usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao]);
  return true;
}

async function listar_usuarios() {
  const res = await pool.query(`
    SELECT u.id_usuario, u.usuario, u.nome_usuario, u.nivel_acesso, u.status_aprovacao, u.id_unidade, un.nome_unidade, u.senha_pendente, u.menus_permitidos, u.ativo,
           COALESCE(
             (SELECT json_agg(uc.id_categoria) 
              FROM tbl_usuario_categorias uc 
              WHERE uc.id_usuario = u.id_usuario), 
             '[]'
           ) as categorias_acesso,
           COALESCE(
             (SELECT json_agg(json_build_object('id_unidade', uu.id_unidade, 'nome_unidade', un2.nome_unidade))
              FROM tbl_usuario_unidades uu
              LEFT JOIN tbl_unidades_operacionais un2 ON uu.id_unidade = un2.id_unidade
              WHERE uu.id_usuario = u.id_usuario),
             '[]'
           ) as unidades_acesso
    FROM tbl_usuarios u
    LEFT JOIN tbl_unidades_operacionais un ON u.id_unidade = un.id_unidade
    ORDER BY u.nome_usuario ASC
  `);
  return res.rows.map(r => ({
    id_usuario: r.id_usuario,
    usuario: r.usuario,
    nome_usuario: r.nome_usuario,
    nivel_acesso: r.nivel_acesso,
    status_aprovacao: r.status_aprovacao || "Aprovado",
    id_unidade: r.id_unidade,
    nome_unidade: r.nome_unidade || "Sem Unidade",
    categorias_acesso: r.categorias_acesso || [],
    unidades_acesso: r.unidades_acesso || [],
    senha_pendente: r.senha_pendente || null,
    menus_permitidos: r.menus_permitidos,
    ativo: r.ativo !== false
  }));
}

async function atualizar_categorias_usuario(id_usuario, categorias_acesso) {
  await pool.query(`DELETE FROM tbl_usuario_categorias WHERE id_usuario = $1`, [id_usuario]);
  if (categorias_acesso && Array.isArray(categorias_acesso) && categorias_acesso.length > 0) {
    for (let id_cat of categorias_acesso) {
      await pool.query(`
        INSERT INTO tbl_usuario_categorias (id_usuario, id_categoria)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [id_usuario, id_cat]);
    }
  }
}

async function atualizar_unidades_usuario(id_usuario, unidades_acesso) {
  await pool.query(`DELETE FROM tbl_usuario_unidades WHERE id_usuario = $1`, [id_usuario]);
  if (unidades_acesso && Array.isArray(unidades_acesso) && unidades_acesso.length > 0) {
    for (let id_unid of unidades_acesso) {
      await pool.query(`
        INSERT INTO tbl_usuario_unidades (id_usuario, id_unidade)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [id_usuario, id_unid]);
    }
  }
}

async function atualizar_menus_usuario(id_usuario, menus_permitidos) {
  await pool.query(`
    UPDATE tbl_usuarios 
    SET menus_permitidos = $1 
    WHERE id_usuario = $2
  `, [menus_permitidos ? JSON.stringify(menus_permitidos) : null, id_usuario]);
  return true;
}

async function aprovar_usuario(id_usuario, unidades_acesso = [], nivel_acesso = "Operador", categorias_acesso = []) {
  // Usa a primeira unidade como principal para compatibilidade
  const id_unidade_principal = unidades_acesso.length > 0 ? unidades_acesso[0] : null;
  await pool.query(`
    UPDATE tbl_usuarios
    SET status_aprovacao = 'Aprovado', id_unidade = $1, nivel_acesso = $2
    WHERE id_usuario = $3
  `, [id_unidade_principal, nivel_acesso, id_usuario]);
  await atualizar_categorias_usuario(id_usuario, categorias_acesso);
  await atualizar_unidades_usuario(id_usuario, unidades_acesso);
  return true;
}

async function atualizar_usuario(id_usuario, unidades_acesso = [], nivel_acesso = "Operador", categorias_acesso = []) {
  const id_unidade_principal = unidades_acesso.length > 0 ? unidades_acesso[0] : null;
  await pool.query(`
    UPDATE tbl_usuarios
    SET id_unidade = $1, nivel_acesso = $2
    WHERE id_usuario = $3
  `, [id_unidade_principal, nivel_acesso, id_usuario]);
  await atualizar_categorias_usuario(id_usuario, categorias_acesso);
  await atualizar_unidades_usuario(id_usuario, unidades_acesso);
  return true;
}

async function rejeitar_usuario(id_usuario) {
  await pool.query(`
    UPDATE tbl_usuarios
    SET status_aprovacao = 'Rejeitado'
    WHERE id_usuario = $1
  `, [id_usuario]);
  return true;
}

async function inativar_usuario(id_usuario) {
  await pool.query(`
    UPDATE tbl_usuarios
    SET ativo = FALSE
    WHERE id_usuario = $1
  `, [id_usuario]);
  return true;
}

async function ativar_usuario(id_usuario) {
  await pool.query(`
    UPDATE tbl_usuarios
    SET ativo = TRUE
    WHERE id_usuario = $1
  `, [id_usuario]);
  return true;
}

async function solicitar_troca_senha(id_usuario, senha_atual, nova_senha) {
  const res = await pool.query("SELECT senha FROM tbl_usuarios WHERE id_usuario = $1", [id_usuario]);
  if (!res.rows[0]) throw new Error("Usuário não encontrado.");
  if (res.rows[0].senha !== senha_atual) throw new Error("Senha atual incorreta.");
  await pool.query("UPDATE tbl_usuarios SET senha_pendente = $1 WHERE id_usuario = $2", [nova_senha, id_usuario]);
  return true;
}

async function aprovar_senha_pendente(id_usuario) {
  await pool.query("UPDATE tbl_usuarios SET senha = senha_pendente, senha_pendente = NULL WHERE id_usuario = $1 AND senha_pendente IS NOT NULL", [id_usuario]);
  return true;
}

async function rejeitar_senha_pendente(id_usuario) {
  await pool.query("UPDATE tbl_usuarios SET senha_pendente = NULL WHERE id_usuario = $1", [id_usuario]);
  return true;
}

async function listar_categorias(id_usuario = null, nivel_acesso = null) {
  // Administradores veem todas as categorias; demais usuários só veem as que têm permissão
  if (id_usuario && nivel_acesso && nivel_acesso !== 'Administrador') {
    const permRes = await pool.query(
      `SELECT tc.id_categoria, tc.nome_categoria
       FROM tbl_categorias tc
       INNER JOIN tbl_usuario_categorias uc ON tc.id_categoria = uc.id_categoria
       WHERE uc.id_usuario = $1
       ORDER BY tc.nome_categoria ASC`,
      [id_usuario]
    );
    // Se o usuário tiver categorias restritas definidas, retorna apenas elas.
    // Se não tiver nenhuma definida, retorna todas (sem restrição)
    if (permRes.rows.length > 0) {
      return permRes.rows.map(r => ({ id_categoria: r.id_categoria, nome_categoria: r.nome_categoria }));
    }
  }
  const res = await pool.query("SELECT id_categoria, nome_categoria FROM tbl_categorias ORDER BY nome_categoria ASC");
  return res.rows.map(r => ({ id_categoria: r.id_categoria, nome_categoria: r.nome_categoria }));
}

async function cadastrar_categoria(nome_categoria) {
  await pool.query("INSERT INTO tbl_categorias (nome_categoria) VALUES ($1) ON CONFLICT DO NOTHING", [nome_categoria]);
  return true;
}

async function listar_fornecedores() {
  const res = await pool.query("SELECT id_fornecedor, nome_fornecedor, cnpj_cpf, telefone, email FROM tbl_fornecedores ORDER BY nome_fornecedor ASC");
  return res.rows.map(r => ({
    id_fornecedor: r.id_fornecedor,
    nome_fornecedor: r.nome_fornecedor,
    cnpj_cpf: r.cnpj_cpf,
    telefone: r.telefone,
    email: r.email
  }));
}

async function cadastrar_fornecedor(nome, cnpj_cpf = "", telefone = "", email = "") {
  await pool.query(`
    INSERT INTO tbl_fornecedores (nome_fornecedor, cnpj_cpf, telefone, email)
    VALUES ($1, $2, $3, $4)
  `, [nome, cnpj_cpf, telefone, email]);
  return true;
}

async function calcular_estoque_produto(id_produto, id_unidade = null) {
  let sql, params;
  if (id_unidade) {
    sql = `
      SELECT 
          COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'ENTRADA' THEN quantidade ELSE 0 END), 0) AS total_entradas,
          COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'SAIDA' THEN quantidade ELSE 0 END), 0) AS total_saidas
      FROM tbl_movimentacoes
      WHERE id_produto = $1 AND id_unidade = $2
    `;
    params = [id_produto, id_unidade];
  } else {
    sql = `
      SELECT 
          COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'ENTRADA' THEN quantidade ELSE 0 END), 0) AS total_entradas,
          COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) = 'SAIDA' THEN quantidade ELSE 0 END), 0) AS total_saidas
      FROM tbl_movimentacoes
      WHERE id_produto = $1
    `;
    params = [id_produto];
  }
  const res = await pool.query(sql, params);
  const row = res.rows[0];
  const total_entradas = row && row.total_entradas ? parseInt(row.total_entradas) : 0;
  const total_saidas = row && row.total_saidas ? parseInt(row.total_saidas) : 0;
  return total_entradas - total_saidas;
}

async function obter_ultimo_custo_produto(id_produto) {
  const res = await pool.query(`
    SELECT valor_unitario
    FROM tbl_movimentacoes
    WHERE id_produto = $1 AND UPPER(tipo_movimentacao) = 'ENTRADA' AND valor_unitario > 0
    ORDER BY data_movimentacao DESC, id_movimentacao DESC
    LIMIT 1
  `, [id_produto]);
  if (res.rows[0] && res.rows[0].valor_unitario) {
    return parseFloat(res.rows[0].valor_unitario);
  }

  const prodRes = await pool.query(
    'SELECT preco_custo FROM tbl_produtos WHERE id_produto = $1',
    [id_produto]
  );
  return (prodRes.rows[0] && prodRes.rows[0].preco_custo)
    ? parseFloat(prodRes.rows[0].preco_custo)
    : 0.0;
}

async function listar_produtos(filtro_busca = "", id_categoria = null, id_unidade = null, incluir_inativos = false, id_usuario = null, nivel_acesso = null) {
  let sql = `
    SELECT p.id_produto, p.codigo_barras, p.nome_produto, p.id_categoria, c.nome_categoria,
           p.estoque_minimo, p.preco_venda, p.data_cadastro, p.inativo,
           p.id_unidade, u.nome_unidade, p.id_usuario, us.nome_usuario AS nome_usuario_cadastro
    FROM tbl_produtos p
    LEFT JOIN tbl_categorias c ON p.id_categoria = c.id_categoria
    LEFT JOIN tbl_unidades_operacionais u ON p.id_unidade = u.id_unidade
    LEFT JOIN tbl_usuarios us ON p.id_usuario = us.id_usuario
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 1;

  if (filtro_busca) {
    sql += ` AND (p.nome_produto ILIKE $${paramCount} OR p.codigo_barras ILIKE $${paramCount+1})`;
    params.push(`%${filtro_busca}%`, `%${filtro_busca}%`);
    paramCount += 2;
  }
  if (id_categoria) {
    sql += ` AND p.id_categoria = $${paramCount}`;
    params.push(id_categoria);
    paramCount++;
  }
  if (id_unidade) {
    sql += ` AND (p.id_unidade = $${paramCount} OR p.id_unidade IS NULL)`;
    params.push(id_unidade);
    paramCount++;
  }
  if (!incluir_inativos) {
    sql += ` AND COALESCE(p.inativo, false) = false`;
  }

  // Filtro por categorias permitidas: apenas para não-administradores
  if (id_usuario && nivel_acesso && nivel_acesso !== 'Administrador') {
    const permRes = await pool.query(
      `SELECT id_categoria FROM tbl_usuario_categorias WHERE id_usuario = $1`,
      [id_usuario]
    );
    if (permRes.rows.length > 0) {
      const cats = permRes.rows.map(r => r.id_categoria);
      sql += ` AND p.id_categoria = ANY($${paramCount}::int[])`;
      params.push(cats);
      paramCount++;
    }
  }

  sql += " ORDER BY p.nome_produto ASC";
  
  const res = await pool.query(sql, params);
  const produtos = [];
  
  for (const r of res.rows) {
    const estoque_atual = await calcular_estoque_produto(r.id_produto, id_unidade);
    const preco_custo = await obter_ultimo_custo_produto(r.id_produto);
    const estoque_min = r.estoque_minimo || 0;
    
    let status = "Normal";
    if (estoque_atual <= 0) status = "Zerado";
    else if (estoque_atual <= estoque_min) status = "Baixo";
    produtos.push({
      id_produto: r.id_produto,
      codigo_barras: r.codigo_barras || "",
      nome_produto: r.nome_produto,
      id_categoria: r.id_categoria,
      nome_categoria: r.nome_categoria || "Sem Categoria",
      estoque_minimo: estoque_min,
      preco_custo: preco_custo,
      preco_venda: parseFloat(r.preco_venda) || 0.0,
      data_cadastro: r.data_cadastro ? r.data_cadastro.toISOString() : "",
      id_unidade: r.id_unidade,
      nome_unidade: r.nome_unidade || "Sem Unidade",
      estoque_atual: estoque_atual,
      status_estoque: status,
      inativo: r.inativo || false,
      id_usuario: r.id_usuario,
      nome_usuario_cadastro: r.nome_usuario_cadastro || "Sistema"
    });
  }
  return produtos;
}

async function obter_produto_por_id(id_produto, id_unidade = null) {
  const res = await pool.query(`
    SELECT id_produto, codigo_barras, nome_produto, id_categoria,
           estoque_minimo, preco_venda, id_unidade, inativo
    FROM tbl_produtos
    WHERE id_produto = $1
  `, [id_produto]);
  
  const r = res.rows[0];
  if (!r) return null;

  const estoque_atual = await calcular_estoque_produto(id_produto, id_unidade);
  const preco_custo = await obter_ultimo_custo_produto(id_produto);

  return {
    id_produto: r.id_produto,
    codigo_barras: r.codigo_barras || "",
    nome_produto: r.nome_produto,
    id_categoria: r.id_categoria,
    estoque_minimo: r.estoque_minimo || 0,
    preco_custo: preco_custo,
    preco_venda: parseFloat(r.preco_venda) || 0.0,
    id_unidade: r.id_unidade,
    estoque_atual: estoque_atual,
    inativo: r.inativo || false
  };
}

async function salvar_produto(data) {
  const id_produto = data.id_produto ? parseInt(data.id_produto) : null;
  const codigo_barras = (data.codigo_barras || "").toString().trim();
  const nome_produto = (data.nome_produto || "").toString().trim();
  const id_categoria = data.id_categoria ? parseInt(data.id_categoria) : null;
  const id_unidade = data.id_unidade ? parseInt(data.id_unidade) : null;
  const estoque_minimo = parseInt(data.estoque_minimo || 5);
  const preco_venda = parseFloat(data.preco_venda || 0.0);
  const inativo = data.inativo === true || data.inativo === 'true';
  const id_usuario = data.id_usuario ? parseInt(data.id_usuario) : null;

  if (id_produto) {
    await pool.query(`
      UPDATE tbl_produtos
      SET codigo_barras = $1, nome_produto = $2, id_categoria = $3,
          estoque_minimo = $4, preco_venda = $5, id_unidade = $6, inativo = $8, id_usuario = COALESCE(id_usuario, $9)
      WHERE id_produto = $7
    `, [codigo_barras, nome_produto, id_categoria, estoque_minimo, preco_venda, id_unidade, id_produto, inativo, id_usuario]);
  } else {
    await pool.query(`
      INSERT INTO tbl_produtos (codigo_barras, nome_produto, id_categoria, estoque_minimo, preco_venda, id_unidade, inativo, id_usuario)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [codigo_barras, nome_produto, id_categoria, estoque_minimo, preco_venda, id_unidade, inativo, id_usuario]);
  }
  return true;
}

async function excluir_produto(id_produto) {
  await pool.query("DELETE FROM tbl_movimentacoes WHERE id_produto = $1", [id_produto]);
  await pool.query("DELETE FROM tbl_produtos WHERE id_produto = $1", [id_produto]);
  return true;
}

async function registrar_movimentacao(id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao = "", data_movimentacao = null, id_unidade = null, id_fornecedor = null, id_usuario = null, numero_nf = null, id_centro_custo = null) {
  if (!id_produto) throw new Error("Selecione um produto para registrar a movimentação.");
  
  const tipo = tipo_movimentacao.toUpperCase();
  if (tipo !== "ENTRADA" && tipo !== "SAIDA") throw new Error("Tipo de movimentação inválido! Use ENTRADA ou SAIDA.");
  
  const qtd = parseInt(quantidade);
  if (qtd <= 0) throw new Error("A quantidade deve ser maior que zero!");

  const valor = parseFloat(valor_unitario || 0.0);

  if (tipo === "SAIDA") {
    const estoque_atual = await calcular_estoque_produto(id_produto, id_unidade);
    if (qtd > estoque_atual) {
      const msg_unid = id_unidade ? " nesta unidade" : "";
      throw new Error(`Estoque insuficiente${msg_unid}! Saldo disponível: ${estoque_atual} unidade(s). Tentativa de saída: ${qtd}.`);
    }
  }

  const dataMov = data_movimentacao || new Date().toISOString();

  await pool.query(`
    INSERT INTO tbl_movimentacoes (id_produto, tipo_movimentacao, quantidade, valor_unitario, data_movimentacao, observacao, id_unidade, id_fornecedor, id_usuario, numero_nf, id_centro_custo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [id_produto, tipo, qtd, valor, dataMov, observacao, id_unidade || null, id_fornecedor || null, id_usuario || null, numero_nf || null, id_centro_custo || null]);
  return true;
}

async function registrar_transferencia(id_produto, quantidade, id_unidade_origem, id_unidade_destino, id_usuario = null, observacao = null) {
  if (!id_produto) throw new Error("Selecione um produto para transferir.");
  if (!id_unidade_origem || !id_unidade_destino) throw new Error("Unidades de origem e destino são obrigatórias.");
  if (parseInt(id_unidade_origem) === parseInt(id_unidade_destino)) throw new Error("A unidade de origem e destino não podem ser iguais.");
  
  const qtd = parseInt(quantidade);
  if (qtd <= 0) throw new Error("A quantidade deve ser maior que zero!");

  const estoque_atual = await calcular_estoque_produto(id_produto, id_unidade_origem);
  if (qtd > estoque_atual) {
    throw new Error(`Estoque insuficiente na unidade de origem! Saldo disponível: ${estoque_atual}. Tentativa de transferência: ${qtd}.`);
  }

  const dataMov = new Date().toISOString();
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Buscar valor unitário (custo)
    const res = await client.query(`
      SELECT valor_unitario
      FROM tbl_movimentacoes
      WHERE id_produto = $1 AND UPPER(tipo_movimentacao) = 'ENTRADA' AND valor_unitario > 0
      ORDER BY data_movimentacao DESC, id_movimentacao DESC
      LIMIT 1
    `, [id_produto]);
    const valor = (res.rows[0] && res.rows[0].valor_unitario) ? parseFloat(res.rows[0].valor_unitario) : 0.0;

    // Nomes das unidades
    const resUnidDest = await client.query('SELECT nome_unidade FROM tbl_unidades_operacionais WHERE id_unidade = $1', [id_unidade_destino]);
    const nomeDestino = resUnidDest.rows[0] ? resUnidDest.rows[0].nome_unidade : 'Outra Unidade';

    const resUnidOrigem = await client.query('SELECT nome_unidade FROM tbl_unidades_operacionais WHERE id_unidade = $1', [id_unidade_origem]);
    const nomeOrigem = resUnidOrigem.rows[0] ? resUnidOrigem.rows[0].nome_unidade : 'Outra Unidade';

    const obsSaida = `Transferência para: ${nomeDestino}` + (observacao ? ` | ${observacao}` : '');
    await client.query(`
      INSERT INTO tbl_movimentacoes (id_produto, tipo_movimentacao, quantidade, valor_unitario, data_movimentacao, observacao, id_unidade, id_usuario)
      VALUES ($1, 'SAIDA', $2, $3, $4, $5, $6, $7)
    `, [id_produto, qtd, valor, dataMov, obsSaida, id_unidade_origem, id_usuario || null]);

    const obsEntrada = `Transferência de: ${nomeOrigem}` + (observacao ? ` | ${observacao}` : '');
    await client.query(`
      INSERT INTO tbl_movimentacoes (id_produto, tipo_movimentacao, quantidade, valor_unitario, data_movimentacao, observacao, id_unidade, id_usuario)
      VALUES ($1, 'ENTRADA', $2, $3, $4, $5, $6, $7)
    `, [id_produto, qtd, valor, dataMov, obsEntrada, id_unidade_destino, id_usuario || null]);

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listar_movimentacoes(limit = 1000, id_unidade = null, data_inicio = null, data_fim = null, id_produto = null, tipo_movimentacao = null, id_usuario_filtro = null, nivel_acesso = null, id_centro_custo = null) {
  let where_conditions = [];
  let params = [];
  let p = 1;

  if (id_unidade) {
    where_conditions.push(`m.id_unidade = $${p++}`);
    params.push(id_unidade);
  }
  if (id_produto) {
    where_conditions.push(`m.id_produto = $${p++}`);
    params.push(id_produto);
  }
  if (tipo_movimentacao) {
    const tipoUpper = tipo_movimentacao.toUpperCase();
    if (tipoUpper === 'TRANSFERENCIA' || tipoUpper === 'TRANSFERENCIAS') {
      // Transferencias sao registradas como ENTRADA/SAIDA com observacao contendo 'Transferencia'
      where_conditions.push(`LOWER(m.observacao) LIKE '%transfer%'`);
    } else {
      where_conditions.push(`UPPER(m.tipo_movimentacao) = $${p++}`);
      params.push(tipoUpper);
    }
  }
  if (data_inicio) {
    let d = data_inicio.trim();
    if (d.length === 10) d += " 00:00:00";
    where_conditions.push(`m.data_movimentacao >= $${p++}`);
    params.push(d);
  }
  if (data_fim) {
    let d = data_fim.trim();
    if (d.length === 10) d += " 23:59:59";
    where_conditions.push(`m.data_movimentacao <= $${p++}`);
    params.push(d);
  }
  if (id_centro_custo) {
    where_conditions.push(`m.id_centro_custo = $${p++}`);
    params.push(id_centro_custo);
  }

  // Filter by allowed categories for non-admin users
  if (id_usuario_filtro && nivel_acesso && nivel_acesso !== 'Administrador') {
    const permRes = await pool.query(
      `SELECT id_categoria FROM tbl_usuario_categorias WHERE id_usuario = $1`,
      [id_usuario_filtro]
    );
    if (permRes.rows.length > 0) {
      const cats = permRes.rows.map(r => r.id_categoria);
      where_conditions.push(`p.id_categoria = ANY($${p++}::int[])`);
      params.push(cats);
    }
  }

  const where_clause = where_conditions.length ? " WHERE " + where_conditions.join(" AND ") : "";

  let query = `
    SELECT m.id_movimentacao, m.id_produto, p.nome_produto, m.tipo_movimentacao,
           m.quantidade, m.valor_unitario, m.data_movimentacao, m.observacao, m.numero_nf,
           m.id_unidade, u.nome_unidade,
           m.id_fornecedor, f.nome_fornecedor,
           m.id_centro_custo, cc.nome AS nome_centro_custo,
           m.id_usuario, us.nome_usuario AS nome_usuario_movimentacao
    FROM tbl_movimentacoes m
    INNER JOIN tbl_produtos p ON m.id_produto = p.id_produto
    LEFT JOIN tbl_unidades_operacionais u ON m.id_unidade = u.id_unidade
    LEFT JOIN tbl_fornecedores f ON m.id_fornecedor = f.id_fornecedor
    LEFT JOIN tbl_centros_custo cc ON m.id_centro_custo = cc.id_centro_custo
    LEFT JOIN tbl_usuarios us ON m.id_usuario = us.id_usuario
    ${where_clause}
    ORDER BY m.data_movimentacao DESC, m.id_movimentacao DESC
  `;

  if (limit) {
    query += ` LIMIT $${p++}`;
    params.push(limit);
  }

  const res = await pool.query(query, params);
  return res.rows.map(r => ({
    id_movimentacao: r.id_movimentacao,
    id_produto: r.id_produto,
    nome_produto: r.nome_produto,
    tipo_movimentacao: r.tipo_movimentacao,
    quantidade: r.quantidade,
    valor_unitario: parseFloat(r.valor_unitario) || 0.0,
    data_movimentacao: r.data_movimentacao ? r.data_movimentacao.toISOString() : "",
    observacao: r.observacao || "",
    numero_nf: r.numero_nf || null,
    id_unidade: r.id_unidade,
    nome_unidade: r.nome_unidade || "Sem Unidade",
    id_fornecedor: r.id_fornecedor,
    nome_fornecedor: r.nome_fornecedor || "Sem Fornecedor",
    id_centro_custo: r.id_centro_custo,
    nome_centro_custo: r.nome_centro_custo || null,
    id_usuario: r.id_usuario,
    nome_usuario_movimentacao: r.nome_usuario_movimentacao || "Sistema"
  }));
}

async function obter_dados_dashboard(id_unidade = null, id_usuario = null, nivel_acesso = null) {
  const produtosAll = await listar_produtos("", null, id_unidade, false, id_usuario, nivel_acesso);
  const produtos = produtosAll.filter(p => !p.inativo);
  const total_produtos = produtos.length;
  
  const total_estoque_itens = produtos.reduce((acc, p) => acc + p.estoque_atual, 0);
  const valor_total_custo = produtos.reduce((acc, p) => p.estoque_atual > 0 ? acc + (p.estoque_atual * p.preco_custo) : acc, 0);
  const valor_total_venda = produtos.reduce((acc, p) => p.estoque_atual > 0 ? acc + (p.estoque_atual * p.preco_venda) : acc, 0);
  
  const produtos_baixo_estoque = produtos.filter(p => p.status_estoque === "Baixo" || p.status_estoque === "Zerado");
  const movimentacoes_recentes = await listar_movimentacoes(10, id_unidade, null, null, null, null, id_usuario, nivel_acesso);

  return {
    total_produtos,
    total_estoque_itens,
    valor_total_custo,
    valor_total_venda,
    qtd_baixo_estoque: produtos_baixo_estoque.length,
    produtos_baixo_estoque: produtos_baixo_estoque.slice(0, 5),
    movimentacoes_recentes
  };
}

async function gerar_relatorio_estoque(id_unidade = null, id_categoria = null, incluir_zerados = false, id_usuario = null, nivel_acesso = null) {
  let where_conditions = ["p.inativo = false"];
  let params = [];
  let p = 1;

  if (id_categoria) {
    where_conditions.push(`p.id_categoria = $${p++}`);
    params.push(id_categoria);
  }

  // Filtro por categorias permitidas ao usuário
  if (id_usuario && nivel_acesso && nivel_acesso !== 'Administrador') {
    const permRes = await pool.query(
      `SELECT id_categoria FROM tbl_usuario_categorias WHERE id_usuario = $1`,
      [id_usuario]
    );
    if (permRes.rows.length > 0) {
      const cats = permRes.rows.map(r => r.id_categoria);
      where_conditions.push(`p.id_categoria = ANY($${p++}::int[])`);
      params.push(cats);
    }
  }

  const where_clause = where_conditions.length ? " WHERE " + where_conditions.join(" AND ") : "";

  let nome_unidade_relatorio = "Todas as Unidades";
  if (id_unidade) {
    const unidRes = await pool.query(
      "SELECT nome_unidade FROM tbl_unidades_operacionais WHERE id_unidade = $1",
      [id_unidade]
    );
    nome_unidade_relatorio = unidRes.rows[0]?.nome_unidade || "Unidade selecionada";
  }

  const sql = `
    SELECT p.id_produto, p.codigo_barras, p.nome_produto, p.id_categoria, p.preco_custo, c.nome_categoria
    FROM tbl_produtos p
    LEFT JOIN tbl_categorias c ON p.id_categoria = c.id_categoria
    ${where_clause}
    ORDER BY p.nome_produto ASC
  `;

  const res = await pool.query(sql, params);
  
  const relatorio = [];
  for (const r of res.rows) {
    const estoque_atual = await calcular_estoque_produto(r.id_produto, id_unidade);
    if (!incluir_zerados && estoque_atual <= 0) continue;
    
    const preco_custo = parseFloat(r.preco_custo) || 0;
    const valor_total = estoque_atual * preco_custo;
    
    relatorio.push({
      id_produto: r.id_produto,
      codigo_barras: r.codigo_barras || "",
      nome_produto: r.nome_produto,
      nome_categoria: r.nome_categoria || "Sem Categoria",
      nome_unidade: nome_unidade_relatorio,
      estoque_atual: estoque_atual,
      preco_custo: preco_custo,
      valor_total: valor_total
    });
  }
  return relatorio;
}

async function gerar_relatorio_sugestao_compras(id_unidade = null, id_categoria = null, data_inicio = null, data_fim = null, id_usuario = null, nivel_acesso = null) {
  if (!data_inicio || !data_fim) {
    const hoje = new Date();
    data_fim = data_fim || hoje.toISOString().split('T')[0];
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 30);
    data_inicio = data_inicio || inicio.toISOString().split('T')[0];
  }

  let where_conditions = ["p.inativo = false"];
  let params = [];
  let p = 1;

  if (id_categoria) {
    where_conditions.push(`p.id_categoria = $${p++}`);
    params.push(id_categoria);
  }

  if (id_unidade) {
    where_conditions.push(`(p.id_unidade = $${p++} OR p.id_unidade IS NULL)`);
    params.push(id_unidade);
  }

  // Filtro por categorias permitidas ao usuário
  if (id_usuario && nivel_acesso && nivel_acesso !== 'Administrador') {
    const permRes = await pool.query(
      `SELECT id_categoria FROM tbl_usuario_categorias WHERE id_usuario = $1`,
      [id_usuario]
    );
    if (permRes.rows.length > 0) {
      const cats = permRes.rows.map(r => r.id_categoria);
      where_conditions.push(`p.id_categoria = ANY($${p++}::int[])`);
      params.push(cats);
    }
  }

  const where_clause = where_conditions.length ? " WHERE " + where_conditions.join(" AND ") : "";

  const dtInicio = new Date(data_inicio);
  const dtFim = new Date(data_fim);
  const dias_periodo = Math.max(1, Math.round((dtFim - dtInicio) / (1000 * 60 * 60 * 24)) + 1);

  let nome_unidade_relatorio = "Todas as Unidades";
  if (id_unidade) {
    const unidRes = await pool.query(
      "SELECT nome_unidade FROM tbl_unidades_operacionais WHERE id_unidade = $1",
      [id_unidade]
    );
    nome_unidade_relatorio = unidRes.rows[0]?.nome_unidade || "Unidade selecionada";
  }

  const sql = `
    SELECT p.id_produto, p.nome_produto, p.estoque_minimo, p.preco_custo, c.nome_categoria,
           u.nome_unidade as nome_unidade_produto
    FROM tbl_produtos p
    LEFT JOIN tbl_categorias c ON p.id_categoria = c.id_categoria
    LEFT JOIN tbl_unidades_operacionais u ON p.id_unidade = u.id_unidade
    ${where_clause}
    ORDER BY p.nome_produto ASC
  `;

  const res = await pool.query(sql, params);

  let dInicio = data_inicio.trim();
  if (dInicio.length === 10) dInicio += " 00:00:00";
  let dFim = data_fim.trim();
  if (dFim.length === 10) dFim += " 23:59:59";

  const relatorio = [];
  for (const r of res.rows) {
    const estoque_real = await calcular_estoque_produto(r.id_produto, id_unidade);
    const estoque_minimo = parseInt(r.estoque_minimo) || 0;

    let consumoSql, consumoParams;
    if (id_unidade) {
      consumoSql = `
        SELECT COALESCE(SUM(quantidade), 0) AS consumo
        FROM tbl_movimentacoes
        WHERE id_produto = $1 AND id_unidade = $2
          AND UPPER(tipo_movimentacao) = 'SAIDA'
          AND data_movimentacao >= $3 AND data_movimentacao <= $4
      `;
      consumoParams = [r.id_produto, id_unidade, dInicio, dFim];
    } else {
      consumoSql = `
        SELECT COALESCE(SUM(quantidade), 0) AS consumo
        FROM tbl_movimentacoes
        WHERE id_produto = $1
          AND UPPER(tipo_movimentacao) = 'SAIDA'
          AND data_movimentacao >= $2 AND data_movimentacao <= $3
      `;
      consumoParams = [r.id_produto, dInicio, dFim];
    }

    const consumoRes = await pool.query(consumoSql, consumoParams);
    const consumo_periodo = parseInt(consumoRes.rows[0]?.consumo || 0);
    const media_consumo = consumo_periodo / dias_periodo;
    const sugestao_pedido = Math.max(0, Math.ceil(media_consumo * dias_periodo + estoque_minimo - estoque_real));

    const preco_custo = parseFloat(r.preco_custo) || 0;
    const valor_sugestao = sugestao_pedido > 0 ? sugestao_pedido * preco_custo : 0;

    relatorio.push({
      id_produto: r.id_produto,
      nome_produto: r.nome_produto,
      nome_unidade: r.nome_unidade_produto || "Global",
      nome_categoria: r.nome_categoria || "Sem Categoria",
      estoque_real,
      estoque_minimo,
      sugestao_pedido,
      preco_custo,
      valor_sugestao
    });
  }
  return relatorio;
}

async function podeExcluirUsuario(id_usuario) {
  const res = await pool.query(
    `SELECT COUNT(*) FROM tbl_movimentacoes WHERE id_usuario = $1`,
    [id_usuario]
  );
  return parseInt(res.rows[0].count) === 0;
}

async function excluir_usuario(id_usuario) {
  const podeExcluir = await podeExcluirUsuario(id_usuario);
  if (!podeExcluir) {
    throw new Error('Este usuário tem movimentações e não pode ser excluído.');
  }
  await pool.query(`DELETE FROM tbl_usuarios WHERE id_usuario = $1`, [id_usuario]);
  return true;
}

async function excluir_movimentacao(id_movimentacao) {
  await pool.query(`DELETE FROM tbl_movimentacoes WHERE id_movimentacao = $1`, [id_movimentacao]);
  return true;
}

async function atualizar_movimentacao(id_movimentacao, id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor, numero_nf = null, id_centro_custo = null) {
  let query = `
    UPDATE tbl_movimentacoes 
    SET id_produto = $1, tipo_movimentacao = $2, quantidade = $3, valor_unitario = $4, observacao = $5, data_movimentacao = $6, id_unidade = $7, id_fornecedor = $8, numero_nf = $9, id_centro_custo = $10
    WHERE id_movimentacao = $11
  `;
  await pool.query(query, [id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor, numero_nf || null, id_centro_custo || null, id_movimentacao]);
  return true;
}

// --- CENTROS DE CUSTO ---

async function listar_centros_custo() {
  const res = await pool.query(
    "SELECT id_centro_custo, codigo, nome, descricao FROM tbl_centros_custo ORDER BY nome ASC"
  );
  return res.rows.map(r => ({
    id_centro_custo: r.id_centro_custo,
    codigo: r.codigo,
    nome: r.nome,
    descricao: r.descricao || ""
  }));
}

async function salvar_centro_custo(id_centro_custo, codigo, nome, descricao = "") {
  if (id_centro_custo) {
    await pool.query(
      "UPDATE tbl_centros_custo SET codigo = $1, nome = $2, descricao = $3 WHERE id_centro_custo = $4",
      [codigo, nome, descricao, id_centro_custo]
    );
  } else {
    await pool.query(
      "INSERT INTO tbl_centros_custo (codigo, nome, descricao) VALUES ($1, $2, $3)",
      [codigo, nome, descricao]
    );
  }
  return true;
}

async function excluir_centro_custo(id_centro_custo) {
  await pool.query("DELETE FROM tbl_centros_custo WHERE id_centro_custo = $1", [id_centro_custo]);
  return true;
}

// --- CONTROLE DE ESTÁGIOS ---

async function listar_lancamentos_estagio() {
  const res = await pool.query(`
    SELECT id_lancamento, to_char(data_lancamento, 'YYYY-MM-DD') as data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro
    FROM tbl_estagios_lancamentos
    ORDER BY id_lancamento DESC
  `);
  return res.rows;
}

async function salvar_lancamento_estagio(id_lancamento, data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro) {
  if (id_lancamento) {
    await pool.query(`
      UPDATE tbl_estagios_lancamentos
       SET data_lancamento = $1, status = $2, nome_aluno = $3, unidade = $4, curso = $5, turma = $6, horas_totais = $7, protocolo_ew = $8, observacoes = $9, horas_campo = $11, horas_capacitacao = $12, horas_laboratorio = $13, horas_evento = $14, horas_enf_cirurgica = $15, horas_enf_medica = $16, horas_saude_mulher = $17, horas_saude_mental = $18, horas_saude_publica = $19, horas_emergencia = $20, validado_coordenacao = $21
       WHERE id_lancamento = $10
    `, [data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, id_lancamento, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao || false]);
    return id_lancamento;
  } else {
    const res = await pool.query(
      `INSERT INTO tbl_estagios_lancamentos (data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id_lancamento`,
      [data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo || 0, horas_capacitacao || 0, horas_laboratorio || 0, horas_evento || 0, horas_enf_cirurgica || 0, horas_enf_medica || 0, horas_saude_mulher || 0, horas_saude_mental || 0, horas_saude_publica || 0, horas_emergencia || 0, validado_coordenacao || false, nome_usuario_registro || null]
    );
    return res.rows[0].id_lancamento;
  }
}

async function excluir_lancamento_estagio(id_lancamento) {
  await pool.query("DELETE FROM tbl_estagios_lancamentos WHERE id_lancamento = $1", [id_lancamento]);
  return true;
}

module.exports = {
  init_db,
  listar_unidades,
  cadastrar_unidade,
  atualizar_unidade,
  autenticar_usuario,
  cadastrar_usuario,
  listar_usuarios,
  aprovar_usuario,
  atualizar_usuario,
  atualizar_unidades_usuario,
  atualizar_menus_usuario,
  rejeitar_usuario,
  inativar_usuario,
  ativar_usuario,
  solicitar_troca_senha,
  aprovar_senha_pendente,
  rejeitar_senha_pendente,
  listar_categorias,
  cadastrar_categoria,
  listar_fornecedores,
  cadastrar_fornecedor,
  listar_produtos,

  obter_produto_por_id,
  salvar_produto,
  excluir_produto,
  excluir_usuario,
  registrar_movimentacao,
  registrar_transferencia,
  listar_movimentacoes,
  excluir_movimentacao,
  atualizar_movimentacao,
  obter_dados_dashboard,
  gerar_relatorio_estoque,
  gerar_relatorio_sugestao_compras,
  listar_centros_custo,
  salvar_centro_custo,
  excluir_centro_custo,
  listar_lancamentos_estagio,
  salvar_lancamento_estagio,
  excluir_lancamento_estagio
};
