/* ==========================================================================
   LÓGICA PRINCIPAL JAVASCRIPT - CONTROLE DE ESTOQUE
   Suporte Híbrido: Servidor Flask API / GitHub Pages (LocalStorage DB)
   ========================================================================== */

let currentUser = null;
let selectedUnitId = null;
let produtosCache = [];
let categoriasCache = [];
let unidadesCache = [];
let movimentacoesCache = [];

// --- HELPERS DE NÍVEL DE ACESSO ---
function isAdmin() {
    return currentUser && currentUser.nivel_acesso === 'Administrador';
}
function isSupervisor() {
    return currentUser && (currentUser.nivel_acesso === 'Supervisor' || currentUser.nivel_acesso === 'Administrador');
}

// --- MOTOR LOCALDB PARA GITHUB PAGES (CLIENT-SIDE ESTÁTICO) ---
const LocalDB = {
    init() {
        if (!localStorage.getItem('gh_unidades')) {
            localStorage.setItem('gh_unidades', JSON.stringify([
                { id_unidade: 1, nome_unidade: "Unidade Matriz", endereco: "Av. Principal, 1000 - Centro", cnpj: "00.000.000/0001-00" }
            ]));
        }
        let users = JSON.parse(localStorage.getItem('gh_usuarios') || '[]');
        if (!users.length) {
            users = [{ id_usuario: 1, usuario: "admin@itec.com", senha: "admin123", nome_usuario: "Administrador do Sistema", nivel_acesso: "Administrador", id_unidade: 1, status_aprovacao: "Aprovado", nome_unidade: "Unidade Matriz" }];
            localStorage.setItem('gh_usuarios', JSON.stringify(users));
        } else {
            let updated = false;
            users.forEach(u => {
                if (u.usuario === 'admin') {
                    u.usuario = 'admin@itec.com';
                    updated = true;
                }
            });
            if (updated) localStorage.setItem('gh_usuarios', JSON.stringify(users));
        }
        if (!localStorage.getItem('gh_categorias')) {
            localStorage.setItem('gh_categorias', JSON.stringify([
                { id_categoria: 1, nome_categoria: "Eletrônicos" },
                { id_categoria: 2, nome_categoria: "Escritório" },
                { id_categoria: 3, nome_categoria: "Informática" }
            ]));
        }
        if (!localStorage.getItem('gh_fornecedores')) {
            localStorage.setItem('gh_fornecedores', JSON.stringify([
                { id_fornecedor: 1, nome_fornecedor: "Tech Brasil LTDA", cnpj_cpf: "12.345.678/0001-90", telefone: "(11) 98888-7777", email: "contato@techbrasil.com" }
            ]));
        }
        if (!localStorage.getItem('gh_produtos')) {
            localStorage.setItem('gh_produtos', JSON.stringify([
                { id_produto: 1, codigo_barras: "7891234567890", nome_produto: "Mouse Sem Fio USB", id_categoria: 3, nome_categoria: "Informática", estoque_minimo: 5, preco_venda: 49.90, data_cadastro: "2026-07-25 10:00:00", id_unidade: 1, nome_unidade: "Unidade Matriz" }
            ]));
        }
        if (!localStorage.getItem('gh_movimentacoes')) {
            localStorage.setItem('gh_movimentacoes', JSON.stringify([
                { id_movimentacao: 1, id_produto: 1, nome_produto: "Mouse Sem Fio USB", tipo_movimentacao: "ENTRADA", quantidade: 20, valor_unitario: 25.00, data_movimentacao: "2026-07-25 10:30:00", observacao: "Estoque inicial", id_unidade: 1, nome_unidade: "Unidade Matriz", id_fornecedor: 1, nome_fornecedor: "Tech Brasil LTDA" }
            ]));
        }
        if (!localStorage.getItem('gh_centros_custo')) {
            localStorage.setItem('gh_centros_custo', JSON.stringify([]));
        }
    },

    get(key) {
        this.init();
        return JSON.parse(localStorage.getItem('gh_' + key) || '[]');
    },

    set(key, data) {
        localStorage.setItem('gh_' + key, JSON.stringify(data));
    },

    calcularEstoqueProduto(id_produto, id_unidade = null) {
        const movs = this.get('movimentacoes').filter(m => m.id_produto == id_produto);
        let entradas = 0, saidas = 0;
        movs.forEach(m => {
            if (!id_unidade || m.id_unidade == id_unidade) {
                if (m.tipo_movimentacao === 'ENTRADA') entradas += parseInt(m.quantidade);
                if (m.tipo_movimentacao === 'SAIDA') saidas += parseInt(m.quantidade);
            }
        });
        return entradas - saidas;
    },

    obterUltimoCustoProduto(id_produto, precoCustoPadrao = 0) {
        const movs = this.get('movimentacoes').filter(m => m.id_produto == id_produto && m.tipo_movimentacao === 'ENTRADA' && parseFloat(m.valor_unitario) > 0);
        if (movs.length > 0) {
            movs.sort((a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao));
            return parseFloat(movs[0].valor_unitario) || 0;
        }
        return parseFloat(precoCustoPadrao) || 0;
    },

    dispatch(url, options = {}) {
        this.init();
        const method = (options.method || 'GET').toUpperCase();
        const body = options.body ? JSON.parse(options.body) : {};
        const urlObj = new URL(url, window.location.origin);
        const path = urlObj.pathname;
        const params = urlObj.searchParams;

        // AUTH LOGIN
        if (path === '/api/auth/login' && method === 'POST') {
            const users = this.get('usuarios');
            const inputUser = (body.usuario || '').trim().toLowerCase();
            const user = users.find(u => {
                const dbUser = (u.usuario || '').trim().toLowerCase();
                const isUserMatch = dbUser === inputUser || 
                    (['admin', 'admin@itec.com'].includes(inputUser) && ['admin', 'admin@itec.com'].includes(dbUser));
                return isUserMatch && u.senha === body.senha;
            });
            if (!user) return { success: false, message: 'E-mail ou senha incorretos!' };
            if (user.status_aprovacao !== 'Aprovado') return { success: false, message: 'Sua conta aguarda aprovação do administrador.' };
            return { success: true, message: `Bem-vindo, ${user.nome_usuario}!`, user };
        }

        // AUTH REGISTER
        if (path === '/api/auth/register' && method === 'POST') {
            const users = this.get('usuarios');
            const units = this.get('unidades');
            const inputUser = (body.usuario || '').toLowerCase();
            if (users.find(u => u.usuario.toLowerCase() === inputUser)) return { success: false, message: 'Este e-mail já está cadastrado no sistema!' };
            const unitObj = body.id_unidade ? units.find(x => x.id_unidade == body.id_unidade) : (units.length > 0 ? units[0] : null);
            const newUser = {
                id_usuario: Date.now(),
                usuario: body.usuario,
                senha: body.senha,
                nome_usuario: body.nome_usuario,
                nivel_acesso: 'Operador',
                id_unidade: unitObj ? unitObj.id_unidade : null,
                status_aprovacao: 'Pendente',
                nome_unidade: unitObj ? unitObj.nome_unidade : 'Não Atrelado'
            };
            users.push(newUser);
            this.set('usuarios', users);
            return { success: true, message: 'Cadastro realizado com sucesso! Aguarde aprovação do administrador.' };
        }

        // GET USERS
        if (path === '/api/auth/users' && method === 'GET') {
            return { success: true, users: this.get('usuarios') };
        }

        // APROVAR USER
        if (path.match(/\/api\/auth\/users\/\d+\/aprovar/) && method === 'POST') {
            const id = path.split('/')[4];
            const users = this.get('usuarios');
            const units = this.get('unidades');
            const u = users.find(x => x.id_usuario == id);
            if (u) {
                u.status_aprovacao = 'Aprovado';
                u.id_unidade = body.id_unidade;
                u.nivel_acesso = body.nivel_acesso || 'Operador';
                const unitObj = units.find(x => x.id_unidade == body.id_unidade);
                u.nome_unidade = unitObj ? unitObj.nome_unidade : 'Sem Unidade';
                this.set('usuarios', users);
                return { success: true, message: 'Usuário aprovado com sucesso!' };
            }
        }

        // EDITAR USER
        if (path.match(/\/api\/auth\/users\/\d+\/editar/) && method === 'POST') {
            const id = path.split('/')[4];
            const users = this.get('usuarios');
            const units = this.get('unidades');
            const u = users.find(x => x.id_usuario == id);
            if (u) {
                u.id_unidade = body.id_unidade;
                u.nivel_acesso = body.nivel_acesso || 'Operador';
                const unitObj = units.find(x => x.id_unidade == body.id_unidade);
                u.nome_unidade = unitObj ? unitObj.nome_unidade : 'Sem Unidade';
                this.set('usuarios', users);
                return { success: true, message: 'Unidade operacional do usuário atualizada!' };
            }
        }

        // REJEITAR USER
        if (path.match(/\/api\/auth\/users\/\d+\/rejeitar/) && method === 'POST') {
            const id = path.split('/')[4];
            const users = this.get('usuarios');
            const u = users.find(x => x.id_usuario == id);
            if (u) {
                u.status_aprovacao = 'Rejeitado';
                this.set('usuarios', users);
                return { success: true, message: 'Cadastro rejeitado.' };
            }
        }

        // SOLICITAR TROCA DE SENHA
        if (path === '/api/auth/users/solicitar-senha' && method === 'POST') {
            const idUsuario = options.headers ? options.headers['X-User-Id'] : null;
            const users = this.get('usuarios');
            const u = users.find(x => x.id_usuario == idUsuario);
            if (!u) return { success: false, message: 'Usuário não encontrado.' };
            if (u.senha !== body.senha_atual) return { success: false, message: 'Senha atual incorreta.' };
            u.senha_pendente = body.nova_senha;
            this.set('usuarios', users);
            return { success: true, message: 'Troca de senha solicitada com sucesso! Aguarde aprovação do administrador.' };
        }

        // APROVAR TROCA DE SENHA
        if (path.match(/\/api\/auth\/users\/\d+\/aprovar-senha/) && method === 'POST') {
            const id = path.split('/')[4];
            const users = this.get('usuarios');
            const u = users.find(x => x.id_usuario == id);
            if (u && u.senha_pendente) {
                u.senha = u.senha_pendente;
                u.senha_pendente = null;
                this.set('usuarios', users);
                return { success: true, message: 'Senha aprovada com sucesso.' };
            }
            return { success: false, message: 'Nenhuma senha pendente.' };
        }

        // REJEITAR TROCA DE SENHA
        if (path.match(/\/api\/auth\/users\/\d+\/rejeitar-senha/) && method === 'POST') {
            const id = path.split('/')[4];
            const users = this.get('usuarios');
            const u = users.find(x => x.id_usuario == id);
            if (u) {
                u.senha_pendente = null;
                this.set('usuarios', users);
                return { success: true, message: 'Solicitação de troca de senha rejeitada.' };
            }
            return { success: false, message: 'Usuário não encontrado.' };
        }

        // UNIDADES
        if (path === '/api/unidades') {
            const units = this.get('unidades');
            if (method === 'GET') return { success: true, unidades: units };
            if (method === 'POST') {
                if (body.id_unidade) {
                    const u = units.find(x => x.id_unidade == body.id_unidade);
                    if (u) {
                        u.nome_unidade = body.nome_unidade;
                        u.endereco = body.endereco;
                        u.cnpj = body.cnpj;
                    }
                } else {
                    units.push({
                        id_unidade: Date.now(),
                        nome_unidade: body.nome_unidade,
                        endereco: body.endereco,
                        cnpj: body.cnpj
                    });
                }
                this.set('unidades', units);
                return { success: true, message: 'Unidade salva com sucesso!' };
            }
        }

        // CATEGORIAS
        if (path === '/api/categorias') {
            const cats = this.get('categorias');
            if (method === 'GET') return { success: true, categorias: cats };
            if (method === 'POST') {
                cats.push({ id_categoria: Date.now(), nome_categoria: body.nome_categoria });
                this.set('categorias', cats);
                return { success: true, message: 'Categoria cadastrada!' };
            }
        }

        // FORNECEDORES
        if (path === '/api/fornecedores') {
            const forns = this.get('fornecedores');
            if (method === 'GET') return { success: true, fornecedores: forns };
            if (method === 'POST') {
                forns.push({ id_fornecedor: Date.now(), ...body });
                this.set('fornecedores', forns);
                return { success: true, message: 'Fornecedor cadastrado!' };
            }
        }

        // CENTROS DE CUSTO
        if (path === '/api/centros-custo') {
            const centros = this.get('centros_custo');
            if (method === 'GET') return { success: true, centros };
            if (method === 'POST') {
                if (body.id_centro_custo) {
                    const c = centros.find(x => x.id_centro_custo == body.id_centro_custo);
                    if (c) { c.codigo = body.codigo; c.nome = body.nome; c.descricao = body.descricao || ''; }
                    this.set('centros_custo', centros);
                    return { success: true, message: 'Centro de Custo atualizado com sucesso!' };
                } else {
                    centros.push({ id_centro_custo: Date.now(), codigo: body.codigo, nome: body.nome, descricao: body.descricao || '' });
                    this.set('centros_custo', centros);
                    return { success: true, message: 'Centro de Custo cadastrado com sucesso!' };
                }
            }
        }

        // CENTROS DE CUSTO DELETE
        if (path.match(/\/api\/centros-custo\/\d+$/) && method === 'DELETE') {
            const id = path.split('/')[3];
            const centros = this.get('centros_custo').filter(x => x.id_centro_custo != id);
            this.set('centros_custo', centros);
            return { success: true, message: 'Centro de Custo excluído com sucesso!' };
        }

        // PRODUTOS GET
        if (path === '/api/produtos' && method === 'GET') {
            const busca = (params.get('busca') || '').toLowerCase();
            const catId = params.get('categoria_id');
            const unidId = params.get('id_unidade');
            const incluirInativos = params.get('incluir_inativos') === 'true' || params.get('incluir_inativos') === '1';

            let prods = this.get('produtos');
            if (!incluirInativos) prods = prods.filter(p => !p.inativo);
            if (busca) prods = prods.filter(p => p.nome_produto.toLowerCase().includes(busca) || (p.codigo_barras && p.codigo_barras.includes(busca)));
            if (catId) prods = prods.filter(p => p.id_categoria == catId);
            if (unidId) prods = prods.filter(p => !p.id_unidade || p.id_unidade == unidId);

            const resultProds = prods.map(p => {
                const estAtual = this.calcularEstoqueProduto(p.id_produto, unidId);
                const estMin = p.estoque_minimo || 0;
                const precoCusto = this.obterUltimoCustoProduto(p.id_produto, p.preco_custo);
                let status = "Normal";
                if (estAtual <= 0) status = "Zerado";
                else if (estAtual <= estMin) status = "Baixo";
                return { ...p, preco_custo: precoCusto, estoque_atual: estAtual, status_estoque: status };
            });

            return { success: true, produtos: resultProds };
        }

        // PRODUTO SINGLE GET
        if (path.match(/\/api\/produtos\/\d+$/) && method === 'GET') {
            const id = path.split('/')[3];
            const unidId = params.get('id_unidade');
            const p = this.get('produtos').find(x => x.id_produto == id);
            if (!p) return { success: false, message: 'Produto não encontrado.' };
            const estAtual = this.calcularEstoqueProduto(p.id_produto, unidId);
            return { success: true, produto: { ...p, estoque_atual: estAtual } };
        }

        // PRODUTO POST
        if (path === '/api/produtos' && method === 'POST') {
            const prods = this.get('produtos');
            const cats = this.get('categorias');
            const units = this.get('unidades');

            const cat = cats.find(c => c.id_categoria == body.id_categoria);
            const unit = units.find(u => u.id_unidade == body.id_unidade);

            if (body.id_produto) {
                const p = prods.find(x => x.id_produto == body.id_produto);
                if (p) {
                    Object.assign(p, body);
                    p.nome_categoria = cat ? cat.nome_categoria : 'Sem Categoria';
                    p.nome_unidade = unit ? unit.nome_unidade : 'Todas';
                }
            } else {
                prods.push({
                    id_produto: Date.now(),
                    ...body,
                    data_cadastro: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    nome_categoria: cat ? cat.nome_categoria : 'Sem Categoria',
                    nome_unidade: unit ? unit.nome_unidade : 'Todas'
                });
            }
            this.set('produtos', prods);
            return { success: true, message: 'Produto salvo com sucesso!' };
        }

        // PRODUTO DELETE
        if (path.match(/\/api\/produtos\/\d+$/) && method === 'DELETE') {
            const id = path.split('/')[3];
            let prods = this.get('produtos').filter(x => x.id_produto != id);
            let movs = this.get('movimentacoes').filter(x => x.id_produto != id);
            this.set('produtos', prods);
            this.set('movimentacoes', movs);
            return { success: true, message: 'Produto excluído.' };
        }

        // PATCH PREÇO
        if (path.match(/\/api\/produtos\/\d+\/preco/) && method === 'PATCH') {
            const id = parseInt(path.split('/')[3]);
            const { campo, valor } = body;
            if (!['preco_custo', 'preco_venda'].includes(campo)) return { success: false, message: 'Campo inválido.' };
            const prods = this.get('produtos');
            const prod = prods.find(p => p.id_produto == id);
            if (!prod) return { success: false, message: 'Produto não encontrado.' };
            prod[campo] = parseFloat(valor) || 0;
            this.set('produtos', prods);
            return { success: true, message: 'Preço atualizado com sucesso!' };
        }

        // MOVIMENTACOES GET
        if (path === '/api/movimentacoes' && method === 'GET') {
            const unidId = params.get('id_unidade');
            const prodId = params.get('id_produto');
            const dataInicio = params.get('data_inicio');
            const dataFim = params.get('data_fim');
            const tipo = params.get('tipo_movimentacao');

            let movs = this.get('movimentacoes');
            if (unidId) movs = movs.filter(m => m.id_unidade == unidId);
            if (prodId) movs = movs.filter(m => m.id_produto == prodId);
            if (tipo) {
                if (tipo === 'TRANSFERENCIA' || tipo === 'TRANSFERENCIAS') {
                    movs = movs.filter(m => (m.observacao || '').toLowerCase().includes('transfer'));
                } else {
                    movs = movs.filter(m => m.tipo_movimentacao === tipo);
                }
            }
            if (dataInicio) movs = movs.filter(m => (m.data_movimentacao || '').substring(0, 10) >= dataInicio);
            if (dataFim) movs = movs.filter(m => (m.data_movimentacao || '').substring(0, 10) <= dataFim);

            movs.sort((a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao));
            return { success: true, movimentacoes: movs };
        }

        // MOVIMENTACOES POST
        if (path === '/api/movimentacoes' && method === 'POST') {
            const movs = this.get('movimentacoes');
            const prods = this.get('produtos');
            const units = this.get('unidades');
            const forns = this.get('fornecedores');

            const prod = prods.find(p => p.id_produto == body.id_produto);
            if (!prod) return { success: false, message: 'Produto não encontrado.' };

            if (body.tipo_movimentacao === 'SAIDA') {
                const estAtual = this.calcularEstoqueProduto(body.id_produto, body.id_unidade);
                if (parseInt(body.quantidade) > estAtual) {
                    return { success: false, message: `Estoque insuficiente! Saldo disponível: ${estAtual} unidade(s).` };
                }
            }

            const unit = units.find(u => u.id_unidade == body.id_unidade);
            const forn = forns.find(f => f.id_fornecedor == body.id_fornecedor);

            movs.push({
                id_movimentacao: Date.now(),
                id_produto: parseInt(body.id_produto),
                nome_produto: prod.nome_produto,
                tipo_movimentacao: body.tipo_movimentacao,
                quantidade: parseInt(body.quantidade),
                valor_unitario: parseFloat(body.valor_unitario),
                data_movimentacao: body.data_movimentacao || new Date().toISOString(),
                observacao: body.observacao || '',
                id_unidade: parseInt(body.id_unidade),
                nome_unidade: unit ? unit.nome_unidade : 'Sem Unidade',
                id_fornecedor: body.id_fornecedor ? parseInt(body.id_fornecedor) : null,
                nome_fornecedor: forn ? forn.nome_fornecedor : 'Sem Fornecedor'
            });

            this.set('movimentacoes', movs);
            return { success: true, message: 'Movimentação registrada com sucesso!' };
        }

        // TRANSFERENCIA POST
        if (path === '/api/movimentacoes/transferencia' && method === 'POST') {
            const movs = this.get('movimentacoes');
            const prods = this.get('produtos');
            const units = this.get('unidades');

            const prod = prods.find(p => p.id_produto == body.id_produto);
            if (!prod) return { success: false, message: 'Produto não encontrado.' };

            if (parseInt(body.id_unidade_origem) === parseInt(body.id_unidade_destino)) {
                return { success: false, message: 'Unidades de origem e destino não podem ser iguais.' };
            }

            const estAtual = this.calcularEstoqueProduto(body.id_produto, body.id_unidade_origem);
            const qtd = parseInt(body.quantidade);
            if (qtd > estAtual) {
                return { success: false, message: `Estoque insuficiente na origem! Saldo: ${estAtual}.` };
            }

            const unitOrigem = units.find(u => u.id_unidade == body.id_unidade_origem);
            const unitDestino = units.find(u => u.id_unidade == body.id_unidade_destino);
            
            let precoCusto = 0;
            const movsEntrada = movs.filter(m => m.id_produto == body.id_produto && m.tipo_movimentacao === 'ENTRADA' && parseFloat(m.valor_unitario) > 0);
            if (movsEntrada.length > 0) {
                movsEntrada.sort((a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao));
                precoCusto = parseFloat(movsEntrada[0].valor_unitario);
            }

            const dt = new Date().toISOString();

            movs.push({
                id_movimentacao: Date.now(),
                id_produto: parseInt(body.id_produto),
                nome_produto: prod.nome_produto,
                tipo_movimentacao: 'SAIDA',
                quantidade: qtd,
                valor_unitario: precoCusto,
                data_movimentacao: dt,
                observacao: `Transferência para: ${unitDestino ? unitDestino.nome_unidade : 'Outra Unidade'}`,
                id_unidade: parseInt(body.id_unidade_origem),
                nome_unidade: unitOrigem ? unitOrigem.nome_unidade : 'Sem Unidade',
                id_fornecedor: null,
                nome_fornecedor: 'Sem Fornecedor'
            });

            movs.push({
                id_movimentacao: Date.now() + 1,
                id_produto: parseInt(body.id_produto),
                nome_produto: prod.nome_produto,
                tipo_movimentacao: 'ENTRADA',
                quantidade: qtd,
                valor_unitario: precoCusto,
                data_movimentacao: dt,
                observacao: `Transferência de: ${unitOrigem ? unitOrigem.nome_unidade : 'Outra Unidade'}`,
                id_unidade: parseInt(body.id_unidade_destino),
                nome_unidade: unitDestino ? unitDestino.nome_unidade : 'Sem Unidade',
                id_fornecedor: null,
                nome_fornecedor: 'Sem Fornecedor'
            });

            this.set('movimentacoes', movs);
            return { success: true, message: 'Transferência registrada com sucesso!' };
        }

        // MOVIMENTAÇÕES SINGLE GET
        if (path.match(/\/api\/movimentacoes\/\d+$/) && method === 'GET') {
            const id = path.split('/')[3];
            const m = this.get('movimentacoes').find(x => x.id_movimentacao == id);
            if (!m) return { success: false, message: 'Movimentação não encontrada.' };
            return { success: true, movimentacao: m };
        }

        // MOVIMENTAÇÕES PUT
        if (path.match(/\/api\/movimentacoes\/\d+$/) && method === 'PUT') {
            const id = path.split('/')[3];
            const movs = this.get('movimentacoes');
            const m = movs.find(x => x.id_movimentacao == id);
            if (!m) return { success: false, message: 'Movimentação não encontrada.' };

            const prods = this.get('produtos');
            const units = this.get('unidades');
            const forns = this.get('fornecedores');
            const prod = prods.find(p => p.id_produto == body.id_produto) || { nome_produto: 'Desconhecido' };
            const unit = units.find(u => u.id_unidade == body.id_unidade);
            const forn = forns.find(f => f.id_fornecedor == body.id_fornecedor);

            Object.assign(m, {
                id_produto: parseInt(body.id_produto),
                nome_produto: prod.nome_produto,
                tipo_movimentacao: body.tipo_movimentacao,
                quantidade: parseInt(body.quantidade),
                valor_unitario: parseFloat(body.valor_unitario),
                data_movimentacao: body.data_movimentacao || new Date().toISOString(),
                observacao: body.observacao || '',
                id_unidade: parseInt(body.id_unidade),
                nome_unidade: unit ? unit.nome_unidade : 'Sem Unidade',
                id_fornecedor: body.id_fornecedor ? parseInt(body.id_fornecedor) : null,
                nome_fornecedor: forn ? forn.nome_fornecedor : 'Sem Fornecedor'
            });

            this.set('movimentacoes', movs);
            return { success: true, message: 'Movimentação atualizada com sucesso!' };
        }

        // MOVIMENTAÇÕES DELETE
        if (path.match(/\/api\/movimentacoes\/\d+$/) && method === 'DELETE') {
            let movs = this.get('movimentacoes');
            const idx = movs.findIndex(x => x.id_movimentacao == path.split('/')[3]);
            if (idx === -1) return { success: false, message: 'Movimentação não encontrada.' };
            movs.splice(idx, 1);
            this.set('movimentacoes', movs);
            return { success: true, message: 'Movimentação excluída com sucesso!' };
        }

        // DASHBOARD
        if (path === '/api/dashboard') {
            const unidId = params.get('id_unidade');
            const prods = this.dispatch('/api/produtos?id_unidade=' + (unidId || ''), { method: 'GET' }).produtos;
            const movs = this.dispatch('/api/movimentacoes?id_unidade=' + (unidId || ''), { method: 'GET' }).movimentacoes;

            const totalProds = prods.length;
            const totalItens = prods.reduce((acc, p) => acc + p.estoque_atual, 0);
            const totalCusto = prods.reduce((acc, p) => acc + (p.estoque_atual > 0 ? p.estoque_atual * p.preco_custo : 0), 0);
            const totalVenda = prods.reduce((acc, p) => acc + (p.estoque_atual > 0 ? p.estoque_atual * p.preco_venda : 0), 0);
            const criticos = prods.filter(p => p.status_estoque === 'Baixo' || p.status_estoque === 'Zerado');

            return {
                success: true,
                data: {
                    total_produtos: totalProds,
                    total_estoque_itens: totalItens,
                    valor_total_custo: totalCusto,
                    valor_total_venda: totalVenda,
                    qtd_baixo_estoque: criticos.length,
                    produtos_baixo_estoque: criticos.slice(0, 5),
                    movimentacoes_recentes: movs.slice(0, 10)
                }
            };
        }

        // RELATÓRIO DE ESTOQUES
        if (path === '/api/relatorios/estoque') {
            const unidId = params.get('id_unidade');
            const catId = params.get('id_categoria');
            const incluirZerados = params.get('incluir_zerados') === 'true' || params.get('incluir_zerados') === '1';

            let prods = this.get('produtos').filter(p => !p.inativo);
            if (catId) prods = prods.filter(p => p.id_categoria == catId);
            
            const cats = this.get('categorias');
            const units = this.get('unidades');
            const unitFilter = unidId ? units.find(x => x.id_unidade == unidId) : null;
            const nomeUnidadeRelatorio = unitFilter ? unitFilter.nome_unidade : "Todas as Unidades";

            let relatorio = prods.map(p => {
                const c = cats.find(x => x.id_categoria == p.id_categoria);
                const estoqueAtual = this.calcularEstoqueProduto(p.id_produto, unidId);
                const precoCusto = this.obterUltimoCustoProduto(p.id_produto, p.preco_custo);
                
                return {
                    id_produto: p.id_produto,
                    codigo_barras: p.codigo_barras || "",
                    nome_produto: p.nome_produto,
                    nome_categoria: c ? c.nome_categoria : "Sem Categoria",
                    nome_unidade: nomeUnidadeRelatorio,
                    estoque_atual: estoqueAtual,
                    preco_custo: precoCusto,
                    valor_total: estoqueAtual * precoCusto
                };
            });

            if (!incluirZerados) {
                relatorio = relatorio.filter(r => r.estoque_atual > 0);
            }
            
            relatorio.sort((a,b) => a.nome_produto.localeCompare(b.nome_produto));
            return { success: true, data: relatorio };
        }

        // RELATÓRIO DE SUGESTÃO DE COMPRAS
        if (path === '/api/relatorios/sugestao-compras') {
            const unidId = params.get('id_unidade');
            const catId = params.get('id_categoria');
            let dataInicio = params.get('data_inicio');
            let dataFim = params.get('data_fim');

            if (!dataInicio || !dataFim) {
                const hoje = new Date();
                dataFim = dataFim || hoje.toISOString().split('T')[0];
                const inicio = new Date(hoje);
                inicio.setDate(inicio.getDate() - 30);
                dataInicio = dataInicio || inicio.toISOString().split('T')[0];
            }

            const dtInicio = new Date(dataInicio);
            const dtFim = new Date(dataFim);
            const diasPeriodo = Math.max(1, Math.round((dtFim - dtInicio) / (1000 * 60 * 60 * 24)) + 1);

            let prods = this.get('produtos').filter(p => !p.inativo);
            if (catId) prods = prods.filter(p => p.id_categoria == catId);

            const cats = this.get('categorias');
            const units = this.get('unidades');
            const movs = this.get('movimentacoes');
            const unitFilter = unidId ? units.find(x => x.id_unidade == unidId) : null;
            const nomeUnidadeRelatorio = unitFilter ? unitFilter.nome_unidade : "Todas as Unidades";

            const relatorio = prods.map(p => {
                const c = cats.find(x => x.id_categoria == p.id_categoria);
                const estoqueReal = this.calcularEstoqueProduto(p.id_produto, unidId);
                const estoqueMinimo = parseInt(p.estoque_minimo) || 0;

                let consumoPeriodo = movs
                    .filter(m => {
                        if (m.id_produto != p.id_produto) return false;
                        if (m.tipo_movimentacao !== 'SAIDA') return false;
                        if (unidId && m.id_unidade != unidId) return false;
                        const dt = m.data_movimentacao ? m.data_movimentacao.substring(0, 10) : '';
                        return dt >= dataInicio && dt <= dataFim;
                    })
                    .reduce((sum, m) => sum + parseInt(m.quantidade || 0), 0);

                const mediaConsumo = consumoPeriodo / diasPeriodo;
                const sugestaoPedido = Math.max(0, Math.ceil(mediaConsumo * diasPeriodo + estoqueMinimo - estoqueReal));

                const precoCusto = this.obterUltimoCustoProduto(p.id_produto, p.preco_custo);

                return {
                    id_produto: p.id_produto,
                    nome_produto: p.nome_produto,
                    nome_unidade: nomeUnidadeRelatorio,
                    nome_categoria: c ? c.nome_categoria : "Sem Categoria",
                    estoque_real: estoqueReal,
                    estoque_minimo: estoqueMinimo,
                    sugestao_pedido: sugestaoPedido,
                    preco_custo: precoCusto,
                    valor_sugestao: sugestaoPedido * precoCusto
                };
            });

            relatorio.sort((a, b) => a.nome_produto.localeCompare(b.nome_produto));
            return { success: true, data: relatorio };
        }

        return { success: false, message: 'Rota não encontrada' };
    }
};

// Funçao auxiliar para realizar chamadas API ou redirecionar para LocalDB no GitHub Pages
async function safeFetch(url, options = {}) {
    // Se estiver rodando estático no GitHub Pages
    if (window.location.hostname.includes('github.io')) {
        return LocalDB.dispatch(url, options);
    }

    let fetchUrl = url;
    // Se estiver rodando localmente via arquivo (file://), tenta acessar o backend Node
    if (window.location.protocol === 'file:') {
        fetchUrl = 'http://localhost:5000' + url;
    }

    try {
        if (!options.headers) options.headers = {};
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.id_usuario) {
            options.headers['X-User-Id'] = currentUser.id_usuario;
            options.headers['X-User-Nivel'] = currentUser.nivel_acesso;
        }

        const res = await fetch(fetchUrl, options);
        if (res.status === 404) throw new Error("API não encontrada, alternando para LocalDB");
        return await res.json();
    } catch (e) {
        // Fallback automático se o servidor não estiver respondendo
        console.warn("Servidor offline ou inacessível. Usando LocalDB offline fallback.");
        return LocalDB.dispatch(url, options);
    }
}

// Inicialização da aplicação ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    checarSessaoUsuario();
    configurarNavegacao();
});

// --- AUTENTICAÇÃO E SESSÃO ---

const SESSION_KEY = 'stock_user';

function getSessionUser() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (!user || !user.id_usuario) return null;
        return user;
    } catch {
        return null;
    }
}

function setSessionUser(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSessionUser() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
}

function checarSessaoUsuario() {
    localStorage.removeItem(SESSION_KEY);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'login' || urlParams.get('logout') === 'true') {
        clearSessionUser();
        currentUser = null;
        window.location.replace('/login');
        return;
    }

    const user = getSessionUser();
    if (!user) {
        window.location.replace('/login');
        return;
    }

    currentUser = user;
    iniciarAplicacao();
}

async function carregarUnidadesRegistroIndex() {
    const selectU = document.getElementById('reg-unidade');
    if (selectU) {
        const dataU = await safeFetch('/api/unidades');
        if (dataU.success && dataU.unidades) {
            selectU.innerHTML = '<option value="">Selecione a Unidade...</option>' +
                dataU.unidades.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
            if (dataU.unidades.length > 0) {
                selectU.value = dataU.unidades[0].id_unidade;
            }
        }
    }
}

function toggleAuthMode(mode) {
    if (mode === 'register') {
        const loginBox = document.getElementById('login-box');
        const regBox = document.getElementById('register-box');
        if (loginBox && regBox) {
            loginBox.classList.remove('active');
            loginBox.classList.add('hidden');
            regBox.classList.remove('hidden');
            regBox.classList.add('active');
            carregarUnidadesRegistroIndex();
        } else {
            window.location.href = '/login.html?mode=register';
        }
    } else {
        const loginBox = document.getElementById('login-box');
        const regBox = document.getElementById('register-box');
        if (loginBox && regBox) {
            regBox.classList.remove('active');
            regBox.classList.add('hidden');
            loginBox.classList.remove('hidden');
            loginBox.classList.add('active');
        } else {
            window.location.href = '/login.html';
        }
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content-wrapper');
    if(sidebar && content) {
        sidebar.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const usuario = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();

    const data = await safeFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
    });

    if (data.success) {
        currentUser = data.user;
        setSessionUser(currentUser);
        showToast(data.message, 'success');
        iniciarAplicacao();
    } else {
        showToast(data.message, 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const nome_usuario = document.getElementById('reg-nome').value.trim();
    const usuario = document.getElementById('reg-usuario').value.trim();
    const senha = document.getElementById('reg-senha').value.trim();
    const id_unidade = document.getElementById('reg-unidade')?.value || null;

    const data = await safeFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_usuario, usuario, senha, id_unidade })
    });

    if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('form-register').reset();
        toggleAuthMode('login');
    } else {
        showToast(data.message, 'error');
    }
}

let inatividadeTimer;
const INATIVIDADE_MS = 5 * 60 * 1000; // 5 minutes
function handleLogout() {
    clearTimeout(inatividadeTimer);
    clearSessionUser();
    currentUser = null;
    window.location.replace('/login');
}

function resetInatividadeTimer() {
    clearTimeout(inatividadeTimer);
    inatividadeTimer = setTimeout(() => {
        showToast('Sessão expirou por inatividade.', 'info');
        handleLogout();
    }, INATIVIDADE_MS);
}

['mousemove','keydown','click','scroll','touchstart'].forEach(evt => {
    document.addEventListener(evt, resetInatividadeTimer);
});

function exibirTelaAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

async function iniciarAplicacao() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    document.getElementById('user-display-name').textContent = currentUser.nome_usuario;
    document.getElementById('user-display-role').textContent = currentUser.nivel_acesso;
    
    const unitEl = document.getElementById('user-display-unit');
    if (unitEl) {
        unitEl.textContent = currentUser.nome_unidade ? `Unidade: ${currentUser.nome_unidade}` : '';
    }
    
    // Start inactivity watcher after login
    resetInatividadeTimer();

    const selectGlobal = document.getElementById('select-global-unidade');
    if (currentUser.nivel_acesso === 'Administrador') {
        const dataU = await safeFetch('/api/unidades');
        if (dataU.success) {
            unidadesCache = dataU.unidades;
            selectGlobal.innerHTML = '<option value="">Todas as Unidades (Visão Global)</option>' +
                unidadesCache.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
            
            const savedAdminUnit = localStorage.getItem('admin_selected_unit') || '';
            selectGlobal.value = savedAdminUnit;
            selectedUnitId = savedAdminUnit ? parseInt(savedAdminUnit) : null;
            selectGlobal.disabled = false;
        }
    } else {
        selectedUnitId = currentUser.id_unidade ? parseInt(currentUser.id_unidade) : null;
        if (selectGlobal) {
            selectGlobal.innerHTML = `<option value="${currentUser.id_unidade || ''}">${currentUser.nome_unidade || 'Sua Unidade'}</option>`;
            selectGlobal.disabled = true;
        }
    }

    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        el.style.display = isAdmin() ? '' : 'none';
    });

    const supervisorElements = document.querySelectorAll('.supervisor-only');
    supervisorElements.forEach(el => {
        el.style.display = isSupervisor() ? '' : 'none';
    });

    if (!isSupervisor()) {
        navegarParaView('view-dashboard');
    }

    carregarCategoriasEFornecedores();
    carregarDashboard();
    carregarProdutos();
}

function trocarUnidadeAtiva(unitId) {
    if (currentUser && currentUser.nivel_acesso === 'Administrador') {
        selectedUnitId = unitId ? parseInt(unitId) : null;
        localStorage.setItem('admin_selected_unit', unitId || '');
        
        const activeView = document.querySelector('.app-view.active');
        if (activeView) {
            const viewId = activeView.id;
            if (viewId === 'view-dashboard') carregarDashboard();
            if (viewId === 'view-produtos') carregarProdutos();
            if (viewId === 'view-movimentacoes') carregarMovimentacoes();
        }
        showToast(unitId ? 'Filtro atualizado para a unidade selecionada.' : 'Visualizando estoque de todas as unidades.', 'info');
    }
}

// --- NAVEGAÇÃO ENTRE TELAS ---

function configurarNavegacao() {
    const navItems = document.querySelectorAll('.sidebar-nav li');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetViewId = item.getAttribute('data-target');
            if (targetViewId) {
                if (item.classList.contains('admin-only') && !isAdmin()) {
                    showToast('Apenas administradores podem acessar esta seção.', 'warning');
                    return;
                }
                if (item.classList.contains('supervisor-only') && !isSupervisor()) {
                    showToast('Acesso restrito a supervisores e administradores.', 'warning');
                    return;
                }
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                navegarParaView(targetViewId);
            }
        });
    });
}

function navegarParaView(viewId) {
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.remove('active'));
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');

        const titles = {
            'view-dashboard': 'Dashboard de Estoque',
            'view-produtos': 'Cadastro e Gestão de Produtos',
            'view-movimentacoes': 'Movimentação de Entradas e Saídas',
            'view-cadastros-centros': 'Cadastro de Centros de Custo',
            'view-cadastros-unidades': 'Cadastro de Unidades Operacionais',
            'view-cadastros-categorias': 'Cadastro de Categorias',
            'view-cadastros-fornecedores': 'Cadastro de Fornecedores',
            'view-usuarios': 'Usuários e Aprovações',
            'view-relatorios-estoque': 'Relatório de Estoque Atual',
            'view-relatorios-sugestao-compras': 'Sugestão de Compras',
            'view-transferencias': 'Transferência de Materiais'
        };
        document.getElementById('page-title').textContent = titles[viewId] || 'Controle de Estoque';

        if (viewId === 'view-dashboard') carregarDashboard();
        if (viewId === 'view-produtos') carregarProdutos();
        if (viewId === 'view-movimentacoes') {
            preencherOpcoesFiltrosMovimentacoes();
            carregarMovimentacoes();
        }
        if (viewId === 'view-transferencias') {
            preencherOpcoesTransferencia();
        }
        if (viewId === 'view-relatorios-estoque') {
            preencherOpcoesFiltrosRelatorioEstoque();
            carregarRelatorioEstoque();
        }
        if (viewId === 'view-relatorios-sugestao-compras') {
            preencherOpcoesFiltrosRelatorioSugestaoCompras();
            carregarRelatorioSugestaoCompras();
        }
        if (viewId.startsWith('view-cadastros-')) carregarCadastrosGerais();
        if (viewId === 'view-usuarios') carregarUsuarios();
    }
}

// --- DASHBOARD ---

async function carregarDashboard() {
    try {
        let url = '/api/dashboard';
        if (selectedUnitId) {
            url += `?id_unidade=${selectedUnitId}`;
        }

        const result = await safeFetch(url);

        if (result.success) {
            const data = result.data;
            document.getElementById('kpi-total-produtos').textContent = data.total_produtos;
            document.getElementById('kpi-total-itens').textContent = data.total_estoque_itens;
            document.getElementById('kpi-valor-total').textContent = formatarMoeda(data.valor_total_custo);
            document.getElementById('kpi-baixo-estoque').textContent = data.qtd_baixo_estoque;

            const tbodyBaixo = document.getElementById('table-baixo-estoque');
            if (data.produtos_baixo_estoque.length === 0) {
                tbodyBaixo.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum produto em nível crítico de estoque!</td></tr>';
            } else {
                tbodyBaixo.innerHTML = data.produtos_baixo_estoque.map(p => `
                    <tr>
                        <td><strong>${p.nome_produto}</strong></td>
                        <td>${p.estoque_minimo}</td>
                        <td><strong>${p.estoque_atual}</strong></td>
                        <td><span class="badge ${p.status_estoque === 'Zerado' ? 'badge-danger' : 'badge-warning'}">${p.status_estoque}</span></td>
                    </tr>
                `).join('');
            }

            const tbodyMovs = document.getElementById('table-dash-movs');
            if (data.movimentacoes_recentes.length === 0) {
                tbodyMovs.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhuma movimentação registrada.</td></tr>';
            } else {
                tbodyMovs.innerHTML = data.movimentacoes_recentes.map(m => `
                    <tr>
                        <td><small>${formatarData(m.data_movimentacao)}</small></td>
                        <td>${m.nome_produto}</td>
                        <td><span class="badge ${m.tipo_movimentacao === 'ENTRADA' ? 'badge-success' : 'badge-warning'}">${m.tipo_movimentacao}</span></td>
                        <td><strong>${m.quantidade}</strong></td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

// --- UNIDADES OPERACIONAIS ---

async function carregarUnidades() {
    try {
        const result = await safeFetch('/api/unidades');

        if (result.success) {
            unidadesCache = result.unidades;
            const tbody = document.getElementById('table-unidades-body');
            if (!tbody) return;
            if (unidadesCache.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhuma unidade cadastrada.</td></tr>';
                return;
            }

            tbody.innerHTML = unidadesCache.map(u => `
                <tr>
                    <td>#${u.id_unidade}</td>
                    <td><strong>${u.nome_unidade}</strong></td>
                    <td>${u.endereco || '-'}</td>
                    <td><code>${u.cnpj || '-'}</code></td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-outline" onclick="abrirModalUnidade(${u.id_unidade})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        showToast('Erro ao carregar unidades operacionais.', 'error');
    }
}

function abrirModalUnidade(id_unidade = null) {
    document.getElementById('form-unidade').reset();
    document.getElementById('unidade-id').value = '';
    document.getElementById('modal-unidade-title').textContent = id_unidade ? 'Editar Unidade Operacional' : 'Cadastrar Unidade Operacional';

    if (id_unidade) {
        const u = unidadesCache.find(x => x.id_unidade == id_unidade);
        if (u) {
            document.getElementById('unidade-id').value = u.id_unidade;
            document.getElementById('unidade-nome').value = u.nome_unidade;
            document.getElementById('unidade-endereco').value = u.endereco;
            document.getElementById('unidade-cnpj').value = u.cnpj;
        }
    }

    document.getElementById('modal-unidade').classList.remove('hidden');
}

async function salvarUnidade(event) {
    event.preventDefault();
    const payload = {
        id_unidade: document.getElementById('unidade-id').value || null,
        nome_unidade: document.getElementById('unidade-nome').value.trim(),
        endereco: document.getElementById('unidade-endereco').value.trim(),
        cnpj: document.getElementById('unidade-cnpj').value.trim()
    };

    const result = await safeFetch('/api/unidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-unidade');
        carregarCadastrosGerais();
        iniciarAplicacao();
    } else {
        showToast(result.message, 'error');
    }
}

// --- GESTÃO DE PRODUTOS ---

async function carregarProdutos() {
    const busca = (document.getElementById('filter-produto-busca')?.value || '');
    const nomeEl = document.getElementById('filter-produto-nome');
    const nomeFiltro = nomeEl ? nomeEl.value.trim().toLowerCase() : '';
    const catId = document.getElementById('filter-produto-categoria').value;
    const incluirInativos = document.getElementById('filter-produto-inativos')?.checked || false;

    let url = `/api/produtos?busca=${encodeURIComponent(busca)}&categoria_id=${encodeURIComponent(catId)}`;
    if (selectedUnitId) {
        url += `&id_unidade=${selectedUnitId}`;
    }
    if (incluirInativos) {
        url += `&incluir_inativos=true`;
    }

    const result = await safeFetch(url);

    if (result.success) {
        let lista = result.produtos;
        if (nomeFiltro) {
            lista = lista.filter(p => p.nome_produto.toLowerCase().includes(nomeFiltro));
        }
        produtosCache = lista;
        renderizarTabelaProdutos(produtosCache);
    }
}

function renderizarTabelaProdutos(produtos) {
    const tbody = document.getElementById('table-produtos-body');
    if (produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Nenhum produto cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = produtos.map(p => {
        let badgeClass = 'badge-success';
        if (p.status_estoque === 'Baixo') badgeClass = 'badge-warning';
        if (p.status_estoque === 'Zerado') badgeClass = 'badge-danger';
        if (p.inativo) badgeClass = 'badge-danger';
        const statusTexto = p.inativo ? 'Inativo' : p.status_estoque;
        const opacidade = p.inativo ? 'opacity: 0.5;' : '';
        const podeEditar = isSupervisor();
        const dblClickCusto = podeEditar ? `ondblclick="editarPrecoCelula(this, ${p.id_produto}, 'preco_custo')"` : '';
        const dblClickVenda = podeEditar ? `ondblclick="editarPrecoCelula(this, ${p.id_produto}, 'preco_venda')"` : '';
        const tipoCusto = podeEditar ? `title="Duplo clique para editar" style="cursor:pointer; border-bottom: 1px dashed var(--accent-warning);"` : '';
        const tipoVenda = podeEditar ? `title="Duplo clique para editar" style="cursor:pointer; border-bottom: 1px dashed var(--accent-green);"` : '';

        return `
            <tr style="${opacidade}">
                <td>#${p.id_produto}</td>
                <td><code>${p.codigo_barras || '-'}</code></td>
                <td><strong>${p.nome_produto}</strong></td>
                <td>${p.nome_categoria}</td>
                <td>${p.nome_unidade || 'Todas'}</td>
                <td>${p.estoque_minimo}</td>
                <td ${dblClickCusto}><span ${tipoCusto} data-valor="${p.preco_custo || 0}">${formatarMoeda(p.preco_custo)}</span></td>
                <td ${dblClickVenda}><span ${tipoVenda} data-valor="${p.preco_venda || 0}">${formatarMoeda(p.preco_venda)}</span></td>
                <td><strong style="font-size: 15px;">${p.estoque_atual}</strong></td>
                <td><span class="badge ${badgeClass}">${statusTexto}</span></td>
                <td>${p.nome_usuario_cadastro || 'Sistema'}</td>
                <td class="text-right">
                    ${isSupervisor() ? `
                    <button class="btn btn-sm btn-outline" onclick="abrirModalProduto(${p.id_produto})" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirProduto(${p.id_produto})" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function editarPrecoCelula(td, id_produto, campo) {
    // Evitar dupla ativação
    if (td.querySelector('input')) return;

    const span = td.querySelector('span');
    const valorAtual = parseFloat(span.dataset.valor) || 0;
    const cor = campo === 'preco_custo' ? 'var(--accent-warning)' : 'var(--accent-green)';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.01';
    input.value = valorAtual.toFixed(2);
    input.style.cssText = `width:110px; padding:3px 7px; border:2px solid ${cor}; border-radius:6px;
        background:var(--bg-card,#1e293b); color:#fff; font-size:13px; outline:none;`;

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const confirmar = async () => {
        const novoValor = parseFloat(input.value);
        if (isNaN(novoValor) || novoValor < 0) {
            showToast('Valor inválido.', 'error');
            td.innerHTML = `<span title="Duplo clique para editar" style="cursor:pointer; border-bottom: 1px dashed ${cor};" data-valor="${valorAtual}">${formatarMoeda(valorAtual)}</span>`;
            td.ondblclick = () => editarPrecoCelula(td, id_produto, campo);
            return;
        }
        // Optimistic update visual
        td.innerHTML = `<span title="Duplo clique para editar" style="cursor:pointer; border-bottom: 1px dashed ${cor};" data-valor="${novoValor}">${formatarMoeda(novoValor)}</span>`;
        td.ondblclick = () => editarPrecoCelula(td, id_produto, campo);

        const result = await safeFetch(`/api/produtos/${id_produto}/preco`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ campo, valor: novoValor })
        });
        if (result.success) {
            showToast(`Preço atualizado: ${formatarMoeda(novoValor)}`, 'success');
            // Atualizar cache local
            const prod = produtosCache.find(p => p.id_produto == id_produto);
            if (prod) prod[campo] = novoValor;
            carregarDashboard();
        } else {
            showToast(result.message || 'Erro ao salvar preço.', 'error');
            td.querySelector('span').textContent = formatarMoeda(valorAtual);
            td.querySelector('span').dataset.valor = valorAtual;
        }
    };

    const cancelar = () => {
        td.innerHTML = `<span title="Duplo clique para editar" style="cursor:pointer; border-bottom: 1px dashed ${cor};" data-valor="${valorAtual}">${formatarMoeda(valorAtual)}</span>`;
        td.ondblclick = () => editarPrecoCelula(td, id_produto, campo);
    };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
    });
    input.addEventListener('blur', () => setTimeout(confirmar, 120));
}

async function abrirModalProduto(id_produto = null) {
    document.getElementById('form-produto').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('modal-produto-title').textContent = id_produto ? 'Editar Produto' : 'Cadastrar Novo Produto';
    
    const inativoEl = document.getElementById('prod-inativo');
    const inativoMsg = document.getElementById('prod-inativo-msg');
    if (inativoEl) {
        inativoEl.checked = false;
        inativoEl.disabled = false;
    }
    if (inativoMsg) inativoMsg.style.display = 'none';

    await carregarCategoriasEFornecedores();

    const dataU = await safeFetch('/api/unidades');
    if (dataU.success && dataU.unidades) {
        const selectU = document.getElementById('prod-unidade');
        selectU.innerHTML = '<option value="">Todas / Padrão</option>' +
            dataU.unidades.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
        if (!id_produto) {
            const defaultUnit = selectedUnitId || (currentUser ? currentUser.id_unidade : null) || (dataU.unidades.length > 0 ? dataU.unidades[0].id_unidade : null);
            if (defaultUnit) selectU.value = defaultUnit;
        }
    }

    if (id_produto) {
        let pUrl = `/api/produtos/${id_produto}`;
        if (selectedUnitId) pUrl += `?id_unidade=${selectedUnitId}`;
        const data = await safeFetch(pUrl);
        if (data.success) {
            const p = data.produto;
            document.getElementById('prod-id').value = p.id_produto;
            document.getElementById('prod-codigo').value = p.codigo_barras;
            document.getElementById('prod-nome').value = p.nome_produto;
            document.getElementById('prod-categoria').value = p.id_categoria || '';
            document.getElementById('prod-unidade').value = p.id_unidade || '';
            document.getElementById('prod-minimo').value = p.estoque_minimo;
            document.getElementById('prod-custo').value = p.preco_custo ?? 0;
            document.getElementById('prod-venda').value = p.preco_venda;
            
            if (inativoEl) {
                inativoEl.checked = p.inativo || false;
                if (p.estoque_atual > 0) {
                    inativoEl.disabled = true;
                    if (inativoMsg) inativoMsg.style.display = 'inline';
                } else {
                    inativoEl.disabled = false;
                    if (inativoMsg) inativoMsg.style.display = 'none';
                }
            }
        }
    }

    document.getElementById('modal-produto').classList.remove('hidden');
}

async function salvarProduto(event) {
    event.preventDefault();
    const payload = {
        id_produto: document.getElementById('prod-id').value || null,
        codigo_barras: document.getElementById('prod-codigo').value.trim(),
        nome_produto: document.getElementById('prod-nome').value.trim(),
        id_categoria: document.getElementById('prod-categoria').value || null,
        id_unidade: document.getElementById('prod-unidade').value || null,
        estoque_minimo: document.getElementById('prod-minimo').value,
        preco_venda: document.getElementById('prod-venda').value,
        inativo: document.getElementById('prod-inativo') ? document.getElementById('prod-inativo').checked : false,
        id_usuario: currentUser ? currentUser.id_usuario : null
    };

    const result = await safeFetch('/api/produtos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-produto');
        carregarProdutos();
        carregarDashboard();
    } else {
        showToast(result.message, 'error');
    }
}

async function excluirProduto(id_produto) {
    if (!confirm('Tem certeza que deseja excluir este produto e todo seu histórico?')) return;

    const result = await safeFetch(`/api/produtos/${id_produto}`, { method: 'DELETE' });

    if (result.success) {
        showToast(result.message, 'success');
        carregarProdutos();
        carregarDashboard();
    } else {
        showToast(result.message, 'error');
    }
}

function excluirMovimentacao(id_movimentacao) {
    if (!confirm('Tem certeza que deseja excluir esta movimentação?')) return;
    safeFetch(`/api/movimentacoes/${id_movimentacao}`, { method: 'DELETE' })
        .then(res => {
            if (res.success) {
                showToast(res.message, 'success');
                carregarMovimentacoes();
                carregarDashboard();
            } else {
                showToast(res.message, 'error');
            }
        });
}
// --- MOVIMENTAÇÕES DE ESTOQUE ---

function getFormattedLocalDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function preencherOpcoesFiltrosMovimentacoes() {
    const dataU = await safeFetch('/api/unidades');
    const selectU = document.getElementById('filter-mov-unidade');
    if (dataU.success && selectU) {
        const valAtual = selectU.value;
        let html = '<option value="">Todas as Unidades</option>';
        if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
            html = `<option value="${currentUser.id_unidade}">${currentUser.nome_unidade || 'Sua Unidade'}</option>`;
            selectU.disabled = true;
        } else {
            dataU.unidades.forEach(un => {
                html += `<option value="${un.id_unidade}">${un.nome_unidade}</option>`;
            });
            selectU.disabled = false;
        }
        selectU.innerHTML = html;
        if (valAtual) selectU.value = valAtual;
    }

    const dataP = await safeFetch('/api/produtos');
    const selectP = document.getElementById('filter-mov-produto');
    if (dataP.success && selectP) {
        const valAtual = selectP.value;
        selectP.innerHTML = '<option value="">Todos os Produtos</option>' +
            dataP.produtos.map(p => `<option value="${p.id_produto}">${p.nome_produto}</option>`).join('');
        selectP.value = valAtual;
    }

    const dataCC = await safeFetch('/api/centros-custo');
    const selectCC = document.getElementById('filter-mov-centro-custo');
    if (dataCC.success && dataCC.centros && selectCC) {
        const valAtual = selectCC.value;
        selectCC.innerHTML = '<option value="">Todos os Centros</option>' +
            dataCC.centros.map(c => `<option value="${c.id_centro_custo}">${c.codigo} — ${c.nome}</option>`).join('');
        if (valAtual) selectCC.value = valAtual;
    }
}

async function preencherOpcoesTransferencia() {
    const selectP = document.getElementById('transf-produto');
    const selectU = document.getElementById('transf-destino');
    
    if (selectP) {
        const dataP = await safeFetch(`/api/produtos${selectedUnitId ? '?id_unidade=' + selectedUnitId : ''}`);
        if (dataP.success && dataP.produtos) {
            const produtosComEstoque = dataP.produtos.filter(p => p.estoque_atual > 0);
            selectP.innerHTML = '<option value="">Selecione o produto...</option>' +
                produtosComEstoque.map(p => `<option value="${p.id_produto}">${p.nome_produto} (Saldo: ${p.estoque_atual})</option>`).join('');
        }
    }
    
    if (selectU) {
        const dataU = await safeFetch('/api/unidades');
        if (dataU.success && dataU.unidades) {
            selectU.innerHTML = '<option value="">Selecione o destino...</option>' +
                dataU.unidades
                    .filter(u => !selectedUnitId || u.id_unidade != selectedUnitId)
                    .map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
        }
    }
}

async function submitTransferencia(event) {
    event.preventDefault();
    if (!selectedUnitId) {
        showToast('Você precisa selecionar uma Unidade Origem no menu do topo.', 'warning');
        return;
    }
    
    const id_produto = document.getElementById('transf-produto').value;
    const id_unidade_destino = document.getElementById('transf-destino').value;
    const quantidade = document.getElementById('transf-quantidade').value;
    
    if (!id_produto || !id_unidade_destino || !quantidade) {
        showToast('Preencha todos os campos obrigatórios.', 'warning');
        return;
    }
    
    const data = await safeFetch('/api/movimentacoes/transferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_produto: id_produto,
            quantidade: quantidade,
            id_unidade_origem: selectedUnitId,
            id_unidade_destino: id_unidade_destino,
            id_usuario: currentUser ? currentUser.id_usuario : null
        })
    });
    
    if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('form-transferencia').reset();
        preencherOpcoesTransferencia();
    } else {
        showToast(data.message, 'error');
    }
}

async function carregarMovimentacoes() {
    const dtInicio = document.getElementById('filter-mov-inicio') ? document.getElementById('filter-mov-inicio').value : '';
    const dtFim = document.getElementById('filter-mov-fim') ? document.getElementById('filter-mov-fim').value : '';
    const filterUnid = document.getElementById('filter-mov-unidade') ? document.getElementById('filter-mov-unidade').value : '';
    const filterProd = document.getElementById('filter-mov-produto') ? document.getElementById('filter-mov-produto').value : '';
    const filterTipo = document.getElementById('filter-mov-tipo') ? document.getElementById('filter-mov-tipo').value : '';
    const filterCC = document.getElementById('filter-mov-centro-custo') ? document.getElementById('filter-mov-centro-custo').value : '';

    let url = '/api/movimentacoes?1=1';
    const activeUnit = filterUnid || selectedUnitId;
    if (activeUnit) url += `&id_unidade=${encodeURIComponent(activeUnit)}`;
    if (filterProd) url += `&id_produto=${encodeURIComponent(filterProd)}`;
    if (dtInicio) url += `&data_inicio=${encodeURIComponent(dtInicio)}`;
    if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;
    if (filterTipo) url += `&tipo_movimentacao=${encodeURIComponent(filterTipo)}`;
    if (filterCC) url += `&id_centro_custo=${encodeURIComponent(filterCC)}`;

    const result = await safeFetch(url);

    if (result.success) {
        const movs = result.movimentacoes;
        movimentacoesCache = movs;
        
        let entradasQtd = 0, entradasVal = 0;
        let saidasQtd = 0, saidasVal = 0;

        movs.forEach(m => {
            const totalItem = (m.quantidade || 0) * (m.valor_unitario || 0);
            if (m.tipo_movimentacao === 'ENTRADA') {
                entradasQtd += parseInt(m.quantidade || 0);
                entradasVal += totalItem;
            } else if (m.tipo_movimentacao === 'SAIDA') {
                saidasQtd += parseInt(m.quantidade || 0);
                saidasVal += totalItem;
            }
        });

        const saldoQtd = entradasQtd - saidasQtd;
        const saldoVal = entradasVal - saidasVal;

        const elEntQtd = document.getElementById('report-total-entradas-qtd');
        const elEntVal = document.getElementById('report-total-entradas-val');
        const elSaiQtd = document.getElementById('report-total-saidas-qtd');
        const elSaiVal = document.getElementById('report-total-saidas-val');
        const elSalQtd = document.getElementById('report-saldo-qtd');
        const elSalVal = document.getElementById('report-saldo-val');

        if (elEntQtd) elEntQtd.textContent = `${entradasQtd} pçs`;
        if (elEntVal) elEntVal.textContent = formatarMoeda(entradasVal);
        if (elSaiQtd) elSaiQtd.textContent = `${saidasQtd} pçs`;
        if (elSaiVal) elSaiVal.textContent = formatarMoeda(saidasVal);
        if (elSalQtd) elSalQtd.textContent = `${saldoQtd} pçs`;
        if (elSalVal) elSalVal.textContent = formatarMoeda(saldoVal);

        const tbody = document.getElementById('table-movimentacoes-body');
        if (movs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Nenhuma movimentação encontrada para os filtros selecionados.</td></tr>';
            return;
        }

        tbody.innerHTML = movs.map(m => {
            const total = m.quantidade * m.valor_unitario;
            return `
                <tr>
                    <td>#${m.id_movimentacao}</td>
                    <td><small>${formatarData(m.data_movimentacao)}</small></td>
                    <td><span class="badge badge-info"><i class="fa-solid fa-building"></i> ${m.nome_unidade || 'Sem Unidade'}</span></td>
                    <td><strong>${m.nome_produto}</strong></td>
                    <td>${m.nome_fornecedor || '-'}</td>
                    <td><span class="badge ${m.tipo_movimentacao === 'ENTRADA' ? 'badge-success' : 'badge-warning'}">${m.tipo_movimentacao}</span></td>
                    <td><strong>${m.quantidade}</strong></td>
                    <td>${formatarMoeda(m.valor_unitario)}</td>
                    <td><strong>${formatarMoeda(total)}</strong></td>
                    <td>${m.nome_usuario_movimentacao || 'Sistema'}</td>
                    <td><small class="text-muted">${m.observacao || '-'}</small></td>
                    <td class="text-right">
                        ${isSupervisor() ? `<button class="btn btn-sm btn-outline" onclick="abrirModalMovimentacao(${m.id_movimentacao})" title="Editar"><i class="fa-solid fa-pen"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirMovimentacao(${m.id_movimentacao})" title="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function aplicarFiltrosMovimentacoes(event) {
    if (event) event.preventDefault();
    carregarMovimentacoes();
}

function limparFiltrosMovimentacoes() {
    const form = document.getElementById('form-filter-movimentacoes');
    if (form) form.reset();
    carregarMovimentacoes();
}

function imprimirRelatorioMovimentacoes() {
    const dataInicio = document.getElementById('filter-mov-inicio')?.value;
    const dataFim = document.getElementById('filter-mov-fim')?.value;
    const selectUnidade = document.getElementById('filter-mov-unidade');
    const nomeUnidade = selectUnidade && selectUnidade.selectedIndex >= 0 ? selectUnidade.options[selectUnidade.selectedIndex].text : 'Todas as Unidades';
    const selectProduto = document.getElementById('filter-mov-produto');
    const nomeProduto = selectProduto && selectProduto.selectedIndex >= 0 ? selectProduto.options[selectProduto.selectedIndex].text : 'Todos os Produtos';
    const selectTipo = document.getElementById('filter-mov-tipo');
    const nomeTipo = selectTipo && selectTipo.selectedIndex >= 0 ? selectTipo.options[selectTipo.selectedIndex].text : 'Entrada & Saída';

    const totalEntradasQtd = document.getElementById('report-total-entradas-qtd')?.innerText || '0 pçs';
    const totalEntradasVal = document.getElementById('report-total-entradas-val')?.innerText || 'R$ 0,00';
    const totalSaidasQtd = document.getElementById('report-total-saidas-qtd')?.innerText || '0 pçs';
    const totalSaidasVal = document.getElementById('report-total-saidas-val')?.innerText || 'R$ 0,00';
    const saldoQtd = document.getElementById('report-saldo-qtd')?.innerText || '0 pçs';
    const saldoVal = document.getElementById('report-saldo-val')?.innerText || 'R$ 0,00';

    const tbody = document.getElementById('table-movimentacoes-body')?.innerHTML || '';
    const now = new Date().toLocaleString('pt-BR');

    let filtrosTexto = [];
    if (dataInicio) filtrosTexto.push(`Data Inicial: <strong>${dataInicio.split('-').reverse().join('/')}</strong>`);
    if (dataFim) filtrosTexto.push(`Data Final: <strong>${dataFim.split('-').reverse().join('/')}</strong>`);
    if (nomeUnidade && nomeUnidade !== 'Todas as Unidades') filtrosTexto.push(`Unidade: <strong>${nomeUnidade}</strong>`);
    if (nomeProduto && nomeProduto !== 'Todos os Produtos') filtrosTexto.push(`Produto: <strong>${nomeProduto}</strong>`);
    if (nomeTipo && nomeTipo !== 'Entrada & Saída') filtrosTexto.push(`Tipo: <strong>${nomeTipo}</strong>`);
    const filtrosHtml = filtrosTexto.length > 0 ? filtrosTexto.join(' | ') : 'Sem filtros específicos (Exibindo todas as movimentações)';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Movimentações de Estoque - ITEC</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1e293b; background: #ffffff; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
        .header h1 { font-size: 20px; margin: 0; color: #0f172a; }
        .header .meta { font-size: 11px; color: #64748b; text-align: right; line-height: 1.4; }
        .filter-box { font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; color: #334155; }
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .kpi-card { padding: 10px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; }
        .kpi-card.green { border-color: #86efac; background: #f0fdf4; }
        .kpi-card.amber { border-color: #fde68a; background: #fffbeb; }
        .kpi-card.blue { border-color: #93c5fd; background: #eff6ff; }
        .kpi-card small { font-size: 10px; font-weight: bold; text-transform: uppercase; display: block; color: #475569; }
        .kpi-card h4 { font-size: 16px; margin: 4px 0 2px 0; color: #0f172a; }
        .kpi-card span { font-size: 11px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
        th { background: #0f172a; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
        tr:nth-child(even) td { background: #f8fafc; }
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; display: inline-block; }
        .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
        .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        @page { margin: 12mm; size: A4 landscape; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>📋 Relatório de Movimentações de Estoque</h1>
            <small style="color: #64748b;">Sistema de Controle de Estoques - ITEC</small>
        </div>
        <div class="meta">
            <strong>Gerado em:</strong> ${now}<br>
            <strong>Usuário:</strong> ${currentUser ? currentUser.nome_usuario : 'Sistema'}
        </div>
    </div>

    <div class="filter-box">
        🔍 <strong>Filtros Aplicados:</strong> ${filtrosHtml}
    </div>

    <div class="kpi-grid">
        <div class="kpi-card green">
            <small style="color: #15803d;">Total Entradas</small>
            <h4>${totalEntradasQtd}</h4>
            <span>${totalEntradasVal}</span>
        </div>
        <div class="kpi-card amber">
            <small style="color: #b45309;">Total Saídas</small>
            <h4>${totalSaidasQtd}</h4>
            <span>${totalSaidasVal}</span>
        </div>
        <div class="kpi-card blue">
            <small style="color: #1d4ed8;">Saldo Líquido Período</small>
            <h4>${saldoQtd}</h4>
            <span>${saldoVal}</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Data/Hora</th>
                <th>Unidade</th>
                <th>Produto</th>
                <th>Fornecedor</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Valor Unitário (R$)</th>
                <th>Total (R$)</th>
                <th>Usuário</th>
                <th>Observação</th>
            </tr>
        </thead>
        <tbody>
            ${tbody}
        </tbody>
    </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            win.focus();
            win.print();
        }, 250);
    } else {
        window.print();
    }
}

let editandoMovimentacaoId = null;

async function abrirModalMovimentacao(param) {
    document.getElementById('form-movimentacao').reset();
    
    // Se for string ('ENTRADA' ou 'SAIDA'), é um novo registro
    if (typeof param === 'string') {
        editandoMovimentacaoId = null;
        document.getElementById('mov-tipo').value = param;
        document.getElementById('mov-data').value = getFormattedLocalDateTime();
        document.getElementById('modal-movimentacao-title').textContent = param === 'ENTRADA' ? 'Registrar Nova ENTRADA de Estoque' : 'Registrar Nova SAÍDA de Estoque';
        
        const btnSubmit = document.getElementById('btn-submit-mov');
        btnSubmit.className = param === 'ENTRADA' ? 'btn btn-primary' : 'btn btn-warning';
        btnSubmit.innerHTML = param === 'ENTRADA' ? '<i class="fa-solid fa-circle-plus"></i> Confirmar Entrada' : '<i class="fa-solid fa-circle-minus"></i> Confirmar Saída';
    } 
    // Se for número, é edição
    else if (typeof param === 'number') {
        editandoMovimentacaoId = param;
        const mov = movimentacoesCache.find(m => m.id_movimentacao == param);
        if (!mov) {
            showToast('Movimentação não encontrada no cache local.', 'error');
            return;
        }

        document.getElementById('mov-tipo').value = mov.tipo_movimentacao;
        
        // Formatar a data para o input datetime-local
        let dt = mov.data_movimentacao;
        if (dt) {
            if (dt.endsWith('Z')) dt = dt.substring(0, dt.length - 1);
            if (dt.length > 16) dt = dt.substring(0, 16);
            document.getElementById('mov-data').value = dt;
        } else {
            document.getElementById('mov-data').value = getFormattedLocalDateTime();
        }

        document.getElementById('modal-movimentacao-title').textContent = `Editar ${mov.tipo_movimentacao} #${mov.id_movimentacao}`;
        
        const btnSubmit = document.getElementById('btn-submit-mov');
        btnSubmit.className = 'btn btn-info';
        btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';
    }

    const tipoAtual = document.getElementById('mov-tipo').value;
    document.getElementById('mov-saldo-info').classList.add('hidden');
    document.getElementById('modal-movimentacao').classList.remove('hidden');

    const groupForn = document.getElementById('group-mov-fornecedor');
    const groupNF = document.getElementById('group-mov-nf');
    const groupCC = document.getElementById('group-mov-centro-custo');
    const valorLabel = document.getElementById('mov-valor-label');

    if (tipoAtual === 'ENTRADA') {
        if (groupForn) groupForn.style.display = '';
        if (groupNF) groupNF.style.display = '';
        if (groupCC) groupCC.style.display = 'none';
        if (valorLabel) valorLabel.textContent = 'Preço de Custo Unitário (R$)';
    } else {
        if (groupForn) groupForn.style.display = 'none';
        if (groupNF) groupNF.style.display = 'none';
        if (groupCC) groupCC.style.display = '';
        if (valorLabel) valorLabel.textContent = 'Preço de Venda Unitário (R$)';
        // Carrega centros de custo e pré-seleciona o primeiro
        await carregarCentrosCustoNoModal();
    }

    await carregarCategoriasEFornecedores();

    const selectU = document.getElementById('mov-unidade');
    const dataU = await safeFetch('/api/unidades');
    if (dataU.success) {
        unidadesCache = dataU.unidades;
        selectU.innerHTML = '<option value="">Selecione a Unidade...</option>' +
            unidadesCache.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
        
        let targetUnit = selectedUnitId || (currentUser ? currentUser.id_unidade : null) || (unidadesCache.length > 0 ? unidadesCache[0].id_unidade : null);
        
        // Se for edição, forçar a unidade da movimentação
        if (editandoMovimentacaoId) {
            const mov = movimentacoesCache.find(m => m.id_movimentacao == editandoMovimentacaoId);
            if (mov) targetUnit = mov.id_unidade;
        }

        if (targetUnit) {
            selectU.value = targetUnit;
        }

        await atualizarProdutosPorUnidadeMovimentacao();

        // Se for edição, setar o produto, qtd, valor, etc
        if (editandoMovimentacaoId) {
            const mov = movimentacoesCache.find(m => m.id_movimentacao == editandoMovimentacaoId);
            if (mov) {
                document.getElementById('mov-produto').value = mov.id_produto;
                document.getElementById('mov-quantidade').value = mov.quantidade;
                document.getElementById('mov-valor').value = mov.valor_unitario;
                document.getElementById('mov-obs').value = mov.observacao || '';

                // Restaura Nota Fiscal se for ENTRADA
                const nfInput = document.getElementById('mov-nf');
                if (nfInput) nfInput.value = mov.numero_nf || '';
                
                if (mov.id_fornecedor && document.getElementById('mov-fornecedor')) {
                    document.getElementById('mov-fornecedor').value = mov.id_fornecedor;
                }

                // Restaura centro de custo se for edição de SAÍDA
                if (mov.tipo_movimentacao === 'SAIDA' && mov.id_centro_custo && document.getElementById('mov-centro-custo')) {
                    await carregarCentrosCustoNoModal(mov.id_centro_custo);
                } else if (mov.tipo_movimentacao === 'SAIDA') {
                    // Caso não haja centro salvo, ainda assim garante que o select esteja populado
                    await carregarCentrosCustoNoModal();
                }

                atualizarDadosProdutoMovimentacao();
            }
        }
    }
}

async function carregarCentrosCustoNoModal(valorAtual = null) {
    const selectCC = document.getElementById('mov-centro-custo');
    if (!selectCC) return;

    // Usa o cache se já disponível, caso contrário busca da API
    let centros = centrosCustoCache;
    if (!centros || centros.length === 0) {
        const result = await safeFetch('/api/centros-custo');
        if (result.success) {
            centrosCustoCache = result.centros;
            centros = result.centros;
        }
    }

    if (!centros || centros.length === 0) {
        selectCC.innerHTML = '<option value="">Nenhum centro de custo cadastrado</option>';
        return;
    }

    selectCC.innerHTML = centros.map(c =>
        `<option value="${c.id_centro_custo}">${c.codigo} — ${c.nome}</option>`
    ).join('');

    // Pré-seleciona o valor informado (edição) ou o primeiro cadastrado
    if (valorAtual) {
        selectCC.value = valorAtual;
    } else {
        selectCC.value = centros[0].id_centro_custo;
    }
}

async function atualizarProdutosPorUnidadeMovimentacao() {

    const movUnid = document.getElementById('mov-unidade').value;
    const selectProd = document.getElementById('mov-produto');
    document.getElementById('mov-saldo-info').classList.add('hidden');

    let prodUrl = '/api/produtos';
    if (movUnid) {
        prodUrl += `?id_unidade=${movUnid}`;
    }
    const data = await safeFetch(prodUrl);
    if (data.success) {
        produtosCache = data.produtos;
        selectProd.innerHTML = '<option value="">Selecione um produto...</option>' +
            produtosCache.map(p => `<option value="${p.id_produto}">${p.nome_produto} (Saldo na Unidade: ${p.estoque_atual})</option>`).join('');
    }
}

function atualizarDadosProdutoMovimentacao() {
    const prodId = document.getElementById('mov-produto').value;
    const tipo = document.getElementById('mov-tipo').value;

    if (!prodId) {
        document.getElementById('mov-saldo-info').classList.add('hidden');
        return;
    }

    const prod = produtosCache.find(p => p.id_produto == prodId);
    if (prod) {
        document.getElementById('mov-saldo-qtd').textContent = prod.estoque_atual;
        document.getElementById('mov-saldo-info').classList.remove('hidden');

        // Só altera o valor se não for edição (ou se for e o usuário mudar de produto)
        // Aqui para não sobrescrever o valor da edição, verificamos se o valor está vazio
        const valorInput = document.getElementById('mov-valor');
        if (!editandoMovimentacaoId || document.activeElement === document.getElementById('mov-produto')) {
            if (tipo === 'ENTRADA') {
                valorInput.value = prod.preco_custo || 0;
            } else {
                valorInput.value = prod.preco_venda || 0;
            }
        }
    }
}

async function salvarMovimentacao(event) {
    event.preventDefault();
    const movUnid = document.getElementById('mov-unidade').value;

    if (!movUnid) {
        showToast('Selecione uma Unidade Operacional para esta movimentação.', 'warning');
        return;
    }

    const payload = {
        id_produto: document.getElementById('mov-produto').value,
        tipo_movimentacao: document.getElementById('mov-tipo').value,
        quantidade: document.getElementById('mov-quantidade').value,
        valor_unitario: document.getElementById('mov-valor').value,
        observacao: document.getElementById('mov-obs').value.trim(),
        data_movimentacao: document.getElementById('mov-data').value,
        id_unidade: parseInt(movUnid),
        id_fornecedor: document.getElementById('mov-fornecedor') ? document.getElementById('mov-fornecedor').value || null : null,
        id_centro_custo: document.getElementById('mov-centro-custo') ? document.getElementById('mov-centro-custo').value || null : null,
        numero_nf: document.getElementById('mov-nf') ? document.getElementById('mov-nf').value.trim() || null : null,
        id_usuario: currentUser ? currentUser.id_usuario : null
    };

    let url = '/api/movimentacoes';
    let method = 'POST';

    if (editandoMovimentacaoId) {
        url += `/${editandoMovimentacaoId}`;
        method = 'PUT';
    }

    const result = await safeFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-movimentacao');
        carregarMovimentacoes();
        carregarProdutos();
        carregarDashboard();
    } else {
        showToast(result.message, 'error');
    }
}

// --- CATEGORIAS, FORNECEDORES & UNIDADES ---

async function carregarCategoriasEFornecedores() {
    const dataCat = await safeFetch('/api/categorias');
    const dataForn = await safeFetch('/api/fornecedores');

    if (dataCat.success) {
        categoriasCache = dataCat.categorias;
        const selectProdCat = document.getElementById('prod-categoria');
        const selectFilterCat = document.getElementById('filter-produto-categoria');
        
        const optionsHtml = categoriasCache.map(c => `<option value="${c.id_categoria}">${c.nome_categoria}</option>`).join('');
        if (selectProdCat) selectProdCat.innerHTML = '<option value="">Selecione...</option>' + optionsHtml;
        if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;
    }

    if (dataForn.success) {
        const optionsForn = '<option value="">Selecione...</option>' +
            dataForn.fornecedores.map(f => `<option value="${f.id_fornecedor}">${f.nome_fornecedor}</option>`).join('');

        const selectFornMov = document.getElementById('mov-fornecedor');
        if (selectFornMov) selectFornMov.innerHTML = optionsForn;
    }
}

async function carregarCadastrosGerais() {
    carregarUnidades();
    carregarCentrosCusto();
    carregarCategoriasEFornecedores();

    const dataCat = await safeFetch('/api/categorias');
    if (dataCat.success) {
        const tbody = document.getElementById('table-categorias-body');
        if (tbody) {
            tbody.innerHTML = dataCat.categorias.map(c => `
                <tr>
                    <td>#${c.id_categoria}</td>
                    <td><strong>${c.nome_categoria}</strong></td>
                </tr>
            `).join('');
        }
    }

    const dataForn = await safeFetch('/api/fornecedores');
    if (dataForn.success) {
        const tbody = document.getElementById('table-fornecedores-body');
        if (tbody) {
            tbody.innerHTML = dataForn.fornecedores.map(f => `
                <tr>
                    <td><strong>${f.nome_fornecedor}</strong></td>
                    <td>${f.cnpj_cpf || '-'}</td>
                    <td>${f.telefone || '-'}</td>
                    <td>${f.email || '-'}</td>
                </tr>
            `).join('');
        }
    }
}

// --- CENTROS DE CUSTO ---

let centrosCustoCache = [];

async function carregarCentrosCusto() {
    try {
        const result = await safeFetch('/api/centros-custo');
        if (result.success) {
            centrosCustoCache = result.centros;
            const tbody = document.getElementById('table-centros-custo-body');
            if (!tbody) return;
            if (centrosCustoCache.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum centro de custo cadastrado.</td></tr>';
                return;
            }
            tbody.innerHTML = centrosCustoCache.map(c => `
                <tr>
                    <td><code>${c.codigo}</code></td>
                    <td><strong>${c.nome}</strong></td>
                    <td><small class="text-muted">${c.descricao || '-'}</small></td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-outline" onclick="abrirModalCentroCusto(${c.id_centro_custo})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="excluirCentroCusto(${c.id_centro_custo})" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        showToast('Erro ao carregar centros de custo.', 'error');
    }
}

function abrirModalCentroCusto(id_centro_custo = null) {
    document.getElementById('form-centro-custo').reset();
    document.getElementById('cc-id').value = '';
    document.getElementById('modal-centro-custo-title').textContent = id_centro_custo ? 'Editar Centro de Custo' : 'Cadastrar Novo Centro de Custo';

    if (id_centro_custo) {
        const c = centrosCustoCache.find(x => x.id_centro_custo == id_centro_custo);
        if (c) {
            document.getElementById('cc-id').value = c.id_centro_custo;
            document.getElementById('cc-codigo').value = c.codigo;
            document.getElementById('cc-nome').value = c.nome;
            document.getElementById('cc-descricao').value = c.descricao || '';
        }
    }

    document.getElementById('modal-centro-custo').classList.remove('hidden');
}

async function salvarCentroCusto(event) {
    event.preventDefault();
    const payload = {
        id_centro_custo: document.getElementById('cc-id').value || null,
        codigo: document.getElementById('cc-codigo').value.trim(),
        nome: document.getElementById('cc-nome').value.trim(),
        descricao: document.getElementById('cc-descricao').value.trim()
    };

    const result = await safeFetch('/api/centros-custo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-centro-custo');
        carregarCentrosCusto();
    } else {
        showToast(result.message, 'error');
    }
}

async function excluirCentroCusto(id_centro_custo) {
    if (!confirm('Tem certeza que deseja excluir este centro de custo?')) return;

    const result = await safeFetch(`/api/centros-custo/${id_centro_custo}`, { method: 'DELETE' });

    if (result.success) {
        showToast(result.message, 'success');
        carregarCentrosCusto();
    } else {
        showToast(result.message, 'error');
    }
}

function abrirModalCategoria() {
    document.getElementById('form-categoria').reset();
    document.getElementById('modal-categoria').classList.remove('hidden');
}

async function salvarCategoria(event) {
    event.preventDefault();
    const nome_categoria = document.getElementById('cat-nome').value.trim();

    const result = await safeFetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_categoria })
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-categoria');
        carregarCadastrosGerais();
    } else {
        showToast(result.message, 'error');
    }
}

function abrirModalFornecedor() {
    document.getElementById('form-fornecedor').reset();
    document.getElementById('modal-fornecedor').classList.remove('hidden');
}

async function salvarFornecedor(event) {
    event.preventDefault();
    const payload = {
        nome_fornecedor: document.getElementById('forn-nome').value.trim(),
        cnpj_cpf: document.getElementById('forn-cnpj').value.trim(),
        telefone: document.getElementById('forn-tel').value.trim(),
        email: document.getElementById('forn-email').value.trim()
    };

    const result = await safeFetch('/api/fornecedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-fornecedor');
        carregarCadastrosGerais();
    } else {
        showToast(result.message, 'error');
    }
}

// --- USUÁRIOS E APROVAÇÃO ---

async function carregarUsuarios() {
    const result = await safeFetch('/api/auth/users');

    if (result.success) {
        const tbody = document.getElementById('table-usuarios-body');
        tbody.innerHTML = result.users.map(u => {
            let statusBadge = 'badge-success';
            if (u.status_aprovacao === 'Pendente') statusBadge = 'badge-warning';
            if (u.status_aprovacao === 'Rejeitado') statusBadge = 'badge-danger';

            let badgeSenha = u.senha_pendente ? ' <span class="badge badge-warning" style="margin-left: 5px;" title="Troca de senha solicitada"><i class="fa-solid fa-key"></i> Pendente</span>' : '';

            let acoesHtml = '';
            if (u.status_aprovacao === 'Pendente') {
                acoesHtml = `
                    <button class="btn btn-sm btn-success" onclick="abrirModalUsuario(${u.id_usuario}, '${u.nome_usuario}', ${u.id_unidade || 'null'}, '${u.nivel_acesso}', 'aprovar', [${u.categorias_acesso ? u.categorias_acesso.join(',') : ''}])" title="Aprovar Cadastro">
                        <i class="fa-solid fa-check"></i> Aprovar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="rejeitarUsuario(${u.id_usuario})" title="Rejeitar Cadastro">
                        <i class="fa-solid fa-xmark"></i> Rejeitar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirUsuario(${u.id_usuario})" title="Excluir Usuário">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `;
            } else {
                acoesHtml = `
                    <button class="btn btn-sm btn-outline" onclick="abrirModalUsuario(${u.id_usuario}, '${u.nome_usuario}', ${u.id_unidade || 'null'}, '${u.nivel_acesso}', 'editar', [${u.categorias_acesso ? u.categorias_acesso.join(',') : ''}])" title="Editar Unidade / Nível">
                        <i class="fa-solid fa-pen-to-square"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirUsuario(${u.id_usuario})" title="Excluir Usuário">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `;
            }
            
            if (u.senha_pendente) {
                acoesHtml += `
                    <button class="btn btn-sm btn-success" onclick="aprovarSenhaPendente(${u.id_usuario})" title="Aprovar Nova Senha">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="rejeitarSenhaPendente(${u.id_usuario})" title="Rejeitar Nova Senha">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                `;
            }

            return `
                <tr>
                    <td>#${u.id_usuario}</td>
                    <td><strong>${u.nome_usuario}</strong>${badgeSenha}</td>
                    <td><code>${u.usuario}</code></td>
                    <td><span class="badge ${u.nivel_acesso === 'Administrador' ? 'badge-info' : u.nivel_acesso === 'Supervisor' ? 'badge-warning' : 'badge-secondary'}">${u.nivel_acesso}</span></td>
                    <td>${u.nome_unidade || 'Sem Unidade'}</td>
                    <td><span class="badge ${statusBadge}">${u.status_aprovacao || 'Aprovado'}</span></td>
                    <td class="text-right">${acoesHtml}</td>
                </tr>
            `;
        }).join('');
    } else {
        const tbody = document.getElementById('table-usuarios-body');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar usuários: ${result.message}</td></tr>`;
    }
}

// -------------------------------------------------
// Função para excluir usuário (DELETE)
// -------------------------------------------------
async function excluirUsuario(id_usuario) {
  // Pergunta de confirmação ao usuário
  if (!confirm('Tem certeza que deseja EXCLUIR este usuário?')) {
    return;
  }

  try {
    const resultado = await safeFetch(`/api/auth/users/${id_usuario}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (resultado.success) {
      showToast('Usuário excluído com sucesso.', 'success');
      // Atualiza a lista de usuários
      carregarUsuarios();
    } else {
      showToast(resultado.message || 'Falha ao excluir o usuário.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao comunicar com o servidor.', 'error');
  }
}


async function abrirModalUsuario(id_usuario, nome_usuario, id_unidade_atual, nivel_atual, modo = 'editar', categorias_acesso = []) {
    document.getElementById('aprovar-user-id').value = id_usuario;
    document.getElementById('aprovar-user-nome').textContent = nome_usuario;
    document.getElementById('aprovar-user-modo').value = modo;

    const title = modo === 'aprovar' ? 'Aprovar e Vincular Usuário' : 'Editar Unidade e Nível de Acesso';
    document.getElementById('modal-user-title').textContent = title;

    const data = await safeFetch('/api/unidades');
    if (data.success) {
        unidadesCache = data.unidades;
        const selectU = document.getElementById('aprovar-unidade');
        selectU.innerHTML = '<option value="">Selecione a Unidade...</option>' +
            data.unidades.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
        
        if (id_unidade_atual && id_unidade_atual !== 'null') {
            selectU.value = id_unidade_atual;
        }
    }

    if (nivel_atual) {
        document.getElementById('aprovar-nivel').value = nivel_atual;
    }

    let cats = categoriasCache;
    if (cats.length === 0) {
        const catReq = await safeFetch('/api/categorias');
        if (catReq.success) {
            cats = catReq.categorias;
            categoriasCache = cats;
        }
    }
    
    const catContainer = document.getElementById('aprovar-categorias');
    if (catContainer) {
        catContainer.innerHTML = cats.map(c => {
            const isChecked = categorias_acesso.includes(c.id_categoria) ? 'checked' : '';
            return `
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-weight: normal; margin-bottom: 2px;">
                    <input type="checkbox" name="usuario-categoria" value="${c.id_categoria}" ${isChecked}>
                    ${c.nome_categoria}
                </label>
            `;
        }).join('');
    }

    document.getElementById('modal-aprovar-usuario').classList.remove('hidden');
}

async function salvarAprovacaoOuEdicaoUsuario(event) {
    event.preventDefault();
    const userId = document.getElementById('aprovar-user-id').value;
    const modo = document.getElementById('aprovar-user-modo').value;
    const id_unidade = document.getElementById('aprovar-unidade').value;
    const nivel_acesso = document.getElementById('aprovar-nivel').value;

    const categoriasSelecionadas = Array.from(document.querySelectorAll('input[name="usuario-categoria"]:checked'))
                                        .map(cb => parseInt(cb.value));

    if (!id_unidade) {
        showToast('Selecione uma Unidade Operacional.', 'warning');
        return;
    }

    const endpoint = modo === 'aprovar' 
        ? `/api/auth/users/${userId}/aprovar` 
        : `/api/auth/users/${userId}/editar`;

    const result = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_unidade, nivel_acesso, categorias: categoriasSelecionadas })
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-aprovar-usuario');
        carregarUsuarios();

        if (currentUser && currentUser.id_usuario == userId) {
            currentUser.id_unidade = id_unidade;
            currentUser.nivel_acesso = nivel_acesso;
            const unitObj = unidadesCache.find(u => u.id_unidade == id_unidade);
            if (unitObj) currentUser.nome_unidade = unitObj.nome_unidade;
            setSessionUser(currentUser);
            iniciarAplicacao();
        }
    } else {
        showToast(result.message, 'error');
    }
}

async function rejeitarUsuario(id_usuario) {
    if (!confirm('Deseja rejeitar este usuário?')) return;

    const result = await safeFetch(`/api/auth/users/${id_usuario}/rejeitar`, { method: 'POST' });

    if (result.success) {
        showToast(result.message, 'success');
        carregarUsuarios();
    } else {
        showToast(result.message, 'error');
    }
}

// Funções de Troca de Senha
function abrirModalTrocarSenha() {
    document.getElementById('form-trocar-senha').reset();
    document.getElementById('modal-trocar-senha').classList.remove('hidden');
}

async function solicitarTrocaSenha(event) {
    event.preventDefault();
    const senha_atual = document.getElementById('ts-senha-atual').value;
    const nova_senha = document.getElementById('ts-nova-senha').value;

    const result = await safeFetch('/api/auth/users/solicitar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser ? currentUser.id_usuario : null },
        body: JSON.stringify({ senha_atual, nova_senha })
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-trocar-senha');
    } else {
        showToast(result.message, 'error');
    }
}

async function aprovarSenhaPendente(id_usuario) {
    if (!confirm('Deseja aprovar a nova senha deste usuário? A antiga deixará de funcionar.')) return;
    const result = await safeFetch(`/api/auth/users/${id_usuario}/aprovar-senha`, { method: 'POST' });
    if (result.success) {
        showToast(result.message, 'success');
        carregarUsuarios();
    } else {
        showToast(result.message, 'error');
    }
}

async function rejeitarSenhaPendente(id_usuario) {
    if (!confirm('Deseja rejeitar a solicitação de nova senha?')) return;
    const result = await safeFetch(`/api/auth/users/${id_usuario}/rejeitar-senha`, { method: 'POST' });
    if (result.success) {
        showToast(result.message, 'success');
        carregarUsuarios();
    } else {
        showToast(result.message, 'error');
    }
}

// --- UTILITÁRIOS ---

function fecharModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatarData(strData) {
    if (!strData) return '-';
    try {
        const d = new Date(strData);
        if (isNaN(d.getTime())) return strData;
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return strData;
    }
}

function showToast(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    
    let icon = 'fa-check-circle';
    if (tipo === 'error') icon = 'fa-circle-xmark';
    if (tipo === 'warning') icon = 'fa-triangle-exclamation';
    if (tipo === 'info') icon = 'fa-circle-info';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${mensagem}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- RELATÓRIO DE ESTOQUE BAIXO ---

async function abrirRelatorioEstoqueBaixo() {
    document.getElementById('modal-relatorio-estoque').classList.remove('hidden');
    document.getElementById('table-relatorio-body').innerHTML =
        '<tr><td colspan="7" class="text-center text-muted">Carregando...</td></tr>';

    let url = '/api/produtos?busca=';
    if (selectedUnitId) url += `&id_unidade=${selectedUnitId}`;

    const result = await safeFetch(url);
    if (!result.success) {
        showToast('Erro ao carregar produtos.', 'error');
        return;
    }

    // Filtra somente produtos com estoque baixo ou zerado
    const baixos = result.produtos.filter(p =>
        p.status_estoque === 'Baixo' || p.status_estoque === 'Zerado'
    );

    const infoEl = document.getElementById('relatorio-estoque-info');
    const unidadeLabel = selectedUnitId
        ? (unidadesCache.find(u => u.id_unidade == selectedUnitId)?.nome_unidade || 'Unidade selecionada')
        : 'Todas as Unidades';
    const agora = new Date().toLocaleString('pt-BR');
    infoEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> &nbsp;
        <strong>${baixos.length} produto(s)</strong> com estoque abaixo do mínimo &nbsp;|&nbsp;
        Unidade: <strong>${unidadeLabel}</strong> &nbsp;|&nbsp;
        Gerado em: <strong>${agora}</strong>`;

    const tbody = document.getElementById('table-relatorio-body');
    if (baixos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:24px;">✅ Nenhum produto com estoque baixo!</td></tr>';
        return;
    }

    tbody.innerHTML = baixos.map((p, i) => {
        const badgeClass = p.status_estoque === 'Zerado' ? 'badge-danger' : 'badge-warning';
        return `
            <tr>
                <td style="color:var(--text-muted)">${i + 1}</td>
                <td><strong>${p.nome_produto}</strong></td>
                <td>${p.nome_categoria || '-'}</td>
                <td>${p.nome_unidade || '-'}</td>
                <td>${p.estoque_minimo}</td>
                <td><strong style="font-size:15px;color:${p.estoque_atual === 0 ? '#f87171' : '#fbbf24'}">${p.estoque_atual}</strong></td>
                <td><span class="badge ${badgeClass}">${p.status_estoque}</span></td>
            </tr>`;
    }).join('');
}

function imprimirRelatorioEstoque() {
    const info = document.getElementById('relatorio-estoque-info').innerText;
    const rows = document.getElementById('table-relatorio-body').innerHTML;
    const thead = document.getElementById('table-relatorio-baixo').querySelector('thead').outerHTML;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Estoque Baixo</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .info { font-size: 12px; color: #555; margin-bottom: 16px; padding: 8px 12px; background: #fff8e1; border-left: 4px solid #f59e0b; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #1e293b; color: #fff; padding: 8px 10px; text-align: left; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .badge { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
        @page { margin: 16mm; }
    </style>
</head>
<body>
    <h1>⚠️ Relatório de Estoque Baixo</h1>
    <div class="info">${info}</div>
    <table>
        ${thead}
        <tbody>${rows}</tbody>
    </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            win.focus();
            win.print();
        }, 250);
    } else {
        window.print();
    }
}

// --- RELATÓRIO DE ESTOQUE ---

async function preencherOpcoesFiltrosRelatorioEstoque() {
    const sUnidade = document.getElementById('filter-rel-est-unidade');
    const sCategoria = document.getElementById('filter-rel-est-categoria');

    if (sUnidade && unidadesCache.length === 0) {
        const u = await safeFetch('/api/unidades');
        if (u.success) unidadesCache = u.unidades;
    }
    if (sCategoria && categoriasCache.length === 0) {
        const c = await safeFetch('/api/categorias');
        if (c.success) categoriasCache = c.categorias;
    }

    if (sUnidade) {
        let html = '<option value="">Todas as Unidades</option>';
        if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
            html = `<option value="${currentUser.id_unidade}">${currentUser.nome_unidade || 'Sua Unidade'}</option>`;
            sUnidade.disabled = true;
        } else {
            unidadesCache.forEach(un => {
                html += `<option value="${un.id_unidade}">${un.nome_unidade}</option>`;
            });
            if (selectedUnitId) sUnidade.value = selectedUnitId;
        }
        sUnidade.innerHTML = html;
    }

    if (sCategoria) {
        sCategoria.innerHTML = '<option value="">Todas as Categorias</option>' + 
            categoriasCache.map(cat => `<option value="${cat.id_categoria}">${cat.nome_categoria}</option>`).join('');
    }
}

async function carregarRelatorioEstoque() {
    let unidade = document.getElementById('filter-rel-est-unidade')?.value || '';
    const categoria = document.getElementById('filter-rel-est-categoria')?.value || '';
    const incluirZerados = document.getElementById('filter-rel-est-zerados')?.checked || false;

    if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
        unidade = currentUser.id_unidade || '';
    } else if (!unidade && selectedUnitId) {
        unidade = selectedUnitId;
        const sUnidade = document.getElementById('filter-rel-est-unidade');
        if (sUnidade) sUnidade.value = selectedUnitId;
    }

    let url = '/api/relatorios/estoque?';
    if (unidade) url += `id_unidade=${unidade}&`;
    if (categoria) url += `id_categoria=${categoria}&`;
    if (incluirZerados) url += `incluir_zerados=true&`;

    const tbody = document.getElementById('table-relatorios-estoque-body');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando dados do relatório...</td></tr>';
        const res = await safeFetch(url);
        
        if (res.success) {
            if (res.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum produto encontrado para os filtros selecionados.</td></tr>';
                if (document.getElementById('report-estoque-total-val')) {
                    document.getElementById('report-estoque-total-val').textContent = 'R$ 0,00';
                }
                return;
            }

            let somaTotal = 0;
            res.data.forEach(r => {
                if (r.valor_total) somaTotal += r.valor_total;
            });
            
            if (document.getElementById('report-estoque-total-val')) {
                document.getElementById('report-estoque-total-val').textContent = somaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }

            tbody.innerHTML = res.data.map(r => `
                <tr>
                    <td>#${r.id_produto}</td>
                    <td><strong>${r.nome_produto}</strong></td>
                    <td>${r.nome_categoria}</td>
                    <td>${r.nome_unidade}</td>
                    <td><span class="badge ${r.estoque_atual <= 0 ? 'badge-danger' : 'badge-primary'}">${r.estoque_atual}</span></td>
                    <td><small style="color: var(--accent-warning);">${(r.preco_custo || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</small></td>
                    <td><strong>${(r.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar relatório.</td></tr>';
            showToast(res.message || 'Erro ao carregar relatório', 'error');
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro de conexão ao carregar relatório.</td></tr>';
    }
}

function aplicarFiltrosRelatorioEstoque(event) {
    if (event) event.preventDefault();
    carregarRelatorioEstoque();
}

function limparFiltrosRelatorioEstoque() {
    document.getElementById('form-filter-relatorio-estoque').reset();
    if (currentUser && currentUser.nivel_acesso === 'Administrador' && selectedUnitId) {
        document.getElementById('filter-rel-est-unidade').value = selectedUnitId;
    }
    carregarRelatorioEstoque();
}

function imprimirRelatorioEstoque() {
    const selectUnidade = document.getElementById('filter-rel-est-unidade');
    const nomeUnidade = selectUnidade && selectUnidade.selectedIndex > 0 ? selectUnidade.options[selectUnidade.selectedIndex].text : 'Todas as Unidades';
    
    const selectCategoria = document.getElementById('filter-rel-est-categoria');
    const nomeCategoria = selectCategoria && selectCategoria.selectedIndex > 0 ? selectCategoria.options[selectCategoria.selectedIndex].text : 'Todas as Categorias';
    const incluirZerados = document.getElementById('filter-rel-est-zerados')?.checked || false;

    const tbody = document.getElementById('table-relatorios-estoque-body')?.innerHTML || '';
    const now = new Date().toLocaleString('pt-BR');

    let filtrosTexto = [];
    if (nomeUnidade && nomeUnidade !== 'Todas as Unidades') filtrosTexto.push(`Unidade: <strong>${nomeUnidade}</strong>`);
    if (nomeCategoria && nomeCategoria !== 'Todas as Categorias') filtrosTexto.push(`Categoria: <strong>${nomeCategoria}</strong>`);
    filtrosTexto.push(`Produtos zerados: <strong>${incluirZerados ? 'Incluídos' : 'Ocultos'}</strong>`);
    
    const filtrosHtml = filtrosTexto.length > 0 ? filtrosTexto.join(' | ') : 'Sem filtros específicos (Exibindo estoque atual geral)';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Estoque Atual</title>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; padding: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
        .header h1 { font-size: 22px; margin: 0 0 5px 0; color: #0f172a; }
        .header .meta { text-align: right; font-size: 11px; color: #475569; }
        .filter-box { font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; color: #334155; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
        th { background: #0f172a; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
        tr:nth-child(even) td { background: #f8fafc; }
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; display: inline-block; }
        .badge-primary { background: #dbeafe; color: #1e3a8a; border: 1px solid #bfdbfe; }
        .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        @page { margin: 12mm; size: A4 portrait; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>📋 Relatório de Estoque Atual</h1>
            <small style="color: #64748b;">Sistema de Controle de Estoques - ITEC</small>
        </div>
        <div class="meta">
            <strong>Gerado em:</strong> ${now}<br>
            <strong>Usuário:</strong> ${currentUser ? currentUser.nome_usuario : 'Sistema'}
        </div>
    </div>

    <div class="filter-box">
        🔍 <strong>Filtros Aplicados:</strong> ${filtrosHtml}
    </div>

    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Saldo Atual</th>
                <th>Preço Unit. (Últ. Entrada)</th>
                <th>Valor Total</th>
            </tr>
        </thead>
        <tbody>
            ${tbody}
        </tbody>
    </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            win.focus();
            win.print();
        }, 250);
    } else {
        window.print();
    }
}

// --- RELATÓRIO DE SUGESTÃO DE COMPRAS ---

function definirPeriodoPadraoSugestaoCompras() {
    const inputInicio = document.getElementById('filter-rel-sug-inicio');
    const inputFim = document.getElementById('filter-rel-sug-fim');
    if (!inputInicio || !inputFim) return;

    if (!inputInicio.value || !inputFim.value) {
        const hoje = new Date();
        const inicio = new Date(hoje);
        inicio.setDate(inicio.getDate() - 30);
        inputFim.value = hoje.toISOString().split('T')[0];
        inputInicio.value = inicio.toISOString().split('T')[0];
    }
}

async function preencherOpcoesFiltrosRelatorioSugestaoCompras() {
    const sUnidade = document.getElementById('filter-rel-sug-unidade');
    const sCategoria = document.getElementById('filter-rel-sug-categoria');

    if (sUnidade && unidadesCache.length === 0) {
        const u = await safeFetch('/api/unidades');
        if (u.success) unidadesCache = u.unidades;
    }
    if (sCategoria && categoriasCache.length === 0) {
        const c = await safeFetch('/api/categorias');
        if (c.success) categoriasCache = c.categorias;
    }

    if (sUnidade) {
        let html = '<option value="">Todas as Unidades</option>';
        if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
            html = `<option value="${currentUser.id_unidade}">${currentUser.nome_unidade || 'Sua Unidade'}</option>`;
            sUnidade.disabled = true;
        } else {
            unidadesCache.forEach(un => {
                html += `<option value="${un.id_unidade}">${un.nome_unidade}</option>`;
            });
            if (selectedUnitId) sUnidade.value = selectedUnitId;
        }
        sUnidade.innerHTML = html;
    }

    if (sCategoria) {
        sCategoria.innerHTML = '<option value="">Todas as Categorias</option>' +
            categoriasCache.map(cat => `<option value="${cat.id_categoria}">${cat.nome_categoria}</option>`).join('');
    }

    definirPeriodoPadraoSugestaoCompras();
}

async function carregarRelatorioSugestaoCompras() {
    definirPeriodoPadraoSugestaoCompras();

    let unidade = document.getElementById('filter-rel-sug-unidade')?.value || '';
    const categoria = document.getElementById('filter-rel-sug-categoria')?.value || '';
    const dataInicio = document.getElementById('filter-rel-sug-inicio')?.value || '';
    const dataFim = document.getElementById('filter-rel-sug-fim')?.value || '';

    if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
        unidade = currentUser.id_unidade || '';
    } else if (!unidade && selectedUnitId) {
        unidade = selectedUnitId;
        const sUnidade = document.getElementById('filter-rel-sug-unidade');
        if (sUnidade) sUnidade.value = selectedUnitId;
    }

    let url = '/api/relatorios/sugestao-compras?';
    if (unidade) url += `id_unidade=${unidade}&`;
    if (categoria) url += `id_categoria=${categoria}&`;
    if (dataInicio) url += `data_inicio=${encodeURIComponent(dataInicio)}&`;
    if (dataFim) url += `data_fim=${encodeURIComponent(dataFim)}&`;

    const tbody = document.getElementById('table-relatorios-sugestao-body');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Carregando dados do relatório...</td></tr>';
        const res = await safeFetch(url);

        if (res.success) {
            const ocultarZero = document.getElementById('filter-rel-sug-ocultar-zero')?.checked ?? true;
            const dados = ocultarZero ? res.data.filter(r => r.sugestao_pedido > 0) : res.data;

            if (dados.length === 0) {
                const msg = ocultarZero && res.data.length > 0
                    ? 'Nenhum produto com sugestão de pedido acima de zero. <a href="#" onclick="document.getElementById(\'filter-rel-sug-ocultar-zero\').click(); return false;">Mostrar todos</a>'
                    : 'Nenhum produto encontrado para os filtros selecionados.';
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">${msg}</td></tr>`;
                const kpiTotal = document.getElementById('kpi-total-sugerido-compras');
                if (kpiTotal) kpiTotal.textContent = 'R$ 0,00';
                return;
            }

            const totalValor = dados.reduce((acc, r) => acc + (r.valor_sugestao || 0), 0);
            const kpiTotal = document.getElementById('kpi-total-sugerido-compras');
            if (kpiTotal) {
                kpiTotal.textContent = totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }

            tbody.innerHTML = dados.map(r => {
                const valorFmt = (r.valor_sugestao || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                return `
                <tr>
                    <td>#${r.id_produto}</td>
                    <td><strong>${r.nome_produto}</strong></td>
                    <td>${r.nome_unidade}</td>
                    <td>${r.nome_categoria}</td>
                    <td><span class="badge ${r.estoque_real <= r.estoque_minimo ? 'badge-danger' : 'badge-primary'}">${r.estoque_real}</span></td>
                    <td><span class="badge badge-warning">${r.estoque_minimo}</span></td>
                    <td><span class="badge ${r.sugestao_pedido > 0 ? 'badge-success' : 'badge-secondary'}">${r.sugestao_pedido}</span></td>
                    <td><span style="font-weight:600; color: var(--accent-teal);">${valorFmt}</span></td>
                </tr>
            `}).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Erro ao carregar relatório.</td></tr>';
            showToast(res.message || 'Erro ao carregar relatório', 'error');
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Erro de conexão ao carregar relatório.</td></tr>';
    }
}

function aplicarFiltrosRelatorioSugestaoCompras(event) {
    if (event) event.preventDefault();
    carregarRelatorioSugestaoCompras();
}

function limparFiltrosRelatorioSugestaoCompras() {
    document.getElementById('form-filter-relatorio-sugestao').reset();
    // Restaurar o toggle ao padrão (ocultar sugestão zero)
    const toggleZero = document.getElementById('filter-rel-sug-ocultar-zero');
    if (toggleZero) toggleZero.checked = true;
    if (currentUser && currentUser.nivel_acesso === 'Administrador' && selectedUnitId) {
        document.getElementById('filter-rel-sug-unidade').value = selectedUnitId;
    }
    definirPeriodoPadraoSugestaoCompras();
    carregarRelatorioSugestaoCompras();
}

function imprimirRelatorioSugestaoCompras() {
    const selectUnidade = document.getElementById('filter-rel-sug-unidade');
    const nomeUnidade = selectUnidade && selectUnidade.selectedIndex > 0 ? selectUnidade.options[selectUnidade.selectedIndex].text : 'Todas as Unidades';

    const selectCategoria = document.getElementById('filter-rel-sug-categoria');
    const nomeCategoria = selectCategoria && selectCategoria.selectedIndex > 0 ? selectCategoria.options[selectCategoria.selectedIndex].text : 'Todas as Categorias';

    const dataInicio = document.getElementById('filter-rel-sug-inicio')?.value || '';
    const dataFim = document.getElementById('filter-rel-sug-fim')?.value || '';

    const tbody = document.getElementById('table-relatorios-sugestao-body')?.innerHTML || '';
    const now = new Date().toLocaleString('pt-BR');

    let filtrosTexto = [];
    if (dataInicio && dataFim) filtrosTexto.push(`Período: <strong>${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')}</strong>`);
    if (nomeUnidade && nomeUnidade !== 'Todas as Unidades') filtrosTexto.push(`Unidade: <strong>${nomeUnidade}</strong>`);
    if (nomeCategoria && nomeCategoria !== 'Todas as Categorias') filtrosTexto.push(`Categoria: <strong>${nomeCategoria}</strong>`);
    const filtrosHtml = filtrosTexto.length > 0 ? filtrosTexto.join(' | ') : 'Sem filtros específicos';

    const totalSugeridoEl = document.getElementById('kpi-total-sugerido-compras');
    const totalSugeridoTexto = totalSugeridoEl ? totalSugeridoEl.textContent : 'R$ 0,00';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Sugestão de Compras</title>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; padding: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
        .header h1 { font-size: 22px; margin: 0 0 5px 0; color: #0f172a; }
        .header .meta { text-align: right; font-size: 11px; color: #475569; }
        .filter-box { font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; color: #334155; }
        .total-box { display: flex; justify-content: flex-end; margin-bottom: 12px; }
        .total-card { background: #f0fdfa; border: 1px solid #14b8a6; border-radius: 8px; padding: 10px 20px; text-align: center; }
        .total-card .label { font-size: 11px; color: #0f766e; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .total-card .value { font-size: 20px; font-weight: 700; color: #0d9488; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
        th { background: #0f172a; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
        tr:nth-child(even) td { background: #f8fafc; }
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; display: inline-block; }
        .badge-primary { background: #dbeafe; color: #1e3a8a; border: 1px solid #bfdbfe; }
        .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .badge-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
        .tfoot-total td { background: #f0fdfa !important; font-weight: 700; color: #0d9488; border-top: 2px solid #14b8a6; }
        @page { margin: 12mm; size: A4 landscape; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>🛒 Sugestão de Compras</h1>
            <small style="color: #64748b;">Sistema de Controle de Estoques - ITEC</small>
        </div>
        <div class="meta">
            <strong>Gerado em:</strong> ${now}<br>
            <strong>Usuário:</strong> ${currentUser ? currentUser.nome_usuario : 'Sistema'}
        </div>
    </div>

    <div class="filter-box">
        🔍 <strong>Filtros Aplicados:</strong> ${filtrosHtml}
    </div>

    <div class="total-box">
        <div class="total-card">
            <div class="label">💰 Total Sugerido</div>
            <div class="value">${totalSugeridoTexto}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Produto</th>
                <th>Unidade</th>
                <th>Categoria</th>
                <th>Estoque Real</th>
                <th>Estoque Mínimo</th>
                <th>Sugestão de Pedido</th>
                <th>Valor Sugerido</th>
            </tr>
        </thead>
        <tbody>
            ${tbody}
        </tbody>
        <tfoot>
            <tr class="tfoot-total">
                <td colspan="7" style="text-align:right; font-size:12px;">TOTAL GERAL SUGERIDO:</td>
                <td>${totalSugeridoTexto}</td>
            </tr>
        </tfoot>
    </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            win.focus();
            win.print();
        }, 250);
    } else {
        window.print();
    }
}
