require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const ProductController = require('./controllers/ProductController');

const app = express();
const PORT = process.env.CATALOG_PUBLIC_PORT || 3010;
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const indexPath = path.join(frontendDistPath, 'index.html');

app.set('trust proxy', true);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '32kb' }));
app.use(morgan('tiny'));

const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const READ_LIMIT = 180;
const WRITE_LIMIT = 60;

function rateLimit(limit) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.method}:${req.path}`;
    const current = rateBuckets.get(key);

    if (!current || current.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return next();
    }

    if (current.count >= limit) {
      return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Tente novamente em instantes.' });
    }

    current.count += 1;
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
}, RATE_WINDOW_MS).unref();

app.get(
  '/api/catalog/medicamentos',
  rateLimit(READ_LIMIT),
  ProductController.getCatalogMedicines.bind(ProductController)
);

app.get(
  '/api/catalog/products',
  rateLimit(READ_LIMIT),
  ProductController.getCatalogProducts.bind(ProductController)
);

app.post(
  '/api/catalog/products/:codigo/view',
  rateLimit(WRITE_LIMIT),
  ProductController.recordCatalogView.bind(ProductController)
);

app.get('/health', (req, res) => {
  res.json({ status: 'online' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso nao encontrado.' });
});

app.use(express.static(frontendDistPath, {
  dotfiles: 'ignore',
  fallthrough: true,
  index: false,
  maxAge: '1h',
}));

app.get('*', (req, res) => {
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send('Catalogo indisponivel. Execute o build do frontend.');
  }

  return res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`Catalogo publico rodando em http://localhost:${PORT}/catalogo`);
});
