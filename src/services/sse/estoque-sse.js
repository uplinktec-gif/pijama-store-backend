import { logger } from '../../utils/logger.js';

// ============================================================
// SERVER-SENT EVENTS (SSE) SERVICE
// ============================================================
// Envia atualizações de estoque em tempo real para clientes
// conectados via EventSource API

const sseClients = new Set();
const MAX_CLIENTS = 1000;

/**
 * Registrar cliente para SSE
 * Chamado quando um cliente se conecta
 */
export function registrarClienteSSE(res) {
  if (sseClients.size >= MAX_CLIENTS) {
    logger.warn('[SSE] Limite máximo de clientes atingido');
    return false;
  }

  // Configurar headers para SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Desabilitar buffering em proxies
    'Access-Control-Allow-Origin': '*'
  });

  // Enviar heartbeat inicial
  res.write(':\n\n');

  // Registrar cliente
  sseClients.add(res);
  logger.debug(`[SSE] Cliente registrado (total: ${sseClients.size})`);

  // Cleanup ao desconectar
  res.on('close', () => {
    sseClients.delete(res);
    logger.debug(`[SSE] Cliente desconectado (total: ${sseClients.size})`);
  });

  res.on('error', (error) => {
    logger.warn('[SSE] Erro na conexão:', error.message);
    sseClients.delete(res);
  });

  return true;
}

/**
 * Enviar notificação de atualização de estoque para todos os clientes
 * Chamado quando webhook notifica mudança
 */
export function broadcast(tipo, dados) {
  const mensagem = {
    tipo,           // 'estoque-atualizado', 'estoque-criado', etc.
    timestamp: new Date().toISOString(),
    dados
  };

  const json = JSON.stringify(mensagem);
  const evento = `data: ${json}\n\n`;

  logger.info(`[SSE] Broadcast: ${tipo} para ${sseClients.size} clientes`);

  // Enviar para todos os clientes conectados
  sseClients.forEach(res => {
    try {
      res.write(evento);
    } catch (error) {
      logger.warn('[SSE] Erro ao enviar para cliente:', error.message);
      sseClients.delete(res);
    }
  });
}

/**
 * Obter número de clientes conectados
 */
export function obterClientesConectados() {
  return sseClients.size;
}

/**
 * Fechar todas as conexões SSE (ao desligar o servidor)
 */
export function fecharTodasAsConexoes() {
  logger.info('[SSE] Fechando todas as conexões...');
  sseClients.forEach(res => {
    try {
      res.end();
    } catch (error) {
      logger.warn('[SSE] Erro ao fechar conexão:', error.message);
    }
  });
  sseClients.clear();
}

/**
 * Enviar heartbeat para manter conexões vivas
 * Chamar periodicamente
 */
export function enviarHeartbeat() {
  sseClients.forEach(res => {
    try {
      res.write(':\n\n'); // Comment keeps connection alive
    } catch (error) {
      sseClients.delete(res);
    }
  });
}

// Enviar heartbeat a cada 30 segundos
setInterval(enviarHeartbeat, 30000);

// Inicializar
logger.info('[SSE] ✓ Server-Sent Events service inicializado');
