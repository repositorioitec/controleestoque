const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const database = require('./src/database');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
  res.redirect('/');
});

app.get('/login.html', (req, res) => {
  res.redirect('/');
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
  const id_unidade = req.body.id_unidade ? parseInt(req.body.id_unidade) : null;

  if (!usuario || !senha || !nome_usuario) {
    return res.status(400).json({ success: false, message: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }

  try {
    await database.cadastrar_usuario(usuario, senha, nome_usuario, nivel_acesso, id_unidade, "Pendente");
    return res.json({ success: true, message: `Usuário "${usuario}" cadastrado! Aguarde a aprovação do administrador para acessar o sistema.` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// Delete usuário (admin only)
app.delete('/api/auth/users/:id_usuario', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  try {
    await database.excluir_usuario(id_usuario);
    return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// Listar usuários (used by front‑end)
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
  const nivel_acesso = req.body.nivel_acesso || 'Operador';
  const categorias_acesso = Array.isArray(req.body.categorias) ? req.body.categorias.map(Number) : [];
  let unidades_acesso = Array.isArray(req.body.unidades) ? req.body.unidades.map(Number) : [];

  // Se marcou "Todas as Unidades", busca todos os IDs
  if (req.body.todas_unidades === true || req.body.todas_unidades === 'true') {
    try {
      const todasUnidades = await database.listar_unidades();
      unidades_acesso = todasUnidades.map(u => u.id_unidade);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Erro ao buscar unidades: ' + e.message });
    }
  }

  if (unidades_acesso.length === 0) {
    return res.status(400).json({ success: false, message: 'Selecione ao menos uma Unidade Operacional para vincular ao usuário.' });
  }

  try {
    await database.aprovar_usuario(id_usuario, unidades_acesso, nivel_acesso, categorias_acesso);
    return res.json({ success: true, message: 'Usuário aprovado com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/editar', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  const nivel_acesso = req.body.nivel_acesso || 'Operador';
  const categorias_acesso = Array.isArray(req.body.categorias) ? req.body.categorias.map(Number) : [];
  let unidades_acesso = Array.isArray(req.body.unidades) ? req.body.unidades.map(Number) : [];

  // Se marcou "Todas as Unidades", busca todos os IDs
  if (req.body.todas_unidades === true || req.body.todas_unidades === 'true') {
    try {
      const todasUnidades = await database.listar_unidades();
      unidades_acesso = todasUnidades.map(u => u.id_unidade);
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Erro ao buscar unidades: ' + e.message });
    }
  }

  if (unidades_acesso.length === 0) {
    return res.status(400).json({ success: false, message: 'Selecione ao menos uma Unidade Operacional.' });
  }

  try {
    await database.atualizar_usuario(id_usuario, unidades_acesso, nivel_acesso, categorias_acesso);
    return res.json({ success: true, message: 'Permissões do usuário atualizadas com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/menus', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  const menus = req.body.menus; // Deve ser um array ou null
  try {
    await database.atualizar_menus_usuario(id_usuario, menus);
    return res.json({ success: true, message: 'Permissões de menu atualizadas com sucesso!' });
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

app.post('/api/auth/users/:id_usuario/inativar', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  try {
    await database.inativar_usuario(id_usuario);
    return res.json({ success: true, message: 'Usuário inativado com sucesso.' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/ativar', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  try {
    await database.ativar_usuario(id_usuario);
    return res.json({ success: true, message: 'Usuário reativado com sucesso.' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/solicitar-senha', async (req, res) => {
  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const { senha_atual, nova_senha } = req.body;
  
  if (!id_usuario || !senha_atual || !nova_senha) {
    return res.status(400).json({ success: false, message: 'Dados inválidos.' });
  }

  try {
    await database.solicitar_troca_senha(id_usuario, senha_atual, nova_senha);
    return res.json({ success: true, message: 'Troca de senha solicitada com sucesso! Aguarde aprovação do administrador.' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/aprovar-senha', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  try {
    await database.aprovar_senha_pendente(id_usuario);
    return res.json({ success: true, message: 'Senha aprovada com sucesso.' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/auth/users/:id_usuario/rejeitar-senha', async (req, res) => {
  const id_usuario = parseInt(req.params.id_usuario);
  try {
    await database.rejeitar_senha_pendente(id_usuario);
    return res.json({ success: true, message: 'Solicitação de troca de senha rejeitada.' });
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

// --- API DE CENTROS DE CUSTO ---

app.get('/api/centros-custo', async (req, res) => {
  try {
    const centros = await database.listar_centros_custo();
    return res.json({ success: true, centros });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/centros-custo', async (req, res) => {
  const id_centro_custo = req.body.id_centro_custo ? parseInt(req.body.id_centro_custo) : null;
  const codigo = (req.body.codigo || '').trim();
  const nome = (req.body.nome || '').trim();
  const descricao = (req.body.descricao || '').trim();

  if (!codigo || !nome) {
    return res.status(400).json({ success: false, message: 'Código e Nome são obrigatórios.' });
  }

  try {
    await database.salvar_centro_custo(id_centro_custo, codigo, nome, descricao);
    const action = id_centro_custo ? 'atualizado' : 'cadastrado';
    return res.json({ success: true, message: `Centro de Custo ${action} com sucesso!` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/centros-custo/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await database.excluir_centro_custo(id);
    return res.json({ success: true, message: 'Centro de Custo excluído com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE DASHBOARD ---

app.get('/api/dashboard', async (req, res) => {
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;
  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const nivel_acesso = req.headers['x-user-nivel'] || null;
  try {
    const stats = await database.obter_dados_dashboard(id_unidade, id_usuario, nivel_acesso);
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
  const incluir_inativos = req.query.incluir_inativos === 'true' || req.query.incluir_inativos === '1';

  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const nivel_acesso = req.headers['x-user-nivel'] || null;

  try {
    const produtos = await database.listar_produtos(busca, categoria_id, id_unidade, incluir_inativos, id_usuario, nivel_acesso);
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

app.patch('/api/produtos/:id_produto/preco', async (req, res) => {
  const id_produto = parseInt(req.params.id_produto);
  const { campo, valor } = req.body;
  try {
    await database.atualizar_preco_produto(id_produto, campo, valor);
    return res.json({ success: true, message: 'Preço atualizado com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE CATEGORIAS E FORNECEDORES ---

app.get('/api/categorias', async (req, res) => {
  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const nivel_acesso = req.headers['x-user-nivel'] || null;
  try {
    const categorias = await database.listar_categorias(id_usuario, nivel_acesso);
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
  const id_centro_custo = req.query.id_centro_custo ? parseInt(req.query.id_centro_custo) : null;

  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const nivel_acesso = req.headers['x-user-nivel'] || null;

  try {
    const movs = await database.listar_movimentacoes(1000, id_unidade, data_inicio, data_fim, id_produto, tipo_movimentacao, id_usuario, nivel_acesso, id_centro_custo);
    return res.json({ success: true, movimentacoes: movs });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/movimentacoes/transferencia', async (req, res) => {
  const { id_produto, quantidade, id_unidade_origem, id_unidade_destino, id_usuario, observacao } = req.body;

  if (!id_produto || !quantidade || !id_unidade_origem || !id_unidade_destino) {
    return res.status(400).json({ success: false, message: 'Produto, quantidade, unidade de origem e destino são obrigatórios.' });
  }

  try {
    await database.registrar_transferencia(
      id_produto,
      quantidade,
      id_unidade_origem,
      id_unidade_destino,
      id_usuario,
      observacao || null
    );
    return res.json({ success: true, message: 'Transferência registrada com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.post('/api/movimentacoes', async (req, res) => {
  const { id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor, id_usuario, numero_nf, id_centro_custo } = req.body;

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
      id_fornecedor,
      id_usuario,
      numero_nf || null,
      id_centro_custo || null
    );
    return res.json({ success: true, message: `Movimentação de ${tipo_movimentacao} registrada com sucesso!` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.put('/api/movimentacoes/:id', async (req, res) => {
  const { id } = req.params;
  const { id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor, numero_nf, id_centro_custo } = req.body;

  if (!id_produto || !tipo_movimentacao || !quantidade) {
    return res.status(400).json({ success: false, message: 'Produto, tipo e quantidade são obrigatórios.' });
  }

  try {
    await database.atualizar_movimentacao(
      id,
      id_produto,
      tipo_movimentacao,
      quantidade,
      valor_unitario,
      observacao,
      data_movimentacao,
      id_unidade,
      id_fornecedor,
      numero_nf || null,
      id_centro_custo || null
    );
    return res.json({ success: true, message: `Movimentação atualizada com sucesso!` });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/movimentacoes/:id', async (req, res) => {
  try {
    await database.excluir_movimentacao(req.params.id);
    return res.json({ success: true, message: 'Movimentação excluída com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- API DE RELATÓRIOS ---

app.get('/api/relatorios/estoque', async (req, res) => {
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;
  const id_categoria = req.query.id_categoria ? parseInt(req.query.id_categoria) : null;
  const incluir_zerados = req.query.incluir_zerados === 'true' || req.query.incluir_zerados === '1';

  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const nivel_acesso = req.headers['x-user-nivel'] || null;

  try {
    const relatorio = await database.gerar_relatorio_estoque(id_unidade, id_categoria, incluir_zerados, id_usuario, nivel_acesso);
    return res.json({ success: true, data: relatorio });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/relatorios/sugestao-compras', async (req, res) => {
  const id_unidade = req.query.id_unidade ? parseInt(req.query.id_unidade) : null;
  const id_categoria = req.query.id_categoria ? parseInt(req.query.id_categoria) : null;
  const data_inicio = req.query.data_inicio || null;
  const data_fim = req.query.data_fim || null;

  const id_usuario = req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null;
  const nivel_acesso = req.headers['x-user-nivel'] || null;

  try {
    const relatorio = await database.gerar_relatorio_sugestao_compras(id_unidade, id_categoria, data_inicio, data_fim, id_usuario, nivel_acesso);
    return res.json({ success: true, data: relatorio });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// --- API DE CONTROLE DE ESTÁGIOS ---

app.get('/api/estagios/lancamentos', async (req, res) => {
  try {
    const lancamentos = await database.listar_lancamentos_estagio();
    return res.json({ success: true, lancamentos });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/estagios/lancamentos', async (req, res) => {
  const { id_lancamento, data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao } = req.body;
  const nome_usuario_registro = req.headers['x-user-nome'] || null;

  if (!data_lancamento || !status || !nome_aluno || !unidade || !curso) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios: Data, Status, Aluno, Unidade e Curso.' });
  }

  try {
    await database.salvar_lancamento_estagio(
      id_lancamento || null,
      data_lancamento,
      status,
      nome_aluno,
      unidade,
      curso,
      turma || null,
      horas_totais || 0,
      protocolo_ew || null,
      observacoes || null,
      horas_campo || 0,
      horas_capacitacao || 0,
      horas_laboratorio || 0,
      horas_evento || 0,
      horas_enf_cirurgica || 0,
      horas_enf_medica || 0,
      horas_saude_mulher || 0,
      horas_saude_mental || 0,
      horas_saude_publica || 0,
      horas_emergencia || 0,
      validado_coordenacao || false,
      nome_usuario_registro
    );
    const msg = id_lancamento ? 'Lançamento atualizado com sucesso!' : 'Lançamento criado com sucesso!';
    return res.json({ success: true, message: msg });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/estagios/lancamentos/:id', async (req, res) => {
  try {
    await database.excluir_lancamento_estagio(req.params.id);
    return res.json({ success: true, message: 'Lançamento excluído com sucesso!' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// --- IMPORTAÇÃO DE PLANILHA DE ESTÁGIOS ---
app.post('/api/estagios/importar-json', async (req, res) => {
  const { lancamentos } = req.body;
  if (!lancamentos || !Array.isArray(lancamentos) || lancamentos.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum dado recebido.' });
  }

  let importados = 0;
  let erros = [];

  for (const row of lancamentos) {
    const nome_aluno = row.nome_aluno;
    const unidade = row.unidade;
    const curso = row.curso;
    const turma = row.turma;
    const status = row.status || 'Em andamento';
    const horas_totais = parseFloat(row.horas_totais) || 0;
    const data_lancamento = row.data_lancamento;
    const protocolo_ew = row.protocolo_ew || null;
    const observacoes = row.observacoes || null;

    if (!nome_aluno || !unidade || !curso) {
      erros.push(`Linha ignorada (dados incompletos): ${nome_aluno || JSON.stringify(row)}`);
      continue;
    }

    try {
      await database.salvar_lancamento_estagio(
        null, data_lancamento, status, nome_aluno, unidade, curso,
        turma, horas_totais, protocolo_ew, observacoes, 0, 0, 0, 0, false
      );
      importados++;
    } catch (err) {
      erros.push(`Erro ao salvar "${nome_aluno}": ${err.message}`);
    }
  }

  return res.json({
    success: true,
    message: `${importados} lançamento(s) importado(s) com sucesso.${erros.length ? ` ${erros.length} linha(s) com erro.` : ''}`,
    importados,
    erros
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("=========================================================");
  console.log("  INICIANDO CONTROLE DE ESTOQUES - ITEC (NODE.JS)");
  console.log("=========================================================");
  console.log(`  Servidor web rodando em: http://127.0.0.1:${PORT}`);
  console.log("  Pressione Ctrl+C para encerrar o servidor.");
  console.log("=========================================================");
});
