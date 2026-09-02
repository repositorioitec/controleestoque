import os
import re

main_path = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with open(main_path, 'r', encoding='utf-8') as f:
    text = f.read()

diff_lines = open(r'c:\ControleEstoques - Ambiente Testes\raw_diff.txt', 'r', encoding='utf-8').read().split('\n')

chunk_start = -1
for i, l in enumerate(diff_lines):
    if l.startswith('@@ -2380'):
        chunk_start = i
        break
        
deleted = []
for i in range(chunk_start+1, len(diff_lines)):
    l = diff_lines[i]
    if l.startswith('@@ '):
        break
    if l.startswith('-'):
        deleted.append(l[1:])

deleted_text = '\n'.join(deleted)

# the bad block starts with "const optionsHtml = categoriasCache.map(c" and ends with "Todas as Categorias</option>' + optionsHtml;"
start_marker = "const optionsHtml = categoriasCache.map("
end_marker = "Todas as Categorias</option>' + optionsHtml;"

idx_start = text.find(start_marker)
idx_end = text.find(end_marker) + len(end_marker)

while idx_start > 0 and text[idx_start-1] in (' ', '\t'):
    idx_start -= 1

bad_block = text[idx_start:idx_end]
print("Found bad block of len", len(bad_block))

# Now inject the new code into the recovered text
inj_targ = "if (selectFilterCat) selectFilterCat.innerHTML = '<option value=\"\">Todas as Categorias</option>' + optionsHtml;"
inj_repl = inj_targ + "\n        \n        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');\n        if (selectFilterManual) selectFilterManual.innerHTML = '<option value=\"\">Todas as Categorias</option>' + optionsHtml;"

deleted_text = deleted_text.replace(inj_targ, inj_repl)

new_text = text[:idx_start] + deleted_text + text[idx_end:]

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Restored successfully!")
