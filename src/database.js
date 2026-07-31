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
          status_aprovacao VARCHAR(20) DEFAULT 'Pendente'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tbl_categorias (
          id_categoria SERIAL PRIMARY KEY,
          nome_categoria VARCHAR(100) NOT NULL UNIQUE
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
      ALTER TABLE tbl_produtos 
      ADD COLUMN IF NOT EXISTS inativo BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE SET NULL;
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
    SELECT u.id_usuario, u.usuario, u.senha, u.nome_usuario, u.nivel_acesso, u.id_unidade, u.status_aprovacao, un.nome_unidade
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
    return {
      id_usuario: row.id_usuario,
      usuario: row.usuario,
      nome_usuario: row.nome_usuario,
      nivel_acesso: row.nivel_acesso,
      id_unidade: row.id_unidade,
      status_aprovacao: status,
      nome_unidade: row.nome_unidade || "Não Atrelado"
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
    SELECT u.id_usuario, u.usuario, u.nome_usuario, u.nivel_acesso, u.status_aprovacao, u.id_unidade, un.nome_unidade
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
    nome_unidade: r.nome_unidade || "Sem Unidade"
  }));
}

async function aprovar_usuario(id_usuario, id_unidade, nivel_acesso = "Operador") {
  await pool.query(`
    UPDATE tbl_usuarios
    SET status_aprovacao = 'Aprovado', id_unidade = $1, nivel_acesso = $2
    WHERE id_usuario = $3
  `, [id_unidade, nivel_acesso, id_usuario]);
  return true;
}

async function atualizar_usuario(id_usuario, id_unidade, nivel_acesso = "Operador") {
  await pool.query(`
    UPDATE tbl_usuarios
    SET id_unidade = $1, nivel_acesso = $2
    WHERE id_usuario = $3
  `, [id_unidade, nivel_acesso, id_usuario]);
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

async function listar_categorias() {
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
  return (res.rows[0] && res.rows[0].valor_unitario) ? parseFloat(res.rows[0].valor_unitario) : 0.0;
}

async function listar_produtos(filtro_busca = "", id_categoria = null, id_unidade = null) {
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

async function registrar_movimentacao(id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao = "", data_movimentacao = null, id_unidade = null, id_fornecedor = null, id_usuario = null) {
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
    INSERT INTO tbl_movimentacoes (id_produto, tipo_movimentacao, quantidade, valor_unitario, data_movimentacao, observacao, id_unidade, id_fornecedor, id_usuario)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [id_produto, tipo, qtd, valor, dataMov, observacao, id_unidade || null, id_fornecedor || null, id_usuario || null]);
  return true;
}

async function listar_movimentacoes(limit = 1000, id_unidade = null, data_inicio = null, data_fim = null, id_produto = null, tipo_movimentacao = null) {
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
    where_conditions.push(`UPPER(m.tipo_movimentacao) = $${p++}`);
    params.push(tipo_movimentacao.toUpperCase());
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

  const where_clause = where_conditions.length ? " WHERE " + where_conditions.join(" AND ") : "";

  let query = `
    SELECT m.id_movimentacao, m.id_produto, p.nome_produto, m.tipo_movimentacao,
           m.quantidade, m.valor_unitario, m.data_movimentacao, m.observacao, m.id_unidade, u.nome_unidade,
           m.id_fornecedor, f.nome_fornecedor, m.id_usuario, us.nome_usuario AS nome_usuario_movimentacao
    FROM tbl_movimentacoes m
    INNER JOIN tbl_produtos p ON m.id_produto = p.id_produto
    LEFT JOIN tbl_unidades_operacionais u ON m.id_unidade = u.id_unidade
    LEFT JOIN tbl_fornecedores f ON m.id_fornecedor = f.id_fornecedor
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
    id_unidade: r.id_unidade,
    nome_unidade: r.nome_unidade || "Sem Unidade",
    id_fornecedor: r.id_fornecedor,
    nome_fornecedor: r.nome_fornecedor || "Sem Fornecedor",
    id_usuario: r.id_usuario,
    nome_usuario_movimentacao: r.nome_usuario_movimentacao || "Sistema"
  }));
}

async function obter_dados_dashboard(id_unidade = null) {
  const produtosAll = await listar_produtos("", null, id_unidade);
  const produtos = produtosAll.filter(p => !p.inativo);
  const total_produtos = produtos.length;
  
  const total_estoque_itens = produtos.reduce((acc, p) => acc + p.estoque_atual, 0);
  const valor_total_custo = produtos.reduce((acc, p) => p.estoque_atual > 0 ? acc + (p.estoque_atual * p.preco_custo) : acc, 0);
  const valor_total_venda = produtos.reduce((acc, p) => p.estoque_atual > 0 ? acc + (p.estoque_atual * p.preco_venda) : acc, 0);
  
  const produtos_baixo_estoque = produtos.filter(p => p.status_estoque === "Baixo" || p.status_estoque === "Zerado");
  const movimentacoes_recentes = await listar_movimentacoes(10, id_unidade);

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
  rejeitar_usuario,
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
  listar_movimentacoes,
  obter_dados_dashboard
};
