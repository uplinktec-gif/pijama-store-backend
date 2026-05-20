import app from './src/app.js';
import { logger } from './src/utils/logger.js';
import { inicializarScheduler, cancelarTodosJobs } from './src/services/scheduler/jobs.js';
import { initializeSheets } from './src/config/sheets.js';
import { initializeClaude } from './src/config/claude.js';
import { initializeGemini } from './src/config/gemini.js';
import { inicializarSecretSessao } from './src/utils/sessionTokens.js';
import { inicializarSheetSuporte } from './src/services/sheets/suporte.js';

const PORT = process.env.PORT || 3000;

async function iniciar() {
  // Inicializar Google Sheets e Claude API antes de aceitar requisições
  await initializeSheets();
  initializeClaude();
  await initializeGemini();

  // Inicializar secret de sessão do cliente (Portal)
  const clienteSessionSecret = process.env.CLIENTE_SESSION_SECRET;
  if (!clienteSessionSecret) {
    logger.warn('⚠️  CLIENTE_SESSION_SECRET não configurado — Portal do Cliente desativado');
  } else {
    inicializarSecretSessao(clienteSessionSecret);
  }

  // Inicializar sheet SUPORTE para "Fale Conosco"
  await inicializarSheetSuporte();

  let server;
  let actualPort = PORT;

  // Tentar iniciar o servidor, com fallback para próximas portas se houver erro EADDRINUSE
  const tryListen = (port) => {
    return new Promise((resolve, reject) => {
      const tempServer = app.listen(port, () => {
        logger.info(`✓ Servidor rodando em http://localhost:${port}`);
        logger.info(`✓ Ambiente: ${process.env.NODE_ENV || 'development'}`);
        actualPort = port;
        server = tempServer;
        inicializarScheduler();
        resolve();
      }).on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < PORT + 10) {
          logger.warn(`Porta ${port} em uso, tentando ${port + 1}...`);
          tryListen(port + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  };

  await tryListen(actualPort);

  process.on('SIGTERM', () => {
    logger.info('SIGTERM recebido. Encerrando servidor...');
    cancelarTodosJobs();
    server.close(() => {
      logger.info('Servidor encerrado');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT recebido. Encerrando servidor...');
    cancelarTodosJobs();
    server.close(() => {
      logger.info('Servidor encerrado');
      process.exit(0);
    });
  });
}

iniciar().catch(error => {
  logger.error('Erro ao inicializar servidor:', error.message);
  process.exit(1);
});
