import codecs

p = r'c:\ControleEstoques - Ambiente Testes\src\database.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# Fix init_db
content = content.replace(
    "ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMPTZ DEFAULT NULL;",
    "ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMPTZ DEFAULT NULL,\n      ADD COLUMN IF NOT EXISTS aguardando_analise BOOLEAN DEFAULT FALSE;"
)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
