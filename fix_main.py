import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# Fix the duplicate declaration syntax errors
# 1. find `abrirModalLancamentoEstagio` block and fix the checkbox logic
def fix_abrir_modal(match):
    # Just clear the mess and put a simple reset
    return "document.getElementById('estagio-status').value = 'Em andamento';\n    const cbAnaliseNew = document.getElementById('estagio-aguardando-analise');\n    if (cbAnaliseNew) cbAnaliseNew.checked = false;"

# 2. find `editarLancamentoEstagio` block and fix it
def fix_editar_modal(match):
    return "document.getElementById('estagio-status').value = 'Em andamento';\n    const cbAnaliseEdit = document.getElementById('estagio-aguardando-analise');\n    if (cbAnaliseEdit) cbAnaliseEdit.checked = l.aguardando_analise || false;"

# Use regex to find the blocks specifically
# For abrirModalLancamentoEstagio
content = re.sub(
    r"document\.getElementById\('estagio-status'\)\.value = 'Em andamento';\s*const checkboxAnalise = [^\n]+\n\s*if [^\n]+\n(\s*const checkboxAnalise = [^\n]+\n\s*if [^\n]+\n)?",
    r"document.getElementById('estagio-status').value = 'Em andamento';\n    // Fixed by script\n",
    content
)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
