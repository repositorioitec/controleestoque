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

window.onerror = function(message, source, lineno, colno, error) {
    if (typeof showToast === 'function') {
        showToast('Erro Global: ' + message, 'error');
    } else {
        alert('Erro Global: ' + message);
    }
};

window.onunhandledrejection = function(event) {
    if (typeof showToast === 'function') {
        showToast('Erro Async: ' + (event.reason ? event.reason.message || event.reason : 'Desconhecido'), 'error');
    } else {
        alert('Erro Async: ' + event.reason);
    }
};

// --- HELPERS DE NÍVEL DE ACESSO ---
function isAdmin() {
    return currentUser && currentUser.nivel_acesso === 'Administrador';
}
function isSupervisor() {
    return currentUser && (currentUser.nivel_acesso === 'Supervisor' || currentUser.nivel_acesso === 'Administrador');
}

// --- MOTOR LOCALDB PARA GITHUB PAGES (CLIENT-SIDE ESTÍTICO) ---
const LocalDB = {
    init() {
        if (!localStorage.getItem('gh_unidades')) {
            localStorage.setItem('gh_unidades', JSON.stringify([
                { id_unidade: 1, nome_unidade: "Unidade Matriz", endereco: "Av. Principal, 1000 - Centro", cnpj: "00.000.000/0001-00" }
            ]));
        }
        let users = JSON.parse(localStorage.getItem('gh_usuarios') || '[]');
        if (!users.length) {
            users = [{ id_usuario: 1, usuario: "admin@itec.com", senha: "admin123", nome_usuario: "Administrador do Sistema", nivel_acesso: "Administrador", id_unidade: 1, status_aprovacao: "Aprovado"