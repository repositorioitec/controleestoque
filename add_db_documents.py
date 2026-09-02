import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\src\database.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# 1. ADD TABLE TO INIT_DB
table_sql = """
            CREATE TABLE IF NOT EXISTS tbl_documentos (
                id_documento SERIAL PRIMARY KEY,
                curso VARCHAR(100) NOT NULL,
                tipo_documento VARCHAR(100) NOT NULL,
                nome_arquivo VARCHAR(255) NOT NULL,
                tipo_mime VARCHAR(100),
                dados_arquivo TEXT NOT NULL,
                data_inclusao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
"""
# Insert after tbl_movimentacoes creation if it doesn't exist
if "tbl_documentos" not in content:
    content = re.sub(
        r"(CREATE TABLE IF NOT EXISTS tbl_movimentacoes.*?;\n)",
        r"\1" + table_sql,
        content,
        flags=re.DOTALL
    )

# 2. ADD FUNCTIONS
funcs = """
async function documentos_salvar(doc) {
    const query = `
        INSERT INTO tbl_documentos (curso, tipo_documento, nome_arquivo, tipo_mime, dados_arquivo)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
    const values = [doc.curso, doc.tipo_documento, doc.nome_arquivo, doc.tipo_mime, doc.dados_arquivo];
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function documentos_listar(curso) {
    // Não retornamos dados_arquivo na listagem para não sobrecarregar a rede
    let query = `
        SELECT id_documento, curso, tipo_documento, nome_arquivo, tipo_mime, data_inclusao
        FROM tbl_documentos
    `;
    let values = [];
    if (curso) {
        query += ` WHERE curso = $1`;
        values.push(curso);
    }
    query += ` ORDER BY data_inclusao DESC`;
    const { rows } = await pool.query(query, values);
    return rows;
}

async function documentos_obter_arquivo(id) {
    const { rows } = await pool.query(`SELECT * FROM tbl_documentos WHERE id_documento = $1`, [id]);
    return rows[0];
}

async function documentos_excluir(id) {
    await pool.query(`DELETE FROM tbl_documentos WHERE id_documento = $1`, [id]);
    return true;
}

module.exports = {
"""

if "documentos_salvar" not in content:
    content = content.replace("module.exports = {", funcs)
    
    # Export them
    exports_add = """    documentos_salvar,
    documentos_listar,
    documentos_obter_arquivo,
    documentos_excluir,
"""
    content = content.replace("module.exports = {\n", "module.exports = {\n" + exports_add)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
