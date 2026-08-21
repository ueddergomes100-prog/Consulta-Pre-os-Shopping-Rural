const express = require('express');
const { Router } = express;
const ProductController = require('../controllers/ProductController');
const IntegrationController = require('../controllers/IntegrationController');
const SyncController = require('../controllers/SyncController');
const WebhookController = require('../controllers/WebhookController');

const routes = Router();

// ERP (Uniplus)
routes.get('/erp/products', ProductController.getErpProducts);
routes.get('/catalog/products', ProductController.getCatalogProducts.bind(ProductController));
routes.post('/catalog/products/:codigo/view', ProductController.recordCatalogView.bind(ProductController));

// Integração (Local)
routes.get('/integration/products', IntegrationController.getIntegratedProducts);
routes.post('/integration/toggle', IntegrationController.toggleSync.bind(IntegrationController));
routes.post('/integration/nuvemshop-price', IntegrationController.updateNuvemShopPrice.bind(IntegrationController));
routes.post('/integration/promotional-price', IntegrationController.updatePromotionalPrice.bind(IntegrationController));
routes.post('/integration/nuvemshop-description', IntegrationController.updateNuvemShopDescription.bind(IntegrationController));
routes.post(
  '/integration/image',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '12mb' }),
  IntegrationController.uploadPastedImage
);
routes.get('/integration/stats', IntegrationController.getStats);
routes.post('/integration/sync', SyncController.syncAll.bind(SyncController));
routes.post('/integration/reconcile', IntegrationController.reconcileNuvemShop.bind(IntegrationController));

// Webhooks NuvemShop
routes.post('/webhook/order', WebhookController.handleOrderCreated);

// Autenticação NuvemShop (OAuth)
routes.get('/auth', async (req, res) => {
  const { code } = req.query;
  const axios = require('axios');

  if (!code) return res.send('Erro: Código não fornecido pela NuvemShop.');

  try {
    const response = await axios.post('https://www.nuvemshop.com.br/apps/authorize/token', {
      client_id: process.env.NUVEMSHOP_CLIENT_ID,
      client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code
    });

    const { access_token, user_id } = response.data;

    res.send(`
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: green;">✅ Sucesso!</h1>
        <p>Seu Access Token foi gerado:</p>
        <code style="background: #eee; padding: 10px; display: block;">${access_token}</code>
        <p>Seu Store ID é: <strong>${user_id}</strong></p>
        <p><strong>Copie esses dados e coloque no seu arquivo .env agora!</strong></p>
      </div>
    `);
  } catch (error) {
    res.status(500).send('Erro ao trocar código pelo token: ' + (error.response?.data?.error_description || error.message));
  }
});

module.exports = routes;
