import os

main_path = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with open(main_path, 'r', encoding='utf-8') as f:
    current_lines = f.read().split('\n')

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
        
print('Extracted', len(deleted), 'deleted lines')

bad_block = """        const optionsHtml = categoriasCache.map(c => `<option value="${c.id_categoria}">${c.nome_categoria}</option>`).join('');
        if (selectProdCat) selectProdCat.innerHTML = '<option value="">Selecione...</option>' + optionsHtml;
        if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;
        
        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');
        if (selectFilterManual) selectFilterManual.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;"""

current_text = '\n'.join(current_lines)
deleted_text = '\n'.join(deleted)

injection_target = """        const optionsHtml = categoriasCache.map(c => `<option value="${c.id_categoria}">${c.nome_categoria}</option>`).join('');
        if (selectProdCat) selectProdCat.innerHTML = '<option value="">Selecione...</option>' + optionsHtml;
        if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;"""

injection_replacement = injection_target + """
        
        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');
        if (selectFilterManual) selectFilterManual.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;"""

deleted_text = deleted_text.replace(injection_target, injection_replacement)

new_text = current_text.replace(bad_block, deleted_text)

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print('Restored successfully!')
