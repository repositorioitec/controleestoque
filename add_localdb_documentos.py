import codecs
import re

main_path = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(main_path, 'r', 'utf-8', errors='ignore') as f:
    text = f.read()

# 1. Add gh_documentos to init()
init_target = """        if (!localStorage.getItem('gh_fornecedores')) {
            localStorage.setItem('gh_fornecedores', JSON.stringify(["""
init_replacement = """        if (!localStorage.getItem('gh_documentos')) {
            localStorage.setItem('gh_documentos', JSON.stringify([]));
        }
        if (!localStorage.getItem('gh_fornecedores')) {
            localStorage.setItem('gh_fornecedores', JSON.stringify(["""

if "gh_documentos" not in text:
    text = text.replace(init_target, init_replacement)

# 2. Add /api/documentos to dispatch()
dispatch_target = """        return { success: false, message: 'Rota no encontrada' };
    }
};"""
# Note: we use regular match for dispatch_target because of encoding issues, let's just find "return { success: false, message: 'Rota "
dispatch_target_clean = text[text.find("return { success: false, message: 'Rota"):text.find("};\n", text.find("return { success: false, message: 'Rota")) + 2]

dispatch_replacement = """        // --- DOCUMENTOS ---
        if (path === '/api/documentos' && method === 'GET') {
            let docs = this.get('documentos');
            const curso = params.get('curso');
            if (curso) docs = docs.filter(d => d.curso === curso);
            return { success: true, documentos: docs };
        }
        if (path === '/api/documentos' && method === 'POST') {
            const docs = this.get('documentos');
            const novo = {
                id_documento: Date.now(),
                curso: body.curso,
                tipo_documento: body.tipo_documento,
                nome_arquivo: body.nome_arquivo,
                tipo_mime: body.tipo_mime,
                dados_arquivo: body.dados_arquivo,
                data_inclusao: new Date().toISOString()
            };
            docs.push(novo);
            this.set('documentos', docs);
            return { success: true, message: 'Documento salvo offline' };
        }
        if (path.match(/\/api\/documentos\/\d+/) && method === 'GET') {
            const id = parseInt(path.split('/')[3]);
            const docs = this.get('documentos');
            const doc = docs.find(d => d.id_documento === id);
            if (doc) return { success: true, documento: doc };
            return { success: false, message: 'Documento não encontrado' };
        }
        if (path.match(/\/api\/documentos\/\d+/) && method === 'DELETE') {
            const id = parseInt(path.split('/')[3]);
            let docs = this.get('documentos');
            docs = docs.filter(d => d.id_documento !== id);
            this.set('documentos', docs);
            return { success: true, message: 'Documento excluído' };
        }

""" + dispatch_target_clean

if "if (path === '/api/documentos' && method === 'GET')" not in text:
    text = text.replace(dispatch_target_clean, dispatch_replacement)

with codecs.open(main_path, 'w', 'utf-8') as f:
    f.write(text)

print("Injected LocalDB documents endpoints!")
