import re

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_view = '''                <!-- VIEW: DOCUMENTOS -->
                <section id="view-documentos" class="app-view">
                    <div class="panel">
                        <div class="panel-header" style="flex-wrap: wrap; gap: 12px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px; margin-bottom: 15px;">
                            <div>
                                <h3 style="margin: 0; font-size: 18px; text-transform: uppercase;"><i class="fa-solid fa-file-pdf" style="margin-right: 8px; color: #fff;"></i> BIBLIOTECA DE DOCUMENTOS</h3>
                            </div>
                            <div class="action-buttons">
                                <button class="btn btn-primary admin-only" onclick="abrirModalUploadDocumento()" style="background-color: #3b82f6; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 500;">
                                    <i class="fa-solid fa-upload"></i> Incluir Documento
                                </button>
                            </div>
                        </div>

                        <div class="search-bar" style="margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; background: rgba(15, 23, 42, 0.4); padding: 16px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.05);">
                            <label for="filtro-documento-curso" style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin: 0;">CURSO *</label>
                            <select id="filtro-documento-curso" class="form-control" onchange="filtrarDocumentos()" style="width: 100%; max-width: 400px; background-color: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); color: #fff;">
                                <option value="">SELECIONE UM CURSO...</option>
                                <option value="ADMINISTRAÇÃO">ADMINISTRAÇÃO</option>
                                <option value="ENFERMAGEM">ENFERMAGEM</option>
                                <option value="TECNICO EM ENFERMAGEM">TECNICO EM ENFERMAGEM</option>
                                <option value="MECÂNICA">MECÂNICA</option>
                                <option value="ELETROMECÂNICA">ELETROMECÂNICA</option>
                                <option value="AUTOMAÇÃO">AUTOMAÇÃO</option>
                                <option value="LOGÍSTICA">LOGÍSTICA</option>
                                <option value="SEGURANÇA DO TRABALHO">SEGURANÇA DO TRABALHO</option>
                            </select>
                        </div>

                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th style="text-transform: uppercase; font-size: 11px; color: var(--text-muted);">Curso</th>
                                        <th style="text-transform: uppercase; font-size: 11px; color: var(--text-muted);">Tipo de Documento</th>
                                        <th style="text-transform: uppercase; font-size: 11px; color: var(--text-muted);">Nome do Arquivo</th>
                                        <th style="text-transform: uppercase; font-size: 11px; color: var(--text-muted);">Data de Inclusão</th>
                                        <th style="text-transform: uppercase; font-size: 11px; color: var(--text-muted);" class="text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="table-documentos-body">
                                    <tr><td colspan="5" class="text-center text-muted">Selecione um curso para ver os documentos.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>'''

pattern = re.compile(r'<!-- VIEW: DOCUMENTOS -->.*?</section>', re.DOTALL)
content = re.sub(pattern, new_view, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated successfully.')
