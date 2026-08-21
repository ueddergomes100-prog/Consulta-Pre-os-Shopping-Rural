const intDb = require('../database/integration');
const SyncController = require('./SyncController');

class WebhookController {
  /**
   * Recebe notificações de novos pedidos da NuvemShop
   */
  async handleOrderCreated(req, res) {
    const order = req.body;
    
    // Verificamos se é um evento de pedido criado
    console.log(`📦 Novo pedido recebido da NuvemShop: #${order.id}`);

    try {
      // Loop pelos itens do pedido para reservar o estoque
      for (const item of order.products) {
        await intDb.query(
          `INSERT INTO pending_orders (nuvemshop_order_id, sku, quantity) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (nuvemshop_order_id, sku)
           DO UPDATE SET quantity = pending_orders.quantity + EXCLUDED.quantity`,
          [order.id, item.sku, item.quantity]
        );

        await SyncController.syncSku(item.sku);
      }

      return res.status(200).send('OK');
    } catch (error) {
      console.error('Erro ao processar webhook:', error.message);
      return res.status(500).send('Erro interno');
    }
  }
}

module.exports = new WebhookController();
