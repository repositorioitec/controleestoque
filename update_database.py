import codecs
import re

p = r'c:\ControleEstoques - Ambiente Testes\src\database.js'
with codecs.open(p, 'r', 'utf-8') as f:
    content = f.read()

# 1. init_db
content = content.replace(
    '''ADD COLUMN IF NOT EXISTS nome_usuario_validacao VARCHAR(150) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMPTZ DEFAULT NULL;''',
    '''ADD COLUMN IF NOT EXISTS nome_usuario_validacao VARCHAR(150) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS data_validacao TIMESTAMPTZ DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS aguardando_analise BOOLEAN DEFAULT FALSE;'''
)

# 2. listar_lancamentos_estagio
content = content.replace(
    "SELECT id_lancamento, to_char(data_lancamento, 'YYYY-MM-DD') as data_lancamento, to_char(data_validacao, 'YYYY-MM-DD') as data_validacao, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao",
    "SELECT id_lancamento, to_char(data_lancamento, 'YYYY-MM-DD') as data_lancamento, to_char(data_validacao, 'YYYY-MM-DD') as data_validacao, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao, aguardando_analise"
)

# 3. salvar_lancamento_estagio signature
content = content.replace(
    "async function salvar_lancamento_estagio(id_lancamento, data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao) {",
    "async function salvar_lancamento_estagio(id_lancamento, data_lancamento, status, nome_aluno, unidade, curso, turma, horas_totais, protocolo_ew, observacoes, horas_campo, horas_capacitacao, horas_laboratorio, horas_evento, horas_enf_cirurgica, horas_enf_medica, horas_saude_mulher, horas_saude_mental, horas_saude_publica, horas_emergencia, validado_coordenacao, nome_usuario_registro, nome_usuario_validacao, aguardando_analise) {"
)

# 4. salvar_lancamento_estagio UPDATE
content = content.replace(
    "validado_coordenacao = $21, nome_usuario_validacao = COALESCE($22, nome_usuario_validacao), data_validacao = CASE WHEN $21 = TRUE AND data_validacao IS NULL THEN CURRENT_TIMESTAMP ELSE data_validacao END",
    "validado_coordenacao = $21, nome_usuario_validacao = COALESCE($22, nome_usuario_validacao), data_validacao = CASE WHEN $21 = TRUE AND data_validacao IS NULL THEN CURRENT_TIMESTAMP ELSE data_validacao END, aguardando_analise = $23"
)
content = content.replace(
    ", validado_coordenacao || false, nome_usuario_validacao || null]);",
    ", validado_coordenacao || false, nome_usuario_validacao || null, aguardando_analise || false]);"
)

# 5. salvar_lancamento_estagio INSERT
content = content.replace(
    "nome_usuario_registro, nome_usuario_validacao)",
    "nome_usuario_registro, nome_usuario_validacao, aguardando_analise)"
)
content = content.replace(
    ", $20, $21, $22)",
    ", $20, $21, $22, $23)"
)

with codecs.open(p, 'w', 'utf-8') as f:
    f.write(content)
