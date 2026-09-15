const { Pool } = require('pg');

// O catálogo consulta os preços existentes sem executar as migrações da integração.
const pool = new Pool({
  host: process.env.INT_DB_HOST,
  port: process.env.INT_DB_PORT,
  database: process.env.INT_DB_NAME,
  user: process.env.INT_DB_USER,
  password: String(process.env.INT_DB_PASS || ''),
  max: 3,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  options: '-c default_transaction_read_only=on',
});

pool.on('error', () => console.error('Conexão de consulta das promoções indisponível.'));

module.exports = { query: (sql, params) => pool.query(sql, params) };
