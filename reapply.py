import os
import codecs

main_path = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(main_path, 'r', 'utf-8', errors='ignore') as f:
    text = f.read()

# Fix 1: safeFetch Content-Type
old_safefetch = """        if (typeof currentUser !== 'undefined' && currentUser && currentUser.id_usuario) {
            options.headers['X-User-Id'] = currentUser.id_usuario;
            options.headers['X-User-Nivel'] = currentUser.nivel_acesso;
        }"""
new_safefetch = """        if (typeof currentUser !== 'undefined' && currentUser && currentUser.id_usuario) {
            options.headers['X-User-Id'] = currentUser.id_usuario;
            options.headers['X-User-Nivel'] = currentUser.nivel_acesso;
        }
        if (options.body && !(options.body instanceof FormData) && !options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
        }"""
text = text.replace(old_safefetch, new_safefetch)

# Fix 2: Document table column order
old_doc_table = """                        <td>${doc.curso_disciplina || '-'}</td>
                        <td>${doc.tipo_documento}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-file${ext === 'pdf' ? '-pdf' : ext.includes('xls') ? '-excel' : ext.includes('doc') ? '-word' : ''} text-${ext === 'pdf' ? 'danger' : ext.includes('xls') ? 'success' : ext.includes('doc') ? 'primary' : 'secondary'} fa-lg"></i>
                                <span>${doc.nome_arquivo}</span>
                            </div>
                        </td>
                        <td>${formatarDataHora(doc.data_inclusao)}</td>"""

new_doc_table = """                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-file${ext === 'pdf' ? '-pdf' : ext.includes('xls') ? '-excel' : ext.includes('doc') ? '-word' : ''} text-${ext === 'pdf' ? 'danger' : ext.includes('xls') ? 'success' : ext.includes('doc') ? 'primary' : 'secondary'} fa-lg"></i>
                                <span>${doc.nome_arquivo}</span>
                            </div>
                        </td>
                        <td>${doc.curso_disciplina || '-'}</td>
                        <td>${doc.tipo_documento}</td>
                        <td>${formatarDataHora(doc.data_inclusao)}</td>"""

if old_doc_table in text:
    text = text.replace(old_doc_table, new_doc_table)
else:
    print("WARNING: Could not find old_doc_table to replace")

# Fix 3: db-last-update-label in carregarDashboard
old_dash = """                    </tr>
                `).join('');
            }
        }
    } catch (error) {"""
new_dash = """                    </tr>
                `).join('');
            }
            
            const lastUpdateLabel = document.getElementById('db-last-update-label');
            if (lastUpdateLabel) {
                const now = new Date();
                lastUpdateLabel.textContent = `ATUALIZADO: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
            }
        }
    } catch (error) {"""
text = text.replace(old_dash, new_dash)

# Fix 4: Manual Tracking Report + Categories dropdown
old_cat = """        const optionsHtml = categoriasCache.map(c => `<option value="${c.id_categoria}">${c.nome_categoria}</option>`).join('');
        if (selectProdCat) selectProdCat.innerHTML = '<option value="">Selecione...</option>' + optionsHtml;
        if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;"""
new_cat = """        const optionsHtml = categoriasCache.map(c => `<option value="${c.id_categoria}">${c.nome_categoria}</option>`).join('');
        if (selectProdCat) selectProdCat.innerHTML = '<option value="">Selecione...</option>' + optionsHtml;
        if (selectFilterCat) selectFilterCat.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;
        
        const selectFilterManual = document.getElementById('filter-categoria-controle-manual');
        if (selectFilterManual) selectFilterManual.innerHTML = '<option value="">Todas as Categorias</option>' + optionsHtml;"""
text = text.replace(old_cat, new_cat)


report_functions = """
// --- RELATÓRIO CONTROLE MANUAL ---
async function gerarRelatorioControleManual() {
    try {
        const catId = document.getElementById('filter-categoria-controle-manual').value;
        const btn = document.querySelector('button[onclick="gerarRelatorioControleManual()"]');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';

        let url = '/api/produtos';
        const queryParams = [];
        if (selectedUnitId) queryParams.push(`id_unidade=${selectedUnitId}`);
        if (catId) queryParams.push(`id_categoria=${catId}`);
        if (queryParams.length > 0) url += '?' + queryParams.join('&');

        const result = await safeFetch(url);
        
        if (btn) btn.innerHTML = '<i class="fa-solid fa-search"></i> Gerar Planilha';

        if (result.success) {
            let produtos = result.produtos;
            if (catId) {
                produtos = produtos.filter(p => p.id_categoria == catId);
            }
            if (selectedUnitId) {
                produtos = produtos.filter(p => p.id_unidade == selectedUnitId || !p.id_unidade);
            }
            
            produtos = produtos.filter(p => !p.inativo);
            
            const tbody = document.getElementById('table-relatorio-controle-manual-body');
            const divResult = document.getElementById('relatorio-controle-manual-resultado');
            const btnImprimir = document.getElementById('btn-imprimir-controle-manual');

            if (produtos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Nenhum produto encontrado para a categoria selecionada.</td></tr>';
            } else {
                tbody.innerHTML = produtos.map(p => `
                    <tr>
                        <td><strong>${p.nome_produto}</strong></td>
                        <td class="text-center">${p.estoque_atual}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                `).join('');
            }
            
            divResult.style.display = 'block';
            btnImprimir.style.display = 'inline-block';
        }
    } catch (e) {
        console.error('Erro ao gerar controle manual', e);
        alert('Erro ao gerar planilha.');
    }
}

function imprimirRelatorioControleManual() {
    const tableDiv = document.getElementById('relatorio-controle-manual-resultado');
    const categoriaTxt = document.getElementById('filter-categoria-controle-manual').options[document.getElementById('filter-categoria-controle-manual').selectedIndex].text;
    
    const janela = window.open('', '', 'width=900,height=600');
    janela.document.write(`
        <html>
        <head>
            <title>Impressão - Controle Manual de Estoque</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { text-align: center; margin-bottom: 5px; }
                h4 { text-align: center; margin-top: 0; color: #555; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                .text-center { text-align: center; }
                @media print {
                    @page { margin: 1cm; }
                }
            </style>
        </head>
        <body>
            <h2>Controle Manual de Estoque</h2>
            <h4>Categoria: ${categoriaTxt}</h4>
            ${tableDiv.innerHTML}
            <script>
                window.onload = function() { window.print(); window.close(); };
            </script>
        </body>
        </html>
    `);
    janela.document.close();
}
"""

if "gerarRelatorioControleManual" not in text:
    text += report_functions

with codecs.open(main_path, 'w', 'utf-8') as f:
    f.write(text)

print("Applied 4 fixes successfully!")
