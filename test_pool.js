require('dotenv').config();
const { Pool } = require('pg');

const baseUrl = process.env.DATABASE_URL;

function buildPoolConfig(label) {
  let connectionString = baseUrl;
  if (label === 'pgbouncer') {
    connectionString += connectionString.includes('?') ? '&pgbouncer=true' : '?pgbouncer=true';
  }

  const config = {
    connectionString,
    connectionTimeoutMillis: 20000
  };

  if (connectionString.includes('supabase.co') || connectionString.includes('supabase.com')) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

async function test(label) {
  const pool = new Pool(buildPoolConfig(label));
  try {
    for (let i = 0; i < 5; i++) {
      await pool.query('SELECT $1::int AS n', [i]);
    }
    console.log(`${label}: OK`);
  } catch (e) {
    console.log(`${label}: FAIL`, e.code, e.message);
  } finally {
    await pool.end();
  }
}

(async () => {
  await test('default');
  await test('pgbouncer');
})();
