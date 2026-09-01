import sys
file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<option value="">TODAS AS UNIDADES</option>', '')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
