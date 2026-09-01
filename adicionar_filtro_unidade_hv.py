import re

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Unidade filter to view-estagios-relatorio-horas-validadas
html_injection = """                            <div class="form-group" style="margin:0; min-width: 180px;">
                                <label for="relatorio-hv-data-fim" style="font-size: 12px;"><i class="fa-solid fa-calendar-day"></i> VALIDAÇÃO ATÉ</label>
                                <input type="date" id="relatorio-hv-data-fim" class="form-control">
                            </div>
                            <!-- NOVO FILTRO DE UNIDADE -->
                            <div class="form-group" style="margin:0; min-width: 200px;">
                                <label for="relatorio-hv-unidade" style="font-size: 12px;"><i class="fa-solid fa-building"></i> UNIDADE</label>
                                <select id="relatorio-hv-unidade" class="form-control">
                                    <option value="">TODAS AS UNIDADES</option>
                                </select>
                            </div>"""

content = content.replace('''                            <div class="form-group" style="margin:0; min-width: 180px;">
                                <label for="relatorio-hv-data-fim" style="font-size: 12px;"><i class="fa-solid fa-calendar-day"></i> VALIDAÇÃO ATÉ</label>
                                <input type="date" id="relatorio-hv-data-fim" class="form-control">
                            </div>''', html_injection)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

# 2. Add logic to populate the dropdown in carregarHorasValidadas or carregarFiltrosHorasValidadas
# Since it's easier, I'll add a helper function and call it right before gerarRelatorioHorasValidadas()
js_helper = """
function popularFiltroUnidadeHorasValidadas() {
    const elUnidade = document.getElementById('relatorio-hv-unidade');
    if (!elUnidade) return;
    
    const unidades = [...new Set(estagiosCache.map(l => (l.unidade || '').trim().toUpperCase()).filter(Boolean))].sort();
    
    let unidadesDisponiveis = unidades;
    const globalUnit = getGlobalSelectedUnitName();
    if (globalUnit) {
        unidadesDisponiveis = [globalUnit.trim().toUpperCase()];
    } else if (currentUser && currentUser.nivel_acesso !== 'Administrador' && currentUser.nome_unidade) {
        unidadesDisponiveis = [currentUser.nome_unidade.trim().toUpperCase()];
    }

    if (unidadesDisponiveis.length <= 1) {
        elUnidade.innerHTML = unidadesDisponiveis.map(u => `<option value="${u}">${u}</option>`).join('');
        elUnidade.disabled = true;
    } else {
        elUnidade.innerHTML = '<option value="">TODAS AS UNIDADES</option>' + 
            unidadesDisponiveis.map(u => `<option value="${u}">${u}</option>`).join('');
        elUnidade.disabled = false;
    }
}
"""

js_content = js_content.replace('gerarRelatorioHorasValidadas();\n        }\n    } catch (e)', 'popularFiltroUnidadeHorasValidadas();\n            gerarRelatorioHorasValidadas();\n        }\n    } catch (e)')
if "popularFiltroUnidadeHorasValidadas" not in js_content:
    js_content += js_helper

# 3. Add the filter logic in gerarRelatorioHorasValidadas
js_content = js_content.replace(
    "const dataFim = document.getElementById('relatorio-hv-data-fim').value;",
    "const dataFim = document.getElementById('relatorio-hv-data-fim').value;\n    const unidadeSelecionadaFiltro = (document.getElementById('relatorio-hv-unidade') ? document.getElementById('relatorio-hv-unidade').value : '').trim().toUpperCase();"
)

js_content = js_content.replace(
    ".filter(l => !dataFim || (l.data_validacao || '') <= dataFim)",
    ".filter(l => !dataFim || (l.data_validacao || '') <= dataFim)\n        .filter(l => !unidadeSelecionadaFiltro || (l.unidade || '').trim().toUpperCase() === unidadeSelecionadaFiltro)"
)

# Also clear it in limparRelatorioHorasValidadas
js_content = js_content.replace(
    "document.getElementById('relatorio-hv-data-fim').value = '';",
    "document.getElementById('relatorio-hv-data-fim').value = '';\n    if(document.getElementById('relatorio-hv-unidade')) document.getElementById('relatorio-hv-unidade').value = '';"
)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
