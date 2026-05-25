import { registrarClienteSSE, obterClientesConectados } from '../services/sse/estoque-sse.js';
import { logger } from '../utils/logger.js';

/**
 * Conexão SSE para atualizações de estoque em tempo real
 * GET /api/sse/estoque
 *
 * Cliente (Portal/Admin):
 * const eventSource = new EventSource('/api/sse/estoque');
 * eventSource.addEventListener('data', (event) => {
 *   const msg = JSON.parse(event.data);
 *   console.log('Estoque atualizado:', msg);
 * });
 */
export function conectarSSEEstoque(req, res) {
  const clienteId = `${req.ip}-${Date.now()}`;
  logger.info(`[SSE-estoque] Novo cliente conectado: ${clienteId}`);

  const registrado = registrarClienteSSE(res);

  if (!registrado) {
    return res.status(503).json({
      error: 'Servidor SSE cheio - tente novamente mais tarde'
    });
  }

  // Enviar mensagem inicial
  res.write(`data: ${JSON.stringify({
    tipo: 'conectado',
    mensagem: 'Conexão SSE estabelecida',
    timestamp: new Date().toISOString()
  })}\n\n`);
}

/**
 * Obter status de conexões SSE
 * GET /api/sse/status
 */
export function statusSSE(req, res) {
  const clientesConectados = obterClientesConectados();

  return res.json({
    success: true,
    sseAtivo: true,
    clientesConectados,
    timestamp: new Date().toISOString()
  });
}
