const intDb = require('../database/integration');
const enrichmentService = require('../services/ProductEnrichmentService');
const nuvemShop = require('../services/NuvemShopService');
const SyncController = require('./SyncController');

class IntegrationController {
  isNotFoundError(error) {
    const message = error.message || '';
    return message.includes('404')
      || message.includes('Not Found')
      || message.includes('not_found')
      || message.includes('does not exist');
  }

  getVariantBySku(product, sku) {
    return product?.variants?.find(v => String(v.sku) === String(sku)) || product?.variants?.[0] || null;
  }

  async findSiteProduct(sku, linkedProductId) {
    let siteProduct = null;

    if (linkedProductId) {
      try {
        siteProduct = await nuvemShop.getProduct(linkedProductId);
      } catch (error) {
        if (!this.isNotFoundError(error)) throw error;
      }
    }

    return siteProduct || nuvemShop.findProductBySku(sku);
  }

  async removeFromNuvemShop(sku, linkedProductId) {
    const siteProduct = await this.findSiteProduct(sku, linkedProductId);
    if (!siteProduct) return false;

    await nuvemShop.deleteProduct(siteProduct.id);
    return true;
  }

  /**
   * Marca ou desmarca um produto para ser enviado ao site.
   */
  async toggleSync(req, res) {
    const { uniplus_product_id, sku, send_to_site, nome, preco, estoque, categoria } = req.body;

    if (!uniplus_product_id || !sku) {
      return res.status(400).json({ error: 'ID do Uniplus e SKU sao obrigatorios' });
    }

    try {
      if (!send_to_site) {
        const { rows: currentRows } = await intDb.query(
          'SELECT nuvemshop_product_id FROM integration_products WHERE uniplus_product_id = $1 OR sku = $2 LIMIT 1',
          [uniplus_product_id, sku]
        );
        await this.removeFromNuvemShop(sku, currentRows[0]?.nuvemshop_product_id);
      }

      const sql = `
        INSERT INTO integration_products
          (uniplus_product_id, sku, send_to_site, last_name, last_price, last_stock, last_category, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (uniplus_product_id)
        DO UPDATE SET
          send_to_site = EXCLUDED.send_to_site,
          sync_status = CASE WHEN EXCLUDED.send_to_site = true THEN 'pending' ELSE 'not_synced' END,
          nuvemshop_product_id = CASE WHEN EXCLUDED.send_to_site = true THEN integration_products.nuvemshop_product_id ELSE NULL END,
          nuvemshop_variant_id = CASE WHEN EXCLUDED.send_to_site = true THEN integration_products.nuvemshop_variant_id ELSE NULL END,
          error_message = NULL,
          updated_at = NOW()
        RETURNING *;
      `;

      const { rows } = await intDb.query(sql, [
        uniplus_product_id,
        sku,
        send_to_site,
        nome,
        preco,
        estoque,
        categoria
      ]);

      return res.json({
        message: send_to_site ? 'Produto marcado para sincronizacao' : 'Produto removido da NuvemShop e da sincronizacao',
        data: rows[0]
      });
    } catch (error) {
      console.error('Erro ao marcar produto:', error.message);
      return res.status(500).json({ error: 'Erro ao salvar no banco de integracao' });
    }
  }

  /**
   * Salva o preco normal manual usado somente na NuvemShop.
   */
  async updateNuvemShopPrice(req, res) {
    const { uniplus_product_id, sku, nome, preco, estoque, categoria, nuvemshop_price } = req.body;

    if (!uniplus_product_id || !sku) {
      return res.status(400).json({ error: 'ID do Uniplus e SKU sao obrigatorios' });
    }

    const erpPrice = parseFloat(preco || 0);
    const manualPrice = nuvemshop_price === null || nuvemshop_price === ''
      ? null
      : parseFloat(nuvemshop_price);

    if (manualPrice !== null && (!Number.isFinite(manualPrice) || manualPrice <= 0)) {
      return res.status(400).json({ error: 'Preco NuvemShop precisa ser maior que zero' });
    }

    try {
      const { rows: currentRows } = await intDb.query(
        'SELECT promotional_price FROM integration_products WHERE uniplus_product_id = $1 OR sku = $2 LIMIT 1',
        [uniplus_product_id, sku]
      );
      const promotionalPrice = currentRows[0]?.promotional_price === null
        || currentRows[0]?.promotional_price === undefined
        ? null
        : parseFloat(currentRows[0].promotional_price);
      const effectivePrice = manualPrice ?? erpPrice;

      if (promotionalPrice !== null && promotionalPrice >= effectivePrice) {
        return res.status(400).json({
          error: 'Preco NuvemShop precisa ser maior que o preco promocional atual'
        });
      }

      const { rows } = await intDb.query(
        `INSERT INTO integration_products
          (uniplus_product_id, sku, send_to_site, last_name, last_stock, last_category, nuvemshop_price, sync_status, updated_at)
         VALUES ($1, $2, false, $3, $4, $5, $6, 'not_synced', NOW())
         ON CONFLICT (uniplus_product_id)
         DO UPDATE SET
          sku = EXCLUDED.sku,
          last_name = EXCLUDED.last_name,
          last_stock = EXCLUDED.last_stock,
          last_category = EXCLUDED.last_category,
          nuvemshop_price = EXCLUDED.nuvemshop_price,
          sync_status = CASE
            WHEN integration_products.send_to_site = true THEN 'pending'
            ELSE integration_products.sync_status
          END,
          error_message = NULL,
          updated_at = NOW()
         RETURNING *`,
        [
          uniplus_product_id,
          sku,
          nome,
          estoque,
          categoria,
          manualPrice
        ]
      );

      return res.json({
        message: manualPrice ? 'Preco NuvemShop salvo' : 'Preco NuvemShop removido',
        data: rows[0]
      });
    } catch (error) {
      console.error('Erro ao salvar preco NuvemShop:', error.message);
      return res.status(500).json({ error: 'Erro ao salvar preco NuvemShop' });
    }
  }

  /**
   * Salva o nome/descricao manual que sera usado somente na NuvemShop.
   */
  async updateNuvemShopDescription(req, res) {
    const { uniplus_product_id, sku, nome, preco, estoque, categoria, nuvemshop_description } = req.body;

    if (!uniplus_product_id || !sku) {
      return res.status(400).json({ error: 'ID do Uniplus e SKU sao obrigatorios' });
    }

    const manualDescription = String(nuvemshop_description || '').trim() || null;

    try {
      const { rows } = await intDb.query(
        `INSERT INTO integration_products
          (uniplus_product_id, sku, send_to_site, last_name, last_price, last_stock, last_category, nuvemshop_description, sync_status, updated_at)
         VALUES ($1, $2, false, $3, $4, $5, $6, $7, 'not_synced', NOW())
         ON CONFLICT (uniplus_product_id)
         DO UPDATE SET
          sku = EXCLUDED.sku,
          last_name = EXCLUDED.last_name,
          last_price = EXCLUDED.last_price,
          last_stock = EXCLUDED.last_stock,
          last_category = EXCLUDED.last_category,
          nuvemshop_description = EXCLUDED.nuvemshop_description,
          sync_status = CASE
            WHEN integration_products.send_to_site = true THEN 'pending'
            ELSE integration_products.sync_status
          END,
          error_message = NULL,
          updated_at = NOW()
         RETURNING *`,
        [
          uniplus_product_id,
          sku,
          nome,
          preco,
          estoque,
          categoria,
          manualDescription
        ]
      );

      return res.json({
        message: manualDescription ? 'Descricao NuvemShop salva' : 'Descricao NuvemShop removida',
        data: rows[0]
      });
    } catch (error) {
      console.error('Erro ao salvar descricao NuvemShop:', error.message);
      return res.status(500).json({ error: 'Erro ao salvar descricao NuvemShop' });
    }
  }

  /**
   * Recebe uma imagem colada no navegador e substitui a foto preparada do produto.
   */
  async uploadPastedImage(req, res) {
    const { uniplus_product_id, sku, nome, preco, estoque, categoria } = req.query;
    const imageSlot = String(req.query.slot || '1') === '2' ? '2' : '1';

    if (!uniplus_product_id || !sku || !nome) {
      return res.status(400).json({ error: 'ID do Uniplus, SKU e nome sao obrigatorios' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Nenhuma imagem foi recebida' });
    }

    try {
      const product = {
        id_produto: uniplus_product_id,
        sku,
        nome_produto: nome,
        nome_categoria: categoria
      };

      const processed = await enrichmentService.processImage(req.body, sku, {
        suffix: imageSlot === '2' ? '2' : ''
      });
      const description = enrichmentService.buildDescription(product);

      const imageColumns = imageSlot === '2'
        ? {
            source: 'image2_source_url',
            local: 'image2_local_path',
            public: 'image2_public_url',
            enrichedAt: 'image2_enriched_at'
          }
        : {
            source: 'image_source_url',
            local: 'image_local_path',
            public: 'image_public_url',
            enrichedAt: 'enriched_at'
          };

      const { rows } = await intDb.query(
        `INSERT INTO integration_products
          (uniplus_product_id, sku, send_to_site, last_name, last_price, last_stock, last_category,
           generated_description, ${imageColumns.source}, ${imageColumns.local}, ${imageColumns.public},
           ${imageColumns.enrichedAt}, enrichment_status, enrichment_error, updated_at)
         VALUES ($1, $2, false, $3, $4, $5, $6, $7, 'manual-paste', $8, $9, NOW(), 'ready', NULL, NOW())
         ON CONFLICT (uniplus_product_id)
         DO UPDATE SET
          sku = EXCLUDED.sku,
          last_name = EXCLUDED.last_name,
          last_price = EXCLUDED.last_price,
          last_stock = EXCLUDED.last_stock,
          last_category = EXCLUDED.last_category,
          generated_description = EXCLUDED.generated_description,
          ${imageColumns.source} = EXCLUDED.${imageColumns.source},
          ${imageColumns.local} = EXCLUDED.${imageColumns.local},
          ${imageColumns.public} = EXCLUDED.${imageColumns.public},
          ${imageColumns.enrichedAt} = NOW(),
          enrichment_status = 'ready',
          enrichment_error = NULL,
          updated_at = NOW()
         RETURNING *`,
        [
          uniplus_product_id,
          sku,
          nome,
          preco,
          estoque,
          categoria,
          description,
          processed.image_local_path,
          processed.image_public_url
        ]
      );

      return res.json({
        message: 'Imagem colada processada com sucesso',
        data: rows[0]
      });
    } catch (error) {
      await intDb.query(
        `UPDATE integration_products
         SET enrichment_status = 'error',
             enrichment_error = $1,
             updated_at = NOW()
         WHERE uniplus_product_id = $2`,
        [error.message, uniplus_product_id]
      );

      console.error('Erro ao processar imagem colada:', error.message);
      return res.status(500).json({
        error: 'Erro ao processar imagem colada',
        details: error.message
      });
    }
  }

  /**
   * Salva o preco promocional manual que sera enviado para a NuvemShop.
   */
  async updatePromotionalPrice(req, res) {
    const { uniplus_product_id, sku, nome, preco, estoque, categoria, promotional_price } = req.body;

    if (!uniplus_product_id || !sku) {
      return res.status(400).json({ error: 'ID do Uniplus e SKU sao obrigatorios' });
    }

    const erpPrice = parseFloat(preco || 0);
    const promoPrice = promotional_price === null || promotional_price === ''
      ? null
      : parseFloat(promotional_price);

    if (promoPrice !== null && (!Number.isFinite(promoPrice) || promoPrice <= 0)) {
      return res.status(400).json({ error: 'Preco promocional precisa ser maior que zero' });
    }

    try {
      const { rows: currentRows } = await intDb.query(
        'SELECT nuvemshop_price FROM integration_products WHERE uniplus_product_id = $1 OR sku = $2 LIMIT 1',
        [uniplus_product_id, sku]
      );
      const manualPrice = currentRows[0]?.nuvemshop_price === null
        || currentRows[0]?.nuvemshop_price === undefined
        ? null
        : parseFloat(currentRows[0].nuvemshop_price);
      const effectiveNormalPrice = manualPrice ?? erpPrice;

      if (promoPrice !== null && effectiveNormalPrice > 0 && promoPrice >= effectiveNormalPrice) {
        return res.status(400).json({ error: 'Preco promocional precisa ser menor que o preco enviado para a NuvemShop' });
      }

      const { rows } = await intDb.query(
        `INSERT INTO integration_products
          (uniplus_product_id, sku, send_to_site, last_name, last_price, last_stock, last_category, promotional_price, sync_status, updated_at)
         VALUES ($1, $2, false, $3, $4, $5, $6, $7, 'not_synced', NOW())
         ON CONFLICT (uniplus_product_id)
         DO UPDATE SET
          sku = EXCLUDED.sku,
          last_name = EXCLUDED.last_name,
          last_price = EXCLUDED.last_price,
          last_stock = EXCLUDED.last_stock,
          last_category = EXCLUDED.last_category,
          promotional_price = EXCLUDED.promotional_price,
          sync_status = CASE
            WHEN integration_products.send_to_site = true THEN 'pending'
            ELSE integration_products.sync_status
          END,
          error_message = NULL,
          updated_at = NOW()
         RETURNING *`,
        [
          uniplus_product_id,
          sku,
          nome,
          erpPrice,
          estoque,
          categoria,
          promoPrice
        ]
      );

      return res.json({
        message: promoPrice ? 'Preco promocional salvo' : 'Preco promocional removido',
        data: rows[0]
      });
    } catch (error) {
      console.error('Erro ao salvar preco promocional:', error.message);
      return res.status(500).json({ error: 'Erro ao salvar preco promocional' });
    }
  }

  /**
   * Confere os vinculos locais contra a NuvemShop e corrige estados divergentes.
   */
  async reconcileNuvemShop(req, res) {
    try {
      const { rows: products } = await intDb.query(`
        SELECT *
        FROM integration_products
        ORDER BY updated_at DESC
      `);

      const results = {
        checked: 0,
        linked: 0,
        removedFromSite: 0,
        deletedOnSite: 0,
        pendingCreate: 0,
        synced: 0,
        errors: 0,
        details: []
      };

      for (const product of products) {
        results.checked++;

        try {
          const siteProduct = await this.findSiteProduct(product.sku, product.nuvemshop_product_id);
          const hadSiteLink = !!product.nuvemshop_product_id;

          if (!product.send_to_site && siteProduct) {
            await nuvemShop.deleteProduct(siteProduct.id);
            await intDb.query(
              `UPDATE integration_products
               SET nuvemshop_product_id = NULL,
                   nuvemshop_variant_id = NULL,
                   sync_status = 'not_synced',
                   error_message = NULL,
                   updated_at = NOW()
               WHERE id = $1`,
              [product.id]
            );
            results.removedFromSite++;
            results.details.push({ sku: product.sku, action: 'removed_from_site' });
            continue;
          }

          if (!siteProduct) {
            const syncStatus = product.send_to_site && !hadSiteLink ? 'pending' : 'not_synced';
            const sendToSite = hadSiteLink ? false : product.send_to_site;

            await intDb.query(
              `UPDATE integration_products
               SET send_to_site = $1,
                   nuvemshop_product_id = NULL,
                   nuvemshop_variant_id = NULL,
                   sync_status = $2,
                   error_message = NULL,
                   updated_at = NOW()
               WHERE id = $3`,
              [sendToSite, syncStatus, product.id]
            );

            if (hadSiteLink) {
              results.deletedOnSite++;
              results.details.push({ sku: product.sku, action: 'deleted_on_site_unmarked_local' });
            } else if (product.send_to_site) {
              results.pendingCreate++;
              results.details.push({ sku: product.sku, action: 'pending_create' });
            }
            continue;
          }

          const variant = this.getVariantBySku(siteProduct, product.sku);
          await intDb.query(
            `UPDATE integration_products
             SET send_to_site = true,
                 nuvemshop_product_id = $1,
                 nuvemshop_variant_id = $2,
                 sync_status = 'synced',
                 error_message = NULL,
                 updated_at = NOW()
             WHERE id = $3`,
            [siteProduct.id, variant?.id || null, product.id]
          );

          results.linked++;
        } catch (error) {
          results.errors++;
          await intDb.query(
            "UPDATE integration_products SET sync_status = 'error', error_message = $1 WHERE id = $2",
            [error.message, product.id]
          );
          results.details.push({ sku: product.sku, error: error.message });
        }
      }

      const syncResults = await SyncController.syncProducts();
      results.synced = syncResults.success;
      results.errors += syncResults.errors;

      return res.json({
        message: 'Validacao da NuvemShop finalizada',
        results,
        sync: syncResults
      });
    } catch (error) {
      console.error('Erro na validacao da NuvemShop:', error.message);
      return res.status(500).json({ error: 'Erro interno ao validar a NuvemShop' });
    }
  }

  /**
   * Lista produtos que ja estao na tabela de integracao.
   */
  async getIntegratedProducts(req, res) {
    try {
      const { rows } = await intDb.query('SELECT * FROM integration_products ORDER BY updated_at DESC');
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar produtos integrados' });
    }
  }

  /**
   * Retorna estatisticas rapidas para o Dashboard.
   */
  async getStats(req, res) {
    try {
      const stats = await intDb.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE send_to_site = true) as marked,
          COUNT(*) FILTER (WHERE nuvemshop_product_id IS NOT NULL AND send_to_site = true) as synced,
          COUNT(*) FILTER (WHERE sync_status = 'error') as errors
        FROM integration_products
      `);
      return res.json(stats.rows[0]);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar estatisticas' });
    }
  }
}

module.exports = new IntegrationController();
