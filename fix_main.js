const fs = require('fs');

let content = fs.readFileSync('public/js/main.js', 'utf8');

const regex = /\}\s*const result = await safeFetch\('\/api\/fornecedores', \{[\s\S]*?body: JSON\.stringify\(payload\)[\s\S]*?\}\);/;

const replacement = `}

async function salvarFornecedor(event) {
    event.preventDefault();
    const payload = {
        nome_fornecedor: document.getElementById('forn-nome').value.trim(),
        razao_reduzida: document.getElementById('forn-razao-reduzida') ? document.getElementById('forn-razao-reduzida').value.trim() : '',
        cnpj_cpf: document.getElementById('forn-cnpj').value.trim(),
        telefone: document.getElementById('forn-tel').value.trim(),
        email: document.getElementById('forn-email').value.trim(),
        cep: document.getElementById('forn-cep') ? document.getElementById('forn-cep').value.trim() : '',
        endereco: document.getElementById('forn-endereco') ? document.getElementById('forn-endereco').value.trim() : '',
        numero: document.getElementById('forn-numero') ? document.getElementById('forn-numero').value.trim() : '',
        complemento: document.getElementById('forn-complemento') ? document.getElementById('forn-complemento').value.trim() : '',
        bairro: document.getElementById('forn-bairro') ? document.getElementById('forn-bairro').value.trim() : '',
        cidade: document.getElementById('forn-cidade') ? document.getElementById('forn-cidade').value.trim() : '',
        estado: document.getElementById('forn-estado') ? document.getElementById('forn-estado').value.trim() : ''
    };

    const result = await safeFetch('/api/fornecedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });`;

if (regex.test(content)) {
    const newContent = content.replace(regex, replacement);
    fs.writeFileSync('public/js/main.js', newContent);
    console.log('Fixed main.js!');
} else {
    console.log('Regex did not match.');
}
