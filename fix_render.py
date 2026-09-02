import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# Fix the renderEstagios error by removing the style from the row, or defining it.
# Actually, the user's requirement was: "deixar a linha completa do relatório de horas por aluno pintada em vermelho".
# That means ONLY in the relatorio, not in the main lancamentos table (which is renderEstagios).
# Let's fix renderEstagios.
def fix_render(match):
    original = match.group(0)
    return original.replace(
        '<tr style="${rowStyle}">',
        '<tr>'
    )
content = re.sub(r'function renderEstagios\(lista\)[\s\S]*?(?=function )', fix_render, content)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
