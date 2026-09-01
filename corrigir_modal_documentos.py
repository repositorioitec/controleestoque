import re

file_path = 'c:/ControleEstoques - Ambiente Testes/public/index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the filter in view-documentos
old_filter_options = r'<select id="filtro-documento-curso"([^>]+)>.*?</select>'
new_filter_options = '''<select id="filtro-documento-curso"\\1>
                                <option value="">SELECIONE UM CURSO...</option>
                                <option value="TECNICO EM ANALISES CLINICAS">TECNICO EM ANALISES CLINICAS</option>
                                <option value="TECNICO EM ENFERMAGEM">TECNICO EM ENFERMAGEM</option>
                                <option value="TECNICO EM RADIOLOGIA">TECNICO EM RADIOLOGIA</option>
                            </select>'''
content = re.sub(old_filter_options, new_filter_options, content, flags=re.DOTALL)

# 2. Update the modal class
content = content.replace('<div class="modal hidden" id="modal-upload-documento">', '<div class="modal-overlay hidden" id="modal-upload-documento">')

# 3. Update the filter in the modal
old_modal_options = r'<select id="upload-doc-curso"([^>]+)>.*?</select>'
new_modal_options = '''<select id="upload-doc-curso"\\1>
                            <option value="">Selecione...</option>
                            <option value="TECNICO EM ANALISES CLINICAS">TECNICO EM ANALISES CLINICAS</option>
                            <option value="TECNICO EM ENFERMAGEM">TECNICO EM ENFERMAGEM</option>
                            <option value="TECNICO EM RADIOLOGIA">TECNICO EM RADIOLOGIA</option>
                        </select>'''
content = re.sub(old_modal_options, new_modal_options, content, flags=re.DOTALL)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated successfully.')
