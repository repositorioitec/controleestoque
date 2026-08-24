const http = require('http');

const postData = JSON.stringify({ usuario: 'admin@itec.com', senha: 'admin123' });

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', data);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('ERRO DE CONEXAO - O servidor NAO esta rodando!:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();
