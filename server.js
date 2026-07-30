const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const database = require('./src/database');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar o banco de dados
database.init_db().catch(err => {
  console.error("Falha ao inicializar o banco na partida do app:", err.message);
  process.exit(1);
});

// Rotas do Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- API DE AUTENTICAÇÃO E USUÁRIOS ---

app.post('/api/auth/login', async (req, res) => {
  const usuario = (req.body.usuario || '').trim();
  const senha = (req.body.senha || '').trim();

  if (!usuario || !senha) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
  }

  try {
    const user_info = await database.autenticar_usuario(usuario, senha);
    if (user_info) {
      return res.json({ success: true, user: user_info, message: 'Login realizado com sucesso!' });
    } else {
      return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });
    }
  } catch (e) {
    return res.status(403).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const usuario = (req.body.usuario || '').trim();
  const senha = (req.body.senha || '').trim();
  const nome_usuario = (req.body.nome_usuario || '').trim();
  const nivel_acesso = (req.body.nivel_acesso || 'Operador').trim();

  if (!usuario || !senha || !nome_usuario) {
    return res.status(400).json({ success: false, message: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }

  try {
    await database.cadastrar_usuario(usuario, senha, nome_usuario, nivel_acesso, null, "Pendente");
    return res.json({ success: true, message: `Usuário "${usuario}" cadastrado! Aguarde a aprovação do administrador para acessar o sistema.` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await database.listar_usuarios();
    return res.json({ success: true, users });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/aprovar', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  const id_unidade = req.body.id_unidade ? parseInt(req.body.id_unidade) : null;
  const nivel_acesso = req.body.nivel_acesso || 'Operador';

  if (!id_unidade) {
    return res.status(400).json({ success: false, message: 'Selecione uma Unidade Operacional para vincular ao usuário.' });
  }

  try {
    await database.aprovar_usuario(id_usuario, id_unidade, nivel_acesso);
    return res.json({ success: true, message: 'Usuário aprovado com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/editar', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  const id_unidade = req.body.id_unidade ? parseInt(req.body.id_unidade) : null;
  const nivel_acesso = req.body.nivel_acesso || 'Operador';

  if (!id_unidade) {
    return res.status(400).json({ success: false, message: 'Selecione uma Unidade Operacional.' });
  }

  try {
    await database.atualizar_usuario(id_usuario, id_unidade, nivel_acesso);
    return res.json({ success: true, message: 'Unidade operacional do usuário atualizada com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/rejeitar', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  try {
    await database.rejeitar_usuario(id_usuario);
    return res.json({ success: true, message: 'Cadastro do usuário rejeitado.' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE UNIDADES OPERACIONAIS ---

app.get('/api/unidades', async (req, res) => {
  try {
    const unidades = await database.listar_unidades();
    return res.json({ success: true, unidades });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/unidades', async (req, res) => {
  const id_unidade = req.body.id_unidade ? parseInt(req.body.id_unidade) : null;
  const nome = (req.body.nome_unidade || '').trim();
  const endereco = (req.body.endereco || '').trim();
  const cnpj = (req.body.cnpj || '').trim();

  if (!nome) {
    return res.status(400).json({ success: false, message: 'Nome da unidade é obrigatório.' });
  }

  try {
    if (id_unidade) {
      await database.atualizar_unidade(id_unidade, nome, endereco, cnpj);
      return res.json({ success: true, message: 'Unidade operacional atualizada!' });
    } else {
      await database.cadastrar_unidade(nome, endereco, cnpj);
      return res.json({ success: true, message: 'Unidade operacional cadastrada com sucesso!' });
    }
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE DASHBOARD ---

app.get('/api/dashboard', async (req, res) => {
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;
  try {
    const stats = await database.obter_dados_dashboard(id_unidade);
    return res.json({ success: true, data: stats });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// --- API DE PRODUTOS ---

app.get('/api/produtos', async (req, res) => {
  const busca = (req.query.busca || '').trim();
  const categoria_id = req.query.categoria_id ? parseInt(req.query.categoria_id) : null;
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;

  try {
    const produtos = await database.listar_produtos(busca, categoria_id, id_unidade);
    return res.json({ success: true, produtos });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/produtos/:id_produto', async (req, res) => {
  const id_produto = parseInt(req.params.id_produto);
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;

  try {
    const produto = await database.obter_produto_por_id(id_produto, id_unidade);
    if (produto) {
      return res.json({ success: true, produto });
    }
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/produtos', async (req, res) => {
  if (!req.body.nome_produto) {
    return res.status(400).json({ success: false, message: 'O nome do produto é obrigatório.' });
  }

  try {
    await database.salvar_produto(req.body);
    const action = req.body.id_produto ? "atualizado" : "cadastrado";
    return res.json({ success: true, message: `Produto ${action} com sucesso!` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/produtos/:id_produto', async (req, res) => {
  const id_produto = parseInt(req.params.id_produto);
  try {
    await database.excluir_produto(id_produto);
    return res.json({ success: true, message: 'Produto excluído com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE CATEGORIAS E FORNECEDORES ---

app.get('/api/categorias', async (req, res) => {
  try {
    const categorias = await database.listar_categorias();
    return res.json({ success: true, categorias });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/categorias', async (req, res) => {
  const nome = (req.body.nome_categoria || '').trim();
  if (!nome) {
    return res.status(400).json({ success: false, message: 'Nome da categoria é obrigatório.' });
  }
  try {
    await database.cadastrar_categoria(nome);
    return res.json({ success: true, message: 'Categoria cadastrada com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.get('/api/fornecedores', async (req, res) => {
  try {
    const fornecedores = await database.listar_fornecedores();
    return res.json({ success: true, fornecedores });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/fornecedores', async (req, res) => {
  const nome = (req.body.nome_fornecedor || '').trim();
  if (!nome) {
    return res.status(400).json({ success: false, message: 'Nome do fornecedor é obrigatório.' });
  }
  try {
    await database.cadastrar_fornecedor(
      nome,
      req.body.cnpj_cpf || '',
      req.body.telefone || '',
      req.body.email || ''
    );
    return res.json({ success: true, message: 'Fornecedor cadastrado com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE MOVIMENTAÇÕES DE ESTOQUE ---

app.get('/api/movimentacoes', async (req, res) => {
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;
  const id_produto = req.query.id_produto ? parseInt(req.query.id_produto) : null;
  const data_inicio = (req.query.data_inicio || '').trim() || null;
  const data_fim = (req.query.data_fim || '').trim() || null;
  const tipo_movimentacao = (req.query.tipo_movimentacao || '').trim() || null;

  try {
    const movs = await database.listar_movimentacoes(1000, id_unidade, data_inicio, data_fim, id_produto, tipo_movimentacao);
    return res.json({ success: true, movimentacoes: movs });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/movimentacoes', async (req, res) => {
  const { id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor } = req.body;

  if (!id_produto || !tipo_movimentacao || !quantidade) {
    return res.status(400).json({ success: false, message: 'Produto, tipo e quantidade são obrigatórios.' });
  }

  try {
    await database.registrar_movimentacao(
      id_produto,
      tipo_movimentacao,
      quantidade,
      valor_unitario,
      observacao,
      data_movimentacao,
      id_unidade,
      id_fornecedor
    );
    return res.json({ success: true, message: `Movimentação de ${tipo_movimentacao} registrada com sucesso!` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log("=========================================================");
  console.log("  INICIANDO CONTROLE DE ESTOQUES - ITEC (NODE.JS)");
  console.log("=========================================================");
  console.log(`  Servidor web rodando em: http://127.0.0.1:${PORT}`);
  console.log("  Pressione Ctrl+C para encerrar o servidor.");
  console.log("=========================================================");
});
