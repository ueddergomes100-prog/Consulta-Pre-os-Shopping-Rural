const erpDb = require('../database/uniplus');

// Usa o horário da loja e os preços já calculados pelo ERP. Nunca grava no banco.
const PROMOTIONS_SQL = `
  WITH clock AS (
    SELECT local_time::date AS today, local_time::time AS time,
      (ARRAY['domingo','segunda','terca','quarta','quinta','sexta','sabado'])
        [EXTRACT(DOW FROM local_time)::int + 1] AS weekday
    FROM (SELECT CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo' AS local_time) t
  ), active AS (
    SELECT pr.* FROM promocao pr CROSS JOIN clock c
    WHERE pr.inativo = 0 AND pr.datainicial <= c.today
      AND (pr.continua = 1 OR pr.datafinal >= c.today)
      AND (to_jsonb(pr)->>c.weekday)::int = 1
      AND c.time BETWEEN
        COALESCE((to_jsonb(pr)->>('horainicial' || c.weekday))::time, '00:00:00'::time)
        AND COALESCE((to_jsonb(pr)->>('horafinal' || c.weekday))::time, '23:59:59'::time)
  )
  SELECT pp.idproduto AS product_id, pr.id AS campaign_id, pr.nome AS name,
    CASE WHEN pr.continua = 1 THEN NULL ELSE pr.datafinal::text END AS ends_at,
    pr.tabelapreco, pr.tipo, pr.modocalculopreco, pr.prioridade,
    pr.funcionario, pr.clientefidelidade, pr.idcategoriacliente,
    pr.aplicapromocaoprazo, pr.idtabelafinanciamento, pr.centrolucro,
    pr.limitepromocao, pr.mes, pr.tipobrinde, pr.valorbrinde,
    NULLIF(BTRIM(pr.jsonpromocao), '') IS NOT NULL AS custom_rules,
    EXISTS (SELECT 1 FROM promocaofinalizador f WHERE f.idpromocao = pr.id) AS payment_rules,
    ARRAY(SELECT pf.idfilial::text FROM promocaofilial pf WHERE pf.idpromocao = pr.id) AS branches,
    pp.valorpromocao AS price, pp.quantidade, pp.valorminimo, pp.brinde, pp.quota,
    pp.quantidadecompren, pp.quantidadepaguen, pp.valor1, pp.valor2, pp.valor3,
    COALESCE((
      SELECT json_agg(json_build_object(
        'price', pe.valorpromocao, 'unit', pe.unidademedida,
        'description', e.descricao, 'quantity', e.fatorconversao, 'branch', e.idfilial::text
      ))
      FROM promocaoembalagem pe JOIN embalagem e ON e.id = pe.idembalagem
      WHERE pe.idpromocao = pr.id AND pe.idproduto = pp.idproduto
        AND COALESCE(e.inativo, 0) = 0
    ), '[]'::json) AS packages
  FROM promocaoproduto pp JOIN active pr ON pr.id = pp.idpromocao
  WHERE pp.idproduto = ANY($1::bigint[])
  ORDER BY pr.id DESC, pp.id
`;

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

function campaignConditions(row) {
  const conditions = [];
  // Os códigos de condições não são interpretados como desconto unitário.
  if (row.tabelapreco !== null && row.tabelapreco !== undefined && Number(row.tabelapreco) !== -1) {
    conditions.push('Válida para uma condição de preço específica. Confirme no ERP.');
  }
  if (positive(row.clientefidelidade) || row.idcategoriacliente) conditions.push('Exclusiva para clientes elegíveis.');
  if (positive(row.funcionario)) conditions.push('Exclusiva para funcionários.');
  if (row.payment_rules || positive(row.aplicapromocaoprazo) || row.idtabelafinanciamento) {
    conditions.push('Depende da forma ou do prazo de pagamento.');
  }
  if (positive(row.quantidadecompren) || positive(row.quantidadepaguen) || positive(row.quantidade)) {
    conditions.push('Depende da quantidade comprada. Confirme as regras no ERP.');
  }
  if (positive(row.quota) || positive(row.limitepromocao)) conditions.push('Sujeita ao limite da campanha.');
  if (positive(row.valorminimo) || positive(row.brinde) || positive(row.valorbrinde) || positive(row.tipobrinde)) {
    conditions.push('Possui condição de compra ou brinde.');
  }
  if (row.custom_rules || row.centrolucro || positive(row.tipo) || positive(row.modocalculopreco)
    || positive(row.mes) || [row.valor1, row.valor2, row.valor3].some(positive)) {
    conditions.push('Campanha com regras adicionais. Confirme no ERP.');
  }
  return conditions;
}

function attachPromotions(products, rows) {
  const byProduct = new Map();
  for (const row of rows) {
    const key = String(row.product_id);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(row);
  }
  return products.map((product) => {
    const branches = (product.price_branches || []).map(String);
    const offers = [];
    for (const row of byProduct.get(String(product.product_id)) || []) {
      if (row.branches?.length && !row.branches.some((branch) => branches.includes(String(branch)))) continue;
      const conditions = campaignConditions(row);
      if (branches.length !== 1) conditions.push('Confirme a filial e seu preço no ERP.');
      const price = positive(row.price) ? Number(row.price) : null;
      if (price === null) conditions.push('Consulte o preço da campanha no ERP.');
      const offer = {
        id: String(row.campaign_id), name: row.name?.trim() || 'Promoção Uniplus',
        price, ends_at: row.ends_at, conditions,
      };
      offers.push(offer);
      for (const pack of row.packages || []) {
        if (pack.branch && !branches.includes(String(pack.branch))) continue;
        if (!positive(pack.price)) continue;
        offers.push({
          ...offer, id: `${offer.id}:package:${offers.length}`, price: Number(pack.price),
          conditions: [...conditions, `Preço por embalagem: ${pack.description || pack.unit || 'consulte a embalagem'}${positive(pack.quantity) ? ` (fator ${Number(pack.quantity)})` : ''}.`],
        });
      }
    }
    const automatic = offers.filter((offer) => offer.conditions.length === 0 && offer.price < Number(product.preco));
    // Sem a regra de precedência do PDV, não escolhe arbitrariamente entre campanhas concorrentes.
    const conflicting = new Set(automatic.map((offer) => offer.price)).size > 1;
    if (conflicting) automatic.forEach((offer) => offer.conditions.push('Campanhas simultâneas. Confirme o preço aplicável no ERP.'));
    const selected = conflicting ? null : automatic[0] || null;
    const { product_id, price_branches, ...publicProduct } = product;
    return {
      ...publicProduct, promotional_price: selected?.price ?? null,
      promotion_source: offers.length ? 'uniplus' : null,
      promotion: selected, promotions: offers,
    };
  });
}

async function enrichProducts(products) {
  if (!products.length) return products;
  const { rows } = await erpDb.query(PROMOTIONS_SQL, [products.map((product) => product.product_id)]);
  return attachPromotions(products, rows);
}

module.exports = { enrichProducts, attachPromotions, PROMOTIONS_SQL };
