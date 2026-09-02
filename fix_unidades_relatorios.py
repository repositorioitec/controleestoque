import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# Fix for filters (Relatorio Movimentacoes, Estoque, Sugestao, etc.)
# They all use selectU or similar
def replacer_filter(match):
    return """
        if (currentUser && currentUser.nivel_acesso !== 'Administrador') {
            if (currentUser.unidades_acesso && currentUser.unidades_acesso.length > 0) {
                if (currentUser.unidades_acesso.length > 1) {
                    html = '<option value="">Todas as minhas unidades</option>';
                    selectU.disabled = false;
                } else {
                    html = '';
                    selectU.disabled = true;
                }
                currentUser.unidades_acesso.forEach(un => {
                    html += `<option value="${un.id_unidade}">${un.nome_unidade}</option>`;
                });
            } else {
                html = `<option value="${currentUser.id_unidade}">${currentUser.nome_unidade || 'Sua Unidade'}</option>`;
                selectU.disabled = true;
            }
        } else {
"""

# 1. Movimentacoes
pattern1 = r"if \(currentUser && currentUser\.nivel_acesso !== 'Administrador'\) {\s*html = `<option value=\"\$\{currentUser\.id_unidade\}\">\$\{currentUser\.nome_unidade \|\| 'Sua Unidade'\}<\/option>`;\s*selectU\.disabled = true;\s*} else {"
content = re.sub(pattern1, replacer_filter, content)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
