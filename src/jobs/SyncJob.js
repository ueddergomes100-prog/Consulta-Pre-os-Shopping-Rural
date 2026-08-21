const cron = require('node-cron');
const SyncController = require('../controllers/SyncController');

/**
 * Configura as tarefas agendadas do sistema.
 */
const setupJobs = () => {
  const intervalSeconds = process.env.SYNC_INTERVAL_SECONDS || 60;

  console.log(`Agendador de estoque configurado para cada ${intervalSeconds} segundos.`);

  // A rotina continua checando o Uniplus, mas agora so envia para a NuvemShop quando algo mudou.
  const cronTime = intervalSeconds >= 60
    ? `*/${Math.floor(intervalSeconds / 60)} * * * *`
    : `*/${intervalSeconds} * * * * *`;

  cron.schedule(cronTime, async () => {
    console.log('Verificando alteracoes de estoque/preco no Uniplus...');

    const mockReq = {};
    const mockRes = {
      json: (data) => console.log(
        'Sync automatico finalizado:',
        data.results.success,
        'sincronizados,',
        data.results.skipped,
        'sem alteracao'
      ),
      status: () => ({ json: (err) => console.error('Erro no sync automatico:', err) })
    };

    try {
      await SyncController.syncAll(mockReq, mockRes);
    } catch (error) {
      console.error('Erro critico no agendador:', error.message);
    }
  });
};

module.exports = setupJobs;
