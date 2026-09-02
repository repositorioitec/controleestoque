import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\server.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

api_docs = """
// ==========================================
// DOCUMENTOS API
// ==========================================
app.get('/api/documentos', async (req, res) => {
    try {
        const docs = await db.documentos_listar(req.query.curso);
        res.json({ success: true, documentos: docs });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/documentos', async (req, res) => {
    try {
        const { curso, tipo_documento, nome_arquivo, tipo_mime, dados_arquivo } = req.body;
        if (!curso || !tipo_documento || !nome_arquivo || !dados_arquivo) {
            return res.status(400).json({ success: false, message: 'Faltam dados obrigatórios.' });
        }
        await db.documentos_salvar(req.body);
        res.json({ success: true, message: 'Documento salvo com sucesso!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Erro ao salvar documento: ' + e.message });
    }
});

app.get('/api/documentos/:id', async (req, res) => {
    try {
        const doc = await db.documentos_obter_arquivo(req.params.id);
        if (doc) {
            res.json({ success: true, documento: doc });
        } else {
            res.status(404).json({ success: false, message: 'Documento não encontrado.' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.delete('/api/documentos/:id', async (req, res) => {
    try {
        await db.documentos_excluir(req.params.id);
        res.json({ success: true, message: 'Documento excluído com sucesso.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

"""

if "/api/documentos" not in content:
    # Insert before the catch-all error handler or listen
    content = re.sub(
        r"(app\.listen\()",
        api_docs + r"\n\1",
        content
    )

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
