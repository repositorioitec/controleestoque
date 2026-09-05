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
  connectionString: getDbUrl(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
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
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS avatar_base64 TEXT DEFAULT NULL;
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
      ALTER TABLE tbl_fornecedores 
      ADD COLUMN IF NOT EXISTS razao_reduzida VARCHAR(150),
      ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
      ADD COLUMN IF NOT EXISTS endereco VARCHAR(150),
      ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
      ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
      ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
      ADD COLUMN IF NOT EXISTS estado VARCHAR(2);
    `).catch(err => console.error("Aviso ao adicionar colunas tbl_fornecedores:", err.message));

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
      ADD COLUMN IF NOT EXISTS nome_usuario_registro VARCHAR(150) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS nome_usuario_validacao VARCHAR(150) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS aguardando_analise BOOLEAN DEFAULT FALSE;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_documentos (
        id_documento SERIAL PRIMARY KEY,
        curso VARCHAR(100) NOT NULL,
        tipo_documento VARCHAR(100) NOT NULL,
        nome_arquivo VARCHAR(255) NOT NULL,
        tipo_mime VARCHAR(100),
        dados_arquivo TEXT NOT NULL,
        data_inclusao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE tbl_documentos
        ADD COLUMN IF NOT EXISTS tipo_mime VARCHAR(100),
        ADD COLUMN IF NOT EXISTS dados_arquivo TEXT,
        ADD COLUMN IF NOT EXISTS data_inclusao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tbl_documentos' AND column_name = 'arquivo_base64'
        ) THEN
          UPDATE tbl_documentos 
          SET dados_arquivo = arquivo_base64 
          WHERE (dados_arquivo IS NULL OR dados_arquivo = '') AND arquivo_base64 IS NOT NULL;
        END IF;
      END $$;
    `).catch(e => console.error("Aviso ao ajustar tbl_documentos:", e.message));

    // Criando Índices de Performance (Foreign Keys e Filtros)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON tbl_produtos(id_categoria);
      CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor ON tbl_produtos(id_fornecedor);
      CREATE INDEX IF NOT EXISTS idx_produtos_unidade ON tbl_produtos(id_unidade);
      CREATE INDEX IF NOT EXISTS idx_produtos_usuario ON tbl_produtos(id_usuario);
      CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON tbl_produtos(codigo_barras);
      CREATE INDEX IF NOT EXISTS idx_produtos_nome ON tbl_produtos(nome_produto);
      
      CREATE INDEX IF NOT EXISTS idx_mov_produto ON tbl_movimentacoes(id_produto);
      CREATE INDEX IF NOT EXISTS idx_mov_unidade ON tbl_movimentacoes(id_unidade);
      CREATE INDEX IF NOT EXISTS idx_mov_fornecedor ON tbl_movimentacoes(id_fornecedor);
      CREATE INDEX IF NOT EXISTS idx_mov_usuario ON tbl_movimentacoes(id_usuario);
      CREATE INDEX IF NOT EXISTS idx_mov_centro_custo ON tbl_movimentacoes(id_centro_custo);
      CREATE INDEX IF NOT EXISTS idx_mov_data ON tbl_movimentacoes(data_movimentacao);
      CREATE INDEX IF NOT EXISTS idx_mov_tipo ON tbl_movimentacoes(tipo_movimentacao);
      
      CREATE INDEX IF NOT EXISTS idx_usuarios_unidade ON tbl_usuarios(id_unidade);
      
      CREATE INDEX IF NOT EXISTS idx_estagios_data ON tbl_estagios_lancamentos(data_lancamento);
      CREATE INDEX IF NOT EXISTS idx_estagios_status ON tbl_estagios_lancamentos(status);
      CREATE INDEX IF NOT EXISTS idx_estagios_unidade ON tbl_estagios_lancamentos(unidade);
      CREATE INDEX IF NOT EXISTS idx_estagios_curso ON tbl_estagios_lancamentos(curso);
    `).catch(e => console.error("Aviso ao criar índices:", e.message));

    // Admin default
    const resAdm = await client.query("SELECT * FROM tbl_usuarios WHERE usuario = 'admin'");
    if (resAdm.rows.length === 0) {
      await client.query(`
        INSERT INTO tbl_usuarios (usuario, senha, nome_usuario, nivel_acesso, status_aprovacao, menus_permitidos)
        VALUES ('admin', 'admin123', 'Administrador do Sistema', 'Administrador', 'Aprovado', '["*"]'::jsonb)
      `);
    }

  } finally {
    client.release();
  }
}

// --- UNIDADES ---

async function listar_unidades() {
  const res = await pool.query("SELECT * FROM tbl_unidades_operacionais ORDER BY nome_unidade ASC");
  return res.rows;
}

async function cadastrar_unidade(nome_unidade, endereco = "", cnpj = "") {
  await pool.query(
    "INSERT INTO tbl_unidades_operacionais (nome_unidade, endereco, cnpj) VALUES ($1, $2, $3)",
    [nome_unidade.trim(), endereco.trim(), cnpj.trim()]
  );
  return true;
}

async function atualizar_unidade(id_unidade, nome_unidade, endereco = "", cnpj = "") {
  await pool.query(
    "UPDATE tbl_unidades_operacionais SET nome_unidade = $1, endereco = $2, cnpj = $3 WHERE id_unidade = $4",
    [nome_unidade.trim(), endereco.trim(), cnpj.trim(), id_unidade]
  );
  return true;
}

// --- USUÁRIOS E AUTENTICAÇÃO ---

async function autenticar_usuario(usuario, senha) {
  const res = await pool.query(
    `SELECT u.*, un.nome_unidade 
     FROM tbl_usuarios u
     LEFT JOIN tbl_unidades_operacionais un ON u.id_unidade = un.id_unidade
     WHERE LOWER(u.usuario) = LOWER($1) AND u.senha = $2`,
    [usuario.trim(), senha]
  );
  if (res.rows.length === 0) return null;
  const user = res.rows[0];
  
  if (user.status_aprovacao !== 'Aprovado') {
    throw new Error(`Seu cadastro está com status '${user.status_aprovacao}'. Aguarde a aprovação do administrador.`);
  }

  if (user.ativo === false) {
    throw new Error("Seu usuário está inativado no sistema. Entre em contato com o administrador.");
  }

  return {
    id_usuario: user.id_usuario,
    usuario: user.usuario,
    nome_usuario: user.nome_usuario,
    nivel_acesso: user.nivel_acesso,
    id_unidade: user.id_unidade,
    nome_unidade: user.nome_unidade,
    status_aprovacao: user.status_aprovacao,
    menus_permitidos: user.menus_permitidos || null,
    avatar_base64: user.avatar_base64 || null
  };
}

async function cadastrar_usuario(usuario, senha, nome_usuario, nivel_acesso = "Operador", id_unidade = null, ids_unidades = [], ids_categorias = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO tbl_usuarios (usuario, senha, nome_usuario, nivel_acesso, id_unidade, status_aprovacao, menus_permitidos) 
       VALUES ($1, $2, $3, $4, $5, 'Pendente', NULL) RETURNING id_usuario`,
      [usuario.trim(), senha, nome_usuario.trim(), nivel_acesso, id_unidade || null]
    );
    const id_usuario = res.rows[0].id_usuario;

    if (ids_unidades && ids_unidades.length > 0) {
      for (const id_u of ids_unidades) {
        await client.query(
          "INSERT INTO tbl_usuario_unidades (id_usuario, id_unidade) VALUES ($1, $2)",
          [id_usuario, id_u]
        );
      }
    }

    if (ids_categorias && ids_categorias.length > 0) {
      for (const id_c of ids_categorias) {
        await client.query(
          "INSERT INTO tbl_usuario_categorias (id_usuario, id_categoria) VALUES ($1, $2)",
          [id_usuario, id_c]
        );
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listar_usuarios() {
  const res = await pool.query(`
    SELECT u.id_usuario, u.usuario, u.nome_usuario, u.nivel_acesso, u.id_unidade, 
           un.nome_unidade, u.status_aprovacao, u.senha_pendente, u.menus_permitidos, u.ativo, u.avatar_base64,
           COALESCE(
             (SELECT json_agg(json_build_object('id_unidade', uu.id_unidade, 'nome_unidade', un2.nome_unidade))
              FROM tbl_usuario_unidades uu
              JOIN tbl_unidades_operacionais un2 ON uu.id_unidade = un2.id_unidade
              WHERE uu.id_usuario = u.id_usuario), '[]'::json
           ) as unidades_vinculadas,
           COALESCE(
             (SELECT json_agg(json_build_object('id_categoria', uc.id_categoria, 'nome_categoria', c.nome_categoria))
              FROM tbl_usuario_categorias uc
              JOIN tbl_categorias c ON uc.id_categoria = c.id_categoria
              WHERE uc.id_usuario = u.id_usuario), '[]'::json
           ) as categorias_vinculadas
    FROM tbl_usuarios u
    LEFT JOIN tbl_unidades_operacionais un ON u.id_unidade = un.id_unidade
    ORDER BY u.nome_usuario ASC
  `);
  return res.rows;
}

async function aprovar_usuario(id_usuario, nivel_acesso, id_unidade = null, menus_permitidos = null, ids_unidades = [], ids_categorias = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const menus = (menus_permitidos && Array.isArray(menus_permitidos)) ? JSON.stringify(menus_permitidos) : null;
    await client.query(
      `UPDATE tbl_usuarios 
       SET status_aprovacao = 'Aprovado', nivel_acesso = $1, id_unidade = $2, menus_permitidos = $3::jsonb
       WHERE id_usuario = $4`,
      [nivel_acesso, id_unidade || null, menus, id_usuario]
    );

    await client.query("DELETE FROM tbl_usuario_unidades WHERE id_usuario = $1", [id_usuario]);
    if (ids_unidades && ids_unidades.length > 0) {
      for (const id_u of ids_unidades) {
        await client.query("INSERT INTO tbl_usuario_unidades (id_usuario, id_unidade) VALUES ($1, $2)", [id_usuario, id_u]);
      }
    }

    await client.query("DELETE FROM tbl_usuario_categorias WHERE id_usuario = $1", [id_usuario]);
    if (ids_categorias && ids_categorias.length > 0) {
      for (const id_c of ids_categorias) {
        await client.query("INSERT INTO tbl_usuario_categorias (id_usuario, id_categoria) VALUES ($1, $2)", [id_usuario, id_c]);
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function atualizar_usuario(id_usuario, nome_usuario, nivel_acesso, id_unidade = null, menus_permitidos = null, ids_unidades = [], ids_categorias = [], senha = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const menus = (menus_permitidos && Array.isArray(menus_permitidos)) ? JSON.stringify(menus_permitidos) : null;
    
    if (senha && senha.trim()) {
      await client.query(
        `UPDATE tbl_usuarios 
         SET nome_usuario = $1, nivel_acesso = $2, id_unidade = $3, menus_permitidos = $4::jsonb, senha = $5
         WHERE id_usuario = $6`,
        [nome_usuario.trim(), nivel_acesso, id_unidade || null, menus, senha.trim(), id_usuario]
      );
    } else {
      await client.query(
        `UPDATE tbl_usuarios 
         SET nome_usuario = $1, nivel_acesso = $2, id_unidade = $3, menus_permitidos = $4::jsonb
         WHERE id_usuario = $5`,
        [nome_usuario.trim(), nivel_acesso, id_unidade || null, menus, id_usuario]
      );
    }

    await client.query("DELETE FROM tbl_usuario_unidades WHERE id_usuario = $1", [id_usuario]);
    if (ids_unidades && ids_unidades.length > 0) {
      for (const id_u of ids_unidades) {
        await client.query("INSERT INTO tbl_usuario_unidades (id_usuario, id_unidade) VALUES ($1, $2)", [id_usuario, id_u]);
      }
    }

    await client.query("DELETE FROM tbl_usuario_categorias WHERE id_usuario = $1", [id_usuario]);
    if (ids_categorias && ids_categorias.length > 0) {
      for (const id_c of ids_categorias) {
        await client.query("INSERT INTO tbl_usuario_categorias (id_usuario, id_categoria) VALUES ($1, $2)", [id_usuario, id_c]);
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function atualizar_unidades_usuario(id_usuario, ids_unidades = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM tbl_usuario_unidades WHERE id_usuario = $1", [id_usuario]);
    for (const id_u of ids_unidades) {
      await client.query("INSERT INTO tbl_usuario_unidades (id_usuario, id_unidade) VALUES ($1, $2)", [id_usuario, id_u]);
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function atualizar_menus_usuario(id_usuario, menus_permitidos) {
  const menus = (menus_permitidos && Array.isArray(menus_permitidos)) ? JSON.stringify(menus_permitidos) : null;
  await pool.query(
    "UPDATE tbl_usuarios SET menus_permitidos = $1::jsonb WHERE id_usuario = $2",
    [menus, id_usuario]
  );
  return true;
}

async function rejeitar_usuario(id_usuario) {
  await pool.query("UPDATE tbl_usuarios SET status_aprovacao = 'Rejeitado' WHERE id_usuario = $1", [id_usuario]);
  return true;
}

async function inativar_usuario(id_usuario) {
  await pool.query("UPDATE tbl_usuarios SET ativo = FALSE WHERE id_usuario = $1", [id_usuario]);
  return true;
}

async function ativar_usuario(id_usuario) {
  await pool.query("UPDATE tbl_usuarios SET ativo = TRUE WHERE id_usuario = $1", [id_usuario]);
  return true;
}

async function atualizar_avatar_usuario(id_usuario, avatar_base64) {
  await pool.query("UPDATE tbl_usuarios SET avatar_base64 = $1 WHERE id_usuario = $2", [avatar_base64 || null, id_usuario]);
  return true;
}

async function solicitar_troca_senha(id_usuario, nova_senha) {
  await pool.query("UPDATE tbl_usuarios SET senha_pendente = $1 WHERE id_usuario = $2", [nova_senha, id_usuario]);
  return true;
}

async function aprovar_senha_pendente(id_usuario) {
  const res = await pool.query("SELECT senha_pendente FROM tbl_usuarios WHERE id_usuario = $1", [id_usuario]);
  if (res.rows.length === 0 || !res.rows[0].senha_pendente) {
    throw new Error("Nenhuma solicitação de troca de senha pendente para este usuário.");
  }
  const nova_senha = res.rows[0].senha_pendente;
  await pool.query("UPDATE tbl_usuarios SET senha = $1, senha_pendente = NULL WHERE id_usuario = $2", [nova_senha, id_usuario]);
  return true;
}

async function rejeitar_senha_pendente(id_usuario) {
  await pool.query("UPDATE tbl_usuarios SET senha_pendente = NULL WHERE id_usuario = $1", [id_usuario]);
  return true;
}

// --- CATEGORIAS ---

async function listar_categorias() {
  const res = await pool.query("SELECT * FROM tbl_categorias ORDER BY nome_categoria ASC");
  return res.rows;
}

async function cadastrar_categoria(nome_categoria) {
  await pool.query("INSERT INTO tbl_categorias (nome_categoria) VALUES ($1)", [nome_categoria.trim()]);
  return true;
}

// --- FORNECEDORES ---

async function listar_fornecedores() {
  const res = await pool.query("SELECT * FROM tbl_fornecedores ORDER BY nome_fornecedor ASC");
  return res.rows;
}

async function cadastrar_fornecedor(dados) {
  const { nome_fornecedor, cnpj_cpf, telefone, email, razao_reduzida, cep, endereco, numero, complemento, bairro, cidade, estado } = dados;
  await pool.query(`
    INSERT INTO tbl_fornecedores (nome_fornecedor, cnpj_cpf, telefone, email, razao_reduzida, cep, endereco, numero, complemento, bairro, cidade, estado)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [(nome_fornecedor || '').trim(), (cnpj_cpf || '').trim(), (telefone || '').trim(), (email || '').trim(), (razao_reduzida || '').trim(), (cep || '').trim(), (endereco || '').trim(), (numero || '').trim(), (complemento || '').trim(), (bairro || '').trim(), (cidade || '').trim(), (estado || '').trim()]);
  return true;
}

async function atualizar_fornecedor(id_fornecedor, dados) {
  const { nome_fornecedor, cnpj_cpf, telefone, email, razao_reduzida, cep, endereco, numero, complemento, bairro, cidade, estado } = dados;
  await pool.query(`
    UPDATE tbl_fornecedores
    SET nome_fornecedor = $1, cnpj_cpf = $2, telefone = $3, email = $4,
        razao_reduzida = $5, cep = $6, endereco = $7, numero = $8, complemento = $9,
        bairro = $10, cidade = $11, estado = $12
    WHERE id_fornecedor = $13
  `, [(nome_fornecedor || '').trim(), (cnpj_cpf || '').trim(), (telefone || '').trim(), (email || '').trim(), (razao_reduzida || '').trim(), (cep || '').trim(), (endereco || '').trim(), (numero || '').trim(), (complemento || '').trim(), (bairro || '').trim(), (cidade || '').trim(), (estado || '').trim(), id_fornecedor]);
  return true;
}

async function excluir_fornecedor(id_fornecedor) {
  await pool.query("DELETE FROM tbl_fornecedores WHERE id_fornecedor = $1", [id_fornecedor]);
  return true;
}

// --- PRODUTOS E ESTOQUE ---

async function calcular_estoque_produto(id_produto, id_unidade = null) {
  let query = `
    SELECT 
      COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) IN ('ENTRADA', 'ENTRADAS') OR LOWER(tipo_movimentacao) LIKE 'entrad%' THEN CAST(quantidade AS NUMERIC) ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN UPPER(tipo_movimentacao) IN ('SAIDA', 'SAÍDA', 'SAIDAS', 'SAÍDAS') OR LOWER(tipo_movimentacao) LIKE 'sa%da%' THEN CAST(quantidade AS NUMERIC) ELSE 0 END), 0) as saldo
    FROM tbl_movimentacoes
    WHERE id_produto = $1
  `;
  let params = [id_produto];
  if (id_unidade) {
    query += " AND (id_unidade = $2 OR id_unidade IS NULL)";
    params.push(id_unidade);
  }
  const res = await pool.query(query, params);
  return parseInt(res.rows[0].saldo) || 0;
}

async function obter_ultimo_custo_produto(id_produto) {
  const res = await pool.query(`
    SELECT valor_unitario
    FROM tbl_movimentacoes
    WHERE id_produto = $1 AND UPPER(tipo_movimentacao) = 'ENTRADA' AND valor_unitario > 0
    ORDER BY data_movimentacao DESC, id_movimentacao DESC
    LIMIT 1
  `, [id_produto]);
  if (res.rows.length > 0 && parseFloat(res.rows[0].valor_unitario) > 0) {
    return parseFloat(res.rows[0].valor_unitario);
  }
  const prodRes = await pool.query("SELECT preco_custo FROM tbl_produtos WHERE id_produto = $1", [id_produto]);
  return prodRes.rows.length > 0 ? (parseFloat(prodRes.rows[0].preco_custo) || 0.0) : 0.0;
}

async function listar_produtos(busca = "", categoria_id = null, id_unidade = null, incluir_inativos = false, id_usuario = null, nivel_acesso = null) {
  let where_conditions = [];
  let params = [];
  let p = 1;

  if (!incluir_inativos) {
    where_conditions.push("p.inativo = FALSE");
  }

  if (busca && busca.trim()) {
    where_conditions.push(`(LOWER(p.nome_produto) LIKE LOWER($${p}) OR LOWER(p.codigo_barras) LIKE LOWER($${p}))`);
    params.push(`%${busca.trim()}%`);
    p++;
  }

  if (categoria_id) {
    where_conditions.push(`p.id_categoria = $${p++}`);
    params.push(categoria_id);
  }

  // Filter by allowed categories for non-admin users
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

  const sql = `
    SELECT p.id_produto, p.codigo_barras, p.nome_produto, p.id_categoria, p.id_fornecedor,
           p.id_unidade, p.estoque_minimo, p.preco_custo, p.preco_venda, p.inativo,
           p.id_usuario, us.nome_usuario AS nome_usuario_cadastro,
           c.nome_categoria, f.nome_fornecedor, u.nome_unidade
    FROM tbl_produtos p
    LEFT JOIN tbl_categorias c ON p.id_categoria = c.id_categoria
    LEFT JOIN tbl_fornecedores f ON p.id_fornecedor = f.id_fornecedor
    LEFT JOIN tbl_unidades_operacionais u ON p.id_unidade = u.id_unidade
    LEFT JOIN tbl_usuarios us ON p.id_usuario = us.id_usuario
    ${where_clause}
    ORDER BY p.nome_produto ASC
  `;

  const res = await pool.query(sql, params);
  const produtos = [];
  for (const r of res.rows) {
    const estoque_atual = await calcular_estoque_produto(r.id_produto, id_unidade);
    const preco_custo_calculado = await obter_ultimo_custo_produto(r.id_produto);
    const estoque_minimo = parseInt(r.estoque_minimo) || 0;

    let status_estoque = "Normal";
    if (estoque_atual <= 0) {
      status_estoque = "Zerado";
    } else if (estoque_atual <= estoque_minimo) {
      status_estoque = "Baixo";
    }

    produtos.push({
      id_produto: r.id_produto,
      codigo_barras: r.codigo_barras || "",
      nome_produto: r.nome_produto,
      id_categoria: r.id_categoria,
      nome_categoria: r.nome_categoria || "Sem Categoria",
      id_fornecedor: r.id_fornecedor,
      nome_fornecedor: r.nome_fornecedor || "Sem Fornecedor",
      id_unidade: r.id_unidade,
      nome_unidade: r.nome_unidade || "Global",
      estoque_minimo: estoque_minimo,
      estoque_atual: estoque_atual,
      status_estoque: status_estoque,
      preco_custo: preco_custo_calculado,
      preco_venda: parseFloat(r.preco_venda) || 0.0,
      inativo: !!r.inativo,
      id_usuario: r.id_usuario,
      nome_usuario_cadastro: r.nome_usuario_cadastro || "Sistema"
    });
  }
  return produtos;
}

async function obter_produto_por_id(id_produto, id_unidade = null) {
  const res = await pool.query("SELECT * FROM tbl_produtos WHERE id_produto = $1", [id_produto]);
  if (res.rows.length === 0) return null;
  const produto = res.rows[0];
  produto.estoque_atual = await calcular_estoque_produto(id_produto, id_unidade);
  return produto;
}

async function salvar_produto(dados) {
  const { id_produto, codigo_barras, nome_produto, id_categoria, id_fornecedor, id_unidade, estoque_minimo, preco_custo, preco_venda, id_usuario, inativo } = dados;
  const is_inativo = inativo === true;
  
  if (is_inativo && id_produto) {
    const estoque_atual = await calcular_estoque_produto(id_produto);
    if (estoque_atual > 0) {
      throw new Error("Não é possível inativar o produto pois ele possui estoque.");
    }
  }

  if (id_produto) {
    await pool.query(`
      UPDATE tbl_produtos 
      SET codigo_barras = $1, nome_produto = $2, id_categoria = $3, id_fornecedor = $4, id_unidade = $5,
          estoque_minimo = $6, preco_custo = $7, preco_venda = $8, id_usuario = COALESCE($9, id_usuario), inativo = $10
      WHERE id_produto = $11
    `, [codigo_barras || null, (nome_produto || '').trim(), id_categoria || null, id_fornecedor || null, id_unidade || null, parseInt(estoque_minimo) || 0, parseFloat(preco_custo) || 0.0, parseFloat(preco_venda) || 0.0, id_usuario || null, is_inativo, id_produto]);
    return id_produto;
  } else {
    const res = await pool.query(`
      INSERT INTO tbl_produtos (codigo_barras, nome_produto, id_categoria, id_fornecedor, id_unidade, estoque_minimo, preco_custo, preco_venda, id_usuario, inativo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_produto
    `, [codigo_barras || null, (nome_produto || '').trim(), id_categoria || null, id_fornecedor || null, id_unidade || null, parseInt(estoque_minimo) || 0, parseFloat(preco_custo) || 0.0, parseFloat(preco_venda) || 0.0, id_usuario || null, is_inativo]);
    return res.rows[0].id_produto;
  }
}

async function excluir_produto(id_produto) {
  const estoque_atual = await calcular_estoque_produto(id_produto);
  if (estoque_atual > 0) {
    throw new Error("Não é possível inativar o produto pois ele possui estoque.");
  }
  await pool.query("UPDATE tbl_produtos SET inativo = TRUE WHERE id_produto = $1", [id_produto]);
  return true;
}

// --- MOVIMENTAÇÕES ---

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

    const preco_custo = await obter_ultimo_custo_produto(r.id_produto);
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

function getHojeLocalIso() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function normalizarDataIso(d) {
  if (!d) return null;
  d = String(d).trim();
  if (!d) return null;
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return d.split('T')[0].split(' ')[0].trim();
}

async function gerar_relatorio_sugestao_compras(id_unidade = null, id_categoria = null, data_inicio = null, data_fim = null, id_usuario = null, nivel_acesso = null, data_entrega = null) {
  const hojeLocal = getHojeLocalIso();
  const dFimStr = normalizarDataIso(data_fim) || hojeLocal;
  let dInicioStr = normalizarDataIso(data_inicio);
  if (!dInicioStr) {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 30);
    const ano = inicio.getFullYear();
    const mes = String(inicio.getMonth() + 1).padStart(2, '0');
    const dia = String(inicio.getDate()).padStart(2, '0');
    dInicioStr = `${ano}-${mes}-${dia}`;
  }

  const dEntregaStr = normalizarDataIso(data_entrega);
  let dias_ate_entrega = 0;
  if (dEntregaStr) {
    const dtEntrega = new Date(dEntregaStr + 'T00:00:00');
    const refStr = (dFimStr && dFimStr < hojeLocal) ? dFimStr : hojeLocal;
    const dtRef = new Date(refStr + 'T00:00:00');
    dias_ate_entrega = Math.max(0, Math.round((dtEntrega - dtRef) / (1000 * 60 * 60 * 24)));
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

  const dtInicio = new Date(dInicioStr + 'T00:00:00');
  const dtFim = new Date(dFimStr + 'T00:00:00');
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

  const relatorio = [];
  for (const r of res.rows) {
    const estoque_real = await calcular_estoque_produto(r.id_produto, id_unidade);
    const estoque_minimo = parseInt(r.estoque_minimo) || 0;
    const preco_custo_calculado = await obter_ultimo_custo_produto(r.id_produto);

    let consumoSql, consumoParams;
    if (id_unidade) {
      consumoSql = `
        SELECT COALESCE(SUM(CAST(quantidade AS NUMERIC)), 0) AS consumo
        FROM tbl_movimentacoes
        WHERE id_produto = $1 
          AND (id_unidade = $2 OR id_unidade IS NULL)
          AND (UPPER(tipo_movimentacao) IN ('SAIDA', 'SAÍDA', 'SAIDAS', 'SAÍDAS') OR LOWER(tipo_movimentacao) LIKE 'sa%da%')
          AND (data_movimentacao::date >= $3::date AND data_movimentacao::date <= $4::date)
      `;
      consumoParams = [r.id_produto, id_unidade, dInicioStr, dFimStr];
    } else {
      consumoSql = `
        SELECT COALESCE(SUM(CAST(quantidade AS NUMERIC)), 0) AS consumo
        FROM tbl_movimentacoes
        WHERE id_produto = $1
          AND (UPPER(tipo_movimentacao) IN ('SAIDA', 'SAÍDA', 'SAIDAS', 'SAÍDAS') OR LOWER(tipo_movimentacao) LIKE 'sa%da%')
          AND (data_movimentacao::date >= $2::date AND data_movimentacao::date <= $3::date)
      `;
      consumoParams = [r.id_produto, dInicioStr, dFimStr];
    }

    const consumoRes = await pool.query(consumoSql, consumoParams);
    const consumo_periodo = Math.round(parseFloat(consumoRes.rows[0]?.consumo || 0));
    const media_consumo = dias_periodo > 0 ? (consumo_periodo / dias_periodo) : 0;
    const consumo_adicional_entrega = media_consumo * dias_ate_entrega;
    
    // Novo cálculo do estoque mínimo
    const estoque_minimo_calculado = Math.ceil(consumo_adicional_entrega * 1.05);
    
    const sugestao_pedido = Math.max(0, Math.ceil(consumo_periodo + consumo_adicional_entrega + estoque_minimo_calculado - estoque_real));

    const preco_custo = preco_custo_calculado;
    const valor_sugestao = sugestao_pedido > 0 ? sugestao_pedido * preco_custo : 0;

    relatorio.push({
      id_produto: r.id_produto,
      nome_produto: r.nome_produto,
      nome_unidade: id_unidade ? nome_unidade_relatorio : (r.nome_unidade_produto || "Todas as Unidades"),
      nome_categoria: r.nome_categoria || "Sem Categoria",
      estoque_real,
      consumo_periodo,
      dias_ate_entrega,
      consumo_adicional_entrega: Math.round(consumo_adicional_entrega),
      consumo_diario: parseFloat(media_consumo.toFixed(2)),
      estoque_minimo: estoque_minimo_calculado,
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
    SELECT id_lancamento, to_char(data_lancamento, 'YYYY-MM-DD') as data_lancamento, to_char(data_validacao, 'YYYY-MM-DD') as data_validacao, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao, aguardando_analise
    FROM tbl_estagios_lancamentos
    ORDER BY id_lancamento DESC
  `);
  return res.rows;
}

async function salvar_lancamento_estagio(id_lancamento, data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao, aguardando_analise) {
  if (id_lancamento) {
    await pool.query(`
      UPDATE tbl_estagios_lancamentos
       SET data_lancamento = $1, status = $2, nome_aluno = $3, unidade = $4, curso = $5, turma = $6, horas_totais = $7, protocolo_ew = $8, observacoes = $9, horas_campo = $11, horas_capacitacao = $12, horas_laboratorio = $13, horas_evento = $14, horas_enf_cirurgica = $15, horas_enf_medica = $16, horas_saude_mulher = $17, horas_saude_mental = $18, horas_saude_publica = $19, horas_emergencia = $20, validado_coordenacao = $21, nome_usuario_validacao = COALESCE($22, nome_usuario_validacao), data_validacao = CASE WHEN $21 = TRUE AND data_validacao IS NULL THEN CURRENT_TIMESTAMP ELSE data_validacao END, aguardando_analise = $23
       WHERE id_lancamento = $10
    `, [data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, id_lancamento, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao || false, nome_usuario_validacao || null, aguardando_analise || false]);
    return id_lancamento;
  } else {
    const res = await pool.query(
      `INSERT INTO tbl_estagios_lancamentos (data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao, aguardando_analise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id_lancamento`,
      [data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo || 0, horas_capacitacao || 0, horas_laboratorio || 0, horas_evento || 0, horas_enf_cirurgica || 0, horas_enf_medica || 0, horas_saude_mulher || 0, horas_saude_mental || 0, horas_saude_publica || 0, horas_emergencia || 0, validado_coordenacao || false, nome_usuario_registro || null, nome_usuario_validacao || null, aguardando_analise || false]
    );
    return res.rows[0].id_lancamento;
  }
}

async function excluir_lancamento_estagio(id_lancamento) {
  await pool.query("DELETE FROM tbl_estagios_lancamentos WHERE id_lancamento = $1", [id_lancamento]);
  return true;
}

// --- DOCUMENTOS ---

async function documentos_salvar(doc) {
    try {
        await pool.query(`ALTER TABLE tbl_documentos ALTER COLUMN arquivo_base64 DROP NOT NULL;`);
    } catch (e) {}
    try {
        await pool.query(`ALTER TABLE tbl_documentos ALTER COLUMN data_upload DROP NOT NULL;`);
    } catch (e) {}

    const colsRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tbl_documentos'
    `);
    const existingCols = colsRes.rows.map(r => r.column_name);

    const cols = ['curso', 'tipo_documento', 'nome_arquivo'];
    const values = [doc.curso, doc.tipo_documento, doc.nome_arquivo];

    if (existingCols.includes('tipo_mime')) {
        cols.push('tipo_mime');
        values.push(doc.tipo_mime || null);
    }
    if (existingCols.includes('dados_arquivo')) {
        cols.push('dados_arquivo');
        values.push(doc.dados_arquivo);
    }
    if (existingCols.includes('arquivo_base64')) {
        cols.push('arquivo_base64');
        values.push(doc.dados_arquivo);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
        INSERT INTO tbl_documentos (${cols.join(', ')})
        VALUES (${placeholders})
        RETURNING *;
    `;
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function documentos_listar(curso) {
    let query = `
        SELECT id_documento, curso, tipo_documento, nome_arquivo, tipo_mime, data_inclusao
        FROM tbl_documentos
    `;
    let values = [];
    if (curso) {
        query += ` WHERE curso = $1`;
        values.push(curso);
    }
    query += ` ORDER BY data_inclusao DESC`;
    const { rows } = await pool.query(query, values);
    return rows;
}

async function documentos_obter_arquivo(id) {
    const { rows } = await pool.query(`SELECT * FROM tbl_documentos WHERE id_documento = $1`, [id]);
    if (rows[0]) {
        if (!rows[0].dados_arquivo && rows[0].arquivo_base64) {
            rows[0].dados_arquivo = rows[0].arquivo_base64;
        }
        if (!rows[0].arquivo_base64 && rows[0].dados_arquivo) {
            rows[0].arquivo_base64 = rows[0].dados_arquivo;
        }
    }
    return rows[0];
}

async function documentos_excluir(id) {
    await pool.query(`DELETE FROM tbl_documentos WHERE id_documento = $1`, [id]);
    return true;
}

async function get_last_db_update() {
    try {
        const res = await pool.query(`
            SELECT MAX(ts) AS ultima_atualizacao FROM (
                SELECT MAX(data_movimentacao) AS ts FROM tbl_movimentacoes
                UNION ALL
                SELECT MAX(data_cadastro) AS ts FROM tbl_estagios_lancamentos
                UNION ALL
                SELECT MAX(data_validacao) AS ts FROM tbl_estagios_lancamentos
                UNION ALL
                SELECT MAX(data_cadastro) AS ts FROM tbl_produtos
                UNION ALL
                SELECT MAX(data_inclusao) AS ts FROM tbl_documentos
            ) AS sub
        `);
        if (res.rows.length > 0 && res.rows[0].ultima_atualizacao) {
            return res.rows[0].ultima_atualizacao;
        }
    } catch (e) {
        console.error("Erro ao obter get_last_db_update:", e);
    }
    return new Date().toISOString();
}

module.exports = {
    get_last_db_update,
    documentos_salvar,
    documentos_listar,
    documentos_obter_arquivo,
    documentos_excluir,

  init_db,
  listar_unidades,
  cadastrar_unidade,
  atualizar_unidade,
  autenticar_usuario,
  cadastrar_usuario,
  listar_usuarios,
  atualizar_avatar_usuario,
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
  atualizar_fornecedor,
  excluir_fornecedor,
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
