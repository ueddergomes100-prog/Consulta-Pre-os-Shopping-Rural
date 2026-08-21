require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const setupJobs = require('./jobs/SyncJob');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Inicia os agendadores
setupJobs();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/media', express.static(path.join(__dirname, '..', 'data', 'media')));

// Rotas
app.use('/api', routes);

// Rota de status
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Integração Uniplus <-> NuvemShop'
  });
});

const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de integração rodando na porta ${PORT}`);
  console.log(`🔗 Endpoint de produtos: http://localhost:${PORT}/api/erp/products`);
});
