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
let _userDataMap = {}; // mapa id_usuario -> dados completos do usuário

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
        if (!localStorage.getItem('gh_estagios_lancamentos')) {
            localStorage.setItem('gh_estagios_lancamentos', JSON.stringify([]));
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

        // PERMISSOES MENU USER
        if (path.match(/\/api\/auth\/users\/\d+\/menus/) && method === 'POST') {
            const id = path.split('/')[4];
            const users = this.get('usuarios');
            const u = users.find(x => x.id_usuario == id);
            if (u) {
                u.menus_permitidos = body.menus;
                this.set('usuarios', users);
                return { success: true, message: 'Permissões de menu atualizadas!' };
            }
            return { success: false, message: 'Usuário não encontrado.' };
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

        // --- ESTÁGIOS ---
        if (path === '/api/estagios/lancamentos') {
            const lancamentos = this.get('estagios_lancamentos');
            if (method === 'GET') {
                return { success: true, lancamentos: lancamentos.sort((a,b) => b.id_lancamento - a.id_lancamento) };
            }
            if (method === 'POST') {
                if (body.id_lancamento) {
                    const l = lancamentos.find(x => x.id_lancamento == body.id_lancamento);
                    if (l) {
                        l.data_lancamento = body.data_lancamento;
                        l.status = body.status;
                        l.nome_aluno = body.nome_aluno;
                        l.unidade = body.unidade;
                        l.curso = body.curso;
                        l.turma = body.turma;
                        l.horas_totais = body.horas_totais;
                        l.protocolo_ew = body.protocolo_ew;
                        l.observacoes = body.observacoes;
                        if (body.horas_capacitacao !== undefined) l.horas_capacitacao = body.horas_capacitacao;
                        if (body.horas_evento !== undefined) l.horas_evento = body.horas_evento;
                        if (body.horas_laboratorio !== undefined) l.horas_laboratorio = body.horas_laboratorio;
                        if (body.horas_enf_cirurgica !== undefined) l.horas_enf_cirurgica = body.horas_enf_cirurgica;
                        if (body.horas_enf_medica !== undefined) l.horas_enf_medica = body.horas_enf_medica;
                        if (body.horas_saude_mulher !== undefined) l.horas_saude_mulher = body.horas_saude_mulher;
                        if (body.horas_saude_mental !== undefined) l.horas_saude_mental = body.horas_saude_mental;
                        if (body.horas_saude_publica !== undefined) l.horas_saude_publica = body.horas_saude_publica;
                        if (body.horas_emergencia !== undefined) l.horas_emergencia = body.horas_emergencia;
                        if (body.aguardando_analise !== undefined) l.aguardando_analise = body.aguardando_analise;
                    }
                } else {
                    lancamentos.push({
                        id_lancamento: Date.now(),
                        data_lancamento: body.data_lancamento,
                        status: body.status,
                        nome_aluno: body.nome_aluno,
                        unidade: body.unidade,
                        curso: body.curso,
                        turma: body.turma,
                        horas_totais: body.horas_totais,
                        protocolo_ew: body.protocolo_ew,
                        observacoes: body.observacoes,
                        horas_capacitacao: body.horas_capacitacao || 0,
                        horas_evento: body.horas_evento || 0,
                        horas_laboratorio: body.horas_laboratorio || 0,
                        horas_enf_cirurgica: body.horas_enf_cirurgica || 0,
                        horas_enf_medica: body.horas_enf_medica || 0,
                        horas_saude_mulher: body.horas_saude_mulher || 0,
                        horas_saude_mental: body.horas_saude_mental || 0,
                        horas_saude_publica: body.horas_saude_publica || 0,
                        horas_emergencia: body.horas_emergencia || 0,
                        aguardando_analise: body.aguardando_analise || false,
                        data_cadastro: new Date().toISOString()
                    });
                }
                this.set('estagios_lancamentos', lancamentos);
                return { success: true, message: 'Lançamento salvo com sucesso!' };
            }
        }
        if (path.match(/\/api\/estagios\/lancamentos\/\d+/) && method === 'DELETE') {
            const id = path.split('/')[4];
            let lancamentos = this.get('estagios_lancamentos');
            lancamentos = lancamentos.filter(x => x.id_lancamento != id);
            this.set('estagios_lancamentos', lancamentos);
            return { success: true, message: 'Lançamento excluído com sucesso!' };
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
            let dataEntrega = params.get('data_entrega');

            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            const dia = String(hoje.getDate()).padStart(2, '0');
            const hojeLocal = `${ano}-${mes}-${dia}`;

            if (!dataInicio || !dataFim) {
                dataFim = dataFim || hojeLocal;
                const inicio = new Date(hoje);
                inicio.setDate(inicio.getDate() - 30);
                const anoI = inicio.getFullYear();
                const mesI = String(inicio.getMonth() + 1).padStart(2, '0');
                const diaI = String(inicio.getDate()).padStart(2, '0');
                dataInicio = dataInicio || `${anoI}-${mesI}-${diaI}`;
            }

            const dtInicio = new Date(dataInicio + 'T00:00:00');
            const dtFim = new Date(dataFim + 'T00:00:00');
            const diasPeriodo = Math.max(1, Math.round((dtFim - dtInicio) / (1000 * 60 * 60 * 24)) + 1);

            let diasAteEntrega = 0;
            if (dataEntrega) {
                const dtEntrega = new Date(dataEntrega + 'T00:00:00');
                const refStr = (dataFim && dataFim < hojeLocal) ? dataFim : hojeLocal;
                const dtRef = new Date(refStr + 'T00:00:00');
                diasAteEntrega = Math.max(0, Math.round((dtEntrega - dtRef) / (1000 * 60 * 60 * 24)));
            }

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
                        const t = (m.tipo_movimentacao || '').toUpperCase();
                        if (t !== 'SAIDA' && t !== 'SAÍDA') return false;
                        if (unidId && m.id_unidade && m.id_unidade != unidId) return false;
                        const dt = m.data_movimentacao ? m.data_movimentacao.substring(0, 10) : '';
                        return dt >= dataInicio && dt <= dataFim;
                    })
                    .reduce((sum, m) => sum + parseInt(m.quantidade || 0), 0);

                const mediaConsumo = diasPeriodo > 0 ? (consumoPeriodo / diasPeriodo) : 0;
                const consumoAdicionalEntrega = mediaConsumo * diasAteEntrega;
                const sugestaoPedido = Math.max(0, Math.ceil(consumoPeriodo + consumoAdicionalEntrega + estoqueMinimo - estoqueReal));

                const precoCusto = this.obterUltimoCustoProduto(p.id_produto, p.preco_custo);

                return {
                    id_produto: p.id_produto,
                    nome_produto: p.nome_produto,
                    nome_unidade: nomeUnidadeRelatorio,
                    nome_categoria: c ? c.nome_categoria : "Sem Categoria",
                    estoque_real: estoqueReal,
                    consumo_periodo: consumoPeriodo,
                    estoque_minimo: estoqueMinimo,
                    sugestao_pedido: sugestaoPedido,
                    preco_custo: precoCusto,
                    valor_sugestao: sugestaoPedido * precoCusto
                };
            });

            relatorio.sort((a, b) => a.nome_produto.localeCompare(b.nome_produto));
            return { success: true, data: relatorio };
        }

        // --- DOCUMENTOS ---
        if (path === '/api/documentos' && method === 'GET') {
            let docs = this.get('documentos') || [];
            const curso = params.get('curso');
            if (curso) docs = docs.filter(d => d.curso === curso);
            return { success: true, documentos: docs };
        }
        if (path === '/api/documentos' && method === 'POST') {
            const docs = this.get('documentos') || [];
            const parsedBody = typeof body === 'string' ? JSON.parse(body) : (body || {});
            const novo = {
                id_documento: Date.now(),
                curso: parsedBody.curso,
                tipo_documento: parsedBody.tipo_documento,
                nome_arquivo: parsedBody.nome_arquivo,
                tipo_mime: parsedBody.tipo_mime,
                dados_arquivo: parsedBody.dados_arquivo,
                data_inclusao: new Date().toISOString()
            };
            docs.push(novo);
            this.set('documentos', docs);
            return { success: true, message: 'Documento salvo com sucesso!' };
        }
        if (path.match(/\/api\/documentos\/\d+/) && method === 'GET') {
            const id = parseInt(path.split('/')[3]);
            const docs = this.get('documentos') || [];
            const doc = docs.find(d => d.id_documento === id);
            if (doc) return { success: true, documento: doc };
            return { success: false, message: 'Documento não encontrado' };
        }
        if (path.match(/\/api\/documentos\/\d+/) && method === 'DELETE') {
            const id = parseInt(path.split('/')[3]);
            let docs = this.get('documentos') || [];
            docs = docs.filter(d => d.id_documento !== id);
            this.set('documentos', docs);
            return { success: true, message: 'Documento excluído com sucesso!' };
        }
        if (path === '/api/db-last-update' && method === 'GET') {
            return { success: true, time: new Date().toISOString() };
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
        if (options.body && typeof options.body === 'string' && !options.headers['Content-Type'] && !(options.body instanceof FormData)) {
            options.headers['Content-Type'] = 'application/json';
        }
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

async function carregarDataAtualizacaoBanco() {
    const el = document.getElementById('db-last-update-label');
    if (!el) return;
    try {
        const res = await safeFetch('/api/db-last-update');
        if (res && res.success && res.time) {
            const dateObj = new Date(res.time);
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            el.innerText = `ATUALIZADO: ${dateStr} ${timeStr}`;
            return;
        }
    } catch (e) {
        console.error("Erro ao carregar data de atualização do banco:", e);
    }
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.innerText = `ATUALIZADO: ${dateStr} ${timeStr}`;
}

// Inicialização da aplicação ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    carregarDataAtualizacaoBanco();
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
    // Não remover localStorage aqui — login.html salva lá

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'login' || urlParams.get('logout') === 'true') {
        clearSessionUser();
        currentUser = null;
        exibirTelaAuth();
        return;
    }

    const user = getSessionUser();
    if (!user) {
        exibirTelaAuth();
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
    const overlay = document.querySelector('.sidebar-overlay');
    if(sidebar) {
        if (window.innerWidth <= 992) {
            sidebar.classList.toggle('open');
            if(overlay) overlay.classList.toggle('active');
        } else {
            sidebar.classList.toggle('collapsed');
            if(content) content.classList.toggle('collapsed');
        }
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
    exibirTelaAuth();
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

let pendingAvatarBase64 = null;

function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (file && currentUser) {
        const reader = new FileReader();
        reader.onload = function(e) {
            pendingAvatarBase64 = e.target.result;
            document.getElementById('avatar-preview-img').src = pendingAvatarBase64;
            document.getElementById('modal-avatar-preview').classList.remove('hidden');
            // reset file input
            event.target.value = '';
        };
        reader.readAsDataURL(file);
    }
}

async function confirmarAvatarUpload() {
    if (pendingAvatarBase64 && currentUser) {
        try {
            const result = await safeFetch(`/api/auth/users/${currentUser.id_usuario}/avatar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar_base64: pendingAvatarBase64 })
            });
            if (!result.success) throw new Error(result.message);
            localStorage.setItem('user_avatar_' + currentUser.id_usuario, pendingAvatarBase64);
            currentUser.avatar_base64 = pendingAvatarBase64;
            document.getElementById('user-avatar-img').src = pendingAvatarBase64;
            document.getElementById('user-avatar-img').style.display = 'block';
            document.getElementById('user-avatar-icon').style.display = 'none';
            fecharModal('modal-avatar-preview');
            pendingAvatarBase64 = null;
            showToast('Foto de perfil atualizada.', 'success');
        } catch (e) {
            showToast('Não foi possível salvar a foto de perfil.', 'error');
        }
    }
}

function abrirFotoUsuario(idUsuario) {
    const usuario = (_usuariosCache || []).find(u => u.id_usuario === idUsuario);
    const avatar = usuario?.avatar_base64 || localStorage.getItem('user_avatar_' + idUsuario);
    if (!usuario || !avatar) return;
    document.getElementById('foto-usuario-nome').textContent = usuario.nome_usuario || 'Foto do usuário';
    document.getElementById('foto-usuario-ampliada').src = avatar;
    const footer = document.getElementById('modal-foto-usuario-footer');
    if (footer) footer.style.display = 'none';
    document.getElementById('modal-foto-usuario').classList.remove('hidden');
}

function abrirMinhaFoto() {
    if (!currentUser) return;
    const avatar = currentUser.avatar_base64 || localStorage.getItem('user_avatar_' + currentUser.id_usuario);
    if (!avatar) {
        document.getElementById('avatar-upload').click();
        return;
    }
    document.getElementById('foto-usuario-nome').textContent = 'Minha Foto';
    document.getElementById('foto-usuario-ampliada').src = avatar;
    const footer = document.getElementById('modal-foto-usuario-footer');
    if (footer) footer.style.display = 'flex';
    document.getElementById('modal-foto-usuario').classList.remove('hidden');
}

async function iniciarAplicacao() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    document.getElementById('user-display-name').textContent = currentUser.nome_usuario;
    document.getElementById('user-display-role').textContent = currentUser.nivel_acesso;
    
    const savedAvatar = currentUser.avatar_base64 || localStorage.getItem('user_avatar_' + currentUser.id_usuario);
    const imgEl = document.getElementById('user-avatar-img');
    const iconEl = document.getElementById('user-avatar-icon');
    if (savedAvatar && imgEl && iconEl) {
        imgEl.src = savedAvatar;
        imgEl.style.display = 'block';
        iconEl.style.display = 'none';
    } else if (imgEl && iconEl) {
        imgEl.src = '';
        imgEl.style.display = 'none';
        iconEl.style.display = 'block';
    }
    
    const unitEl = document.getElementById('user-display-unit');
    if (unitEl) {
        unitEl.textContent = currentUser.nome_unidade ? `Unidade: ${currentUser.nome_unidade}` : '';
    }
    
    // Start inactivity watcher after login
    resetInatividadeTimer();
    carregarDataAtualizacaoBanco();

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
        const unidades_usuario = currentUser.unidades_acesso || [];
        if (unidades_usuario.length > 1) {
            // Usuário com múltiplas unidades pode trocar entre elas
            selectGlobal.innerHTML = '<option value="">Todas as Minhas Unidades</option>' +
                unidades_usuario.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
            selectGlobal.disabled = false;
            const savedUnit = sessionStorage.getItem(`user_unit_${currentUser.id_usuario}`) || '';
            selectGlobal.value = savedUnit;
            selectedUnitId = savedUnit ? parseInt(savedUnit) : null;
        } else {
            selectedUnitId = currentUser.id_unidade ? parseInt(currentUser.id_unidade) : null;
            if (selectGlobal) {
                selectGlobal.innerHTML = `<option value="${currentUser.id_unidade || ''}">${currentUser.nome_unidade || 'Sua Unidade'}</option>`;
                selectGlobal.disabled = true;
            }
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

    // Enforce Menus Permitidos
    const menuItems = document.querySelectorAll('[data-menu-key]');
    menuItems.forEach(el => {
        const key = el.getAttribute('data-menu-key');
        if (isAdmin()) {
            el.style.display = '';
        } else {
            if (currentUser.menus_permitidos && Array.isArray(currentUser.menus_permitidos)) {
                if (!currentUser.menus_permitidos.includes(key)) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
            } else {
                // Fallback: se menus_permitidos for nulo, mostra tudo (comportamento antigo)
                el.style.display = '';
            }
        }
    });

    carregarCategoriasEFornecedores();
    
    // Abre automaticamente o primeiro menu pai e navega para o primeiro submenu disponível
    abrirPrimeiroMenuESubmenu();
}

function abrirPrimeiroMenuESubmenu() {
    // Fecha todos os submenus primeiro
    const submenus = ['ul-controle-estoques', 'ul-controle-estagios', 'ul-estagios-relatorios'];
    submenus.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Remove active de todos os nav-items
    const allNavItems = document.querySelectorAll('.sidebar-nav li');
    allNavItems.forEach(i => i.classList.remove('active'));

    // Lista ordenada dos menus pais e seus submenus
    const parentMenus = [
        { parentKey: 'controle-estoques', ulId: 'ul-controle-estoques' },
        { parentKey: 'controle-estagios', ulId: 'ul-controle-estagios' }
    ];

    let targetView = null;
    let targetNavItem = null;
    let parentUlToOpen = null;

    for (const p of parentMenus) {
        const parentLi = document.querySelector(`li[data-menu-key="${p.parentKey}"]`);
        // Verifica se o menu pai está visível/permitido
        if (parentLi && parentLi.style.display !== 'none') {
            const ul = document.getElementById(p.ulId);
            if (ul) {
                // Procura o primeiro submenu visível com data-target
                const subItems = ul.querySelectorAll('li[data-target]');
                for (const item of subItems) {
                    if (item.style.display !== 'none') {
                        if (item.classList.contains('admin-only') && !isAdmin()) continue;
                        if (item.classList.contains('supervisor-only') && !isSupervisor()) continue;

                        targetView = item.getAttribute('data-target');
                        targetNavItem = item;
                        break;
                    }
                }
            }
        }
        if (targetView) break;
    }

    // Fallback se não for menu pai (ex: Administrador direto em Usuários)
    if (!targetView) {
        const anyVisibleItem = document.querySelector('.sidebar-nav li[data-target]:not([style*="display: none"])');
        if (anyVisibleItem) {
            targetView = anyVisibleItem.getAttribute('data-target');
            targetNavItem = anyVisibleItem;
        }
    }

    // Menus permanecem RECOLHIDOS ao iniciar — não abre o parentUlToOpen

    // Marca como active o primeiro submenu
    if (targetNavItem) {
        targetNavItem.classList.add('active');
    }

    // Carrega a tela do primeiro submenu
    if (targetView) {
        navegarParaView(targetView);
    } else {
        navegarParaView('view-dashboard');
    }
}

function trocarUnidadeAtiva(unitId) {
    const isAdminOrMultiUnit = isAdmin() || (currentUser && (currentUser.unidades_acesso || []).length > 1);
    if (isAdminOrMultiUnit) {
        selectedUnitId = unitId ? parseInt(unitId) : null;
        if (isAdmin()) {
            localStorage.setItem('admin_selected_unit', unitId || '');
        } else {
            sessionStorage.setItem(`user_unit_${currentUser.id_usuario}`, unitId || '');
        }
        
        const activeView = document.querySelector('.app-view.active');
        if (activeView) {
            const viewId = activeView.id;
            if (viewId === 'view-dashboard') carregarDashboard();
            if (viewId === 'view-produtos') carregarProdutos();
            if (viewId === 'view-movimentacoes') carregarMovimentacoes();
            if (viewId === 'view-estagios-lancamento') carregarLancamentosEstagio();
            if (viewId === 'view-estagios-validacao') carregarValidacaoEstagios();
            if (viewId === 'view-estagios-relatorio-horas-aluno') iniciarRelatorioHorasAluno();
            if (viewId === 'view-estagios-relatorio-alunos-unidade') iniciarRelatorioAlunosUnidade();
            if (viewId === 'view-estagios-relatorio-horas-validadas') iniciarRelatorioHorasValidadas();
            if (viewId === 'view-estagios-relatorio-aguardando-retorno') iniciarRelatorioAguardandoRetorno();
        }
        showToast(unitId ? 'Filtro atualizado para a unidade selecionada.' : 'Visualizando estoque de todas as unidades permitidas.', 'info');
    }
}

// Retorna o nome da unidade global selecionada, se houver
function getGlobalSelectedUnitName() {
    if (selectedUnitId && unidadesCache.length > 0) {
        const uObj = unidadesCache.find(u => u.id_unidade == selectedUnitId);
        if (uObj) return uObj.nome_unidade;
    }
    return null;
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
            'view-transferencias': 'Transferência de Materiais',
            'view-estagios-lancamento': 'Lançamento de Horas (Estágios)',
            'view-estagios-validacao': 'Validação Coordenação (Estágios)',
            'view-estagios-relatorio-horas-aluno': 'Relatório: Total de Horas por Aluno',
            'view-estagios-relatorio-alunos-unidade': 'Relatório: Alunos por Unidade',
            'view-estagios-relatorio-horas-validadas': 'Relatório: Horas Validadas',
            'view-estagios-relatorio-aguardando-retorno': 'Relatório: Aguardando Retorno do Aluno'
        };
        document.getElementById('page-title').textContent = titles[viewId] || 'Gestão Operacional';

        if (viewId === 'view-dashboard') carregarDashboard();
        if (viewId === 'view-produtos') carregarProdutos();
        if (viewId === 'view-movimentacoes') {
            preencherOpcoesFiltrosMovimentacoes();
            carregarMovimentacoes();
        }
        if (viewId === 'view-transferencias') {
            preencherOpcoesTransferencia();
            carregarHistoricoTransferencias();
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
        if (viewId === 'view-estagios-lancamento') carregarLancamentosEstagio();
        if (viewId === 'view-estagios-validacao') carregarValidacaoEstagios();
        if (viewId === 'view-estagios-relatorio-horas-aluno') iniciarRelatorioHorasAluno();
        if (viewId === 'view-estagios-relatorio-alunos-unidade') iniciarRelatorioAlunosUnidade();
        if (viewId === 'view-estagios-relatorio-horas-validadas') iniciarRelatorioHorasValidadas();
        if (viewId === 'view-estagios-relatorio-aguardando-retorno') iniciarRelatorioAguardandoRetorno();
    }
}

// --- DASHBOARD ---

async function carregarDashboard() {
    carregarDataAtualizacaoBanco();
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
        preco_custo: document.getElementById('prod-custo').value,
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
    return `${year}-${month}-${day}`;
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
    const selectC = document.getElementById('transf-categoria');
    const selectP = document.getElementById('transf-produto');
    const selectU = document.getElementById('transf-destino');

    // Carregar categorias
    if (selectC && selectC.options.length <= 1) {
        const dataC = await safeFetch('/api/categorias');
        if (dataC.success && dataC.categorias) {
            selectC.innerHTML = '<option value="">Todas as categorias</option>' +
                dataC.categorias.map(c => `<option value="${c.id_categoria}">${c.nome_categoria}</option>`).join('');
        }
    }

    // Carregar produtos (com filtro de categoria se selecionada)
    await filtrarProdutosPorCategoria();

    // Carregar unidades de destino
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

async function filtrarProdutosPorCategoria() {
    const selectP = document.getElementById('transf-produto');
    const selectC = document.getElementById('transf-categoria');
    if (!selectP) return;

    const categoriaId = selectC ? selectC.value : '';
    let url = `/api/produtos${selectedUnitId ? '?id_unidade=' + selectedUnitId : '?1=1'}`;
    if (categoriaId) url += `&categoria_id=${categoriaId}`;

    selectP.innerHTML = '<option value="">Carregando produtos...</option>';
    const dataP = await safeFetch(url);
    if (dataP.success && dataP.produtos) {
        const produtosComEstoque = dataP.produtos.filter(p => p.estoque_atual > 0);
        if (produtosComEstoque.length === 0) {
            selectP.innerHTML = '<option value="">Nenhum produto com estoque nesta categoria</option>';
        } else {
            selectP.innerHTML = '<option value="">Selecione o produto...</option>' +
                produtosComEstoque.map(p => `<option value="${p.id_produto}">${p.nome_produto} (Saldo: ${p.estoque_atual})</option>`).join('');
        }
    } else {
        selectP.innerHTML = '<option value="">Selecione o produto...</option>';
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
    const observacao = document.getElementById('transf-observacao') ? document.getElementById('transf-observacao').value.trim() : '';
    
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
            id_usuario: currentUser ? currentUser.id_usuario : null,
            observacao: observacao || null
        })
    });
    
    if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('form-transferencia').reset();
        preencherOpcoesTransferencia();
        carregarHistoricoTransferencias();
    } else {
        showToast(data.message, 'error');
    }
}

async function carregarHistoricoTransferencias() {
    const tbody = document.getElementById('table-transferencias-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</td></tr>';

    let url = '/api/movimentacoes?1=1&tipo_movimentacao=TRANSFERENCIA';
    if (selectedUnitId) url += `&id_unidade=${encodeURIComponent(selectedUnitId)}`;

    const result = await safeFetch(url);

    if (!result.success || !result.movimentacoes) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Erro ao carregar transferências.</td></tr>';
        return;
    }

    const movs = result.movimentacoes.filter(m =>
        m.observacao && (m.observacao.toLowerCase().includes('transfer'))
    );

    if (movs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhuma transferência encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = movs.map(m => {
        const isSaida = m.tipo_movimentacao === 'SAIDA';
        const badgeClass = isSaida ? 'badge-warning' : 'badge-success';
        const badgeLabel = isSaida ? '<i class="fa-solid fa-arrow-right"></i> Saída' : '<i class="fa-solid fa-arrow-left"></i> Entrada';
        // Extrai a observação personalizada após " | "
        const obsPartes = (m.observacao || '').split(' | ');
        const obsPersonalizada = obsPartes.length > 1 ? obsPartes.slice(1).join(' | ') : '';
        return `
            <tr>
                <td><small class="text-muted">#${m.id_movimentacao}</small></td>
                <td><small>${formatarData(m.data_movimentacao)}</small></td>
                <td><strong>${m.nome_produto || '-'}</strong></td>
                <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                <td><span class="badge badge-info"><i class="fa-solid fa-building"></i> ${m.nome_unidade || '-'}</span></td>
                <td><strong>${m.quantidade}</strong></td>
                <td><small>${m.nome_usuario_movimentacao || 'Sistema'}</small></td>
                <td><small class="text-muted">${obsPartes[0] || '-'}${obsPersonalizada ? '<br><em style="color:var(--text-primary);">' + obsPersonalizada + '</em>' : ''}</small></td>
            </tr>
        `;
    }).join('');
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
    const now = new Date().toLocaleDateString('pt-BR');

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
        .summary-box { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: inline-block; }
        .summary-box small { color: #059669; font-weight: 600; text-transform: uppercase; font-size: 11px; }
        .summary-box h4 { margin: 4px 0 0 0; font-size: 18px; color: #064e3b; }
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
        
        // Formatar a data para o input date
        let dt = mov.data_movimentacao;
        if (dt) {
            document.getElementById('mov-data').value = dt.substring(0, 10);
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

        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');
        if (selectFilterManual) selectFilterManual.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;
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
        window._fornecedoresCache = dataForn.fornecedores;
        const tbody = document.getElementById('table-fornecedores-body');
        if (tbody) {
            tbody.innerHTML = dataForn.fornecedores.map(f => {
                const cidadeUf = (f.cidade && f.estado) ? `${f.cidade}/${f.estado}` : (f.cidade || f.estado || '-');
                return `
                <tr>
                    <td><strong>${f.nome_fornecedor}</strong></td>
                    <td>${f.razao_reduzida || '-'}</td>
                    <td>${f.cnpj_cpf || '-'}</td>
                    <td>${f.telefone || '-'}</td>
                    <td>${cidadeUf}</td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-secondary" title="Editar" onclick="editarFornecedor(${f.id_fornecedor})"><i class="fa-solid fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" title="Excluir" onclick="excluirFornecedor(${f.id_fornecedor})"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
                `;
            }).join('');
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

async function buscarEnderecoPorCep(cep) {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
            document.getElementById('forn-endereco').value = data.logradouro || '';
            document.getElementById('forn-bairro').value = data.bairro || '';
            document.getElementById('forn-cidade').value = data.localidade || '';
            document.getElementById('forn-estado').value = data.uf || '';
            document.getElementById('forn-numero').focus();
        } else {
            showToast('CEP não encontrado.', 'error');
        }
    } catch (error) {
        showToast('Erro ao buscar o CEP.', 'error');
    }
}

async function editarFornecedor(id) {
    if (!window._fornecedoresCache) return;
    const f = window._fornecedoresCache.find(x => x.id_fornecedor === id);
    if (!f) return;

    document.getElementById('form-fornecedor').reset();
    document.getElementById('forn-id').value = f.id_fornecedor;
    document.getElementById('forn-nome').value = f.nome_fornecedor || '';
    if (document.getElementById('forn-razao-reduzida')) document.getElementById('forn-razao-reduzida').value = f.razao_reduzida || '';
    document.getElementById('forn-cnpj').value = f.cnpj_cpf || '';
    document.getElementById('forn-tel').value = f.telefone || '';
    document.getElementById('forn-email').value = f.email || '';
    if (document.getElementById('forn-cep')) document.getElementById('forn-cep').value = f.cep || '';
    if (document.getElementById('forn-endereco')) document.getElementById('forn-endereco').value = f.endereco || '';
    if (document.getElementById('forn-numero')) document.getElementById('forn-numero').value = f.numero || '';
    if (document.getElementById('forn-complemento')) document.getElementById('forn-complemento').value = f.complemento || '';
    if (document.getElementById('forn-bairro')) document.getElementById('forn-bairro').value = f.bairro || '';
    if (document.getElementById('forn-cidade')) document.getElementById('forn-cidade').value = f.cidade || '';
    if (document.getElementById('forn-estado')) document.getElementById('forn-estado').value = f.estado || '';

    document.getElementById('modal-fornecedor').classList.remove('hidden');
}

async function excluirFornecedor(id) {
    if (confirm('Tem certeza que deseja excluir este fornecedor?')) {
        const result = await safeFetch(`/api/fornecedores/${id}`, {
            method: 'DELETE'
        });
        if (result.success) {
            showToast(result.message, 'success');
            carregarCadastrosGerais();
        } else {
            showToast(result.message, 'error');
        }
    }
}

async function salvarFornecedor(event) {
    event.preventDefault();
    const payload = {
        nome_fornecedor: document.getElementById('forn-nome').value.trim(),
        razao_reduzida: document.getElementById('forn-razao-reduzida') ? document.getElementById('forn-razao-reduzida').value.trim() : '',
        cnpj_cpf: document.getElementById('forn-cnpj').value.trim(),
        telefone: document.getElementById('forn-tel').value.trim(),
        email: document.getElementById('forn-email').value.trim(),
        cep: document.getElementById('forn-cep') ? document.getElementById('forn-cep').value.trim() : '',
        endereco: document.getElementById('forn-endereco') ? document.getElementById('forn-endereco').value.trim() : '',
        numero: document.getElementById('forn-numero') ? document.getElementById('forn-numero').value.trim() : '',
        complemento: document.getElementById('forn-complemento') ? document.getElementById('forn-complemento').value.trim() : '',
        bairro: document.getElementById('forn-bairro') ? document.getElementById('forn-bairro').value.trim() : '',
        cidade: document.getElementById('forn-cidade') ? document.getElementById('forn-cidade').value.trim() : '',
        estado: document.getElementById('forn-estado') ? document.getElementById('forn-estado').value.trim() : ''
    };

    const id = document.getElementById('forn-id') ? document.getElementById('forn-id').value : '';
    let url = '/api/fornecedores';
    let method = 'POST';
    if (id) {
        url += `/${id}`;
        method = 'PUT';
    }

    const result = await safeFetch(url, {
        method: method,
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
        window._usuariosCache = result.users;
        renderizarTabelaUsuarios();
    } else {
        const tbody = document.getElementById('table-usuarios-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erro ao carregar usuários: ${result.message}</td></tr>`;
    }
}

function filtrarUsuariosNaTela() {
    renderizarTabelaUsuarios();
}

function limparFiltroUsuarios() {
    const form = document.getElementById('form-filter-usuarios');
    if(form) form.reset();
    filtrarUsuariosNaTela();
}

function renderizarTabelaUsuarios() {
    const buscaNome = (document.getElementById('filter-usr-nome')?.value || '').toLowerCase().trim();
    const buscaNivel = document.getElementById('filter-usr-nivel')?.value || '';
    const buscaStatus = document.getElementById('filter-usr-status')?.value || '';

    let filtrados = _usuariosCache || [];

    if (buscaNome) {
        filtrados = filtrados.filter(u => 
            (u.nome_usuario && u.nome_usuario.toLowerCase().includes(buscaNome)) ||
            (u.usuario && u.usuario.toLowerCase().includes(buscaNome))
        );
    }
    
    if (buscaNivel) {
        filtrados = filtrados.filter(u => u.nivel_acesso === buscaNivel);
    }

    if (buscaStatus) {
        filtrados = filtrados.filter(u => {
            const isAtivo = u.ativo !== false;
            if (buscaStatus === 'Aprovados') return (u.status_aprovacao === 'Aprovado' || !u.status_aprovacao) && isAtivo;
            if (buscaStatus === 'Pendentes') return u.status_aprovacao === 'Pendente';
            if (buscaStatus === 'Inativos') return !isAtivo;
            if (buscaStatus === 'Rejeitados') return u.status_aprovacao === 'Rejeitado';
            return true;
        });
    }

    const tbody = document.getElementById('table-usuarios-body');
    if (!tbody) return;

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Nenhum usuário encontrado com os filtros selecionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(u => {
        let statusBadge = 'badge-success';
        if (u.status_aprovacao === 'Pendente') statusBadge = 'badge-warning';
        if (u.status_aprovacao === 'Rejeitado') statusBadge = 'badge-danger';

        let badgeSenha = u.senha_pendente ? ' <span class="badge badge-warning" style="margin-left: 5px;" title="Troca de senha solicitada"><i class="fa-solid fa-key"></i> Pendente</span>' : '';

        // Texto de unidades
        let unidades_texto;
        if (u.nivel_acesso === 'Administrador') {
            unidades_texto = '<span style="color:var(--primary);font-weight:600;">Todas (Admin)</span>';
        } else if (u.unidades_acesso && u.unidades_acesso.length > 0) {
            unidades_texto = u.unidades_acesso.map(uu => uu.nome_unidade).join(', ');
        } else {
            unidades_texto = u.nome_unidade || 'Sem Unidade';
        }

        let acoesHtml = '';
        if (u.status_aprovacao === 'Pendente') {
            acoesHtml = `
                <button class="btn btn-sm btn-success" onclick="abrirModalUsuario(${u.id_usuario}, 'aprovar')" title="Aprovar Cadastro">
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
            let menusPermJson = u.menus_permitidos ? JSON.stringify(u.menus_permitidos).replace(/"/g, '&quot;') : 'null';
            const isAtivo = u.ativo !== false;
            const btnInativar = isAtivo
                ? `<button class="btn btn-sm" style="background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);" onclick="toggleInativarUsuario(${u.id_usuario}, true)" title="Inativar Usuário">
                       <i class="fa-solid fa-user-slash"></i> Inativar
                   </button>`
                : `<button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);" onclick="toggleInativarUsuario(${u.id_usuario}, false)" title="Reativar Usuário">
                       <i class="fa-solid fa-user-check"></i> Reativar
                   </button>`;
            acoesHtml = `
                <button class="btn btn-sm btn-outline" onclick="abrirModalUsuario(${u.id_usuario}, 'editar')" title="Editar Unidade / Nível">
                    <i class="fa-solid fa-pen-to-square"></i> Editar
                </button>
                <button class="btn btn-sm btn-outline" style="color: var(--primary);" onclick="abrirModalPermissoesMenu(${u.id_usuario}, '${u.nome_usuario}', ${menusPermJson})" title="Permissões de Menu">
                    <i class="fa-solid fa-list-check"></i> Permissões
                </button>
                ${btnInativar}
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

        const isAtivo = u.ativo !== false;
        const avatar = u.avatar_base64 || localStorage.getItem('user_avatar_' + u.id_usuario);
        const fotoHtml = avatar
            ? `<button type="button" onclick="abrirFotoUsuario(${u.id_usuario})" title="Visualizar foto" style="width:38px; height:38px; padding:0; border:1px solid var(--accent-blue); border-radius:50%; overflow:hidden; cursor:pointer; background:transparent; vertical-align:middle;"><img src="${avatar}" alt="Foto de ${u.nome_usuario}" style="width:100%; height:100%; object-fit:cover;"></button>`
            : `<span title="Sem foto" style="display:inline-flex; width:38px; height:38px; align-items:center; justify-content:center; border-radius:50%; background:rgba(148,163,184,0.16); color:var(--text-muted);"><i class="fa-solid fa-user"></i></span>`;
        return `
            <tr style="${isAtivo ? '' : 'opacity:0.55;'}">
                <td>#${u.id_usuario}</td>
                <td>${fotoHtml}</td>
                <td><strong>${u.nome_usuario}</strong>${badgeSenha}${ !isAtivo ? ' <span class="badge badge-danger" style="margin-left:5px;"><i class="fa-solid fa-ban"></i> Inativo</span>' : '' }</td>
                <td><code>${u.usuario}</code></td>
                <td><span class="badge ${u.nivel_acesso === 'Administrador' ? 'badge-info' : u.nivel_acesso === 'Supervisor' ? 'badge-warning' : 'badge-secondary'}">${u.nivel_acesso}</span></td>
                <td>${unidades_texto}</td>
                <td><span class="badge ${statusBadge}">${u.status_aprovacao || 'Aprovado'}</span></td>
                <td class="text-right">${acoesHtml}</td>
            </tr>
        `;
    }).join('');
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

async function toggleInativarUsuario(id_usuario, inativar) {
    const acao = inativar ? 'INATIVAR' : 'REATIVAR';
    const descricao = inativar
        ? 'Tem certeza que deseja INATIVAR este usuário? Ele não conseguirá mais fazer login.'
        : 'Tem certeza que deseja REATIVAR este usuário? Ele voltará a ter acesso ao sistema.';
    if (!confirm(descricao)) return;

    const endpoint = inativar
        ? `/api/auth/users/${id_usuario}/inativar`
        : `/api/auth/users/${id_usuario}/ativar`;

    try {
        const resultado = await safeFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (resultado.success) {
            showToast(resultado.message, 'success');
            carregarUsuarios();
        } else {
            showToast(resultado.message || 'Falha na operação.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Erro ao comunicar com o servidor.', 'error');
    }
}

// Controla o checkbox "Todas as Unidades"
function toggleTodasUnidades(checkbox) {
    const cbs = document.querySelectorAll('input[name="usuario-unidade"]');
    cbs.forEach(cb => {
        cb.checked = checkbox.checked;
        cb.disabled = checkbox.checked;
    });
}

async function abrirModalUsuario(id_usuario, modo = 'editar') {
    const u = _userDataMap[id_usuario] || {};
    const nome_usuario = u.nome_usuario || '';
    const unidades_atuais = u.unidades_acesso || [];
    const nivel_atual = u.nivel_acesso || 'Operador';
    const categorias_acesso = u.categorias_acesso || [];

    document.getElementById('aprovar-user-id').value = id_usuario;
    document.getElementById('aprovar-user-nome').textContent = nome_usuario;
    document.getElementById('aprovar-user-modo').value = modo;

    const title = modo === 'aprovar' ? 'Aprovar e Vincular Usuário' : 'Editar Unidade e Nível de Acesso';
    document.getElementById('modal-user-title').textContent = title;

    // Carregar unidades
    const data = await safeFetch('/api/unidades');
    if (data.success) {
        unidadesCache = data.unidades;
        const unidContainer = document.getElementById('aprovar-unidades-container');
        const idsAtuais = unidades_atuais.map(uu => uu.id_unidade);
        const todasMarcadas = idsAtuais.length > 0 && idsAtuais.length === data.unidades.length;

        unidContainer.innerHTML = data.unidades.map(un => {
            const isChecked = idsAtuais.includes(un.id_unidade) ? 'checked' : '';
            const isDisabled = todasMarcadas ? 'disabled' : '';
            return `
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-weight: normal; margin-bottom: 2px;">
                    <input type="checkbox" name="usuario-unidade" value="${un.id_unidade}" ${isChecked} ${isDisabled}>
                    ${un.nome_unidade}
                </label>
            `;
        }).join('');

        // Marcar "Todas" se todas estiverem selecionadas
        const checkTodas = document.getElementById('check-todas-unidades');
        if (checkTodas) checkTodas.checked = todasMarcadas;
    }

    if (nivel_atual) {
        document.getElementById('aprovar-nivel').value = nivel_atual;
    }

    // Carregar categorias
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
    const nivel_acesso = document.getElementById('aprovar-nivel').value;

    // Verificar se marcou "Todas as Unidades"
    const checkTodas = document.getElementById('check-todas-unidades');
    const todasMarcadas = checkTodas && checkTodas.checked;

    // Coletar unidades selecionadas
    const unidades = Array.from(document.querySelectorAll('input[name="usuario-unidade"]:checked'))
                          .map(cb => parseInt(cb.value));

    if (!todasMarcadas && unidades.length === 0) {
        showToast('Selecione ao menos uma Unidade Operacional.', 'warning');
        return;
    }

    const categoriasSelecionadas = Array.from(document.querySelectorAll('input[name="usuario-categoria"]:checked'))
                                        .map(cb => parseInt(cb.value));

    const endpoint = modo === 'aprovar' 
        ? `/api/auth/users/${userId}/aprovar` 
        : `/api/auth/users/${userId}/editar`;

    const result = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            unidades, 
            todas_unidades: todasMarcadas, 
            nivel_acesso, 
            categorias: categoriasSelecionadas 
        })
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-aprovar-usuario');
        carregarUsuarios();

        if (currentUser && currentUser.id_usuario == userId) {
            currentUser.nivel_acesso = nivel_acesso;
            setSessionUser(currentUser);
            iniciarAplicacao();
        }
    } else {
        showToast(result.message, 'error');
    }
}

const TODOS_MENUS = [
    { key: 'controle-estoques', label: 'Controle de Estoques (Menu Pai)', isParent: true },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'movimentacoes', label: 'Movimentações (Grupo)' },
    { key: 'historico', label: 'Histórico' },
    { key: 'transferencias', label: 'Transferências' },
    { key: 'cadastros', label: 'Cadastros (Grupo)' },
    { key: 'centros-custo', label: 'Centros de Custo' },
    { key: 'unidades', label: 'Unidades' },
    { key: 'categorias', label: 'Categorias' },
    { key: 'fornecedores', label: 'Fornecedores' },
    { key: 'relatorios', label: 'Relatórios (Grupo)' },
    { key: 'estoque-atual', label: 'Estoque Atual' },
    { key: 'sugestao-compras', label: 'Sugestão de Compras' },
    { key: 'controle-estagios', label: 'Controle de Estágios (Menu Pai)', isParent: true },
    { key: 'estagios-lancamentos', label: 'Lançamento de horas' },
    { key: 'estagios-validacao', label: 'Validação Coordenação' },
    { key: 'estagios-relatorios', label: 'Relatórios (Estágios - Grupo)', isParent: true },
    { key: 'estagios-relatorio-horas-aluno', label: 'Total de Horas por Aluno' },
    { key: 'estagios-relatorio-alunos-unidade', label: 'Alunos por Unidade' },
    { key: 'estagios-relatorio-horas-validadas', label: 'Horas Validadas' },
    { key: 'estagios-relatorio-aguardando-retorno', label: 'Aguardando retorno do aluno' }
];

function abrirModalPermissoesMenu(id_usuario, nome_usuario, menus_permitidos) {
    document.getElementById('perm-menu-id').value = id_usuario;
    document.getElementById('perm-menu-username').textContent = `- ${nome_usuario}`;

    const permitidos = menus_permitidos || [];

    // Monta mapa de pai → filhos para cascata de checkboxes
    const grupoAtual = { key: null };
    const grupoDoItem = {};
    TODOS_MENUS.forEach(m => {
        if (m.isParent) {
            grupoAtual.key = m.key;
        } else if (grupoAtual.key) {
            grupoDoItem[m.key] = grupoAtual.key;
        }
    });

    const container = document.getElementById('permissoes-menu-list');
    container.innerHTML = TODOS_MENUS.map(m => {
        // Se null/undefined (antes da feature), assume que pode ver (fallback).
        const isChecked = !menus_permitidos || permitidos.includes(m.key) ? 'checked' : '';
        const boldStyle = m.isParent ? 'font-weight: bold;' : 'margin-left: 15px;';
        const parentAttr = m.isParent ? `data-parent-key="${m.key}"` : '';
        const groupAttr = grupoDoItem[m.key] ? `data-group="${grupoDoItem[m.key]}"` : '';

        return `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; ${boldStyle}">
                <input type="checkbox" name="menu-permission" value="${m.key}" ${isChecked} ${parentAttr} ${groupAttr}>
                ${m.label}
            </label>
        `;
    }).join('');

    // Cascata: ao marcar/desmarcar um pai, marca/desmarca todos os filhos do grupo
    container.querySelectorAll('input[data-parent-key]').forEach(parentCb => {
        parentCb.addEventListener('change', function () {
            const key = this.getAttribute('data-parent-key');
            container.querySelectorAll(`input[data-group="${key}"]`).forEach(child => {
                child.checked = this.checked;
            });
        });
    });

    document.getElementById('modal-permissoes-menu').classList.remove('hidden');
}

async function salvarPermissoesMenu(event) {
    event.preventDefault();
    const id_usuario = document.getElementById('perm-menu-id').value;
    
    const checkboxes = document.querySelectorAll('input[name="menu-permission"]:checked');
    const menus = Array.from(checkboxes).map(cb => cb.value);

    const result = await safeFetch(`/api/auth/users/${id_usuario}/menus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menus })
    });

    if (result.success) {
        showToast(result.message, 'success');
        fecharModal('modal-permissoes-menu');
        carregarUsuarios(); // recarregar a lista para pegar as permissões novas
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

function getNomeUnidadeAtiva() {
    if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
        return currentUser.nome_unidade;
    }
    const globalSelect = document.getElementById('select-global-unidade');
    if (globalSelect && globalSelect.value) {
        return globalSelect.options[globalSelect.selectedIndex].text;
    }
    return ''; // Retorna vazio se for "Todas as Unidades"
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatarData(strData) {
    if (!strData) return '-';
    try {
        const d = new Date(strData);
        if (isNaN(d.getTime())) return strData;
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    const agora = new Date().toLocaleDateString('pt-BR');
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
    const now = new Date().toLocaleDateString('pt-BR');

    let filtrosTexto = [];
    if (nomeUnidade && nomeUnidade !== 'Todas as Unidades') filtrosTexto.push(`Unidade: <strong>${nomeUnidade}</strong>`);
    if (nomeCategoria && nomeCategoria !== 'Todas as Categorias') filtrosTexto.push(`Categoria: <strong>${nomeCategoria}</strong>`);
    filtrosTexto.push(`Produtos zerados: <strong>${incluirZerados ? 'Incluídos' : 'Ocultos'}</strong>`);
    
    const filtrosHtml = filtrosTexto.length > 0 ? filtrosTexto.join(' | ') : 'Sem filtros específicos (Exibindo estoque atual geral)';
    const valorTotalEstoque = document.getElementById('report-estoque-total-val')?.innerText || 'R$ 0,00';

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

    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: inline-block;">
        <small style="color: #059669; font-weight: 600; text-transform: uppercase; font-size: 11px;">Valor Total em Estoque</small>
        <h4 style="margin: 4px 0 0 0; font-size: 18px; color: #064e3b;">${valorTotalEstoque}</h4>
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
    const inputEntrega = document.getElementById('filter-rel-sug-entrega');
    if (!inputInicio || !inputFim) return;

    if (!inputInicio.value || !inputFim.value) {
        const hoje = new Date();
        const inicio = new Date(hoje);
        inicio.setDate(inicio.getDate() - 30);
        inputFim.value = hoje.toISOString().split('T')[0];
        inputInicio.value = inicio.toISOString().split('T')[0];
    }

    if (inputEntrega && !inputEntrega.value && inputFim.value) {
        const dataFim = new Date(inputFim.value + 'T00:00:00');
        dataFim.setDate(dataFim.getDate() + 10);
        inputEntrega.value = dataFim.toISOString().split('T')[0];
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
    const dataEntrega = document.getElementById('filter-rel-sug-entrega')?.value || '';

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
    if (dataEntrega) url += `data_entrega=${encodeURIComponent(dataEntrega)}&`;

    const tbody = document.getElementById('table-relatorios-sugestao-body');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Carregando dados do relatório...</td></tr>';
        const res = await safeFetch(url);

        if (res.success) {
            const ocultarZero = document.getElementById('filter-rel-sug-ocultar-zero')?.checked ?? true;
            const dados = ocultarZero ? res.data.filter(r => r.sugestao_pedido > 0) : res.data;

            if (dados.length === 0) {
                const msg = ocultarZero && res.data.length > 0
                    ? 'Nenhum produto com sugestão de pedido acima de zero. <a href="#" onclick="document.getElementById(\'filter-rel-sug-ocultar-zero\').click(); return false;">Mostrar todos</a>'
                    : 'Nenhum produto encontrado para os filtros selecionados.';
                tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">${msg}</td></tr>`;
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
                    <td><span class="badge" style="background: rgba(249, 115, 22, 0.15); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.3); font-weight: 600;">${r.consumo_periodo ?? 0}</span></td>
                    <td><span class="badge badge-warning">${r.estoque_minimo}</span></td>
                    <td><span class="badge ${r.sugestao_pedido > 0 ? 'badge-success' : 'badge-secondary'}">${r.sugestao_pedido}</span></td>
                    <td><span style="font-weight:600; color: var(--accent-teal);">${valorFmt}</span></td>
                </tr>
            `}).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar relatório.</td></tr>';
            showToast(res.message || 'Erro ao carregar relatório', 'error');
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro de conexão ao carregar relatório.</td></tr>';
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
    const dataEntrega = document.getElementById('filter-rel-sug-entrega')?.value || '';

    const tbody = document.getElementById('table-relatorios-sugestao-body')?.innerHTML || '';
    const now = new Date().toLocaleDateString('pt-BR');

    let filtrosTexto = [];
    if (dataInicio && dataFim) filtrosTexto.push(`Período: <strong>${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')}</strong>`);
    if (dataEntrega) filtrosTexto.push(`Previsão de Entrega: <strong>${dataEntrega.split('-').reverse().join('/')}</strong>`);
    if (nomeUnidade && nomeUnidade !== 'Todas as Unidades') filtrosTexto.push(`Unidade: <strong>${nomeUnidade}</strong>`);
    if (nomeCategoria && nomeCategoria !== 'Todas as Categorias') filtrosTexto.push(`Categoria: <strong>${nomeCategoria}</strong>`);
    const filtrosHtml = filtrosTexto.length > 0 ? filtrosTexto.join(' | ') : 'Sem filtros específicos';

    const totalSugeridoEl = document.getElementById('kpi-total-sugerido-compras');
    const totalSugeridoTexto = totalSugeridoEl ? totalSugeridoEl.textContent : 'R$ 0,00';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Erro ao abrir janela de impressão. Verifique se há bloqueio de pop-ups.', 'error');
        return;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Sugestão de Compras</title>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; padding: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
        .header h1 { font-size: 22px; margin: 0 0 5px 0; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; }
        th { background-color: #f1f5f9; font-weight: 600; color: #334155; }
        .footer { margin-top: 30px; text-align: right; font-weight: 600; font-size: 16px; color: #0f172a; }
        .meta { color: #64748b; font-size: 13px; }
        @media print { body { padding: 0; } }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Sugestão de Compras</h1>
            <div class="meta">
                ${filtrosHtml}<br>
                Gerado em: ${new Date().toLocaleString()}
            </div>
        </div>
        <div>
            <div style="font-size: 18px; font-weight: 700; color: #0284c7;">
                Custo Estimado: ${totalSugeridoTexto}
            </div>
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
                <th>Consumo Período</th>
                <th>Estoque Mínimo</th>
                <th>Sugestão Pedido</th>
                <th>Valor Sugerido</th>
            </tr>
        </thead>
        <tbody>
            ${tbody}
        </tbody>
    </table>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = function() {
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    };
}

// ============================================================================
// IMPORTAÇÃO DE PLANILHA DE ESTÁGIOS
// ============================================================================

let _planilhaArquivo = null;

function abrirModalImportarPlanilha() {
    _planilhaArquivo = null;
    document.getElementById('input-planilha').value = '';
    document.getElementById('nome-arquivo-planilha').textContent = 'Nenhum arquivo selecionado';
    document.getElementById('btn-confirmar-importacao').disabled = true;
    const resultado = document.getElementById('resultado-importacao');
    resultado.style.display = 'none';
    resultado.innerHTML = '';
    document.getElementById('drop-zone-planilha').style.borderColor = '';
    document.getElementById('modal-importar-planilha').classList.remove('hidden');
}

function selecionarPlanilha(input) {
    if (input.files && input.files[0]) {
        _planilhaArquivo = input.files[0];
        document.getElementById('nome-arquivo-planilha').textContent = _planilhaArquivo.name;
        document.getElementById('btn-confirmar-importacao').disabled = false;
        document.getElementById('drop-zone-planilha').style.borderColor = 'var(--accent-blue)';
    }
}

function handleDropPlanilha(event) {
    event.preventDefault();
    document.getElementById('drop-zone-planilha').style.borderColor = 'var(--border-color)';
    const file = event.dataTransfer.files[0];
    if (file) {
        _planilhaArquivo = file;
        document.getElementById('nome-arquivo-planilha').textContent = file.name;
        document.getElementById('btn-confirmar-importacao').disabled = false;
        document.getElementById('drop-zone-planilha').style.borderColor = 'var(--accent-blue)';
    }
}

async function confirmarImportacaoPlanilha() {
    if (!_planilhaArquivo) return;

    const btn = document.getElementById('btn-confirmar-importacao');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';

    const resultado = document.getElementById('resultado-importacao');
    resultado.style.display = 'none';

    try {
        const data = await _planilhaArquivo.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            throw new Error('Planilha vazia ou sem dados.');
        }

        const lancamentos = [];
        for (const row of rows) {
            const normalizar = (obj, chave) => {
                const norm = (s) => s.toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
                const chaveNorm = norm(chave);
                for (const k of Object.keys(obj)) {
                    if (norm(k) === chaveNorm) return obj[k];
                }
                return '';
            };

            const nome_aluno = String(normalizar(row, 'Alunos') || normalizar(row, 'Aluno') || '').trim();
            const unidade = String(normalizar(row, 'Unidade') || '').trim();
            let curso = String(normalizar(row, 'Curso') || '').trim();
            if (curso.toLowerCase() === 'tecnico de enfermagem' || curso.toLowerCase() === 'técnico de enfermagem') {
                curso = 'Tecnico em Enfermagem';
            }
            const turma = String(normalizar(row, 'Turma') || '').trim() || null;
            const status = String(normalizar(row, 'Status') || 'Em andamento').trim();
            const horas_totais = parseFloat(normalizar(row, 'Horas') || normalizar(row, 'Horas Totais')) || 0;
            const protocolo_ew = String(normalizar(row, 'Protocolo') || normalizar(row, 'Protocolo EW') || '').trim() || null;
            const observacoes = String(normalizar(row, 'Observacoes') || normalizar(row, 'Observações') || '').trim() || null;

            let data_lancamento = normalizar(row, 'Data');
            if (data_lancamento instanceof Date) {
                data_lancamento = data_lancamento.toISOString().split('T')[0];
            } else if (typeof data_lancamento === 'number') {
                const d = XLSX.SSF.parse_date_code(data_lancamento);
                data_lancamento = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
            } else if (typeof data_lancamento === 'string' && data_lancamento.includes('/')) {
                const [dd, mm, yyyy] = data_lancamento.split('/');
                data_lancamento = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            } else {
                data_lancamento = data_lancamento || new Date().toISOString().split('T')[0];
            }

            lancamentos.push({
                nome_aluno,
                unidade,
                curso,
                turma,
                status,
                horas_totais,
                data_lancamento,
                protocolo_ew,
                observacoes
            });
        }

        const res = await fetch('/api/estagios/importar-json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lancamentos })
        });
        const respData = await res.json();

        resultado.style.display = 'block';
        if (respData.success) {
            resultado.style.background = 'rgba(34, 197, 94, 0.1)';
            resultado.style.border = '1px solid rgba(34, 197, 94, 0.3)';
            resultado.style.color = 'var(--accent-green)';
            resultado.innerHTML = `<i class="fa-solid fa-check-circle"></i> <strong>${respData.message}</strong>`
                + (respData.erros && respData.erros.length
                    ? `<ul style="margin-top:8px;font-size:12px;color:var(--text-muted);">${respData.erros.map(e => `<li>${e}</li>`).join('')}</ul>`
                    : '');
            carregarLancamentosEstagio();
        } else {
            resultado.style.background = 'rgba(239, 68, 68, 0.1)';
            resultado.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            resultado.style.color = 'var(--accent-red, #ef4444)';
            resultado.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${respData.message}`;
        }
    } catch (e) {
        resultado.style.display = 'block';
        resultado.style.background = 'rgba(239, 68, 68, 0.1)';
        resultado.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        resultado.style.color = 'var(--accent-red, #ef4444)';
        resultado.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Erro ao processar planilha: ' + e.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-upload"></i> Importar';
    }
}

// ============================================================================
// NOVO CÓDIGO - ABA DE ESTÁGIOS
// ============================================================================

let estagiosCache = [];

async function carregarLancamentosEstagio() {
    const tbody = document.getElementById('table-estagios-lancamentos-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Carregando estágios...</td></tr>';
    
    try {
        const res = await safeFetch('/api/estagios/lancamentos');
        if (res.success && res.lancamentos) {
            let data = res.lancamentos;
            const globalUnit = getGlobalSelectedUnitName();
            if (globalUnit) {
                data = data.filter(l => (l.unidade || '').trim().toUpperCase() === globalUnit.toUpperCase());
            }
            estagiosCache = data;
            atualizarFiltrosLancamentosEstagio();
            atualizarDatalistAlunos();
            renderEstagios(estagiosCache);
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum estágio encontrado.</td></tr>';
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar estágios.</td></tr>';
        console.error(e);
    }
}

function atualizarFiltrosLancamentosEstagio() {
    const elCurso = document.getElementById('filtro-lancamento-curso');
    const elTurma = document.getElementById('filtro-lancamento-turma');
    const elUnidade = document.getElementById('filtro-lancamento-unidade');
    const elStatus = document.getElementById('filtro-lancamento-status');

    if (!elCurso || !elTurma || !elUnidade) return;

    // Salva os valores atualmente selecionados
    const cursoAtual = (elCurso.value || '').toUpperCase();
    const turmaAtual = (elTurma.value || '').toUpperCase();
    const unidadeAtual = (elUnidade.value || '').toUpperCase();
    const statusAtual = elStatus ? (elStatus.value || '').toUpperCase() : '';

    // Extrai valores únicos em MAIÚSCULO
    const cursos = [...new Set(estagiosCache.map(l => (l.curso || '').trim().toUpperCase()).filter(Boolean))].sort();
    const turmas = [...new Set(estagiosCache.map(l => (l.turma || '').trim().toUpperCase()).filter(Boolean))].sort();
    const unidades = [...new Set(estagiosCache.map(l => (l.unidade || '').trim().toUpperCase()).filter(Boolean))].sort();
    const statuses = [...new Set(estagiosCache.map(l => (l.status || '').trim().toUpperCase()).filter(Boolean))].sort();

    // Atualiza opções Curso
    elCurso.innerHTML = '<option value="">TODOS OS CURSOS</option>' + 
        cursos.map(c => `<option value="${c}">${c}</option>`).join('');
    
    // Atualiza opções Turma
    elTurma.innerHTML = '<option value="">TODAS AS TURMAS</option>' + 
        turmas.map(t => `<option value="${t}">${t}</option>`).join('');

    // Atualiza opções Unidade
    elUnidade.innerHTML = '<option value="">TODAS AS UNIDADES</option>' + 
        unidades.map(u => `<option value="${u}">${u}</option>`).join('');

    // Atualiza opções Status
    if (elStatus) {
        elStatus.innerHTML = '<option value="">TODOS OS STATUS</option>' + 
            statuses.map(s => `<option value="${s}">${s}</option>`).join('');
        if (statuses.includes(statusAtual)) elStatus.value = statusAtual;
    }

    // Restaura os valores caso ainda existam na lista
    if (cursos.includes(cursoAtual)) elCurso.value = cursoAtual;
    if (turmas.includes(turmaAtual)) elTurma.value = turmaAtual;
    if (unidades.includes(unidadeAtual)) elUnidade.value = unidadeAtual;
}

function obterUnidadePadraoUsuario() {
    // 1. Se houver unidade selecionada no topo da página (select global)
    const selectGlobal = document.getElementById('select-global-unidade');
    if (selectGlobal && selectGlobal.value) {
        const unitId = selectGlobal.value;
        const uObj = unidadesCache.find(u => u.id_unidade == unitId);
        if (uObj && uObj.nome_unidade) return uObj.nome_unidade;
    }
    
    // 2. Se houver selectedUnitId
    if (selectedUnitId && unidadesCache.length > 0) {
        const uObj = unidadesCache.find(u => u.id_unidade == selectedUnitId);
        if (uObj && uObj.nome_unidade) return uObj.nome_unidade;
    }

    // 3. Se o usuário tiver unidade permitida no cadastro
    if (currentUser && currentUser.nome_unidade) {
        return currentUser.nome_unidade;
    }

    return '';
}

async function preencherSelectUnidadesModalEstagio() {
    const selectU = document.getElementById('estagio-unidade');
    if (!selectU) return;

    if (unidadesCache.length === 0) {
        const dataU = await safeFetch('/api/unidades');
        if (dataU.success && dataU.unidades) {
            unidadesCache = dataU.unidades;
        }
    }

    // Coleta todas as unidades do sistema e dos lançamentos
    const setUnidades = new Set();
    unidadesCache.forEach(u => {
        if (u.nome_unidade) setUnidades.add(u.nome_unidade.trim());
    });
    estagiosCache.forEach(l => {
        if (l.unidade) setUnidades.add(l.unidade.trim());
    });
    if (currentUser && currentUser.nome_unidade) {
        setUnidades.add(currentUser.nome_unidade.trim());
    }

    const listaOrdenada = Array.from(setUnidades).sort();
    
    selectU.innerHTML = '<option value="">Selecione a Unidade...</option>' +
        listaOrdenada.map(nome => `<option value="${nome}">${nome}</option>`).join('');
}

async function abrirModalLancamentoEstagio() {
    document.getElementById('form-estagios-lancamento').reset();
    document.getElementById('estagio-id').value = '';
    document.getElementById('modal-estagio-title').innerText = 'Novo Lançamento de Horas';
    document.getElementById('estagio-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('estagio-status').value = 'Em andamento';
    document.getElementById('estagio-horas').value = '';

    // Popula opções de unidades no modal
    await preencherSelectUnidadesModalEstagio();

    // Popula opções de cursos dinamicamente de acordo com a pesquisa (em maiúsculo)
    const selectCurso = document.getElementById('estagio-curso');
    if (selectCurso) {
        let cursos = [];
        if (estagiosCache && estagiosCache.length > 0) {
            cursos = [...new Set(estagiosCache.map(l => (l.curso || '').trim().toUpperCase()).filter(Boolean))].sort();
        }
        let html = '<option value="">SELECIONE...</option>';
        cursos.forEach(c => {
            html += `<option value="${c}">${c}</option>`;
        });
        html += '<option value="OUTROS">OUTROS</option>';
        selectCurso.innerHTML = html;
    }

    // Define a unidade padrão fixa/selecionada
    const padraoUnidade = obterUnidadePadraoUsuario();
    const selectUnidade = document.getElementById('estagio-unidade');
    if (padraoUnidade && selectUnidade) {
        let matched = false;
        for (let opt of selectUnidade.options) {
            if (opt.value.trim().toUpperCase() === padraoUnidade.trim().toUpperCase()) {
                selectUnidade.value = opt.value;
                matched = true;
                break;
            }
        }
        if (!matched) {
            const newOpt = document.createElement('option');
            newOpt.value = padraoUnidade;
            newOpt.textContent = padraoUnidade;
            selectUnidade.appendChild(newOpt);
            selectUnidade.value = padraoUnidade;
        }

        // Se o usuário não for Administrador, bloqueia o select para manter fixo na sua unidade
        if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
            selectUnidade.disabled = true;
        } else {
            selectUnidade.disabled = false;
        }
    } else if (selectUnidade) {
        selectUnidade.disabled = false;
    }

    document.getElementById('modal-estagios-lancamento').classList.remove('hidden');
}

async function salvarLancamentoEstagio(event) {
    event.preventDefault();
    const id = document.getElementById('estagio-id').value;
    const selectUnidade = document.getElementById('estagio-unidade');
    const unidadeValor = (selectUnidade ? selectUnidade.value : '') || obterUnidadePadraoUsuario();

    const payload = {
        id_lancamento: id || null,
        data_lancamento: document.getElementById('estagio-data').value,
        status: 'Em andamento',
        nome_aluno: (document.getElementById('estagio-aluno').value || '').trim().toUpperCase(),
        unidade: unidadeValor,
        curso: document.getElementById('estagio-curso').value,
        turma: (document.getElementById('estagio-turma').value || '').trim().toUpperCase() || null,
        horas_totais: Math.round(parseFloat(document.getElementById('estagio-horas').value) || 0),
        protocolo_ew: document.getElementById('estagio-protocolo').value,
        observacoes: document.getElementById('estagio-observacoes').value,
        horas_campo: 0,
        horas_capacitacao: 0,
        horas_laboratorio: 0,
        horas_evento: 0,
        validado_coordenacao: false,
        aguardando_analise: document.getElementById('estagio-aguardando-analise') ? document.getElementById('estagio-aguardando-analise').checked : false
    };

    try {
        const res = await fetch('/api/estagios/lancamentos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': currentUser ? currentUser.id_usuario : '',
                'X-User-Nivel': currentUser ? currentUser.nivel_acesso : '',
                'X-User-Nome': currentUser ? currentUser.nome_usuario : ''
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            fecharModal('modal-estagios-lancamento');
            carregarLancamentosEstagio();
            alert(data.message);
        } else {
            alert('Erro: ' + data.message);
        }
    } catch (e) {
        alert('Erro de comunicação com o servidor.');
    }
}

function renderEstagios(lista) {
    const tbody = document.getElementById('table-estagios-lancamentos-body');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">Nenhum registro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(l => {
        let statusBadge = 'badge-secondary';
        const stUpper = (l.status || '').toUpperCase();
        if (stUpper === 'EM ANDAMENTO') statusBadge = 'badge-primary';
        else if (stUpper === 'CONCLUIDO' || stUpper === 'CONCLUÍDO') statusBadge = 'badge-success';
        else if (stUpper === 'EVADIDO') statusBadge = 'badge-warning';
        else if (stUpper === 'CANCELADO') statusBadge = 'badge-danger';

        // Formata data para DD/MM/YYYY
        let dataFormatada = l.data_lancamento || '-';
        if (dataFormatada.includes('-')) {
            const parts = dataFormatada.split('-');
            if (parts.length === 3) dataFormatada = parts[2] + '/' + parts[1] + '/' + parts[0];
        }

        const hTotal = Math.round(parseFloat(l.horas_totais) || 0);
        const validado = l.validado_coordenacao ? '<span class="text-success"><i class="fa-solid fa-check"></i> Sim</span>' : '<span class="text-warning"><i class="fa-solid fa-clock"></i> Pendente</span>';

        return `
            <tr>
                <td>${dataFormatada}</td>
                <td><strong>${l.nome_aluno}</strong></td>
                <td>${l.curso}</td>
                <td>${l.turma || '-'}</td>
                <td>${l.unidade}</td>
                <td><strong>${hTotal}</strong></td>
                <td><span class="badge ${statusBadge}">${l.status}</span></td>
                <td>${validado}</td>
                <td><small style="color: var(--text-muted);">${l.nome_usuario_registro || '-'}</small></td>
                <td class="text-right">
                    <button class="btn btn-sm btn-secondary" onclick="editarLancamentoEstagio(${l.id_lancamento})" title="Editar"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="excluirLancamentoEstagio(${l.id_lancamento})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarLancamentosEstagio() {
    const elAluno = document.getElementById('filtro-lancamento-aluno');
    const elCurso = document.getElementById('filtro-lancamento-curso');
    const elTurma = document.getElementById('filtro-lancamento-turma');
    const elUnidade = document.getElementById('filtro-lancamento-unidade');
    const elStatus = document.getElementById('filtro-lancamento-status');

    if (!elAluno) return; // Garante que a view existe

    const termoAluno = (elAluno.value || '').trim().toUpperCase();
    const filtroCurso = (elCurso ? elCurso.value : '').trim().toUpperCase();
    const filtroTurma = (elTurma ? elTurma.value : '').trim().toUpperCase();
    const filtroUnidade = (elUnidade ? elUnidade.value : '').trim().toUpperCase();
    const filtroStatus = (elStatus ? elStatus.value : '').trim().toUpperCase();

    const filtrados = estagiosCache.filter(l => {
        const alunoUpper = (l.nome_aluno || '').trim().toUpperCase();
        const cursoUpper = (l.curso || '').trim().toUpperCase();
        const turmaUpper = (l.turma || '').trim().toUpperCase();
        const unidadeUpper = (l.unidade || '').trim().toUpperCase();
        const statusUpper = (l.status || '').trim().toUpperCase();

        const matchAluno = !termoAluno || alunoUpper.includes(termoAluno);
        const matchCurso = !filtroCurso || cursoUpper === filtroCurso;
        const matchTurma = !filtroTurma || turmaUpper === filtroTurma;
        const matchUnidade = !filtroUnidade || unidadeUpper === filtroUnidade;
        const matchStatus = !filtroStatus || statusUpper === filtroStatus;
        return matchAluno && matchCurso && matchTurma && matchUnidade && matchStatus;
    });

    renderEstagios(filtrados);
}

async function editarLancamentoEstagio(id) {
    const l = estagiosCache.find(x => x.id_lancamento === id);
    if (!l) return;

    await preencherSelectUnidadesModalEstagio();

    // Popula opções de cursos dinamicamente de acordo com a pesquisa (em maiúsculo)
    const selectCurso = document.getElementById('estagio-curso');
    if (selectCurso) {
        let cursos = [];
        if (estagiosCache && estagiosCache.length > 0) {
            cursos = [...new Set(estagiosCache.map(l => (l.curso || '').trim().toUpperCase()).filter(Boolean))].sort();
        }
        let html = '<option value="">SELECIONE...</option>';
        cursos.forEach(c => {
            html += `<option value="${c}">${c}</option>`;
        });
        html += '<option value="OUTROS">OUTROS</option>';
        selectCurso.innerHTML = html;
        
        // Verifica se o curso do lançamento não está na lista principal e adiciona
        if (l.curso) {
            const cursoAtualUpper = l.curso.trim().toUpperCase();
            if (!cursos.includes(cursoAtualUpper) && cursoAtualUpper !== 'OUTROS') {
                selectCurso.innerHTML = `<option value="">SELECIONE...</option>` +
                    `<option value="${cursoAtualUpper}">${cursoAtualUpper}</option>` +
                    cursos.map(c => `<option value="${c}">${c}</option>`).join('') +
                    `<option value="OUTROS">OUTROS</option>`;
            }
        }
    }

    document.getElementById('estagio-id').value = l.id_lancamento;
    document.getElementById('estagio-data').value = l.data_lancamento;
    document.getElementById('estagio-status').value = 'Em andamento';
    document.getElementById('estagio-aluno').value = l.nome_aluno;
    
    const selectUnidade = document.getElementById('estagio-unidade');
    if (selectUnidade) {
        let matched = false;
        for (let opt of selectUnidade.options) {
            if (opt.value.trim().toUpperCase() === (l.unidade || '').trim().toUpperCase()) {
                selectUnidade.value = opt.value;
                matched = true;
                break;
            }
        }
        if (!matched && l.unidade) {
            const newOpt = document.createElement('option');
            newOpt.value = l.unidade;
            newOpt.textContent = l.unidade;
            selectUnidade.appendChild(newOpt);
            selectUnidade.value = l.unidade;
        }
        if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
            selectUnidade.disabled = true;
        } else {
            selectUnidade.disabled = false;
        }
    }

    document.getElementById('estagio-curso').value = (l.curso || '').trim().toUpperCase();
    document.getElementById('estagio-turma').value = l.turma || '';
    document.getElementById('estagio-horas').value = (l.horas_totais !== null && l.horas_totais !== undefined) ? Math.round(parseFloat(l.horas_totais) || 0) : '';
    document.getElementById('estagio-protocolo').value = l.protocolo_ew || '';
    document.getElementById('estagio-observacoes').value = l.observacoes || '';
    const cbAnalise = document.getElementById('estagio-aguardando-analise');
    if (cbAnalise) {
        cbAnalise.checked = l.aguardando_analise === true || l.aguardando_analise === 'true' || l.aguardando_analise === 1 || l.aguardando_analise === '1';
    }
    
    document.getElementById('modal-estagio-title').innerText = 'Editar Lançamento de Horas';
    document.getElementById('modal-estagios-lancamento').classList.remove('hidden');
}

async function excluirLancamentoEstagio(id) {
    if (!confirm('Deseja realmente excluir este lançamento?')) return;
    try {
        const res = await fetch('/api/estagios/lancamentos/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            carregarLancamentosEstagio();
        } else {
            alert('Erro: ' + data.message);
        }
    } catch(e) {
        alert('Erro ao excluir lançamento.');
    }
}

async function carregarValidacaoEstagios() {
    try {
        const res = await safeFetch('/api/estagios/lancamentos');
        if (res.success && res.lancamentos) {
            let data = res.lancamentos;
            const globalUnit = getGlobalSelectedUnitName();
            if (globalUnit) {
                data = data.filter(l => (l.unidade || '').trim().toUpperCase() === globalUnit.toUpperCase());
            }
            estagiosCache = data;
            atualizarFiltrosValidacaoEstagio();
            filtrarValidacaoEstagios();
        }
    } catch (e) {
        console.error(e);
    }
}

function atualizarFiltrosValidacaoEstagio() {
    const elCurso = document.getElementById('filter-validacao-curso');
    const elTurma = document.getElementById('filter-validacao-turma');
    const elUnidade = document.getElementById('filter-validacao-unidade');
    const elStatus = document.getElementById('filter-validacao-status-estagio');

    if (!elCurso || !elTurma || !elUnidade) return;

    const cursoAtual = (elCurso.value || '').toUpperCase();
    const turmaAtual = (elTurma.value || '').toUpperCase();
    const unidadeAtual = (elUnidade.value || '').toUpperCase();
    const statusAtual = elStatus ? (elStatus.value || '').toUpperCase() : '';

    const cursos = [...new Set(estagiosCache.map(l => (l.curso || '').trim().toUpperCase()).filter(Boolean))].sort();
    const turmas = [...new Set(estagiosCache.map(l => (l.turma || '').trim().toUpperCase()).filter(Boolean))].sort();
    const unidades = [...new Set(estagiosCache.map(l => (l.unidade || '').trim().toUpperCase()).filter(Boolean))].sort();
    const statuses = [...new Set(estagiosCache.map(l => (l.status || '').trim().toUpperCase()).filter(Boolean))].sort();

    elCurso.innerHTML = '<option value="">TODOS OS CURSOS</option>' + 
        cursos.map(c => `<option value="${c}">${c}</option>`).join('');
    
    elTurma.innerHTML = '<option value="">TODAS AS TURMAS</option>' + 
        turmas.map(t => `<option value="${t}">${t}</option>`).join('');

    elUnidade.innerHTML = '<option value="">TODAS AS UNIDADES</option>' + 
        unidades.map(u => `<option value="${u}">${u}</option>`).join('');

    if (elStatus) {
        elStatus.innerHTML = '<option value="">TODOS OS STATUS</option>' + 
            statuses.map(s => `<option value="${s}">${s}</option>`).join('');
            
        if (elStatus.dataset.firstLoad === "true") {
            elStatus.dataset.firstLoad = "false";
            if (statuses.includes("EM ANDAMENTO")) {
                elStatus.value = "EM ANDAMENTO";
            }
        } else {
            if (statuses.includes(statusAtual)) elStatus.value = statusAtual;
        }
    }

    if (cursos.includes(cursoAtual)) elCurso.value = cursoAtual;
    if (turmas.includes(turmaAtual)) elTurma.value = turmaAtual;
    if (unidades.includes(unidadeAtual)) elUnidade.value = unidadeAtual;
}

function filtrarValidacaoEstagios() {
    const tbody = document.getElementById('table-estagios-validacao-body');
    if (!tbody) return;
    
    const inputAluno = document.getElementById('search-validacao-aluno');
    const termo = inputAluno ? (inputAluno.value || '').trim().toUpperCase() : '';
    
    const inputProtocolo = document.getElementById('search-validacao-protocolo');
    const termoProtocolo = inputProtocolo ? (inputProtocolo.value || '').trim().toUpperCase() : '';
    
    const selectCurso = document.getElementById('filter-validacao-curso');
    const filtroCurso = selectCurso ? (selectCurso.value || '').trim().toUpperCase() : '';
    
    const selectTurma = document.getElementById('filter-validacao-turma');
    const filtroTurma = selectTurma ? (selectTurma.value || '').trim().toUpperCase() : '';
    
    const selectUnidade = document.getElementById('filter-validacao-unidade');
    const filtroUnidade = selectUnidade ? (selectUnidade.value || '').trim().toUpperCase() : '';
    
    const selectStatusEstagio = document.getElementById('filter-validacao-status-estagio');
    const filtroStatusEstagio = selectStatusEstagio ? (selectStatusEstagio.value || '').trim().toUpperCase() : '';
    
    const selectStatus = document.getElementById('filter-validacao-status');
    const statusVal = selectStatus ? (selectStatus.value || '').trim().toLowerCase() : '';
    
    const filtrados = estagiosCache.filter(l => {
        const alunoUpper = (l.nome_aluno || '').trim().toUpperCase();
        const protocoloUpper = (l.protocolo_ew || '').trim().toUpperCase();
        const cursoUpper = (l.curso || '').trim().toUpperCase();
        const turmaUpper = (l.turma || '').trim().toUpperCase();
        const unidadeUpper = (l.unidade || '').trim().toUpperCase();
        const statusUpper = (l.status || '').trim().toUpperCase();

        const matchAluno = !termo || alunoUpper.includes(termo);
        const matchProtocolo = !termoProtocolo || protocoloUpper.includes(termoProtocolo);
        const matchCurso = !filtroCurso || cursoUpper === filtroCurso;
        const matchTurma = !filtroTurma || turmaUpper === filtroTurma;
        const matchUnidade = !filtroUnidade || unidadeUpper === filtroUnidade;
        const matchStatus = !filtroStatusEstagio || statusUpper === filtroStatusEstagio;
        
        let matchValidacao = true;
        if (statusVal === 'validado') {
            matchValidacao = l.validado_coordenacao === true;
        } else if (statusVal === 'pendente') {
            matchValidacao = !l.validado_coordenacao;
        }

        return matchAluno && matchProtocolo && matchCurso && matchTurma && matchUnidade && matchStatus && matchValidacao;
    });
    
    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center">Nenhum registro encontrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtrados.map(l => {
        let statusBadge = 'badge-secondary';
        if (l.status === 'Em andamento') statusBadge = 'badge-primary';
        else if (l.status === 'Concluido') statusBadge = 'badge-success';
        else if (l.status === 'Evadido') statusBadge = 'badge-warning';
        else if (l.status === 'Cancelado') statusBadge = 'badge-danger';

        const inputStyle = `
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: inherit;
            width: 70px;
            padding: 3px 6px;
            font-size: 13px;
            text-align: center;
        `;

        return `
            <tr data-id="${l.id_lancamento}">
                <td><strong>${l.nome_aluno}</strong></td>
                <td>${l.turma || '-'}</td>
                <td><span class="badge ${statusBadge}">${l.status}</span></td>
                <td>${l.protocolo_ew || '-'}</td>
                <td><strong>${Math.round(parseFloat(l.horas_totais) || 0)}</strong></td>
                <td>
                    <input type="number" step="1" min="0"
                        class="validacao-campo"
                        data-field="horas_campo"
                        data-id="${l.id_lancamento}"
                        value="${Math.round(parseFloat(l.horas_campo) || 0)}"
                        style="${inputStyle} color: var(--accent-blue);">
                </td>
                <td>
                    <input type="number" step="1" min="0"
                        class="validacao-campo"
                        data-field="horas_capacitacao"
                        data-id="${l.id_lancamento}"
                        value="${Math.round(parseFloat(l.horas_capacitacao) || 0)}"
                        style="${inputStyle} color: var(--accent-green);">
                </td>
                <td>
                    <input type="number" step="1" min="0"
                        class="validacao-campo"
                        data-field="horas_laboratorio"
                        data-id="${l.id_lancamento}"
                        value="${Math.round(parseFloat(l.horas_laboratorio) || 0)}"
                        style="${inputStyle} color: var(--accent-warning);">
                </td>
                <td>
                    <input type="number" step="1" min="0"
                        class="validacao-campo"
                        data-field="horas_evento"
                        data-id="${l.id_lancamento}"
                        value="${Math.round(parseFloat(l.horas_evento) || 0)}"
                        style="${inputStyle} color: var(--accent-teal);">
                </td>
                <td>
                    <button class="btn btn-sm btn-success"
                        onclick="validarLancamentoEstagio(${l.id_lancamento})"
                        title="Salvar e Validar">
                        <i class="fa-solid fa-check-double"></i> Validar
                    </button>
                </td>
                <td><small style="color: var(--text-muted);">${l.nome_usuario_registro || '-'}</small></td>
                <td><small style="color: var(--text-muted);">${l.nome_usuario_validacao || '-'}</small></td>
            </tr>
        `;
    }).join('');
}

async function validarLancamentoEstagio(id) {
    const original = estagiosCache.find(x => x.id_lancamento === id);
    if (!original) return;

    const row = document.querySelector(`tr[data-id="${id}"]`);
    const getInput = (field) => {
        const el = row ? row.querySelector(`input[data-field="${field}"]`) : null;
        return el ? Math.round(parseFloat(el.value) || 0) : Math.round(parseFloat(original[field]) || 0);
    };

    const horas_campo       = getInput('horas_campo');
    const horas_capacitacao = getInput('horas_capacitacao');
    const horas_laboratorio = getInput('horas_laboratorio');
    const horas_evento      = getInput('horas_evento');

    // ── Validação: soma das disciplinas deve ser igual ao total de horas ──
    const horas_totais_previsto = Math.round(parseFloat(original.horas_totais) || 0);
    const soma_disciplinas = horas_campo + horas_capacitacao + horas_laboratorio + horas_evento;

    if (soma_disciplinas !== horas_totais_previsto) {
        showToast(
            `⚠️ Soma das disciplinas (${soma_disciplinas}h) é diferente do Total de Horas (${horas_totais_previsto}h). Corrija antes de validar.`,
            'error'
        );
        return;
    }

    const payload = {
        id_lancamento:       original.id_lancamento,
        data_lancamento:     original.data_lancamento,
        status:              original.status,
        nome_aluno:          original.nome_aluno,
        unidade:             original.unidade,
        curso:               original.curso,
        turma:               original.turma || null,
        horas_totais:        Math.round(parseFloat(original.horas_totais) || 0),
        protocolo_ew:        original.protocolo_ew || null,
        observacoes:         original.observacoes || null,
        horas_campo,
        horas_capacitacao,
        horas_laboratorio,
        horas_evento,
        validado_coordenacao: true,
        nome_usuario_validacao: currentUser ? currentUser.nome_usuario : null
    };

    try {
        const res  = await fetch('/api/estagios/lancamentos', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Lançamento validado com sucesso!', 'success');
            if (row) {
                const btn = row.querySelector('button');
                if (btn) {
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-secondary');
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> Validado';
                    btn.disabled = true;
                }
            }
            const idx = estagiosCache.findIndex(x => x.id_lancamento === id);
            if (idx !== -1) {
                estagiosCache[idx].horas_campo       = horas_campo;
                estagiosCache[idx].horas_capacitacao = horas_capacitacao;
                estagiosCache[idx].horas_laboratorio = horas_laboratorio;
                estagiosCache[idx].horas_evento      = horas_evento;
                estagiosCache[idx].validado_coordenacao = true;
                estagiosCache[idx].data_validacao = new Date().toISOString().slice(0, 10);
                estagiosCache[idx].nome_usuario_validacao = currentUser?.nome_usuario || currentUser?.usuario || null;
            }
        } else {
            showToast('Erro: ' + data.message, 'error');
        }
    } catch (e) {
        showToast('Erro de comunicação com o servidor.', 'error');
    }
}

function atualizarDatalistAlunos() {
    const datalist = document.getElementById('lista-alunos');
    if (datalist && estagiosCache.length > 0) {
        const alunos = [...new Set(estagiosCache.map(l => (l.nome_aluno || '').trim().toUpperCase()).filter(Boolean))].sort();
        datalist.innerHTML = alunos.map(a => `<option value="${a}">`).join('');
    }
}

async function iniciarRelatorioHorasAluno() {
    limparRelatorioHorasAluno();
    try {
        const res = await safeFetch('/api/estagios/lancamentos');
        if (res.success && res.lancamentos) {
            let data = res.lancamentos;
            const globalUnit = getGlobalSelectedUnitName();
            if (globalUnit) {
                data = data.filter(l => (l.unidade || '').trim().toUpperCase() === globalUnit.toUpperCase());
            }
            estagiosCache = data;
            atualizarDatalistAlunos();
        }
    } catch (e) {
        console.error(e);
    }
}

function gerarRelatorioHorasAluno() {
    const inputPesquisa = document.getElementById('relatorio-search-aluno');
    if (!inputPesquisa) return;
    const termo = (inputPesquisa.value || '').trim().toUpperCase();
    const termoProtocolo = ((document.getElementById('relatorio-search-protocolo') || {}).value || '').trim().toUpperCase();

    if (!termo && !termoProtocolo) {
        alert('Por favor, preencha ao menos um campo de pesquisa (Nome do Aluno ou Protocolo EW).');
        return;
    }

    const filtrados = estagiosCache
        .filter(l => {
            const matchAluno = !termo || (l.nome_aluno || '').trim().toUpperCase().includes(termo);
            const matchProtocolo = !termoProtocolo || (l.protocolo_ew || '').trim().toUpperCase().includes(termoProtocolo);
            return matchAluno && matchProtocolo;
        })
        .sort((a, b) => (b.data_lancamento || '').localeCompare(a.data_lancamento || '') ||
            (b.id_lancamento || 0) - (a.id_lancamento || 0));
    
    document.getElementById('relatorio-horas-aluno-inicial').style.display = 'none';
    
    if (filtrados.length === 0) {
        document.getElementById('relatorio-horas-aluno-resultado').style.display = 'none';
        document.getElementById('relatorio-horas-aluno-vazio').style.display = 'block';
        document.getElementById('btn-imprimir-horas').style.display = 'none';
        const containerAlterar = document.getElementById('container-alterar-status-todos');
        if(containerAlterar) containerAlterar.style.display = 'none';
        return;
    }
    
    document.getElementById('relatorio-horas-aluno-vazio').style.display = 'none';
    document.getElementById('relatorio-horas-aluno-resultado').style.display = 'block';
    document.getElementById('btn-imprimir-horas').style.display = 'inline-block';
    const containerAlterar = document.getElementById('container-alterar-status-todos');
    if(containerAlterar) containerAlterar.style.display = 'flex';

    // Preenche o bloco de info do aluno (usa o primeiro registro encontrado)
    const primeiroReg = filtrados[0];
    const infoEl = document.getElementById('relatorio-aluno-info');
    if (infoEl && primeiroReg) {
        infoEl.innerHTML = `
            <span><i class="fa-solid fa-user" style="color:#6366f1; margin-right:6px;"></i><strong>Aluno(a):</strong>&nbsp;${primeiroReg.nome_aluno || '-'}</span>
            <span><i class="fa-solid fa-building" style="color:#10b981; margin-right:6px;"></i><strong>Unidade:</strong>&nbsp;${primeiroReg.unidade || '-'}</span>
            <span><i class="fa-solid fa-graduation-cap" style="color:#f59e0b; margin-right:6px;"></i><strong>Curso:</strong>&nbsp;${primeiroReg.curso || '-'}</span>
        `;
    }
    
    const tbody = document.getElementById('table-relatorio-horas-aluno-body');
    const tfoot = document.getElementById('table-relatorio-horas-aluno-footer');
    
    if (!tbody || !tfoot) return;
    
    let totalHoras = 0, totalCampo = 0, totalCapacitacao = 0, totalLaboratorio = 0, totalEvento = 0;
    
    tbody.innerHTML = filtrados.map(l => {
        let dataFormatada = l.data_lancamento || '-';
        if (dataFormatada.includes('-')) {
            const parts = dataFormatada.split('-');
            if (parts.length === 3) dataFormatada = parts[2] + '/' + parts[1] + '/' + parts[0];
        }
        
        let statusBadge = 'badge-secondary';
        if (l.status === 'Em andamento') statusBadge = 'badge-primary';
        else if (l.status === 'Concluido') statusBadge = 'badge-success';
        else if (l.status === 'Evadido') statusBadge = 'badge-warning';
        else if (l.status === 'Cancelado') statusBadge = 'badge-danger';
        
        const hTotal = Math.round(parseFloat(l.horas_totais) || 0);
        const hCampo = Math.round(parseFloat(l.horas_campo) || 0);
        const hCapacitacao = Math.round(parseFloat(l.horas_capacitacao) || 0);
        const hLaboratorio = Math.round(parseFloat(l.horas_laboratorio) || 0);
        const hEvento = Math.round(parseFloat(l.horas_evento) || 0);

        totalHoras += hTotal;
        totalCampo += hCampo;
        totalCapacitacao += hCapacitacao;
        totalLaboratorio += hLaboratorio;
        totalEvento += hEvento;
        
        return `
            <tr>
                <td>${dataFormatada}</td>
                <td>${l.turma || '-'}</td>
                <td>
                    <span class="badge ${statusBadge}" style="cursor: pointer;" onclick="alterarStatusLancamentoRelatorio(${l.id_lancamento})" title="Clique para alterar o status">
                        ${l.status} <i class="fa-solid fa-pen" style="font-size: 10px; margin-left: 4px;"></i>
                    </span>
                </td>
                <td>${l.protocolo_ew || '-'}</td>
                <td style="color: var(--accent-blue); text-align: center;">${hCampo}</td>
                <td style="color: var(--accent-green); text-align: center;">${hCapacitacao}</td>
                <td style="color: var(--accent-warning); text-align: center;">${hLaboratorio}</td>
                <td style="color: var(--accent-teal); text-align: center;">${hEvento}</td>
                <td style="text-align: center;"><strong>${hTotal}</strong></td>
            </tr>
        `;
    }).join('');
    
    tfoot.innerHTML = `
        <tr style="background: rgba(99, 102, 241, 0.15); font-weight: 700; border-top: 2px solid var(--accent-blue);">
            <td colspan="4" style="text-align: right; padding-right: 12px;">
                <i class="fa-solid fa-sigma"></i> TOTAL (${filtrados.length} lançamento${filtrados.length > 1 ? 's' : ''})
            </td>
            <td style="color: var(--accent-blue); text-align: center; font-weight: 700;"><strong>${totalCampo}</strong></td>
            <td style="color: var(--accent-green); text-align: center; font-weight: 700;"><strong>${totalCapacitacao}</strong></td>
            <td style="color: var(--accent-warning); text-align: center; font-weight: 700;"><strong>${totalLaboratorio}</strong></td>
            <td style="color: var(--accent-teal); text-align: center; font-weight: 700;"><strong>${totalEvento}</strong></td>
            <td style="font-size: 16px; text-align: center; font-weight: 700;"><strong>${totalHoras} h</strong></td>
        </tr>
    `;
}

async function alterarStatusLancamentoRelatorio(id) {
    const original = estagiosCache.find(x => x.id_lancamento === id);
    if (!original) return;

    const novoStatus = prompt('Digite o novo status (Em andamento, Concluido, Evadido, Cancelado):', original.status);
    if (!novoStatus) return;

    const statusPermitidos = ['Em andamento', 'Concluido', 'Concluído', 'Evadido', 'Cancelado'];
    const statusFormatado = statusPermitidos.find(s => s.toLowerCase() === novoStatus.toLowerCase().trim());

    if (!statusFormatado) {
        alert('Status inválido! Use apenas: Em andamento, Concluído, Evadido ou Cancelado.');
        return;
    }
    
    const statusFinal = (statusFormatado === 'Concluido') ? 'Concluído' : statusFormatado;

    if (statusFinal === original.status || statusFormatado === original.status) return;

    if (!confirm(`Deseja realmente alterar o status deste lançamento de "${original.status}" para "${statusFinal}"?`)) {
        return;
    }

    const payload = { ...original, status: statusFinal };

    try {
        const res = await fetch('/api/estagios/lancamentos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': currentUser ? currentUser.id_usuario : '',
                'X-User-Nivel': currentUser ? currentUser.nivel_acesso : '',
                'X-User-Nome': currentUser ? currentUser.nome_usuario : ''
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('Status atualizado com sucesso!', 'success');
            original.status = statusFormatado;
            gerarRelatorioHorasAluno(); // recarrega a tabela para refletir a alteração
        } else {
            alert('Erro: ' + data.message);
        }
    } catch (e) {
        alert('Erro de comunicação com o servidor.');
    }
}

function limparRelatorioHorasAluno() {
    document.getElementById('relatorio-search-aluno').value = '';
    const inputProtocolo = document.getElementById('relatorio-search-protocolo');
    if (inputProtocolo) inputProtocolo.value = '';
    document.getElementById('relatorio-horas-aluno-resultado').style.display = 'none';
    document.getElementById('relatorio-horas-aluno-vazio').style.display = 'none';
    document.getElementById('relatorio-horas-aluno-inicial').style.display = 'block';
    const btnImprimir = document.getElementById('btn-imprimir-horas');
    if (btnImprimir) btnImprimir.style.display = 'none';
    const containerAlterar = document.getElementById('container-alterar-status-todos');
    if (containerAlterar) containerAlterar.style.display = 'none';
}

async function alterarStatusTodosLancamentosRelatorio() {
    const selectEl = document.getElementById('select-status-todos');
    if (!selectEl) return;
    
    const novoStatus = selectEl.value;
    if (!novoStatus) return; // Nada selecionado

    const inputPesquisa = document.getElementById('relatorio-search-aluno');
    if (!inputPesquisa) return;
    const termo = (inputPesquisa.value || '').trim().toUpperCase();
    const termoProtocolo = ((document.getElementById('relatorio-search-protocolo') || {}).value || '').trim().toUpperCase();

    if (!termo && !termoProtocolo) {
        selectEl.value = '';
        return;
    }

    const filtrados = estagiosCache.filter(l => {
        const matchAluno = !termo || (l.nome_aluno || '').trim().toUpperCase().includes(termo);
        const matchProtocolo = !termoProtocolo || (l.protocolo_ew || '').trim().toUpperCase().includes(termoProtocolo);
        return matchAluno && matchProtocolo;
    });

    if (filtrados.length === 0) {
        selectEl.value = '';
        return;
    }

    const statusFinal = (novoStatus === 'Concluido') ? 'Concluído' : novoStatus;

    if (!confirm(`Deseja realmente alterar o status de TODOS os ${filtrados.length} lançamentos deste(a) aluno(a) para "${statusFinal}"?`)) {
        selectEl.value = ''; // Reseta se cancelar
        return;
    }

    let sucessos = 0;
    let erros = 0;

    for (const original of filtrados) {
        if (original.status === statusFinal) {
            sucessos++;
            continue;
        }

        const payload = { ...original, status: statusFinal };
        try {
            const res = await fetch('/api/estagios/lancamentos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': currentUser ? currentUser.id_usuario : '',
                    'X-User-Nivel': currentUser ? currentUser.nivel_acesso : '',
                    'X-User-Nome': currentUser ? currentUser.nome_usuario : ''
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                sucessos++;
                original.status = statusFinal;
            } else {
                erros++;
            }
        } catch (e) {
            erros++;
        }
    }

    if (erros > 0) {
        alert(`Atualização concluída com erros. Sucessos: ${sucessos}, Erros: ${erros}`);
    } else {
        showToast(`Todos os ${sucessos} lançamentos foram atualizados para "${statusFinal}" com sucesso!`, 'success');
    }
    
    selectEl.value = ''; // Reseta após salvar
    gerarRelatorioHorasAluno();
}

function imprimirRelatorioHorasAluno() {
    const relatorioContent = document.getElementById('relatorio-horas-aluno-resultado').cloneNode(true);
    const termoAluno = (document.getElementById('relatorio-search-aluno')?.value || '').trim().toUpperCase();
    const termoProtocolo = (document.getElementById('relatorio-search-protocolo')?.value || '').trim().toUpperCase();
    const alunoRelatorio = estagiosCache.find(l => {
        const matchAluno = !termoAluno || (l.nome_aluno || '').trim().toUpperCase().includes(termoAluno);
        const matchProtocolo = !termoProtocolo || (l.protocolo_ew || '').trim().toUpperCase().includes(termoProtocolo);
        return matchAluno && matchProtocolo;
    });
    const nomeAluno = (alunoRelatorio?.nome_aluno || 'Aluno(a)')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const responsavelSecretaria = (currentUser?.nome_usuario || currentUser?.usuario || 'Responsável Secretaria')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor, permita pop-ups no navegador para visualizar o relatório.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatório - Total de Horas por Aluno</title>
                <style>
                    @page { size: A4 landscape; margin: 12mm; }
                    body { font-family: 'Inter', Arial, sans-serif; padding: 25px; color: #1e293b; background: #fff; }
                    .btn-imprimir-toolbar {
                        display: flex;
                        justify-content: flex-end;
                        margin-bottom: 20px;
                        gap: 10px;
                    }
                    .btn-print {
                        background-color: #2563eb;
                        color: white;
                        border: none;
                        padding: 10px 18px;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                        font-weight: 600;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        transition: background 0.2s;
                    }
                    .btn-print:hover {
                        background-color: #1d4ed8;
                    }
                    h2 { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 8px; text-transform: uppercase; color: #0f172a; font-size: 20px; }
                    .info-header { margin-bottom: 24px; font-size: 13px; text-align: left; color: #64748b; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 15px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
                    th { background-color: #f1f5f9; text-transform: uppercase; color: #334155; font-size: 11px; }
                    .badge { display: inline-block; padding: 3px 6px; border-radius: 4px; font-size: 11px; background: #e2e8f0; }
                    tfoot tr { background-color: #f8fafc; font-weight: bold; }
                    .assinaturas {
                        display: flex;
                        justify-content: center;
                        gap: 90px;
                        margin: 120px auto 0;
                        width: 72%;
                    }
                    .assinatura {
                        flex: 1;
                        min-width: 220px;
                        border-top: 1px solid #1e293b;
                        padding-top: 7px;
                        text-align: center;
                        font-size: 12px;
                        color: #334155;
                    }
                    @media print {
                        .no-print { display: none !important; }
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="btn-imprimir-toolbar no-print">
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                </div>
                <h2>Relatório de Horas por Aluno</h2>
                <div class="info-header">
                    <div>Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</div>
                    <div>Impresso por: <strong>${currentUser ? (currentUser.nome_usuario || currentUser.usuario || '-') : '-'}</strong></div>
                </div>
                ${relatorioContent.innerHTML}
                <div class="assinaturas">
                    <div class="assinatura">${nomeAluno}</div>
                    <div class="assinatura">${responsavelSecretaria}</div>
                </div>
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
}

// ============================================================================
// RELATÓRIO: HORAS VALIDADAS
// ============================================================================

async function popularSelectUnidadesRelatorio(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    if (!window.unidadesCache || window.unidadesCache.length === 0) {
        try {
            const dataU = await safeFetch('/api/unidades');
            if (dataU.success && dataU.unidades) {
                window.unidadesCache = dataU.unidades;
            }
        } catch (e) {}
    }

    const setUnidades = new Set();
    if (window.unidadesCache) {
        window.unidadesCache.forEach(u => {
            if (u.nome_unidade) setUnidades.add(u.nome_unidade.trim().toUpperCase());
        });
    }
    if (estagiosCache) {
        estagiosCache.forEach(l => {
            if (l.unidade) setUnidades.add(l.unidade.trim().toUpperCase());
        });
    }
    if (currentUser && currentUser.nome_unidade) {
        setUnidades.add(currentUser.nome_unidade.trim().toUpperCase());
    }

    const lista = Array.from(setUnidades).sort();
    let padrao = obterUnidadePadraoUsuario();
    if (padrao) padrao = padrao.trim().toUpperCase();

    if (currentUser && currentUser.nivel_acesso !== 'Administrador' && padrao) {
        select.innerHTML = `<option value="${padrao}" selected>${padrao}</option>`;
        select.disabled = true;
    } else {
        const valAtual = select.value;
        select.innerHTML = '<option value="">SELECIONE UMA UNIDADE...</option>' +
            lista.map(u => `<option value="${u}">${u}</option>`).join('');
        if (valAtual && lista.includes(valAtual)) {
            select.value = valAtual;
        }
        select.disabled = false;
    }
}

async function iniciarRelatorioHorasValidadas() {
    try {
        const res = await safeFetch('/api/estagios/lancamentos');
        if (res.success && res.lancamentos) {
            estagiosCache = res.lancamentos;
            await popularSelectUnidadesRelatorio('relatorio-hv-unidade');
            gerarRelatorioHorasValidadas();
        }
    } catch (e) {
        console.error('Erro ao carregar as horas validadas:', e);
    }
}

function limparRelatorioHorasValidadas() {
    document.getElementById('relatorio-hv-data-inicio').value = '';
    document.getElementById('relatorio-hv-data-fim').value = '';
    const selectU = document.getElementById('relatorio-hv-unidade');
    if (selectU && !selectU.disabled) selectU.value = '';
    gerarRelatorioHorasValidadas();
}

function gerarRelatorioHorasValidadas() {
    const dataInicio = document.getElementById('relatorio-hv-data-inicio').value;
    const dataFim = document.getElementById('relatorio-hv-data-fim').value;
    const selectUnidade = document.getElementById('relatorio-hv-unidade');
    const unidadeFiltro = (selectUnidade ? selectUnidade.value : '').trim().toUpperCase();

    const resultados = estagiosCache
        .filter(l => l.validado_coordenacao === true)
        .filter(l => !dataInicio || (l.data_validacao || '') >= dataInicio)
        .filter(l => !dataFim || (l.data_validacao || '') <= dataFim)
        .filter(l => !unidadeFiltro || (l.unidade || '').trim().toUpperCase() === unidadeFiltro)
        .sort((a, b) => (b.data_validacao || '').localeCompare(a.data_validacao || '') ||
            (b.horas_totais || 0) - (a.horas_totais || 0));

    const resultadoEl = document.getElementById('relatorio-hv-resultado');
    const vazioEl = document.getElementById('relatorio-hv-vazio');
    const inicialEl = document.getElementById('relatorio-hv-inicial');
    const btnImprimir = document.getElementById('btn-imprimir-hv');
    const tbody = document.getElementById('table-relatorio-hv-body');
    const tfoot = document.getElementById('table-relatorio-hv-footer');
    inicialEl.style.display = 'none';

    if (!resultados.length) {
        resultadoEl.style.display = 'none';
        vazioEl.style.display = 'block';
        btnImprimir.style.display = 'none';
        return;
    }

    const formatarData = data => data ? data.split('-').reverse().join('/') : '-';
    let totalHoras = 0;
    tbody.innerHTML = resultados.map(l => {
        const horas = Math.round(parseFloat(l.horas_totais) || 0);
        totalHoras += horas;
        return `<tr><td><strong>${l.nome_aluno || '-'}</strong></td><td>${l.unidade || '-'}</td><td>${l.curso || '-'}</td><td>${l.turma || '-'}</td><td><strong>${horas}</strong></td><td>${formatarData(l.data_validacao)}</td><td>${l.nome_usuario_validacao || '-'}</td></tr>`;
    }).join('');
    tfoot.innerHTML = `<tr><td colspan="4" style="text-align:right; font-weight:bold;">TOTAL:</td><td colspan="3" style="font-weight:bold;">${totalHoras} horas (${resultados.length} lançamento${resultados.length > 1 ? 's' : ''})</td></tr>`;
    vazioEl.style.display = 'none';
    resultadoEl.style.display = 'block';
    btnImprimir.style.display = 'inline-block';
}

function imprimirRelatorioHorasValidadas() {
    const relatorio = document.getElementById('relatorio-hv-resultado');
    if (!relatorio || relatorio.style.display === 'none') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor, permita pop-ups no navegador para visualizar o relatório.');
        return;
    }
    const selectUnidade = document.getElementById('relatorio-hv-unidade');
    const unidadeFiltro = selectUnidade && selectUnidade.value ? selectUnidade.options[selectUnidade.selectedIndex].text : 'Todas as Unidades';

    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório - Horas Validadas</title><style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; }
        .no-print { display: flex; justify-content: flex-end; margin-bottom: 18px; }
        button { padding: 9px 16px; background:#2563eb; color:#fff; border:0; border-radius:5px; cursor:pointer; font-weight:bold; }
        h2 { text-align:center; font-size:20px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; margin-bottom: 4px; }
        .sub-header { text-align:center; font-size:12px; color:#64748b; margin-bottom:15px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th, td { border:1px solid #cbd5e1; padding:8px; text-align:left; }
        th, tfoot { background:#f1f5f9; text-transform:uppercase; font-size:11px; }
        @media print { .no-print { display:none; } }
    </style></head><body>
        <div class="no-print"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
        <h2>Relatório: Horas Validadas</h2>
        <div class="sub-header">Unidade: <strong>${unidadeFiltro}</strong> | Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</div>
        ${relatorio.innerHTML}
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
}

// ============================================================================
// RELATÓRIO: AGUARDANDO RETORNO DO ALUNO
// ============================================================================

async function iniciarRelatorioAguardandoRetorno() {
    try {
        const res = await safeFetch('/api/estagios/lancamentos');
        if (res.success && res.lancamentos) {
            estagiosCache = res.lancamentos;
            await popularSelectUnidadesRelatorio('relatorio-ara-unidade');
            gerarRelatorioAguardandoRetorno();
        }
    } catch (e) {
        console.error('Erro ao carregar lançamentos para aguardando retorno:', e);
    }
}

function limparRelatorioAguardandoRetorno() {
    document.getElementById('relatorio-ara-data-inicio').value = '';
    document.getElementById('relatorio-ara-data-fim').value = '';
    const selectU = document.getElementById('relatorio-ara-unidade');
    if (selectU && !selectU.disabled) selectU.value = '';
    gerarRelatorioAguardandoRetorno();
}

function gerarRelatorioAguardandoRetorno() {
    const dataInicio = document.getElementById('relatorio-ara-data-inicio').value;
    const dataFim = document.getElementById('relatorio-ara-data-fim').value;
    const selectUnidade = document.getElementById('relatorio-ara-unidade');
    const unidadeFiltro = (selectUnidade ? selectUnidade.value : '').trim().toUpperCase();

    const resultados = estagiosCache
        .filter(l => l.aguardando_analise === true || l.aguardando_analise === 'true' || l.aguardando_analise === 1 || l.aguardando_analise === '1')
        .filter(l => !dataInicio || (l.data_lancamento || '') >= dataInicio)
        .filter(l => !dataFim || (l.data_lancamento || '') <= dataFim)
        .filter(l => !unidadeFiltro || (l.unidade || '').trim().toUpperCase() === unidadeFiltro)
        .sort((a, b) => (b.data_lancamento || '').localeCompare(a.data_lancamento || '') ||
            (b.horas_totais || 0) - (a.horas_totais || 0));

    const resultadoEl = document.getElementById('relatorio-ara-resultado');
    const vazioEl = document.getElementById('relatorio-ara-vazio');
    const inicialEl = document.getElementById('relatorio-ara-inicial');
    const btnImprimir = document.getElementById('btn-imprimir-ara');
    const tbody = document.getElementById('table-relatorio-ara-body');
    const tfoot = document.getElementById('table-relatorio-ara-footer');
    inicialEl.style.display = 'none';

    if (!resultados.length) {
        resultadoEl.style.display = 'none';
        vazioEl.style.display = 'block';
        btnImprimir.style.display = 'none';
        return;
    }

    const formatarData = data => data ? data.split('-').reverse().join('/') : '-';
    let totalHoras = 0;
    tbody.innerHTML = resultados.map(l => {
        const horas = Math.round(parseFloat(l.horas_totais) || 0);
        totalHoras += horas;
        return `
            <tr>
                <td>${formatarData(l.data_lancamento)}</td>
                <td><strong>${l.nome_aluno || '-'}</strong></td>
                <td>${l.unidade || '-'}</td>
                <td>${l.curso || '-'}</td>
                <td>${l.turma || '-'}</td>
                <td><strong>${horas}</strong></td>
                <td>${l.protocolo_ew || '-'}</td>
                <td style="max-width: 250px; font-size: 12px;">${l.observacoes || '-'}</td>
                <td><small style="color: var(--text-muted);">${l.nome_usuario_registro || '-'}</small></td>
            </tr>
        `;
    }).join('');
    tfoot.innerHTML = `<tr><td colspan="5" style="text-align:right; font-weight:bold;">TOTAL:</td><td colspan="4" style="font-weight:bold;">${totalHoras} horas (${resultados.length} lançamento${resultados.length > 1 ? 's' : ''} aguardando retorno)</td></tr>`;
    vazioEl.style.display = 'none';
    resultadoEl.style.display = 'block';
    btnImprimir.style.display = 'inline-block';
}

function imprimirRelatorioAguardandoRetorno() {
    const relatorio = document.getElementById('relatorio-ara-resultado');
    if (!relatorio || relatorio.style.display === 'none') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor, permita pop-ups no navegador para visualizar o relatório.');
        return;
    }
    const selectUnidade = document.getElementById('relatorio-ara-unidade');
    const unidadeFiltro = selectUnidade && selectUnidade.value ? selectUnidade.options[selectUnidade.selectedIndex].text : 'Todas as Unidades';
    const dataInicio = document.getElementById('relatorio-ara-data-inicio').value;
    const dataFim = document.getElementById('relatorio-ara-data-fim').value;
    let periodoTxt = 'Todos os registros';
    if (dataInicio && dataFim) periodoTxt = `De ${dataInicio.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}`;
    else if (dataInicio) periodoTxt = `A partir de ${dataInicio.split('-').reverse().join('/')}`;
    else if (dataFim) periodoTxt = `Até ${dataFim.split('-').reverse().join('/')}`;

    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório - Aguardando Retorno do Aluno</title><style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; }
        .no-print { display: flex; justify-content: flex-end; margin-bottom: 18px; }
        button { padding: 9px 16px; background:#2563eb; color:#fff; border:0; border-radius:5px; cursor:pointer; font-weight:bold; }
        h2 { text-align:center; font-size:20px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; margin-bottom: 4px; }
        .sub-header { text-align:center; font-size:12px; color:#64748b; margin-bottom:15px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th, td { border:1px solid #cbd5e1; padding:8px; text-align:left; }
        th, tfoot { background:#f1f5f9; text-transform:uppercase; font-size:11px; }
        @media print { .no-print { display:none; } }
    </style></head><body>
        <div class="no-print"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
        <h2>Relatório: Aguardando Retorno do Aluno</h2>
        <div class="sub-header">Unidade: <strong>${unidadeFiltro}</strong> | Período: <strong>${periodoTxt}</strong> | Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</div>
        ${relatorio.innerHTML}
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
}

// ============================================================================
// RELATÓRIO: ALUNOS POR UNIDADE
// ============================================================================

async function iniciarRelatorioAlunosUnidade() {
    limparRelatorioAlunosUnidade();
    try {
        const res = await safeFetch('/api/estagios/lancamentos');
        if (res.success && res.lancamentos) {
            let data = res.lancamentos;
            const globalUnit = getGlobalSelectedUnitName();
            if (globalUnit) {
                data = data.filter(l => (l.unidade || '').trim().toUpperCase() === globalUnit.toUpperCase());
            }
            estagiosCache = data;
            preencherFiltrosRelatorioAlunosUnidade();
        }
    } catch (e) {
        console.error("Erro ao carregar estágios para relatório:", e);
    }
}

function preencherFiltrosRelatorioAlunosUnidade() {
    const elUnidade = document.getElementById('relatorio-au-unidade');
    const elCurso = document.getElementById('relatorio-au-curso');
    const elStatus = document.getElementById('relatorio-au-status');

    if (!elUnidade || !elCurso || !elStatus) return;

    const unidades = [...new Set(estagiosCache.map(l => (l.unidade || '').trim().toUpperCase()).filter(Boolean))].sort();
    const cursos = [...new Set(estagiosCache.map(l => (l.curso || '').trim().toUpperCase()).filter(Boolean))].sort();
    const statuses = [...new Set(estagiosCache.map(l => (l.status || '').trim().toUpperCase()).filter(Boolean))].sort();

    elUnidade.innerHTML = '<option value="">TODAS AS UNIDADES</option>' + 
        unidades.map(u => `<option value="${u}">${u}</option>`).join('');
    
    elCurso.innerHTML = '<option value="">TODOS OS CURSOS</option>' + 
        cursos.map(c => `<option value="${c}">${c}</option>`).join('');

    elStatus.innerHTML = '<option value="">TODOS OS STATUS</option>' + 
        statuses.map(s => `<option value="${s}">${s}</option>`).join('');
}

function limparRelatorioAlunosUnidade() {
    document.getElementById('relatorio-au-unidade').value = '';
    document.getElementById('relatorio-au-curso').value = '';
    document.getElementById('relatorio-au-horas-min').value = '';
    document.getElementById('relatorio-au-horas-max').value = '';
    document.getElementById('relatorio-au-status').value = '';
    
    document.getElementById('relatorio-au-resultado').style.display = 'none';
    document.getElementById('relatorio-au-vazio').style.display = 'none';
    document.getElementById('relatorio-au-inicial').style.display = 'block';
    document.getElementById('btn-imprimir-au').style.display = 'none';
    document.getElementById('btn-exportar-au').style.display = 'none';
    document.getElementById('table-relatorio-au-body').innerHTML = '';
}

function gerarRelatorioAlunosUnidade() {
    const filtroUnidade = (document.getElementById('relatorio-au-unidade').value || '').trim().toUpperCase();
    const filtroCurso = (document.getElementById('relatorio-au-curso').value || '').trim().toUpperCase();
    const filtroHorasMin = parseFloat(document.getElementById('relatorio-au-horas-min').value);
    const filtroHorasMax = parseFloat(document.getElementById('relatorio-au-horas-max').value);
    const filtroStatus = (document.getElementById('relatorio-au-status').value || '').trim().toUpperCase();

    const mapaAlunos = {};

    estagiosCache.forEach(l => {
        const aluno = (l.nome_aluno || '').trim().toUpperCase();
        const unidade = (l.unidade || '').trim().toUpperCase();
        const curso = (l.curso || '').trim().toUpperCase();
        const turma = (l.turma || '').trim().toUpperCase();
        const status = (l.status || '').trim().toUpperCase();
        const horas = parseFloat(l.horas_totais) || 0;

        if (filtroUnidade && unidade !== filtroUnidade) return;
        if (filtroCurso && curso !== filtroCurso) return;
        if (filtroStatus && status !== filtroStatus) return;

        const key = `${aluno}|${unidade}|${curso}|${turma}|${status}`;
        if (!mapaAlunos[key]) {
            mapaAlunos[key] = {
                aluno: aluno,
                unidade: unidade,
                curso: curso,
                turma: turma,
                status: status,
                horas: 0
            };
        }
        mapaAlunos[key].horas += horas;
    });

    const resultados = Object.values(mapaAlunos).filter(item => {
        if (!isNaN(filtroHorasMin) && item.horas < filtroHorasMin) return false;
        if (!isNaN(filtroHorasMax) && item.horas > filtroHorasMax) return false;
        return true;
    });

    resultados.sort((a, b) => b.horas - a.horas || a.aluno.localeCompare(b.aluno));

    document.getElementById('relatorio-au-inicial').style.display = 'none';

    if (resultados.length === 0) {
        document.getElementById('relatorio-au-vazio').style.display = 'block';
        document.getElementById('relatorio-au-resultado').style.display = 'none';
        document.getElementById('btn-imprimir-au').style.display = 'none';
        document.getElementById('btn-exportar-au').style.display = 'none';
        return;
    }

    document.getElementById('relatorio-au-vazio').style.display = 'none';
    document.getElementById('relatorio-au-resultado').style.display = 'block';
    document.getElementById('btn-imprimir-au').style.display = 'inline-block';
    document.getElementById('btn-exportar-au').style.display = 'inline-block';

    const tbody = document.getElementById('table-relatorio-au-body');
    let totalGeralHoras = 0;
    
    tbody.innerHTML = resultados.map(r => {
        totalGeralHoras += r.horas;
        let statusBadge = 'badge-secondary';
        if (r.status === 'EM ANDAMENTO') statusBadge = 'badge-primary';
        else if (r.status === 'CONCLUÍDO' || r.status === 'CONCLUIDO') statusBadge = 'badge-success';
        else if (r.status === 'EVADIDO') statusBadge = 'badge-warning';
        else if (r.status === 'CANCELADO') statusBadge = 'badge-danger';

        return `
            <tr>
                <td><strong>${r.aluno}</strong></td>
                <td>${r.unidade}</td>
                <td>${r.curso}</td>
                <td>${r.turma || '-'}</td>
                <td><strong>${r.horas}</strong></td>
                <td><span class="badge ${statusBadge}">${r.status}</span></td>
            </tr>
        `;
    }).join('');

    const tfoot = document.getElementById('table-relatorio-au-footer');
    tfoot.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: right; font-weight: bold;">TOTAL GERAL:</td>
            <td colspan="2" style="font-weight: bold; font-size: 14px;">${totalGeralHoras} horas ( ${resultados.length} alunos )</td>
        </tr>
    `;
}

function imprimirRelatorioAlunosUnidade() {
    const relatorioContent = document.getElementById('relatorio-au-resultado');
    if (!relatorioContent || relatorioContent.style.display === 'none') return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Erro ao abrir janela de impressão. Verifique o bloqueio de pop-ups.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Impressão - Relatório Alunos por Unidade</title>
                <style>
                    body { font-family: 'Inter', Arial, sans-serif; color: #333; padding: 20px; }
                    .btn-imprimir-toolbar {
                        display: flex;
                        justify-content: flex-end;
                        margin-bottom: 20px;
                        gap: 10px;
                    }
                    .btn-print {
                        background-color: #2563eb;
                        color: white;
                        border: none;
                        padding: 10px 18px;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                        font-weight: 600;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        transition: background 0.2s;
                    }
                    .btn-print:hover {
                        background-color: #1d4ed8;
                    }
                    h2 { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 8px; text-transform: uppercase; color: #0f172a; font-size: 20px; }
                    .info-header { margin-bottom: 24px; font-size: 13px; text-align: center; color: #64748b; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 15px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
                    th { background-color: #f1f5f9; text-transform: uppercase; color: #334155; font-size: 11px; }
                    .badge { display: inline-block; padding: 3px 6px; border-radius: 4px; font-size: 11px; background: #e2e8f0; border: 1px solid #cbd5e1; }
                    tfoot tr { background-color: #f8fafc; font-weight: bold; }
                    @media print {
                        .no-print { display: none !important; }
                        body { -webkit-print-color-adjust: exact; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="btn-imprimir-toolbar no-print">
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                    <button class="btn-print" onclick="window.opener.exportarRelatorioAlunosUnidadeExcel()">📊 Baixar Excel</button>
                </div>
                <h2>Relatório de Alunos por Unidade</h2>
                <div class="info-header">
                    Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
                </div>
                ${relatorioContent.innerHTML}
            </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
}

function exportarRelatorioAlunosUnidadeExcel() {
    const tabela = document.getElementById('table-relatorio-au');
    if (!tabela) return;

    const conteudo = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><table>${tabela.innerHTML}</table></body></html>`;
    const arquivo = new Blob(['\ufeff', conteudo], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = `relatorio-alunos-por-unidade-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}


// ==========================================
// DOCUMENTOS API
// ==========================================

function abrirModalUploadDocumento() {
    document.getElementById('form-upload-documento').reset();
    document.getElementById('modal-upload-documento').classList.remove('hidden');
}

async function salvarDocumento() {
    const curso = document.getElementById('upload-doc-curso').value;
    const tipo = document.getElementById('upload-doc-tipo').value;
    const inputArquivo = document.getElementById('upload-doc-arquivo');
    
    if (!curso || !tipo || inputArquivo.files.length === 0) {
        showToast('Preencha todos os campos.', 'warning');
        return;
    }
    
    const file = inputArquivo.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        
        const docData = {
            curso: curso,
            tipo_documento: tipo,
            nome_arquivo: file.name,
            tipo_mime: file.type,
            dados_arquivo: base64Data
        };
        
        const btn = document.querySelector('#form-upload-documento button[type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
        
        const res = await safeFetch('/api/documentos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docData)
        });
        
        if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar Documento'; }
        
        if (res.success) {
            showToast('Documento salvo!', 'success');
            fecharModal('modal-upload-documento');
            // Atualiza filtro se necessário
            const filtroAtual = document.getElementById('filtro-documento-curso').value;
            if (filtroAtual === curso || !filtroAtual) {
                document.getElementById('filtro-documento-curso').value = curso;
                filtrarDocumentos();
            }
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    };
    
    reader.onerror = function() {
        showToast('Erro ao ler o arquivo.', 'error');
    };
    
    reader.readAsDataURL(file);
}

async function filtrarDocumentos() {
    const curso = document.getElementById('filtro-documento-curso').value;
    const tbody = document.getElementById('table-documentos-body');
    
    if (!curso) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Selecione um curso para ver os documentos.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando documentos... <i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
    
    const res = await safeFetch(`/api/documentos?curso=${encodeURIComponent(curso)}`);
    if (res.success) {
        if (res.documentos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum documento encontrado para este curso.</td></tr>';
            return;
        }
        
        tbody.innerHTML = res.documentos.map(d => `
            <tr>
                <td>${d.curso}</td>
                <td>${d.tipo_documento}</td>
                <td><strong>${d.nome_arquivo}</strong></td>
                <td>${new Date(d.data_inclusao).toLocaleString('pt-BR')}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-primary" onclick="visualizarDocumento(${d.id_documento})" title="Visualizar / Baixar"><i class="fa-solid fa-eye"></i> Visualizar</button>
                    ${currentUser && currentUser.nivel_acesso === 'Administrador' ? 
                      `<button class="btn btn-sm btn-danger" onclick="excluirDocumento(${d.id_documento})" title="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar documentos.</td></tr>';
    }
}

let docAtualVisualizando = null;
let currentDocBlob = null;
let currentDocBlobUrl = null;

function base64ToBlob(base64Data, defaultMime = 'application/octet-stream') {
    let raw = base64Data;
    let mime = defaultMime;
    if (base64Data.startsWith('data:')) {
        const parts = base64Data.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        if (mimeMatch) mime = mimeMatch[1];
        raw = parts[1];
    }
    const byteCharacters = atob(raw);
    const byteArrays = [];
    const sliceSize = 1024;
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mime });
}

async function visualizarDocumento(id) {
    const res = await safeFetch(`/api/documentos/${id}`);
    if (!res.success || !res.documento) {
        showToast('Erro ao abrir documento.', 'error');
        return;
    }

    const doc = res.documento;
    docAtualVisualizando = doc;

    if (currentDocBlobUrl) {
        URL.revokeObjectURL(currentDocBlobUrl);
        currentDocBlobUrl = null;
    }

    const modal = document.getElementById('modal-visualizar-documento');
    const titulo = document.getElementById('visualizar-doc-titulo');
    const iframe = document.getElementById('iframe-visualizar-doc');
    const containerCustom = document.getElementById('container-visualizar-doc-custom');

    titulo.innerText = doc.nome_arquivo;
    titulo.title = doc.nome_arquivo;

    const ext = (doc.nome_arquivo.split('.').pop() || '').toLowerCase();
    const mime = (doc.tipo_mime || '').toLowerCase();
    const isPdf = mime === 'application/pdf' || ext === 'pdf';
    const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
    const isWord = ['doc', 'docx'].includes(ext) || mime.includes('word');
    const isExcel = ['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet');

    try {
        currentDocBlob = base64ToBlob(doc.dados_arquivo, mime || (isPdf ? 'application/pdf' : 'application/octet-stream'));
        currentDocBlobUrl = URL.createObjectURL(currentDocBlob);
    } catch (e) {
        console.error('Erro ao converter base64 em blob:', e);
    }

    if (isPdf && currentDocBlobUrl) {
        iframe.style.display = 'block';
        containerCustom.style.display = 'none';
        iframe.src = currentDocBlobUrl;
    } else if (isImage) {
        iframe.style.display = 'none';
        containerCustom.style.display = 'flex';
        containerCustom.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; width:100%; height:100%; padding:15px;">
                <img src="${doc.dados_arquivo}" alt="${doc.nome_arquivo}" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,0.5);" />
            </div>
        `;
    } else {
        iframe.style.display = 'none';
        containerCustom.style.display = 'flex';
        
        let iconClass = 'fa-file-lines';
        let iconColor = '#3b82f6';
        let tipoNome = 'Documento';

        if (isWord) {
            iconClass = 'fa-file-word';
            iconColor = '#2563eb';
            tipoNome = 'Microsoft Word (.docx)';
        } else if (isExcel) {
            iconClass = 'fa-file-excel';
            iconColor = '#10b981';
            tipoNome = 'Microsoft Excel (.xlsx)';
        }

        containerCustom.innerHTML = `
            <div style="text-align: center; max-width: 520px; background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 36px 28px; box-shadow: 0 16px 40px rgba(0,0,0,0.5);">
                <div style="width: 80px; height: 80px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); border-radius: 50%;">
                    <i class="fa-solid ${iconClass}" style="font-size: 42px; color: ${iconColor};"></i>
                </div>
                <h3 style="color: #fff; font-size: 18px; margin-bottom: 8px; font-weight: 600; word-break: break-word;">${doc.nome_arquivo}</h3>
                <p style="color: #94a3b8; font-size: 13px; margin-bottom: 20px;">
                    <span style="color: #e2e8f0; font-weight: 500;">${doc.tipo_documento}</span> &bull; 
                    <span>${doc.curso}</span>
                </p>
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; margin-bottom: 24px; text-align: left; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
                    <div><strong>Formato:</strong> ${tipoNome}</div>
                    <div><strong>Data de Inclusão:</strong> ${new Date(doc.data_inclusao || Date.now()).toLocaleString('pt-BR')}</div>
                </div>
                <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-success" onclick="baixarDocumentoAtual()" style="background-color: #10b981; border-color: #10b981; padding: 10px 20px;">
                        <i class="fa-solid fa-download"></i> Baixar Arquivo
                    </button>
                </div>
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

function imprimirDocumentoAtual() {
    if (!docAtualVisualizando) {
        showToast('Nenhum documento selecionado para impressão.', 'warning');
        return;
    }

    const doc = docAtualVisualizando;
    const ext = (doc.nome_arquivo.split('.').pop() || '').toLowerCase();
    const mime = (doc.tipo_mime || '').toLowerCase();
    const isPdf = mime === 'application/pdf' || ext === 'pdf';
    const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);

    if (isPdf && currentDocBlobUrl) {
        const iframe = document.getElementById('iframe-visualizar-doc');
        try {
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                return;
            }
        } catch (e) {
            console.warn('Iframe print falhou, abrindo janela auxiliar de impressão:', e);
        }

        const printWin = window.open(currentDocBlobUrl, '_blank');
        if (printWin) {
            printWin.focus();
            printWin.onload = () => printWin.print();
        } else {
            showToast('Permita popups no navegador para imprimir o PDF.', 'warning');
        }
        return;
    }

    if (isImage) {
        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${doc.nome_arquivo}</title>
                    <style>
                        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
                        img { max-width: 100%; max-height: 98vh; object-fit: contain; }
                    </style>
                </head>
                <body>
                    <img src="${doc.dados_arquivo}" onload="window.print(); window.close();" />
                </body>
                </html>
            `);
            printWin.document.close();
        }
        return;
    }

    // Outros formatos (Word, Excel) geram a folha de identificação/impressão
    const printWin = window.open('', '_blank');
    if (printWin) {
        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ficha - ${doc.nome_arquivo}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; }
                    .header { border-bottom: 3px solid #3b82f6; padding-bottom: 15px; margin-bottom: 30px; }
                    h1 { margin: 0 0 8px 0; font-size: 22px; color: #0f172a; }
                    p.sub { margin: 0; color: #64748b; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                    th, td { border: 1px solid #cbd5e1; padding: 12px 16px; text-align: left; }
                    th { background-color: #f8fafc; font-weight: 600; width: 30%; color: #334155; }
                    .footer { margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>CONTROLE DE ESTOQUES & ESTÁGIOS</h1>
                    <p class="sub">Protocolo de Registro de Documento</p>
                </div>
                <table>
                    <tr><th>Nome do Arquivo</th><td><strong>${doc.nome_arquivo}</strong></td></tr>
                    <tr><th>Tipo de Documento</th><td>${doc.tipo_documento}</td></tr>
                    <tr><th>Curso Vinculado</th><td>${doc.curso}</td></tr>
                    <tr><th>Data de Inclusão</th><td>${new Date(doc.data_inclusao || Date.now()).toLocaleString('pt-BR')}</td></tr>
                    <tr><th>Status do Registro</th><td>Anexado ao Banco de Dados</td></tr>
                </table>
                <div class="footer">
                    Impresso em: ${new Date().toLocaleString('pt-BR')}
                </div>
                <script>
                    window.onload = function() { window.print(); };
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    }
}

function baixarDocumentoAtual() {
    if (!docAtualVisualizando) {
        showToast('Nenhum documento selecionado para download.', 'warning');
        return;
    }
    baixarArquivo(docAtualVisualizando.dados_arquivo, docAtualVisualizando.nome_arquivo);
}

function fecharModalVisualizarDocumento() {
    fecharModal('modal-visualizar-documento');
    const iframe = document.getElementById('iframe-visualizar-doc');
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
    }
    const containerCustom = document.getElementById('container-visualizar-doc-custom');
    if (containerCustom) {
        containerCustom.innerHTML = '';
        containerCustom.style.display = 'none';
    }
    if (currentDocBlobUrl) {
        URL.revokeObjectURL(currentDocBlobUrl);
        currentDocBlobUrl = null;
    }
    currentDocBlob = null;
    docAtualVisualizando = null;
}

function baixarArquivo(base64Data, filename) {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function excluirDocumento(id) {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    
    const res = await safeFetch(`/api/documentos/${id}`, { method: 'DELETE' });
    if (res.success) {
        showToast('Documento excluído!', 'success');
        filtrarDocumentos();
    } else {
        showToast('Erro ao excluir', 'error');
    }
}


// --- RELATÓRIO CONTROLE MANUAL ---
async function gerarRelatorioControleManual() {
    try {
        const catId = document.getElementById('filter-categoria-controle-manual').value;
        const btn = document.querySelector('button[onclick="gerarRelatorioControleManual()"]');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';

        let url = '/api/produtos';
        const queryParams = [];
        if (selectedUnitId) queryParams.push(`id_unidade=${selectedUnitId}`);
        if (catId) queryParams.push(`id_categoria=${catId}`);
        if (queryParams.length > 0) url += '?' + queryParams.join('&');

        const result = await safeFetch(url);
        
        if (btn) btn.innerHTML = '<i class="fa-solid fa-search"></i> Gerar Planilha';

        if (result.success) {
            let produtos = result.produtos;
            if (catId) {
                produtos = produtos.filter(p => p.id_categoria == catId);
            }
            if (selectedUnitId) {
                produtos = produtos.filter(p => p.id_unidade == selectedUnitId || !p.id_unidade);
            }
            
            produtos = produtos.filter(p => !p.inativo);
            
            const tbody = document.getElementById('table-relatorio-controle-manual-body');
            const divResult = document.getElementById('relatorio-controle-manual-resultado');
            const btnImprimir = document.getElementById('btn-imprimir-controle-manual');

            if (produtos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Nenhum produto encontrado para a categoria selecionada.</td></tr>';
            } else {
                tbody.innerHTML = produtos.map(p => `
                    <tr>
                        <td><strong>${p.nome_produto}</strong></td>
                        <td class="text-center">${p.estoque_atual}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                `).join('');
            }
            
            divResult.style.display = 'block';
            btnImprimir.style.display = 'inline-block';
        }
    } catch (e) {
        console.error('Erro ao gerar controle manual', e);
        alert('Erro ao gerar planilha.');
    }
}

function imprimirRelatorioControleManual() {
    const tableDiv = document.getElementById('relatorio-controle-manual-resultado');
    const categoriaTxt = document.getElementById('filter-categoria-controle-manual').options[document.getElementById('filter-categoria-controle-manual').selectedIndex].text;
    
    const dataAtual = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR');
    const nomeUsuario = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.nome_usuario : 'Usuário não identificado';
    
    const janela = window.open('', '', 'width=900,height=600');
    janela.document.write(`
        <html>
        <head>
            <title>Impressão - Controle Manual de Estoque</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { text-align: center; margin-bottom: 5px; }
                h4 { text-align: center; margin-top: 0; color: #555; }
                .info-meta { text-align: right; font-size: 11px; color: #555; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                .text-center { text-align: center; }
                @media print {
                    @page { size: landscape; margin: 1cm; }
                }
            </style>
        </head>
        <body>
            <h2>Controle Manual de Estoque</h2>
            <h4>Categoria: ${categoriaTxt}</h4>
            <div class="info-meta">
                Gerado por: <strong>${nomeUsuario}</strong> em <strong>${dataAtual}</strong>
            </div>
            ${tableDiv.innerHTML}
            <script>
                window.onload = function() { window.print(); window.close(); };
            </script>
        </body>
        </html>
    `);
    janela.document.close();
}
