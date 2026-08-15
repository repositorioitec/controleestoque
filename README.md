# Controle de Estoques

Sistema de gestão e controle de estoques com suporte a múltiplas unidades operacionais e categorias.

## Como iniciar

1. Instale o Node.js LTS (versão 18 ou superior), caso ainda não esteja instalado.
2. Copie `.env.example` e renomeie a cópia para `.env`.
3. No `.env`, substitua `[YOUR-PASSWORD]` pela senha do banco de dados no Supabase.
4. Dê dois cliques em `iniciar_sistema.bat`.
5. Abra `http://localhost:5000` no navegador.

Também é possível iniciar pelo terminal, dentro desta pasta:

```powershell
npm start
```

Para parar o servidor, use `Ctrl+C` na janela que o iniciou.

## Dados

Usuários, produtos, centros de custo e movimentações são armazenados no banco PostgreSQL do Supabase. Não envie o arquivo `.env` para outras pessoas nem o publique em repositórios abertos.

## Como Publicar na Internet (Deploy via GitHub)

Para publicar o projeto gratuitamente na internet para acesso externo, recomendamos serviços de hospedagem (PaaS) como **Render**, **Railway** ou **Koyeb**, que se conectam diretamente ao seu repositório no GitHub.

### Passos gerais para Deploy:

1. **Suba o projeto para o GitHub**:
   Faça o commit e o push do código para um repositório no seu GitHub. (Lembre-se que o arquivo `.env` será ignorado e não subirá - o que é correto e seguro).

2. **Crie o serviço de hospedagem**:
   - Crie uma conta no [Render](https://render.com) (ou plataforma similar).
   - Clique em **New** > **Web Service**.
   - Conecte sua conta do GitHub e selecione o repositório do projeto.

3. **Configurações de Build e Início**:
   - **Environment / Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. **Variáveis de Ambiente (MUITO IMPORTANTE)**:
   - Na plataforma de hospedagem, vá para a aba **Environment Variables** (Variáveis de Ambiente).
   - Adicione a variável de conexão com o banco do Supabase.
   - **Key**: `DATABASE_URL`
   - **Value**: (Sua URL de conexão do Supabase)

5. **Aguarde o Deploy**:
   Clique para salvar e publicar. A plataforma fará o download do seu código do GitHub, instalará as dependências (`npm install`) e iniciará o servidor (`npm start`). Ao final, ele fornecerá um link público seguro (ex: `https://seu-projeto.onrender.com`) para você acessar o sistema de qualquer lugar!
