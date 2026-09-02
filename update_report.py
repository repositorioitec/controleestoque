import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# 1. Update gerarRelatorioHorasAluno to count aguardando analise and paint row
content = content.replace(
    "let totalHoras = 0, totalCampo = 0, totalCapacitacao = 0, totalLaboratorio = 0, totalEvento = 0;",
    "let totalHoras = 0, totalCampo = 0, totalCapacitacao = 0, totalLaboratorio = 0, totalEvento = 0;\n    let aguardandoAnaliseCount = 0;"
)

content = content.replace(
    "totalEvento += hEvento;",
    "totalEvento += hEvento;\n\n        let rowStyle = '';\n        if (l.aguardando_analise) {\n            rowStyle = 'background-color: #fee2e2;';\n            aguardandoAnaliseCount++;\n        }"
)

content = content.replace(
    "<tr>\n                <td>${dataFormatada}</td>",
    "<tr style=\"${rowStyle}\">\n                <td>${dataFormatada}</td>"
)

# 2. Add legend to footer if aguardandoAnaliseCount > 0
footer_target = "        </tr>\n    `;"
footer_replacement = """        </tr>
    `;
    
    if (aguardandoAnaliseCount > 0) {
        tfoot.innerHTML += `
            <tr>
                <td colspan="9" style="text-align: left; color: #dc2626; font-size: 11px; padding: 6px 12px; background: #fff;">
                    <i class="fa-solid fa-circle-info"></i> Existem <strong>${aguardandoAnaliseCount}</strong> lançamento(s) aguardando retorno/análise do aluno, destacados em vermelho.
                </td>
            </tr>
        `;
    }"""
content = content.replace(footer_target, footer_replacement)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
