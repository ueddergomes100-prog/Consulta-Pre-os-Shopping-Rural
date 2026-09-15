const { test } = require('node:test');
const assert = require('node:assert/strict');
const { attachPromotions } = require('./CatalogPromotionService');

// Fixtures isoladas; não são usadas pela aplicação nem gravadas em banco.
const product = { product_id: '1', codigo: 'TEST', preco: '100', price_branches: ['1'] };
const campaign = { product_id: '1', campaign_id: '7', price: '80', tabelapreco: -1, branches: [], packages: [] };

test('preço unitário do ERP e campos públicos', () => {
  const [result] = attachPromotions([product], [campaign]);
  assert.equal(result.promotional_price, 80);
  assert.equal(result.promotion_source, 'uniplus');
  assert.equal(result.product_id, undefined);
  assert.equal(result.price_branches, undefined);
  assert.equal(result.nuvemshop_price, undefined);
});

test('não usa desconto inexistente, inválido ou superior ao preço normal', () => {
  for (const price of ['0', '-1', '120', null, 'invalid']) {
    assert.equal(attachPromotions([product], [{ ...campaign, price }])[0].promotional_price, null);
  }
  assert.deepEqual(attachPromotions([product], [])[0].promotions, []);
});

test('condições de preço, cliente, pagamento e quantidade não viram desconto automático', () => {
  for (const restriction of [{ tabelapreco: 15 }, { clientefidelidade: 1 }, { payment_rules: true }, { quantidade: 4 }, { quota: 10 }, { custom_rules: true }]) {
    const [result] = attachPromotions([product], [{ ...campaign, ...restriction }]);
    assert.equal(result.promotional_price, null);
    assert.ok(result.promotions[0].conditions.length > 0);
  }
});

test('respeita filial e não escolhe um preço entre filiais agregadas', () => {
  assert.equal(attachPromotions([product], [{ ...campaign, branches: ['2'] }])[0].promotions.length, 0);
  assert.equal(attachPromotions([product], [{ ...campaign, branches: ['1'] }])[0].promotional_price, 80);
  assert.equal(attachPromotions([{ ...product, price_branches: ['1', '2'] }], [campaign])[0].promotional_price, null);
});

test('promoção da embalagem fica separada do preço unitário', () => {
  const [result] = attachPromotions([product], [{ ...campaign, packages: [{ price: '1500', unit: 'SACO', quantity: '20', branch: '1' }] }]);
  assert.equal(result.promotional_price, 80);
  assert.equal(result.promotions[1].price, 1500);
  assert.match(result.promotions[1].conditions[0], /SACO/);
});

test('campanhas concorrentes com preços distintos exigem conferência', () => {
  const [result] = attachPromotions([product], [campaign, { ...campaign, campaign_id: '8', price: '70' }]);
  assert.equal(result.promotional_price, null);
  assert.equal(result.promotions.length, 2);
  assert.ok(result.promotions.every((offer) => offer.conditions.some((condition) => condition.includes('simultâneas'))));
});

test('falha na consulta de promoções retorna erro em vez de preços sem conferência', async (t) => {
  const erpDb = require('../database/uniplus');
  const controller = require('../controllers/ProductController');
  t.mock.method(console, 'error', () => {});
  t.mock.method(erpDb, 'query', async (sql) => {
    if (sql.includes('COUNT(*)::integer AS total')) return { rows: [{ total: 1 }] };
    if (sql.includes('p.id AS product_id')) return { rows: [product] };
    throw new Error('Falha de conexão simulada em teste isolado');
  });
  const response = {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
  };
  await controller.getCatalogProducts({ query: { search: 'TEST' } }, response);
  assert.equal(response.code, 503);
  assert.equal(response.body.data, undefined);
  assert.ok(response.body.error);
});
