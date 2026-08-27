const fs = require('fs');

let content = fs.readFileSync('src/database.js', 'utf8');

const correctInitDb = `async function init_db() {
  const client = await pool.connect();
  try {
    await client.query(\`
      CREATE TABLE IF NOT EXISTS tbl_unidades_operacionais (
          id_unidade SERIAL PRIMARY KEY,
          nome_unidade VARCHAR(150) NOT NULL UNIQUE,
          endereco VARCHAR(255),
          cnpj VARCHAR(30)
      );
    \`);

    await client.query(\`
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
    \`);

    await client.query(\`
      ALTER TABLE tbl_usuarios 
      ADD COLUMN IF NOT EXISTS senha_pendente VARCHAR(100),
      ADD COLUMN IF NOT EXISTS menus_permitidos JSONB DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS tbl_categorias (
          id_categoria SERIAL PRIMARY KEY,
          nome_categoria VARCHAR(100) NOT NULL UNIQUE
      );
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS tbl_usuario_categorias (
          id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE CASCADE,
          id_categoria INT REFERENCES tbl_categorias(id_categoria) ON DELETE CASCADE,
          PRIMARY KEY (id_usuario, id_categoria)
      );
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS tbl_usuario_unidades (
          id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE CASCADE,
          id_unidade INT REFERENCES tbl_unidades_operacionais(id_unidade) ON DELETE CASCADE,
          PRIMARY KEY (id_usuario, id_unidade)
      );
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS tbl_fornecedores (
          id_fornecedor SERIAL PRIMARY KEY,
          nome_fornecedor VARCHAR(150) NOT NULL,
          cnpj_cpf VARCHAR(20),
          telefone VARCHAR(20),
          email VARCHAR(100)
      );
    \`);

    await client.query(\`
      ALTER TABLE tbl_fornecedores 
      ADD COLUMN IF NOT EXISTS razao_reduzida VARCHAR(150),
      ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
      ADD COLUMN IF NOT EXISTS endereco VARCHAR(150),
      ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
      ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
      ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
      ADD COLUMN IF NOT EXISTS estado VARCHAR(2);
    \`).catch(err => console.error("Aviso ao adicionar colunas tbl_fornecedores:", err.message));

    await client.query(\`
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
    \`);

    await client.query(\`
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
    \`);

    await client.query(\`
      ALTER TABLE tbl_movimentacoes 
      ADD COLUMN IF NOT EXISTS id_fornecedor INT REFERENCES tbl_fornecedores(id_fornecedor) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE SET NULL;
    \`);

    await client.query(\`
      ALTER TABLE tbl_movimentacoes 
      ADD COLUMN IF NOT EXISTS id_centro_custo INT REFERENCES tbl_centros_custo(id_centro_custo) ON DELETE SET NULL;
    \`);

    await client.query(\`
      ALTER TABLE tbl_movimentacoes 
      ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(50) DEFAULT NULL;
    \`);

    await client.query(\`
      ALTER TABLE tbl_produtos 
      ADD COLUMN IF NOT EXISTS inativo BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS id_usuario INT REFERENCES tbl_usuarios(id_usuario) ON DELETE SET NULL;
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS tbl_centros_custo (
          id_centro_custo SERIAL PRIMARY KEY,
          codigo VARCHAR(30) NOT NULL UNIQUE,
          nome VARCHAR(150) NOT NULL,
          descricao TEXT
      );
    \`);`;

const regex = /async function init_db\(\) \{[\s\S]*?CREATE TABLE IF NOT EXISTS tbl_centros_custo \([\s\S]*?\);\n    `\);/m;

if (regex.test(content)) {
    const newContent = content.replace(regex, correctInitDb);
    fs.writeFileSync('src/database.js', newContent);
    console.log('Fixed database.js!');
} else {
    console.log('Regex did not match. Cannot fix.');
}
