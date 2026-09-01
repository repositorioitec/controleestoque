import sys

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Insert Menu Item
menu_injection = """                            <li class="nav-item" data-target="view-documentos" data-menu-key="documentos">
                                <a href="#"><i class="fa-solid fa-file-pdf"></i> <span>Documentos</span></a>
                            </li>
"""
content = content.replace('<!-- Submenu Relatórios de Estágios -->', menu_injection + '                            <!-- Submenu Relatórios de Estágios -->')

# 2. Insert View Section
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
content = content.replace('</main>', view_injection + '\n        </main>')

# 3. Insert Modal
modal_injection = """
    <!-- MODAL: UPLOAD DOCUMENTO -->
    <div class="modal hidden" id="modal-upload-documento">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fa-solid fa-upload"></i> Enviar Documento</h2>
                <button class="btn-close" onclick="fecharModal('modal-upload-documento')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <form id="form-upload-documento" onsubmit="event.preventDefault(); salvarDocumento();">
                    <div class="form-group">
                        <label for="upload-doc-curso">Curso</label>
                        <select id="upload-doc-curso" class="form-control" required>
                            <option value="">Selecione...</option>
                            <option value="ADMINISTRAÇÃO">ADMINISTRAÇÃO</option>
                            <option value="ENFERMAGEM">ENFERMAGEM</option>
                            <option value="MECÂNICA">MECÂNICA</option>
                            <option value="ELETROMECÂNICA">ELETROMECÂNICA</option>
                            <option value="AUTOMAÇÃO">AUTOMAÇÃO</option>
                            <option value="LOGÍSTICA">LOGÍSTICA</option>
                            <option value="SEGURANÇA DO TRABALHO">SEGURANÇA DO TRABALHO</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="upload-doc-tipo">Tipo de Documento</label>
                        <input type="text" id="upload-doc-tipo" class="form-control" placeholder="Ex: Termo de Compromisso" required>
                    </div>
                    <div class="form-group">
                        <label for="upload-doc-arquivo">Arquivo (Somente PDF)</label>
                        <input type="file" id="upload-doc-arquivo" class="form-control" accept="application/pdf" required>
                    </div>
                    <div class="form-actions" style="margin-top: 20px; text-align: right;">
                        <button type="button" class="btn btn-secondary" onclick="fecharModal('modal-upload-documento')">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Salvar Documento</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
"""
content = content.replace('</body>', modal_injection + '\n</body>')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Documentos injetados com sucesso!")
