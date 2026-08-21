const { Pool } = require('pg');

// Pool de conexão com o Banco da INTEGRAÇÃO (ONDE ESCREVEMOS)
const intPool = new Pool({
  host: process.env.INT_DB_HOST,
  port: process.env.INT_DB_PORT,
  database: process.env.INT_DB_NAME,
  user: process.env.INT_DB_USER,
  password: String(process.env.INT_DB_PASS || ''),
  max: 10,
});

const initDb = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS integration_products (
        id SERIAL PRIMARY KEY,
        uniplus_product_id INTEGER UNIQUE NOT NULL,
        sku VARCHAR(100) UNIQUE NOT NULL,
        send_to_site BOOLEAN DEFAULT FALSE,
        nuvemshop_product_id BIGINT,
        nuvemshop_variant_id BIGINT,
        last_synced_at TIMESTAMP,
        last_stock DECIMAL(15,4),
        last_erp_stock DECIMAL(15,4),
        last_price DECIMAL(15,2),
        nuvemshop_price DECIMAL(15,2),
        promotional_price DECIMAL(15,2),
        last_promotional_price DECIMAL(15,2),
        last_name VARCHAR(255),
        last_category VARCHAR(100),
        nuvemshop_description TEXT,
        last_nuvemshop_description TEXT,
        generated_description TEXT,
        image_source_url TEXT,
        image_local_path TEXT,
        image_public_url TEXT,
        image2_source_url TEXT,
        image2_local_path TEXT,
        image2_public_url TEXT,
        image2_enriched_at TIMESTAMP,
        images_synced_at TIMESTAMP,
        image_search_term TEXT,
        blocked_image_urls JSONB DEFAULT '[]'::jsonb,
        enrichment_status VARCHAR(20) DEFAULT 'not_prepared',
        enrichment_error TEXT,
        enriched_at TIMESTAMP,
        sync_status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100),
        action VARCHAR(50),
        status VARCHAR(20),
        message TEXT,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pending_orders (
        id SERIAL PRIMARY KEY,
        nuvemshop_order_id BIGINT,
        sku VARCHAR(100),
        quantity INTEGER,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS generated_description TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS nuvemshop_description TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS last_nuvemshop_description TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image_source_url TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image_local_path TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image_public_url TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image2_source_url TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image2_local_path TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image2_public_url TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image2_enriched_at TIMESTAMP;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS images_synced_at TIMESTAMP;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS image_search_term TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS last_erp_stock DECIMAL(15,4);
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS nuvemshop_price DECIMAL(15,2);
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS promotional_price DECIMAL(15,2);
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS last_promotional_price DECIMAL(15,2);
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS blocked_image_urls JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(20) DEFAULT 'not_prepared';
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS enrichment_error TEXT;
    ALTER TABLE integration_products ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP;

    ALTER TABLE pending_orders DROP CONSTRAINT IF EXISTS pending_orders_nuvemshop_order_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS pending_orders_order_sku_idx
      ON pending_orders (nuvemshop_order_id, sku);
  `;
  try {
    await intPool.query(queryText);
    console.log('✅ Tabelas de integração verificadas/criadas');
  } catch (err) {
    console.error('❌ Erro ao criar tabelas de integração:', err.message);
  }
};

const ready = initDb();

module.exports = {
  query: async (text, params) => {
    await ready;
    return intPool.query(text, params);
  },
};
