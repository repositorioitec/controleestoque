import re

js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

old_func_pattern = r'function popularFiltroUnidadeHorasValidadas\(\) \{.*?\}\n'
new_func = """function popularFiltroUnidadeHorasValidadas() {
    const elUnidade = document.getElementById('relatorio-hv-unidade');
    if (!elUnidade) return;
    
    let unidades = [];
    if (typeof unidadesCache !== 'undefined' && unidadesCache.length > 0) {
        unidades = unidadesCache.map(u => u.nome_unidade.trim().toUpperCase());
    } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.nome_unidade) {
        unidades = [currentUser.nome_unidade.trim().toUpperCase()];
    }
    unidades = [...new Set(unidades)].sort();

    let optionPreSelecionada = obterUnidadePadraoUsuario();
    if (optionPreSelecionada) optionPreSelecionada = optionPreSelecionada.trim().toUpperCase();

    if (unidades.length === 1) {
        const u = unidades[0];
        elUnidade.innerHTML = `<option value="${u}" selected>${u}</option>`;
        elUnidade.disabled = true;
    } else if (unidades.length > 1) {
        elUnidade.innerHTML = '<option value="">SELECIONE UMA UNIDADE...</option>' + 
            unidades.map(u => `<option value="${u}" ${u === optionPreSelecionada ? 'selected' : ''}>${u}</option>`).join('');
        elUnidade.disabled = false;
    } else {
        elUnidade.innerHTML = '<option value="">NENHUMA UNIDADE ENCONTRADA</option>';
        elUnidade.disabled = true;
    }
}
"""

js_content = re.sub(old_func_pattern, new_func, js_content, flags=re.DOTALL)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
