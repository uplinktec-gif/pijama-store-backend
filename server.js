import app from './src/app.js';
import { logger } from './src/utils/logger.js';
import { inicializarScheduler, cancelarTodosJobs } from './src/services/scheduler/jobs.js';
import { initializeDatabase, closeDatabase, saveDatabase } from './src/config/database.js';
import { initializeSheets } from './src/config/sheets.js';
import { initializeClaude } from './src/config/claude.js';
import { initializeGemini } from './src/config/gemini.js';
import { inicializarSecretSessao } from './src/utils/sessionTokens.js';

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function iniciar() {
  // Inicializar banco de dados SQLite
  await initializeDatabase();

  // Inicializar Claude API
  initializeClaude();
  await initializeGemini();

  // Inicializar Google Sheets (opcional - usado apenas para Google OAuth)
  try {
    await initializeSheets();
  } catch (err) {
    logger.warn('⚠️ Google Sheets não inicializado (opcional):', err.message);
  }

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
      logger.info(`✓ Servidor rodando em http://localhost:${PORT}`);
      logger.info(`✓ Ambiente: ${process.env.NODE_ENV || 'development'}`);
      inicializarScheduler();
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
