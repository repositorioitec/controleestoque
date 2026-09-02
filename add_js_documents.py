import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\public\js\main.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

js_docs = """
// ==========================================
// DOCUMENTOS API
// ==========================================

function abrirModalUploadDocumento() {
    document.getElementById('form-upload-documento').reset();
    document.getElementById('modal-upload-documento').classList.remove('hidden');
}

async function salvarDocumento() {
    const curso = document.getElementById('upload-doc-curso').value;
    const tipo = document.getElementById('upload-doc-tipo').value;
    const inputArquivo = document.getElementById('upload-doc-arquivo');
    
    if (!curso || !tipo || inputArquivo.files.length === 0) {
        showToast('Preencha todos os campos.', 'warning');
        return;
    }
    
    const file = inputArquivo.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        
        const docData = {
            curso: curso,
            tipo_documento: tipo,
            nome_arquivo: file.name,
            tipo_mime: file.type,
            dados_arquivo: base64Data
        };
        
        const btn = document.querySelector('#form-upload-documento button[type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
        
        const res = await safeFetch('/api/documentos', {
            method: 'POST',
            body: JSON.stringify(docData)
        });
        
        if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar Documento'; }
        
        if (res.success) {
            showToast('Documento salvo!', 'success');
            fecharModal('modal-upload-documento');
            // Atualiza filtro se necessário
            const filtroAtual = document.getElementById('filtro-documento-curso').value;
            if (filtroAtual === curso || !filtroAtual) {
                document.getElementById('filtro-documento-curso').value = curso;
                filtrarDocumentos();
            }
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    };
    
    reader.onerror = function() {
        showToast('Erro ao ler o arquivo.', 'error');
    };
    
    reader.readAsDataURL(file);
}

async function filtrarDocumentos() {
    const curso = document.getElementById('filtro-documento-curso').value;
    const tbody = document.getElementById('table-documentos-body');
    
    if (!curso) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Selecione um curso para ver os documentos.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando documentos... <i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
    
    const res = await safeFetch(`/api/documentos?curso=${encodeURIComponent(curso)}`);
    if (res.success) {
        if (res.documentos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum documento encontrado para este curso.</td></tr>';
            return;
        }
        
        tbody.innerHTML = res.documentos.map(d => `
            <tr>
                <td><strong>${d.nome_arquivo}</strong></td>
                <td>${d.tipo_documento}</td>
                <td>${d.curso}</td>
                <td>${new Date(d.data_inclusao).toLocaleString('pt-BR')}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-primary" onclick="visualizarDocumento(${d.id_documento})" title="Visualizar / Baixar"><i class="fa-solid fa-eye"></i> Visualizar</button>
                    ${currentUser && currentUser.nivel_acesso === 'Administrador' ? 
                      `<button class="btn btn-sm btn-danger" onclick="excluirDocumento(${d.id_documento})" title="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar documentos.</td></tr>';
    }
}

async function visualizarDocumento(id) {
    const res = await safeFetch(`/api/documentos/${id}`);
    if (res.success && res.documento) {
        const doc = res.documento;
        // Verifica se é PDF ou DOCX/XLSX
        if (doc.tipo_mime === 'application/pdf') {
            document.getElementById('visualizar-doc-titulo').innerText = doc.nome_arquivo;
            document.getElementById('iframe-visualizar-doc').src = doc.dados_arquivo;
            document.getElementById('modal-visualizar-documento').classList.remove('hidden');
        } else {
            // Outros arquivos (Word, Excel) forçam o download pois o iframe não consegue renderizar facilmente
            baixarArquivo(doc.dados_arquivo, doc.nome_arquivo);
        }
    } else {
        showToast('Erro ao abrir documento', 'error');
    }
}

function baixarArquivo(base64Data, filename) {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function excluirDocumento(id) {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    
    const res = await safeFetch(`/api/documentos/${id}`, { method: 'DELETE' });
    if (res.success) {
        showToast('Documento excluído!', 'success');
        filtrarDocumentos();
    } else {
        showToast('Erro ao excluir', 'error');
    }
}

"""

if "function salvarDocumento" not in content:
    content = content + "\n" + js_docs

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
