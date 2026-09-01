import re

# 1. Update index.html
html_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

# Locate the sidebar-logo and replace it with the new structure including the label
old_logo_html = """                <div class="sidebar-logo">
                    <i class="fa-solid fa-boxes-stacked"></i>
                    <span>Gestão Operacional</span>
                </div>"""

new_logo_html = """                <div class="sidebar-logo" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        <span>Gestão Operacional</span>
                    </div>
                    <span id="db-last-update-label" style="font-size: 9px; font-weight: 500; color: var(--text-muted); text-transform: uppercase;">ATUALIZADO: CARREGANDO...</span>
                </div>"""

html_content = html_content.replace(old_logo_html, new_logo_html)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_content)


# 2. Update main.js
js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

# Add the new function to fetch the date
fetch_function = """
async function carregarDataAtualizacaoBanco() {
    const el = document.getElementById('db-last-update-label');
    if (!el) return;
    try {
        const res = await safeFetch('/api/db-last-update');
        if (res.success && res.time) {
            const dateObj = new Date(res.time);
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            el.innerText = `ATUALIZADO: ${dateStr} ${timeStr}`;
        } else {
            el.innerText = 'ATUALIZADO: N/D';
        }
    } catch (e) {
        el.innerText = 'ATUALIZADO: ERRO';
    }
}
"""

if "carregarDataAtualizacaoBanco" not in js_content:
    js_content += fetch_function

# Call the function inside iniciarAplicacao()
js_content = js_content.replace(
    "startInactivityTimer();\n    \n    // Remove admin items if not admin",
    "startInactivityTimer();\n    carregarDataAtualizacaoBanco();\n    \n    // Remove admin items if not admin"
)

# Since I don't know the exact lines after startInactivityTimer, let's just append it before applying permissions
# Or just replace a known string inside iniciarAplicacao
js_content = js_content.replace(
    "aplicarPermissoesDeAcesso();",
    "aplicarPermissoesDeAcesso();\n    carregarDataAtualizacaoBanco();"
)


with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
