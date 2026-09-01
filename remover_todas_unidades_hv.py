import re

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<option value="">TODAS AS UNIDADES</option>', '<option value="">SELECIONE UMA UNIDADE...</option>')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

js_content = js_content.replace('<option value="">TODAS AS UNIDADES</option>', '<option value="">SELECIONE UMA UNIDADE...</option>')

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
