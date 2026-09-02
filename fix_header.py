import codecs

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'

with codecs.open(p, 'r', 'utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if i == 3445:  # This is line 3446 (0-indexed)
        new_lines.append('    <div class="header">\n')
        new_lines.append('        <div>\n')
        new_lines.append('            <h1>📋 Relatório de Estoque Atual</h1>\n')
        new_lines.append('            <small style="color: #64748b;">Sistema de Controle de Estoques - ITEC</small>\n')
        new_lines.append('        </div>\n')
        new_lines.append('        <div class="meta">\n')
        new_lines.append('            <strong>Gerado em:</strong> ${now}<br>\n')
        new_lines.append('            <strong>Usuário:</strong> ${currentUser ? currentUser.nome_usuario : \'Sistema\'}\n')
        new_lines.append('        </div>\n')
        new_lines.append('    </div>\n')
        new_lines.append('\n')
        new_lines.append('    <div class="filter-box" style="display: block; width: 100%; clear: both;">\n')
        new_lines.append('        🔎 <strong>Filtros Aplicados:</strong> ${filtrosHtml}\n')
        new_lines.append('    </div>\n')
        new_lines.append('\n')
        new_lines.append('    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: block; width: 300px;">\n')
        new_lines.append('        <small style="color: #059669; font-weight: 600; text-transform: uppercase; font-size: 11px;">Valor Total em Estoque</small>\n')
        new_lines.append('        <h4 style="margin: 4px 0 0 0; font-size: 18px; color: #064e3b;">${valorTotalEstoque}</h4>\n')
        new_lines.append('    </div>\n')
        skip = True
    elif skip and i <= 3456: # Lines 3447 to 3457
        continue
    else:
        new_lines.append(line)

with codecs.open(p, 'w', 'utf-8') as f:
    f.writelines(new_lines)
