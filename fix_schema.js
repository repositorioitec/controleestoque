require('dotenv').config();
const { pool } = require('./src/database');

async function fixTable() {
    try {
        console.log("Adding tipo_mime to tbl_documentos...");
        await pool.query(`ALTER TABLE tbl_documentos ADD COLUMN tipo_mime VARCHAR(100);`);
        console.log("Success!");
    } catch (e) {
        console.error("Error (might already exist):", e.message);
    }
    
    try {
        console.log("Renaming arquivo_base64 to dados_arquivo if needed...");
        await pool.query(`ALTER TABLE tbl_documentos RENAME COLUMN arquivo_base64 TO dados_arquivo;`);
        console.log("Success!");
    } catch (e) {
        console.error("Error (might already exist):", e.message);
    }
    
    process.exit(0);
}

fixTable();
