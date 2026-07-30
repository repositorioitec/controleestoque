# 📦 Controle de Estoques — ITEC

Sistema web de controle de estoque desenvolvido com **Python/Flask** e banco de dados **PostgreSQL (Supabase)**. Permite gerenciar produtos, movimentações de entrada e saída, fornecedores, categorias e unidades operacionais com controle de acesso por usuário.

---

## ✨ Funcionalidades

- 🔐 **Autenticação** com aprovação de usuário pelo administrador
- 🏢 **Unidades Operacionais** — cadastre e gerencie múltiplas filiais/depósitos
- 📦 **Produtos** — cadastro completo com categoria, unidade de medida e estoque mínimo
- 🔄 **Movimentações** — registre entradas e saídas com data, quantidade e fornecedor
- 📊 **Dashboard** — visão geral do estoque por unidade operacional
- 🏭 **Fornecedores** — cadastro com CNPJ/CPF, telefone e e-mail
- 🏷️ **Categorias** — organização dos produtos por categoria

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.10+ / Flask |
| Banco de Dados | PostgreSQL via [Supabase](https://supabase.com) |
| ORM / Driver | psycopg2-binary |
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Deploy | Render / Heroku / qualquer PaaS com suporte a Python |

---

## 🚀 Como executar localmente

### Pré-requisitos
- Python 3.10 ou superior
- Conta no [Supabase](https://supabase.com) com projeto criado (PostgreSQL)

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/ControleEstoques.git
cd ControleEstoques
```

### 2. Crie e ative o ambiente virtual

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

### 4. Configure as variáveis de ambiente

Copie o arquivo de exemplo e preencha com os dados do seu banco:

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.seu_projeto.supabase.co:5432/postgres
SECRET_KEY=uma_chave_secreta_forte_e_unica
```

> ⚠️ **Nunca commite o arquivo `.env` com senhas reais!** Ele já está no `.gitignore`.

### 5. Inicialize o banco de dados

As tabelas são criadas automaticamente ao iniciar a aplicação pela primeira vez.

### 6. Execute a aplicação

```bash
# Execução simples (abre o navegador automaticamente)
python run.py

# Ou via Flask diretamente
python app.py
```

Acesse em: **http://127.0.0.1:5000**

> Para Windows, você também pode usar o script `iniciar_sistema.bat`.

---

## 🌐 Deploy em produção (Render)

Este projeto já inclui os arquivos de configuração para deploy no [Render](https://render.com):

- `render.yaml` — configuração do serviço web
- `Procfile` — comando de inicialização com Gunicorn

### Passos no Render:
1. Faça fork/push do repositório para o GitHub
2. Conecte o repositório no painel do Render
3. Defina as variáveis de ambiente no painel do Render:
   - `DATABASE_URL` — URL de conexão do PostgreSQL/Supabase
   - `SECRET_KEY` — chave secreta Flask
4. O Render executará automaticamente `pip install -r requirements.txt` e iniciará com `gunicorn app:app`

---

## 📁 Estrutura do Projeto

```
ControleEstoques/
│
├── app.py                 # Rotas Flask (API REST)
├── database.py            # Funções de acesso ao banco de dados
├── run.py                 # Inicialização local com abertura do navegador
├── iniciar_sistema.bat    # Script de inicialização (Windows)
│
├── templates/             # Templates HTML (Jinja2)
│   ├── index.html         # Interface principal
│   └── login.html         # Tela de login e cadastro
│
├── static/                # Arquivos estáticos
│   ├── css/               # Estilos CSS
│   └── js/                # Scripts JavaScript
│
├── requirements.txt       # Dependências Python
├── Procfile               # Configuração Heroku/Render
├── render.yaml            # Configuração Render
│
├── .env.example           # Exemplo de variáveis de ambiente
└── .gitignore             # Arquivos ignorados pelo Git
```

---

## 🔑 Primeiro acesso

Ao iniciar o sistema pela primeira vez, um usuário administrador padrão é criado automaticamente:

| Campo | Valor |
|-------|-------|
| Usuário | `admin` |
| Senha | `admin123` |

> ⚠️ **Altere a senha do administrador imediatamente após o primeiro acesso!**

---

## 📄 Licença

Este projeto é de uso interno da **ITEC**. Todos os direitos reservados.

---

## 🤝 Contribuições

Contribuições são bem-vindas! Abra uma *issue* ou envie um *pull request*.
