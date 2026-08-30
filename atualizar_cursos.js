const dotenv = require('dotenv');
dotenv.config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("DATABASE_URL não configurada!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: url.trim()
});

async function run() {
  try {
    const client = await pool.connect();
    console.log("Conectado ao banco de dados.");
    
    // Consulta registros antes
    const checkRes = await client.query(`
      SELECT DISTINCT curso FROM tbl_estagios_lancamentos
    `);
    console.log("Cursos existentes atualmente:", checkRes.rows);

    const updateRes = await client.query(`
      UPDATE tbl_estagios_lancamentos
      SET curso = 'Tecnico em Enfermagem'
      WHERE LOWER(curso) = 'tecnico de enfermagem' 
         OR LOWER(curso) = 'técnico de enfermagem' 
         OR LOWER(curso) = 'tecnicos de enfermagem'
         OR LOWER(curso) = 'técnicos de enfermagem'
         OR LOWER(curso) LIKE '%tecnico%de%enfermagem%'
         OR LOWER(curso) LIKE '%técnico%de%enfermagem%';
    `);
    
    console.log(`Sucesso! ${updateRes.rowCount} registros atualizados para 'Tecnico em Enfermagem'.`);
    
    const afterRes = await client.query(`
      SELECT DISTINCT curso FROM tbl_estagios_lancamentos
    `);
    console.log("Cursos após atualização:", afterRes.rows);

    client.release();
    await pool.end();
  } catch (err) {
    console.error("Erro ao atualizar banco:", err);
  }
}

run();
