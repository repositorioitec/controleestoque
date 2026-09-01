import re

js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

# Call the function inside iniciarAplicacao()
if "carregarDataAtualizacaoBanco();" not in js_content:
    js_content = js_content.replace(
        "resetInatividadeTimer();",
        "resetInatividadeTimer();\n    carregarDataAtualizacaoBanco();"
    )

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
