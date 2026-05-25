import { logger } from '../utils/logger.js';
import { query, queryOne } from '../config/database.js';
import { broadcast } from '../services/sse/estoque-sse.js';

// ============================================================
// WEBHOOK RECEIVER CONTROLLER
// ============================================================
// Recebe notificações de mudanças de estoque do servidor central
// e invalidaa cache local + notifica clientes via SSE/WebSocket

/**
 * Receber notificação de mudança de estoque (versioned event)
 * POST /webhooks/estoque
 *
 * Body (enviado pelo Event Bus):
 * {
 *   operacao: "INSERT|UPDATE|DELETE",
 *   sku: "MODELO_TAMANHO_COR",
 *   versao: 1,
 *   timestamp: "2026-05-24T17:35:08.000Z",
 *   mudancas: {
 *     quantidade_total: { de: 5, para: 10 },
 *     preco_unitario: { de: 79.90, para: 85.90 }
 *   },
 *   usuario_id: "admin"
 * }
 */
export async function receberNotificacaoEstoque(req, res) {
  try {
    const { operacao, sku, versao, mudancas, usuario_id, timestamp } = req.body;

    // Validar payload
    if (!operacao || !sku) {
      logger.warn('[webhook-receiver] Payload inválido:', req.body);
      return res.status(400).json({
        success: false,
        error: 'operacao e sku são obrigatórios'
      });
    }

    logger.info(`[webhook-receiver] ✓ Notificação recebida: ${operacao} ${sku} v${versao}`);

    // 1. Verificar se é um evento novo (versão desconhecida localmente)
    const localVersionAtual = obterVersaoLocalAtual();
    if (versao <= localVersionAtual) {
      logger.debug(`[webhook-receiver] Versão ${versao} já processada (local: ${localVersionAtual})`);
      return res.json({
        success: true,
        message: 'Evento já processado',
        versao_local: localVersionAtual,
        versao_recebida: versao
      });
    }

    // 2. Registrar recebimento da notificação
    registrarRecebimentoNotificacao(sku, versao, operacao);

    // 3. Atualizar cache local (invalidar)
    invalidarCacheEstoque(sku);

    // 4. Notificar clientes conectados via SSE
    const tipoNotificacao = operacao === 'INSERT' ? 'estoque-criado' :
                            operacao === 'UPDATE' ? 'estoque-atualizado' :
                            'estoque-deletado';
    broadcast(tipoNotificacao, {
      sku,
      operacao,
      mudancas,
      versao,
      usuario_id
    });

    // 5. Se for DELETE, marcar item como INATIVO
    if (operacao === 'DELETE') {
      query('UPDATE estoque SET status = ? WHERE sku = ?', ['INATIVO', sku]);
    }

    // 6. Atualizar version local
    atualizarVersaoLocal(versao);

    logger.info(`[webhook-receiver] ✓ Processado com sucesso: ${sku} v${versao}`);

    return res.json({
      success: true,
      message: `Notificação processada: ${operacao} ${sku}`,
      versao_processada: versao,
      timestamp_recebimento: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[webhook-receiver] Erro ao processar notificação:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar notificação de estoque'
    });
  }
}

/**
 * Health check para webhook receiver
 * GET /webhooks/estoque/health
 */
export async function healthCheckWebhook(req, res) {
  try {
    const versionAtual = obterVersaoLocalAtual();
    const lastNotificationTime = obterUltimaNotificacao();

    return res.json({
      success: true,
      status: 'healthy',
      versao_local: versionAtual,
      ultima_notificacao: lastNotificationTime,
      timestamp: new Date().toISOString(),
      consumer: 'pijama-store-portal'
    });
  } catch (error) {
    logger.error('[webhook-receiver] Erro no health check:', error.message);
    return res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
}

/**
 * Sincronizar estoque completo a partir do servidor
 * POST /webhooks/estoque/sync
 *
 * Útil para recuperação após desconexão prolongada
 */
export async function sincronizarEstoque(req, res) {
  try {
    logger.info('[webhook-receiver] Iniciando sincronização completa de estoque...');

    // Buscar versão local atual
    const versionAtual = obterVersaoLocalAtual();

    // Buscar estoque completo do servidor
    // (Em produção, isso seria uma chamada para o servidor central)
    // Por enquanto, vamos apenas retornar a versão local

    return res.json({
      success: true,
      message: 'Sincronização iniciada',
      versao_local: versionAtual,
      timestamp: new Date().toISOString(),
      status: 'syncing'
    });

  } catch (error) {
    logger.error('[webhook-receiver] Erro ao sincronizar estoque:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao sincronizar estoque'
    });
  }
}

// ============================================================
// FUNÇÕES AUXILIARES (Cache Management)
// ============================================================

// Em-memory cache de versão local
let versaoLocalAtual = 0;
let ultimaNotificacao = null;
const cacheEstoqueInvalidado = new Set();

/**
 * Obter versão local atual (última versão processada)
 */
function obterVersaoLocalAtual() {
  if (versaoLocalAtual === 0) {
    try {
      const result = queryOne('SELECT MAX(versao) as versao FROM estoque_versao');
      versaoLocalAtual = result?.versao ?? 0;
    } catch {
      versaoLocalAtual = 0;
    }
  }
  return versaoLocalAtual;
}

/**
 * Atualizar versão local após processar notificação
 */
function atualizarVersaoLocal(novaVersao) {
  versaoLocalAtual = Math.max(versaoLocalAtual, novaVersao);
  ultimaNotificacao = new Date().toISOString();
}

/**
 * Obter timestamp da última notificação processada
 */
function obterUltimaNotificacao() {
  return ultimaNotificacao;
}

/**
 * Invalidar cache de um SKU específico
 */
function invalidarCacheEstoque(sku) {
  cacheEstoqueInvalidado.add(sku);

  // Limpar cache global do estoque
  if (global.cacheEstoqueGlobal) {
    delete global.cacheEstoqueGlobal;
  }

  logger.debug(`[cache-invalidation] Cache invalidado para: ${sku}`);
}

/**
 * Verificar se cache de SKU foi invalidado
 */
export function isCacheInvalidado(sku) {
  return cacheEstoqueInvalidado.has(sku);
}

/**
 * Limpar flag de cache invalidado após recarregar
 */
export function limparInvalidacaoCache(sku) {
  cacheEstoqueInvalidado.delete(sku);
}

/**
 * Registrar recebimento de notificação
 */
function registrarRecebimentoNotificacao(sku, versao, operacao) {
  try {
    // Registrar em tabela de log (opcional, para auditoria)
    // run(
    //   'INSERT INTO webhook_recebimentos (sku, versao, operacao, timestamp) VALUES (?, ?, ?, ?)',
    //   [sku, versao, operacao, new Date().toISOString()]
    // );
    logger.debug(`[webhook-log] Recebimento registrado: ${sku} v${versao} ${operacao}`);
  } catch (error) {
    logger.warn('[webhook-log] Erro ao registrar recebimento:', error.message);
  }
}

/**
 * Notificar clientes conectados (via WebSocket ou SSE)
 *
 * NOTA: Para WebSocket, isso seria broadcast via socket.io
 * Para SSE, isso seria envio para todos os clientes conectados via EventEmitter
 *
 * Por enquanto, apenas registramos em log
 */
function notificarClientesEstoqueAtualizado(sku, operacao, mudancas) {
  try {
    // Se houver servidor WebSocket conectado (futuro)
    // io.emit('estoque:atualizado', { sku, operacao, mudancas });

    logger.info(`[broadcast] Notificando clientes: ${operacao} ${sku}`);

    // Emitir evento globalmente (para SSE listeners)
    if (global.estoque_notificacoes) {
      global.estoque_notificacoes.emit('estoque:changed', {
        sku,
        operacao,
        mudancas,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.warn('[broadcast] Erro ao notificar clientes:', error.message);
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

/**
 * Inicializar webhook receiver
 * Chamar ao iniciar o servidor
 */
export async function inicializarWebhookReceiver() {
  logger.info('[webhook-receiver] ✓ Webhook Receiver inicializado');

  // Carregar versão local do banco
  obterVersaoLocalAtual();

  // Inicializar EventEmitter para notificações em tempo real
  if (!global.estoque_notificacoes) {
    const { EventEmitter } = await import('events');
    global.estoque_notificacoes = new EventEmitter();
    global.estoque_notificacoes.setMaxListeners(100);
  }
}
