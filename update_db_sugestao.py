import re

with open('src/database.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace from `async function gerar_relatorio_sugestao_compras` up to `async function listar_centros_custo`
pattern = r'async function gerar_relatorio_sugestao_compras\(.*?\n\/\/ --- CENTROS DE CUSTO ---'

new_code = '''async function gerar_relatorio_sugestao_compras(id_unidade, id_categoria, data_inicio, data_fim, id_usuario = null, nivel_acesso = null) {
  const where_conditions = ["p.inativo = FALSE"];
  const params = [];

  if (id_categoria) {
    params.push(id_categoria);
    where_conditions.push(`p.id_categoria = $${params.length}`);
  }

  const where_clause = where_conditions.length ? " WHERE " + where_conditions.join(" AND ") : "";

  const dtInicio = new Date(data_inicio);
  const dtFim = new Date(data_fim);
  const dias_periodo = Math.max(1, Math.round((dtFim - dtInicio) / (1000 * 60 * 60 * 24)) + 1);

  let nome_unidade_relatorio = "Todas as Unidades";
  if (id_unidade) {
    const unidRes = await pool.query(
      "SELECT nome_unidade FROM tbl_unidades_operacionais WHERE id_unidade = $1",
      [id_unidade]
    );
    nome_unidade_relatorio = unidRes.rows[0]?.nome_unidade || "Unidade selecionada";
  }

  const sql = `
    SELECT p.id_produto, p.nome_produto, p.estoque_minimo, p.preco_custo, c.nome_categoria,
           u.nome_unidade as nome_unidade_produto
    FROM tbl_produtos p
    LEFT JOIN tbl_categorias c ON p.id_categoria = c.id_categoria
    LEFT JOIN tbl_unidades_operacionais u ON p.id_unidade = u.id_unidade
    ${where_clause}
    ORDER BY p.nome_produto ASC
  `;

  const res = await pool.query(sql, params);

  let dInicio = data_inicio.trim();
  if (dInicio.length === 10) dInicio += " 00:00:00";
  let dFim = data_fim.trim();
  if (dFim.length === 10) dFim += " 23:59:59";

  const relatorio = [];
  for (const r of res.rows) {
    const estoque_real = await calcular_estoque_produto(r.id_produto, id_unidade);
    const estoque_minimo = parseInt(r.estoque_minimo) || 0;
    const preco_custo_calculado = await obter_ultimo_custo_produto(r.id_produto);

    let consumoSql, consumoParams;
    if (id_unidade) {
      consumoSql = `
        SELECT COALESCE(SUM(quantidade), 0) AS consumo
        FROM tbl_movimentacoes
        WHERE id_produto = $1 AND id_unidade = $2
          AND UPPER(tipo_movimentacao) = 'SAIDA'
          AND data_movimentacao >= $3 AND data_movimentacao <= $4
      `;
      consumoParams = [r.id_produto, id_unidade, dInicio, dFim];
    } else {
      consumoSql = `
        SELECT COALESCE(SUM(quantidade), 0) AS consumo
        FROM tbl_movimentacoes
        WHERE id_produto = $1
          AND UPPER(tipo_movimentacao) = 'SAIDA'
          AND data_movimentacao >= $2 AND data_movimentacao <= $3
      `;
      consumoParams = [r.id_produto, dInicio, dFim];
    }

    const consumoRes = await pool.query(consumoSql, consumoParams);
    const consumo_periodo = parseInt(consumoRes.rows[0]?.consumo || 0);
    const media_consumo = consumo_periodo / dias_periodo;
    const sugestao_pedido = Math.max(0, Math.ceil(media_consumo * dias_periodo + estoque_minimo - estoque_real));

    const preco_custo = preco_custo_calculado;
    const valor_sugestao = sugestao_pedido > 0 ? sugestao_pedido * preco_custo : 0;

    relatorio.push({
      id_produto: r.id_produto,
      nome_produto: r.nome_produto,
      nome_unidade: id_unidade ? nome_unidade_relatorio : (r.nome_unidade_produto || "Todas as Unidades"),
      nome_categoria: r.nome_categoria || "Sem Categoria",
      estoque_real,
      consumo_periodo,
      estoque_minimo,
      sugestao_pedido,
      preco_custo,
      valor_sugestao
    });
  }
  return relatorio;
}

async function podeExcluirUsuario(id_usuario) {
  const res = await pool.query(
    `SELECT COUNT(*) FROM tbl_movimentacoes WHERE id_usuario = $1`,
    [id_usuario]
  );
  return parseInt(res.rows[0].count) === 0;
}

async function excluir_usuario(id_usuario) {
  const podeExcluir = await podeExcluirUsuario(id_usuario);
  if (!podeExcluir) {
    throw new Error('Este usuário tem movimentações e não pode ser excluído.');
  }
  await pool.query(`DELETE FROM tbl_usuarios WHERE id_usuario = $1`, [id_usuario]);
  return true;
}

async function excluir_movimentacao(id_movimentacao) {
  await pool.query(`DELETE FROM tbl_movimentacoes WHERE id_movimentacao = $1`, [id_movimentacao]);
  return true;
}

async function atualizar_movimentacao(id_movimentacao, id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor, numero_nf = null, id_centro_custo = null) {
  let query = `
    UPDATE tbl_movimentacoes 
    SET id_produto = $1, tipo_movimentacao = $2, quantidade = $3, valor_unitario = $4, observacao = $5, data_movimentacao = $6, id_unidade = $7, id_fornecedor = $8, numero_nf = $9, id_centro_custo = $10
    WHERE id_movimentacao = $11
  `;
  await pool.query(query, [id_produto, tipo_movimentacao, quantidade, valor_unitario, observacao, data_movimentacao, id_unidade, id_fornecedor, numero_nf || null, id_centro_custo || null, id_movimentacao]);
  return true;
}

// --- CENTROS DE CUSTO ---'''

content = re.sub(pattern, new_code, content, flags=re.DOTALL)
with open('src/database.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("database.js updated successfully!")
