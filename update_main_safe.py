import codecs

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# Replace the specific occurrences carefully.
# In `abrirModalLancamentoEstagio`
import re
def insert_abrir(match):
    original = match.group(0)
    return original.replace(
        "document.getElementById('estagio-status').value = 'Em andamento';",
        "document.getElementById('estagio-status').value = 'Em andamento';\n    const cbAnaliseNew = document.getElementById('estagio-aguardando-analise');\n    if (cbAnaliseNew) cbAnaliseNew.checked = false;"
    )
content = re.sub(r'function abrirModalLancamentoEstagio\(\)[\s\S]*?(?=function )', insert_abrir, content)

def insert_editar(match):
    original = match.group(0)
    return original.replace(
        "document.getElementById('estagio-status').value = 'Em andamento';",
        "document.getElementById('estagio-status').value = 'Em andamento';\n    const cbAnaliseEdit = document.getElementById('estagio-aguardando-analise');\n    if (cbAnaliseEdit) cbAnaliseEdit.checked = l.aguardando_analise || false;"
    )
content = re.sub(r'async function editarLancamentoEstagio\(id\)[\s\S]*?(?=function )', insert_editar, content)

content = content.replace(
    "horas_evento: 0,",
    "horas_evento: 0,\n        aguardando_analise: document.getElementById('estagio-aguardando-analise') ? document.getElementById('estagio-aguardando-analise').checked : false,"
)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
