require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('ERRO: DATABASE_URL nao definida no .env');
  process.exit(1);
}

const masked = url.replace(/:([^:@/]+)@/, ':***@');
console.log('DATABASE_URL:', masked);

const pool = new Pool({
  connectionString: url,
  connectionTimeoutMillis: 15000
});

pool.query('SELECT NOW() as now, current_database() as db')
  .then(r => {
    console.log('CONEXAO OK:', JSON.stringify(r.rows[0]));
    return pool.end();
  })
  .catch(e => {
    console.error('CONEXAO FALHOU:');
    console.error('  code:', e.code);
    console.error('  message:', e.message);
    pool.end().finally(() => process.exit(1));
  });
