const erpDb = require('../database/uniplus');

class ProductController {
  /**
   * Consulta paginada e somente leitura usada pelo catálogo dos vendedores.
   * Mantém as mesmas regras do painel: soma o saldo da filial e usa o maior
   * preço cadastrado por produto.
   */
  async getCatalogProducts(req, res) {
    const rawSearch = String(req.query.search || '').trim();
    const requestedPage = Number.parseInt(req.query.page, 10);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(requestedPageSize, 1), 50)
      : 20;

    const offset = (page - 1) * pageSize;

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

    const whereClause = `p.inativo = 0 ${searchCondition}`;

    try {
      const countSql = `
        SELECT COUNT(*)::integer AS total
        FROM produto p
        WHERE ${whereClause}
      `;

      const dataSql = `
        SELECT
          p.codigo AS codigo,
          p.nome AS nome,
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
        WHERE ${whereClause}
        ORDER BY ${nameExpression}, ${codeExpression}
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `;

      const [countResult, dataResult] = await Promise.all([
        erpDb.query(countSql, queryParams),
        erpDb.query(dataSql, [...queryParams, pageSize, offset])
      ]);

      const total = countResult.rows[0]?.total || 0;
      const totalPages = Math.ceil(total / pageSize);

      return res.json({
        total,
        page,
        pageSize,
        totalPages,
        data: dataResult.rows
      });
    } catch (error) {
      console.error('Erro ao consultar o catálogo do UNIPLUS:', error.message);
      return res.status(503).json({
        error: 'Não foi possível consultar os produtos no momento.'
      });
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
