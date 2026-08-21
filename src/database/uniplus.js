const { Pool } = require('pg');

// Pool de conexão com o ERP UNIPLUS (FONTE - SOMENTE LEITURA)
const erpPool = new Pool({
  host: process.env.ERP_DB_HOST,
  port: process.env.ERP_DB_PORT,
  database: process.env.ERP_DB_NAME,
  user: process.env.ERP_DB_USER,
  password: String(process.env.ERP_DB_PASS || ''),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

erpPool.on('connect', () => {
  console.log('✅ Conectado ao banco de dados UNIPLUS (Somente Leitura)');
});

erpPool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do UNIPLUS:', err.message);
});

module.exports = {
  query: (text, params) => erpPool.query(text, params),
};
