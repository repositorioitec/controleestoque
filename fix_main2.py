import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# Restore the base state by stripping the duplicate logic
content = re.sub(
    r"document\.getElementById\('estagio-status'\)\.value = 'Em andamento';[\s\S]*?(?=document\.getElementById\('estagio-aluno'\)|document\.getElementById\('modal-estagio-title'\))",
    "document.getElementById('estagio-status').value = 'Em andamento';\n    ",
    content
)

# Now, we carefully inject the logic where it belongs.
# We will find `function abrirModalLancamentoEstagio()` block
def insert_abrir(match):
    original = match.group(0)
    return original.replace(
        "document.getElementById('estagio-status').value = 'Em andamento';",
        "document.getElementById('estagio-status').value = 'Em andamento';\n    const cbAnaliseNew = document.getElementById('estagio-aguardando-analise');\n    if (cbAnaliseNew) cbAnaliseNew.checked = false;"
    )

content = re.sub(r'function abrirModalLancamentoEstagio\(\)[\s\S]*?(?=function )', insert_abrir, content)

# We find `function editarLancamentoEstagio(id)` block
def insert_editar(match):
    original = match.group(0)
    return original.replace(
        "document.getElementById('estagio-status').value = 'Em andamento';",
        "document.getElementById('estagio-status').value = 'Em andamento';\n    const cbAnaliseEdit = document.getElementById('estagio-aguardando-analise');\n    if (cbAnaliseEdit) cbAnaliseEdit.checked = l.aguardando_analise || false;"
    )

content = re.sub(r'async function editarLancamentoEstagio\(id\)[\s\S]*?(?=function )', insert_editar, content)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
