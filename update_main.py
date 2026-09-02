import codecs

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# 1. Update abrirModalLancamentoEstagio to reset the checkbox
content = content.replace(
    "document.getElementById('estagio-status').value = 'Em andamento';",
    "document.getElementById('estagio-status').value = 'Em andamento';\n    const checkboxAnalise = document.getElementById('estagio-aguardando-analise');\n    if (checkboxAnalise) checkboxAnalise.checked = false;"
)

# 2. Update salvarLancamentoEstagio payload
content = content.replace(
    "horas_evento: 0,",
    "horas_evento: 0,\n        aguardando_analise: document.getElementById('estagio-aguardando-analise') ? document.getElementById('estagio-aguardando-analise').checked : false,"
)

# 3. Update editarLancamentoEstagio to load the checkbox value
content = content.replace(
    "document.getElementById('estagio-status').value = 'Em andamento';",
    "document.getElementById('estagio-status').value = 'Em andamento';\n    const checkboxAnalise = document.getElementById('estagio-aguardando-analise');\n    if (checkboxAnalise) checkboxAnalise.checked = l.aguardando_analise || false;"
)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
