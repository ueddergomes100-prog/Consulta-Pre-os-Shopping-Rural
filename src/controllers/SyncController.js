const nuvemShop = require('../services/NuvemShopService');
const intDb = require('../database/integration');
const erpDb = require('../database/uniplus');

class SyncController {
  /**
   * Sincroniza produtos marcados para envio, evitando reenviar itens sem alteracao.
   */
  async syncProducts(filter = {}) {
    const params = [];
    let where = 'send_to_site = true';

    if (filter.sku) {
      params.push(filter.sku);
      where += ` AND sku = $${params.length}`;
    }

    const { rows: productsToSync } = await intDb.query(
      `SELECT * FROM integration_products WHERE ${where}`,
      params
    );

    const results = { success: 0, skipped: 0, errors: 0, details: [] };

    for (const item of productsToSync) {
      try {
        await new Promise(resolve => setTimeout(resolve, 600));

        const { rows: freshData } = await erpDb.query(
          `SELECT
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
           WHERE p.codigo = $1`,
          [item.sku]
        );

        if (freshData.length === 0) {
          results.skipped++;
          results.details.push({ sku: item.sku, status: 'skipped', reason: 'Produto nao encontrado no Uniplus' });
          continue;
        }

        const currentErpPrice = parseFloat(freshData[0].preco || 0);
        const currentErpStock = parseFloat(freshData[0].estoque || 0);
        const manualSitePrice = item.nuvemshop_price === null ? null : parseFloat(item.nuvemshop_price);
        const effectiveSitePrice = manualSitePrice ?? currentErpPrice;

        let reservedCount = await this.getReservedCount(item.sku);
        const lastErpStock = item.last_erp_stock === null ? null : parseFloat(item.last_erp_stock);

        if (reservedCount > 0 && lastErpStock !== null && currentErpStock <= lastErpStock - reservedCount) {
          await intDb.query(
            "UPDATE pending_orders SET processed = true WHERE sku = $1 AND processed = false",
            [item.sku]
          );
          reservedCount = 0;
        }

        const finalStock = Math.max(0, Math.floor(currentErpStock - reservedCount));
        const currentPromoPrice = item.promotional_price === null ? null : parseFloat(item.promotional_price);
        const lastPromoPrice = item.last_promotional_price === null ? null : parseFloat(item.last_promotional_price);
        const promoForNuvemShop = currentPromoPrice && currentPromoPrice > 0 ? currentPromoPrice : null;
        const effectiveSiteName = String(item.nuvemshop_description || '').trim() || item.last_name;
        const lastSiteName = String(item.last_nuvemshop_description || '').trim() || item.last_name;
        const hasPreparedImages = !!(item.image_local_path || item.image2_local_path);
        const needsCreate = !item.nuvemshop_product_id || item.sync_status === 'pending';
        const needsImageCheck = hasPreparedImages && !item.images_synced_at;
        const stockChanged = item.last_stock === null || parseFloat(item.last_stock) !== finalStock;
        const priceChanged = item.last_price === null || parseFloat(item.last_price) !== effectiveSitePrice;
        const promoChanged = lastPromoPrice !== promoForNuvemShop;
        const siteNameChanged = lastSiteName !== effectiveSiteName;

        if (promoForNuvemShop !== null && promoForNuvemShop >= effectiveSitePrice) {
          throw new Error(`Preco promocional (${promoForNuvemShop}) precisa ser menor que o preco normal enviado (${effectiveSitePrice})`);
        }

        if (!needsCreate && !stockChanged && !priceChanged && !promoChanged && !siteNameChanged && !needsImageCheck) {
          await intDb.query(
            `UPDATE integration_products
             SET last_erp_stock = $1, last_synced_at = NOW(), sync_status = 'synced', error_message = NULL
             WHERE id = $2`,
            [currentErpStock, item.id]
          );
          results.skipped++;
          continue;
        }

        let changeMsg = `"${item.last_name}"`;
        if (stockChanged) changeMsg += ` | Estoque: ${item.last_stock} -> ${finalStock}`;
        if (priceChanged) changeMsg += ` | Preco: R$ ${item.last_price} -> R$ ${effectiveSitePrice}`;
        if (promoChanged) changeMsg += ` | Promocional: R$ ${lastPromoPrice || 0} -> R$ ${promoForNuvemShop || 0}`;
        if (siteNameChanged) changeMsg += ` | Nome NuvemShop alterado`;
        if (needsImageCheck) changeMsg += ' | Conferir imagens';
        if (!stockChanged && !priceChanged && !promoChanged && !siteNameChanged && !needsImageCheck) changeMsg += ' | Produto novo/pendente';

        // SKU primeiro: se o produto ja existe no site, atualizamos ele em vez de criar outro.
        let siteProduct = await nuvemShop.findProductBySku(item.sku);
        let siteVariant = siteProduct?.variants?.find(v => String(v.sku) === String(item.sku));

        if (!siteProduct && item.nuvemshop_product_id) {
          try {
            siteProduct = await nuvemShop.getProduct(item.nuvemshop_product_id);
            siteVariant = siteProduct?.variants?.find(v => String(v.sku) === String(item.sku))
              || siteProduct?.variants?.find(v => String(v.id) === String(item.nuvemshop_variant_id))
              || siteProduct?.variants?.[0];
          } catch (linkedError) {
            const isNotFound = linkedError.message.includes('404')
              || linkedError.message.includes('Not Found')
              || linkedError.message.includes('does not exist');
            if (!isNotFound) throw linkedError;

            await intDb.query(
              "UPDATE integration_products SET nuvemshop_product_id = NULL, nuvemshop_variant_id = NULL WHERE id = $1",
              [item.id]
            );
          }
        }

        if (siteProduct && siteVariant) {
          await nuvemShop.updateVariant(siteProduct.id, siteVariant.id, {
            estoque: finalStock,
            preco: effectiveSitePrice,
            precoPromocional: promoForNuvemShop
          });

          if (siteNameChanged || needsCreate) {
            await nuvemShop.updateProduct(siteProduct.id, {
              nome: effectiveSiteName,
              descricao: item.generated_description
            });
          }

          if (needsImageCheck) {
            const currentImages = await nuvemShop.listProductImages(siteProduct.id);
            if (currentImages.length === 0) {
              await nuvemShop.replaceProductImages(siteProduct.id, [
                item.image_local_path,
                item.image2_local_path
              ], item.last_name);
            }
          }

          await intDb.query(
            "UPDATE integration_products SET nuvemshop_product_id = $1, nuvemshop_variant_id = $2, sync_status = 'synced', images_synced_at = CASE WHEN $4 = true THEN NOW() ELSE images_synced_at END WHERE id = $3",
            [siteProduct.id, siteVariant.id, item.id, needsImageCheck]
          );
          console.log(`${changeMsg} | Preco/estoque atualizados no site.`);
        } else {
          const newProd = await nuvemShop.createProduct({
            nome: effectiveSiteName,
            sku: item.sku,
            preco: effectiveSitePrice,
            precoPromocional: promoForNuvemShop,
            estoque: finalStock,
            descricao: item.generated_description
          });

          const newVariant = newProd.variants?.find(v => String(v.sku) === String(item.sku))
            || newProd.variants?.[0];

          await nuvemShop.replaceProductImages(newProd.id, [
            item.image_local_path,
            item.image2_local_path
          ], item.last_name);

          await intDb.query(
            "UPDATE integration_products SET nuvemshop_product_id = $1, nuvemshop_variant_id = $2, sync_status = 'synced', images_synced_at = CASE WHEN $4 = true THEN NOW() ELSE images_synced_at END WHERE id = $3",
            [newProd.id, newVariant?.id || null, item.id, hasPreparedImages]
          );
          console.log(`Novo cadastro criado no site para "${item.last_name}".`);
        }

        await intDb.query(
          `UPDATE integration_products
           SET last_synced_at = NOW(),
               last_stock = $1,
               last_erp_stock = $2,
               last_price = $3,
               last_promotional_price = $4,
               last_nuvemshop_description = $5,
               sync_status = 'synced',
               error_message = NULL
           WHERE id = $6`,
          [finalStock, currentErpStock, effectiveSitePrice, promoForNuvemShop, effectiveSiteName, item.id]
        );

        results.success++;
      } catch (error) {
        results.errors++;
        await intDb.query(
          "UPDATE integration_products SET sync_status = 'error', error_message = $1 WHERE id = $2",
          [error.message, item.id]
        );
        results.details.push({ sku: item.sku, error: error.message });
      }
    }

    return results;
  }

  async getReservedCount(sku) {
    const { rows: pending } = await intDb.query(
      "SELECT SUM(quantity) as reserved FROM pending_orders WHERE sku = $1 AND processed = false",
      [sku]
    );

    return parseInt(pending[0].reserved || 0);
  }

  async syncSku(sku) {
    return this.syncProducts({ sku });
  }

  async syncAll(req, res) {
    try {
      const results = await this.syncProducts();

      return res.json({
        message: 'Processo de sincronizacao finalizado',
        results
      });
    } catch (error) {
      console.error('Erro na sincronizacao:', error.message);
      return res.status(500).json({ error: 'Erro interno no processo de sincronizacao' });
    }
  }
}

module.exports = new SyncController();
