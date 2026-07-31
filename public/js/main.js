/* ==========================================================================
   LÓGICA PRINCIPAL JAVASCRIPT - CONTROLE DE ESTOQUE
   Suporte Híbrido: Servidor Flask API / GitHub Pages (LocalStorage DB)
   ========================================================================== */

let currentUser = null;
let selectedUnitId = null;
let produtosCache = [];
let categoriasCache = [];
let unidadesCache = [];

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

        // PRODUTOS GET
        if (path === '/api/produtos' && method === 'GET') {
            const busca = (params.get('busca') || '').toLowerCase();
            const catId = params.get('categoria_id');
            const unidId = params.get('id_unidade');

            let prods = this.get('produtos');
            if (busca) prods = prods.filter(p => p.nome_produto.toLowerCase().includes(busca) || (p.codigo_barras && p.codigo_barras.includes(busca)));
            if (catId) prods = prods.filter(p => p.id_categoria == catId);
            if (unidId) prods = prods.filter(p => !p.id_unidade || p.id_unidade == unidId);

            const resultProds = prods.map(p => {
                const estAtual = this.calcularEstoqueProduto(p.id_produto, unidId);
                const estMin = p.estoque_minimo || 0;
                let precoCusto = parseFloat(p.preco_custo || 0);
                if (precoCusto === 0) {
                    const movs = this.get('movimentacoes').filter(m => m.id_produto == p.id_produto && m.tipo_movimentacao === 'ENTRADA' && parseFloat(m.valor_unitario) > 0);
                    if (movs.length > 0) {
                        movs.sort((a, b) => new Date(b.data_movimentacao) - new Date(a.data_movimentacao));
                        precoCusto = parseFloat(movs[0].valor_unitario);
                    }
                }
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
            if (tipo) movs = movs.filter(m => m.tipo_movimentacao === tipo);
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

        return { success: false, message: 'Rota não encontrada' };
    }
};

// Funçao auxiliar para realizar chamadas API ou redirecionar para LocalDB no GitHub Pages
async function safeFetch(url, options = {}) {
    // Se estiver rodando estático no GitHub Pages ou arquivo local
    if (window.location.protocol === 'file:' || window.location.hostname.includes('github.io')) {
        return LocalDB.dispatch(url, options);
    }

    try {
        const res = await fetch(url, options);
        if (res.status === 404) throw new Error("API não encontrada, alternando para LocalDB");
        return await res.json();
    } catch (e) {
        // Fallback automático se o servidor não estiver respondendo
        return LocalDB.dispatch(url, options);
    }
}

// Inicialização da aplicação ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    checarSessaoUsuario();
    configurarNavegacao();
});

// --- AUTENTICAÇÃO E SESSÃO ---

function checarSessaoUsuario() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'login' || urlParams.get('logout') === 'true') {
        localStorage.removeItem('stock_user');
        currentUser = null;
        exibirTelaAuth();
        return;
    }

    const savedUser = localStorage.getItem('stock_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            iniciarAplicacao();
        } catch (e) {
            localStorage.removeItem('stock_user');
            exibirTelaAuth();
        }
    } else {
        exibirTelaAuth();
    }
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
        localStorage.setItem('stock_user', JSON.stringify(currentUser));
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
    localStorage.removeItem('stock_user');
    currentUser = null;
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    showToast('Você saiu do sistema.', 'info');
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
            'view-cadastros': 'Gestão de Categorias, Fornecedores e Unidades',
            'view-usuarios': 'Usuários e Aprovações'
        };
        document.getElementById('page-title').textContent = titles[viewId] || 'Controle de Estoque';

        if (viewId === 'view-dashboard') carregarDashboard();
        if (viewId === 'view-produtos') carregarProdutos();
        if (viewId === 'view-movimentacoes') {
            preencherOpcoesFiltrosMovimentacoes();
            carregarMovimentacoes();
        }
        if (viewId === 'view-cadastros') carregarCadastrosGerais();
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

    let url = `/api/produtos?busca=${encodeURIComponent(busca)}&categoria_id=${encodeURIComponent(catId)}`;
    if (selectedUnitId) {
        url += `&id_unidade=${selectedUnitId}`;
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

        return `
            <tr style="${opacidade}">
                <td>#${p.id_produto}</td>
                <td><code>${p.codigo_barras || '-'}</code></td>
                <td><strong>${p.nome_produto}</strong></td>
                <td>${p.nome_categoria}</td>
                <td>${p.nome_unidade || 'Todas'}</td>
                <td>${p.estoque_minimo}</td>
                <td>${formatarMoeda(p.preco_custo)}</td>
                <td>${formatarMoeda(p.preco_venda)}</td>
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
        selectU.innerHTML = '<option value="">Todas as Unidades</option>' +
            dataU.unidades.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
        selectU.value = valAtual;
    }

    const dataP = await safeFetch('/api/produtos');
    const selectP = document.getElementById('filter-mov-produto');
    if (dataP.success && selectP) {
        const valAtual = selectP.value;
        selectP.innerHTML = '<option value="">Todos os Produtos</option>' +
            dataP.produtos.map(p => `<option value="${p.id_produto}">${p.nome_produto}</option>`).join('');
        selectP.value = valAtual;
    }
}

async function carregarMovimentacoes() {
    const dtInicio = document.getElementById('filter-mov-inicio') ? document.getElementById('filter-mov-inicio').value : '';
    const dtFim = document.getElementById('filter-mov-fim') ? document.getElementById('filter-mov-fim').value : '';
    const filterUnid = document.getElementById('filter-mov-unidade') ? document.getElementById('filter-mov-unidade').value : '';
    const filterProd = document.getElementById('filter-mov-produto') ? document.getElementById('filter-mov-produto').value : '';
    const filterTipo = document.getElementById('filter-mov-tipo') ? document.getElementById('filter-mov-tipo').value : '';

    let url = '/api/movimentacoes?1=1';
    const activeUnit = filterUnid || selectedUnitId;
    if (activeUnit) url += `&id_unidade=${encodeURIComponent(activeUnit)}`;
    if (filterProd) url += `&id_produto=${encodeURIComponent(filterProd)}`;
    if (dtInicio) url += `&data_inicio=${encodeURIComponent(dtInicio)}`;
    if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;
    if (filterTipo) url += `&tipo_movimentacao=${encodeURIComponent(filterTipo)}`;

    const result = await safeFetch(url);

    if (result.success) {
        const movs = result.movimentacoes;
        
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

async function abrirModalMovimentacao(tipo) {
    document.getElementById('form-movimentacao').reset();
    document.getElementById('mov-tipo').value = tipo;
    
    document.getElementById('mov-data').value = getFormattedLocalDateTime();

    const title = tipo === 'ENTRADA' ? 'Registrar Nova ENTRADA de Estoque' : 'Registrar Nova SAÍDA de Estoque';
    document.getElementById('modal-movimentacao-title').textContent = title;
    
    const btnSubmit = document.getElementById('btn-submit-mov');
    btnSubmit.className = tipo === 'ENTRADA' ? 'btn btn-primary' : 'btn btn-warning';
    btnSubmit.innerHTML = tipo === 'ENTRADA' ? '<i class="fa-solid fa-circle-plus"></i> Confirmar Entrada' : '<i class="fa-solid fa-circle-minus"></i> Confirmar Saída';

    document.getElementById('mov-saldo-info').classList.add('hidden');
    document.getElementById('modal-movimentacao').classList.remove('hidden');

    const groupForn = document.getElementById('group-mov-fornecedor');
    const valorLabel = document.getElementById('mov-valor-label');

    if (tipo === 'ENTRADA') {
        if (groupForn) groupForn.style.display = '';
        if (valorLabel) valorLabel.textContent = 'Preço de Custo Unitário (R$)';
    } else {
        if (groupForn) groupForn.style.display = 'none';
        if (valorLabel) valorLabel.textContent = 'Preço de Venda Unitário (R$)';
    }

    await carregarCategoriasEFornecedores();

    const selectU = document.getElementById('mov-unidade');
    const dataU = await safeFetch('/api/unidades');
    if (dataU.success) {
        unidadesCache = dataU.unidades;
        selectU.innerHTML = '<option value="">Selecione a Unidade...</option>' +
            unidadesCache.map(u => `<option value="${u.id_unidade}">${u.nome_unidade}</option>`).join('');
        
        const defaultUnit = selectedUnitId || (currentUser ? currentUser.id_unidade : null) || (unidadesCache.length > 0 ? unidadesCache[0].id_unidade : null);
        if (defaultUnit) {
            selectU.value = defaultUnit;
        }

        if (!isAdmin() && currentUser && currentUser.id_unidade) {
            selectU.value = currentUser.id_unidade;
            selectU.disabled = true;
        } else {
            selectU.disabled = false;
        }
    }

    await atualizarProdutosPorUnidadeMovimentacao();
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
        if (tipo === 'ENTRADA') {
            valorInput.value = prod.preco_custo || 0;
        } else {
            valorInput.value = prod.preco_venda || 0;
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
        id_usuario: currentUser ? currentUser.id_usuario : null
    };

    const result = await safeFetch('/api/movimentacoes', {
        method: 'POST',
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

            let acoesHtml = '';
            if (u.status_aprovacao === 'Pendente') {
                acoesHtml = `
                    <button class="btn btn-sm btn-success" onclick="abrirModalUsuario(${u.id_usuario}, '${u.nome_usuario}', ${u.id_unidade || 'null'}, '${u.nivel_acesso}', 'aprovar')" title="Aprovar Cadastro">
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
                    <button class="btn btn-sm btn-outline" onclick="abrirModalUsuario(${u.id_usuario}, '${u.nome_usuario}', ${u.id_unidade || 'null'}, '${u.nivel_acesso}', 'editar')" title="Editar Unidade / Nível">
                        <i class="fa-solid fa-pen-to-square"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="excluirUsuario(${u.id_usuario})" title="Excluir Usuário">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `;
            }

            return `
                <tr>
                    <td>#${u.id_usuario}</td>
                    <td><strong>${u.nome_usuario}</strong></td>
                    <td><code>${u.usuario}</code></td>
                    <td><span class="badge ${u.nivel_acesso === 'Administrador' ? 'badge-info' : u.nivel_acesso === 'Supervisor' ? 'badge-warning' : 'badge-secondary'}">${u.nivel_acesso}</span></td>
                    <td>${u.nome_unidade || 'Sem Unidade'}</td>
                    <td><span class="badge ${statusBadge}">${u.status_aprovacao || 'Aprovado'}</span></td>
                    <td class="text-right">${acoesHtml}</td>
                </tr>
            `;
        }).join('');
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


async function abrirModalUsuario(id_usuario, nome_usuario, id_unidade_atual, nivel_atual, modo = 'editar') {
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

    document.getElementById('modal-aprovar-usuario').classList.remove('hidden');
}

async function salvarAprovacaoOuEdicaoUsuario(event) {
    event.preventDefault();
    const userId = document.getElementById('aprovar-user-id').value;
    const modo = document.getElementById('aprovar-user-modo').value;
    const id_unidade = document.getElementById('aprovar-unidade').value;
    const nivel_acesso = document.getElementById('aprovar-nivel').value;

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
        body: JSON.stringify({ id_unidade, nivel_acesso })
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
            localStorage.setItem('stock_user', JSON.stringify(currentUser));
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
