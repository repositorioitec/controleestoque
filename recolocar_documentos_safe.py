import sys

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

view_injection = """
                <!-- VIEW: DOCUMENTOS -->
                <section id="view-documentos" class="app-view" style="display: none;">
                    <div class="panel">
                        <div class="panel-header" style="flex-wrap: wrap; gap: 12px;">
                            <div>
                                <h3><i class="fa-solid fa-file-pdf text-primary"></i> Documentos (Templates PDF)</h3>
                                <small style="color: var(--text-muted);">Gerencie os templates de documentos por curso</small>
                            </div>
                            <div class="action-buttons">
                                <button class="btn btn-primary admin-only" onclick="abrirModalUploadDocumento()">
                                    <i class="fa-solid fa-upload"></i> Enviar Documento
                                </button>
                            </div>
                        </div>

                        <div class="search-bar" style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap; background: var(--bg-color); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <select id="filtro-documento-curso" class="form-control" onchange="filtrarDocumentos()" style="flex: 1; min-width: 200px;">
                                <option value="">SELECIONE UM CURSO...</option>
                                <option value="ADMINISTRAÇÃO">ADMINISTRAÇÃO</option>
                                <option value="ENFERMAGEM">ENFERMAGEM</option>
                                <option value="MECÂNICA">MECÂNICA</option>
                                <option value="ELETROMECÂNICA">ELETROMECÂNICA</option>
                                <option value="AUTOMAÇÃO">AUTOMAÇÃO</option>
                                <option value="LOGÍSTICA">LOGÍSTICA</option>
                                <option value="SEGURANÇA DO TRABALHO">SEGURANÇA DO TRABALHO</option>
                            </select>
                        </div>

                        <div class="table-responsive" style="margin-top: 20px;">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Nome do Arquivo</th>
                                        <th>Tipo</th>
                                        <th>Curso</th>
                                        <th>Data Upload</th>
                                        <th class="text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="table-documentos-body">
                                    <tr><td colspan="5" class="text-center text-muted">Selecione um curso para ver os documentos.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
"""

# Find the last closing section inside content-body
split_content = content.split('</main>')
if len(split_content) > 1:
    before_main = split_content[0]
    # find the last </div> before </main>
    last_div_index = before_main.rfind('</div>')
    if last_div_index != -1:
        # Insert just before the last </div>
        new_before_main = before_main[:last_div_index] + view_injection + '\n' + before_main[last_div_index:]
        content = new_before_main + '</main>' + split_content[1]
    
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Documentos injetado corretamente!")
