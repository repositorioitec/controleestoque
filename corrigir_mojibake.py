import re

js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

# Fix "Imprimir / Salvar PDF"
js_content = re.sub(r'<button([^>]*)>[^<a-zA-Z]*Imprimir / Salvar PDF</button>', r'<button\1>Imprimir / Salvar PDF</button>', js_content)

# Fix "Baixar Excel"
js_content = re.sub(r'<button([^>]*)>[^<a-zA-Z]*Baixar Excel</button>', r'<button\1>Baixar Excel</button>', js_content)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
