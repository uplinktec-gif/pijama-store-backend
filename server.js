import app from './src/app.js';
import { logger } from './src/utils/logger.js';
import { inicializarScheduler, cancelarTodosJobs } from './src/services/scheduler/jobs.js';
import { executarMonitor } from './src/services/monitor/evolution-monitor.js';
import { initializeDatabase, closeDatabase, saveDatabase } from './src/config/database.js';
import { initializeClaude } from './src/config/claude.js';
import { inicializarSecretSessao } from './src/utils/sessionTokens.js';
import { env } from './src/config/env.js';

const PORT = env.port;

async function iniciar() {
  // Inicializar banco de dados SQLite
  await initializeDatabase();

  // Inicializar Claude API
  initializeClaude();

  // Inicializar secret de sessão do cliente (Portal)
  const clienteSessionSecret = process.env.CLIENTE_SESSION_SECRET;
  if (!clienteSessionSecret) {
    logger.warn('⚠️  CLIENTE_SESSION_SECRET não configurado — Portal do Cliente desativado');
  } else {
    inicializarSecretSessao(clienteSessionSecret);
  }

  let server;

  // Iniciar na porta configurada — sem fallback para portas alternativas
  // (portas alternativas causam acúmulo de processos zumbis com scheduler ativo)
  await new Promise((resolve, reject) => {
    server = app.listen(PORT, () => {
      const isDev = env.nodeEnv === 'development';
      logger.info(`✓ Servidor rodando em http://localhost:${PORT}`);
      logger.info(`✓ Ambiente: ${env.nodeEnv.toUpperCase()}`);
      logger.info(`✓ Banco de dados: ${env.dbPath}`);

      if (isDev) {
        logger.warn('⚠️  Modo DESENVOLVIMENTO - CORS aberto, endpoints de teste ativados');
      } else {
        logger.info('🔒 Modo PRODUÇÃO - CORS restrito, segurança ativada');
      }

      inicializarScheduler();

      // Iniciar monitor de Evolution API em background
      executarMonitor().catch(err => {
        logger.error('Erro ao iniciar Evolution Monitor:', err.message);
      });

      resolve();
    }).on('error', (err) => {
      logger.error(`✗ Não foi possível iniciar na porta ${PORT}: ${err.message}`);
      reject(err);
    });
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM recebido. Encerrando servidor...');
    cancelarTodosJobs();
    saveDatabase(true);
    closeDatabase();
    server.close(() => {
      logger.info('Servidor encerrado');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT recebido. Encerrando servidor...');
    cancelarTodosJobs();
    saveDatabase(true);
    closeDatabase();
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
