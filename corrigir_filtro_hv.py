import re

js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

# Replace the existing popularFiltroUnidadeHorasValidadas function
old_func_pattern = r'function popularFiltroUnidadeHorasValidadas\(\) \{.*?\}\n'
new_func = """function popularFiltroUnidadeHorasValidadas() {
    const elUnidade = document.getElementById('relatorio-hv-unidade');
    if (!elUnidade) return;
    
    // Pegar todas as unidades do cache global
    const unidades = (typeof unidadesCache !== 'undefined' ? unidadesCache.map(u => u.nome_unidade.trim().toUpperCase()) : []).sort();
    
    let unidadesDisponiveis = unidades;
    const globalUnit = getGlobalSelectedUnitName();
    if (globalUnit) {
        unidadesDisponiveis = [globalUnit.trim().toUpperCase()];
    } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.nivel_acesso !== 'Administrador' && currentUser.nome_unidade) {
        unidadesDisponiveis = [currentUser.nome_unidade.trim().toUpperCase()];
    }

    if (unidadesDisponiveis.length === 1) {
        elUnidade.innerHTML = `<option value="${unidadesDisponiveis[0]}">${unidadesDisponiveis[0]}</option>`;
        elUnidade.disabled = true;
    } else if (unidadesDisponiveis.length > 1) {
        elUnidade.innerHTML = '<option value="">SELECIONE UMA UNIDADE...</option>' + 
            unidadesDisponiveis.map(u => `<option value="${u}">${u}</option>`).join('');
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
