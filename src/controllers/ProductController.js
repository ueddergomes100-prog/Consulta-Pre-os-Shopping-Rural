const erpDb = require('../database/uniplus');
const catalogPopularity = require('../services/CatalogPopularityService');

const MEDICINE_KEYWORDS = [
  'medicamento',
  'medicamentoso',
  'remedio',
  'farmacia',
  'antibiotico',
  'antiinflamatorio',
  'anti inflamatorio',
  'analgesico',
  'antialergico',
  'antitoxico',
  'antisseptico',
  'cicatrizante',
  'vermifugo',
  'vermicida',
  'endectocida',
  'ectoparasiticida',
  'carrapaticida',
  'pulguicida',
  'antipulgas',
  'anticarrapatos',
  'sarnicida',
  'otologico',
  'oftalmico',
  'colirio',
  'pomada',
  'unguento',
  'spray prata',
  'iodo',
  'iodopovidona',
  'clorexidina',
  'ivermectina',
  'doramectina',
  'moxidectina',
  'albendazol',
  'fenbendazol',
  'febantel',
  'praziquantel',
  'piperazina',
  'levamisol',
  'oxitetraciclina',
  'terramicina',
  'penicilina',
  'enrofloxacina',
  'ceftiofur',
  'sulfametoxazol',
  'trimetoprim',
  'dexametasona',
  'meloxicam',
  'flunixin',
  'ketoprofeno',
  'dipirona',
  'bravecto',
  'nexgard',
  'simparic',
  'credeli',
  'frontline',
  'advocate',
  'advantage',
  'revolution',
  'seresto'
];

const MEDICINE_CATEGORY_KEYWORDS = [
  'veterinario',
  'veterinario porte',
  'antibiotico',
  'antipulga',
  'carrapato',
  'antiparasitario',
  'vacina',
  'medic',
  'vermifugo'
];

class ProductController {
  /**
   * Consulta limitada a 20 produtos usada pelo catálogo dos vendedores.
   * Mantém as mesmas regras do painel: soma o saldo da filial e usa o maior
   * preço cadastrado por produto.
   */
  async getCatalogProducts(req, res) {
    const rawSearch = String(req.query.search || '').trim();
    const medicineOnly = req.catalogScope === 'medicines' || req.query.group === 'medicamentos';
    const pageSize = medicineOnly ? 2000 : 20;

    const normalizeSearch = (value) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const hasTermOperator = rawSearch.includes('+');
    const searchTerms = (hasTermOperator ? rawSearch.split('+') : [rawSearch])
      .map(normalizeSearch)
      .filter(Boolean)
      .slice(0, 8);

    const normalizeSql = (column) => `translate(
      lower(COALESCE(${column}, '')),
      'áàãâäéèêëíìîïóòõôöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    )`;
    const codeExpression = normalizeSql('p.codigo');
    const nameExpression = normalizeSql('p.nome');
    const categoryExpression = normalizeSql('h.nome');
    const queryParams = [];
    let searchCondition = '';

    if (searchTerms.length > 1 || hasTermOperator) {
      const termConditions = searchTerms.map((term, index) => {
        queryParams.push(`%${term}%`);
        return `${nameExpression} LIKE $${index + 1}`;
      });
      searchCondition = termConditions.length ? `AND ${termConditions.join(' AND ')}` : '';
    } else if (searchTerms.length === 1) {
      queryParams.push(`${searchTerms[0]}%`);
      searchCondition = `AND (${codeExpression} LIKE $1 OR ${nameExpression} LIKE $1)`;
    }

    let medicineCondition = '';

    if (medicineOnly) {
      queryParams.push(MEDICINE_KEYWORDS.map((keyword) => `%${keyword}%`));
      const medicineNameParam = queryParams.length;
      queryParams.push(MEDICINE_CATEGORY_KEYWORDS.map((keyword) => `%${keyword}%`));
      const medicineCategoryParam = queryParams.length;
      medicineCondition = `
        AND (
          ${categoryExpression} LIKE ANY($${medicineCategoryParam})
          OR ${nameExpression} LIKE ANY($${medicineNameParam})
        )
      `;
    }

    const whereClause = `p.inativo = 0 ${searchCondition} ${medicineCondition}`;

    try {
      const popularCodes = rawSearch || medicineOnly ? [] : await catalogPopularity.getTopCodes(pageSize);
      const dataParams = [...queryParams];
      let orderClause = `${nameExpression}, ${codeExpression}`;

      if (popularCodes.length) {
        const rankingCases = popularCodes.map((code, index) => {
          dataParams.push(code);
          return `WHEN $${dataParams.length} THEN ${index}`;
        });
        orderClause = `
          CASE p.codigo ${rankingCases.join(' ')} ELSE ${popularCodes.length} END,
          ${nameExpression},
          ${codeExpression}
        `;
      }

      const countSql = `
        SELECT COUNT(*)::integer AS total
        FROM produto p
        LEFT JOIN hierarquia h ON h.id = p.idhierarquia
        WHERE ${whereClause}
      `;

      const dataSql = `
        SELECT
          p.codigo AS codigo,
          p.nome AS nome,
          h.nome AS nome_categoria,
          COALESCE(hg.nome, h.nome) AS grupo_categoria,
          h.nome AS subgrupo_categoria,
          NULLIF(BTRIM(p.descricaoshop), '') AS descricao,
          COALESCE(fpp.preco, 0) AS preco,
          COALESCE(se.estoque, 0) AS estoque
        FROM produto p
        LEFT JOIN (
          SELECT idproduto, SUM(COALESCE(quantidade, 0)) AS estoque
          FROM saldoestoque
          GROUP BY idproduto
        ) se ON se.idproduto = p.id
        LEFT JOIN (
          SELECT idproduto, MAX(COALESCE(preco, 0)) AS preco
          FROM formacaoprecoproduto
          GROUP BY idproduto
        ) fpp ON fpp.idproduto = p.id
        LEFT JOIN hierarquia h ON h.id = p.idhierarquia
        LEFT JOIN hierarquia hg
          ON BTRIM(hg.codigo) = SPLIT_PART(REGEXP_REPLACE(BTRIM(h.codigo), '\\s+', ' ', 'g'), ' ', 1)
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${dataParams.length + 1}
      `;

      const [countResult, dataResult] = await Promise.all([
        erpDb.query(countSql, queryParams),
        erpDb.query(dataSql, [...dataParams, pageSize])
      ]);

      if (dataResult.rows.length) {
        try {
          const intDb = require('../database/catalog-integration');
          const productCodes = dataResult.rows.map((product) => String(product.codigo || '').trim());
          const { rows: priceRows } = await intDb.query(
            `SELECT sku, nuvemshop_price, promotional_price
             FROM integration_products
             WHERE sku = ANY($1)`,
            [productCodes]
          );
          const priceMap = new Map(
            priceRows.map((price) => [String(price.sku || '').trim(), price])
          );

          dataResult.rows = dataResult.rows.map((product) => {
            const price = priceMap.get(String(product.codigo || '').trim());
            return {
              ...product,
              nuvemshop_price: price?.nuvemshop_price ?? null,
              promotional_price: price?.promotional_price ?? null
            };
          });
        } catch (priceError) {
          console.error('Erro ao consultar preços promocionais do catálogo:', priceError.message);
        }
      }

      const total = countResult.rows[0]?.total || 0;

      return res.json({
        total,
        page: 1,
        pageSize,
        totalPages: 1,
        mode: medicineOnly ? 'medicines' : (rawSearch ? 'search' : 'popular'),
        group: medicineOnly ? 'Medicamentos' : null,
        popularCount: popularCodes.length,
        data: dataResult.rows
      });
    } catch (error) {
      console.error('Erro ao consultar o catálogo do UNIPLUS:', error.message);
      return res.status(503).json({
        error: 'Não foi possível consultar os produtos no momento.'
      });
    }
  }

  async getCatalogMedicines(req, res) {
    req.catalogScope = 'medicines';
    return this.getCatalogProducts(req, res);
  }

  async recordCatalogView(req, res) {
    const code = String(req.params.codigo || '').trim().slice(0, 80);

    if (!code) {
      return res.status(400).json({ error: 'Código do produto não informado.' });
    }

    try {
      const { rows } = await erpDb.query(
        'SELECT codigo FROM produto WHERE inativo = 0 AND codigo = $1 LIMIT 1',
        [code]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'Produto não encontrado.' });
      }

      await catalogPopularity.recordView(code);
      return res.status(204).send();
    } catch (error) {
      console.error('Erro ao registrar consulta do catálogo:', error.message);
      return res.status(503).json({ error: 'Não foi possível registrar a consulta.' });
    }
  }

  /**
   * Busca todos os produtos ativos do UNIPLUS usando a query validada
   */
  async getErpProducts(req, res) {
    try {
      const sql = `
        SELECT
            p.id AS id_produto,
            p.codigo AS sku,
            p.nome AS nome_produto,
            p.inativo,
            h.nome AS nome_categoria,
            COALESCE(se.estoque, 0) AS estoque,
            COALESCE(fpp.preco, 0) AS preco
        FROM produto p
        LEFT JOIN (
            SELECT idproduto, SUM(COALESCE(quantidade, 0)) AS estoque
            FROM saldoestoque
            GROUP BY idproduto
        ) se ON se.idproduto = p.id
        LEFT JOIN (
            SELECT idproduto, MAX(COALESCE(preco, 0)) AS preco
            FROM formacaoprecoproduto
            GROUP BY idproduto
        ) fpp ON fpp.idproduto = p.id
        LEFT JOIN hierarquia h ON h.id = p.idhierarquia
        WHERE p.inativo = 0
        ORDER BY p.codigo;
      `;

      const { rows: erpProducts } = await erpDb.query(sql);

      // Busca o estado da integração para cruzar os dados
      const intDb = require('../database/integration');
      const { rows: integrationState } = await intDb.query(
        `SELECT 
          uniplus_product_id, send_to_site, sync_status, nuvemshop_product_id, error_message,
          nuvemshop_price, promotional_price,
          nuvemshop_description,
          generated_description, image_source_url, image_public_url,
          image2_source_url, image2_public_url, image2_enriched_at, enrichment_status,
          enrichment_error, enriched_at, blocked_image_urls, image_search_term
        FROM integration_products`
      );

      // Mapeia para facilitar a busca (Casting para String para garantir o match)
      const stateMap = new Map(integrationState.map(i => [String(i.uniplus_product_id), i]));

      const combined = erpProducts.map(p => {
        const state = stateMap.get(String(p.id_produto));
        return {
          ...p,
          is_marked: state ? state.send_to_site : false,
          sync_status: state ? state.sync_status : 'not_synced',
          is_synced: state ? !!state.nuvemshop_product_id : false,
          error_message: state ? state.error_message : null,
          nuvemshop_price: state ? state.nuvemshop_price : null,
          promotional_price: state ? state.promotional_price : null,
          nuvemshop_description: state ? state.nuvemshop_description : null,
          generated_description: state ? state.generated_description : null,
          image_source_url: state ? state.image_source_url : null,
          image_public_url: state ? state.image_public_url : null,
          image2_source_url: state ? state.image2_source_url : null,
          image2_public_url: state ? state.image2_public_url : null,
          image2_enriched_at: state ? state.image2_enriched_at : null,
          enrichment_status: state ? state.enrichment_status : 'not_prepared',
          enrichment_error: state ? state.enrichment_error : null,
          enriched_at: state ? state.enriched_at : null,
          blocked_image_urls: state ? state.blocked_image_urls : [],
          image_search_term: state ? state.image_search_term : null
        };
      });

      return res.json({
        total: combined.length,
        data: combined
      });
    } catch (error) {
      console.error('Erro ao buscar produtos no UNIPLUS:', error.message);
      return res.status(500).json({
        error: 'Erro interno ao consultar o banco de dados do ERP',
        details: error.message
      });
    }
  }
}

module.exports = new ProductController();
