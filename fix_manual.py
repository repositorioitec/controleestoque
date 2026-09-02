import codecs

main_path = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(main_path, 'r', 'utf-8', errors='ignore') as f:
    text = f.read()

target = "        if (selectFilterCat) selectFilterCat.innerHTML = '<option value=\"\">Todas as Categorias</option>' + optionsHtml;\n    }"
replacement = """        if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;

        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');
        if (selectFilterManual) selectFilterManual.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;
    }"""

if target in text:
    text = text.replace(target, replacement)
    with codecs.open(main_path, 'w', 'utf-8') as f:
        f.write(text)
    print("Fixed!")
else:
    print("Target not found!")
