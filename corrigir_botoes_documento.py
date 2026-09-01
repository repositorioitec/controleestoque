import re

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

modal_html = """
    <!-- MODAL: VISUALIZAR DOCUMENTO -->
    <div class="modal-overlay hidden" id="modal-visualizar-documento">
        <div class="modal-content" style="max-width: 900px; width: 95%; height: 90vh; display: flex; flex-direction: column;">
            <div class="modal-header">
                <h2 id="visualizar-doc-titulo" style="text-transform: uppercase;">Visualizar Documento</h2>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary" id="btn-imprimir-doc-modal"><i class="fa-solid fa-print"></i> Imprimir</button>
                    <button class="btn-close" onclick="fecharModal('modal-visualizar-documento')" style="margin-left: 10px;"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="modal-body" style="flex: 1; padding: 0;">
                <iframe id="iframe-visualizar-doc" style="width: 100%; height: 100%; border: none;"></iframe>
            </div>
        </div>
    </div>
"""

# Append the modal right before the closing body tag
content = content.replace('</body>', modal_html + '\n</body>')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)


js_path = 'c:/ControleEstoques - Ambiente Testes/public/js/main.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

# Make the exclude button unconditionally visible
js_content = js_content.replace(
    "${isAdmin() ? `<button class=\"btn btn-icon text-danger\" title=\"Excluir\" onclick=\"excluirDocumento(${doc.id_documento})\"><i class=\"fa-solid fa-trash\"></i></button>` : ''}",
    "<button class=\"btn btn-icon text-danger\" title=\"Excluir\" onclick=\"excluirDocumento(${doc.id_documento})\"><i class=\"fa-solid fa-trash\"></i></button>"
)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Updated successfully.')
