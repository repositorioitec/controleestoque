const fs = require('fs');

const path = 'public/js/main.js';
let text = fs.readFileSync(path, 'utf8');

const target = "if (selectFilterCat) selectFilterCat.innerHTML = '<option value=\"\">Todas as Categorias</option>' + optionsHtml;\n    }";
const replacement = `if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;

        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');
        if (selectFilterManual) selectFilterManual.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;
    }`;

// normalize CRLF to LF just for matching, then we keep the output same
const textLf = text.replace(/\r\n/g, '\n');

if (textLf.includes(target)) {
    const newText = textLf.replace(target, replacement);
    fs.writeFileSync(path, newText, 'utf8');
    console.log("Fixed with Node!");
} else {
    console.log("Not found with Node either!");
}
