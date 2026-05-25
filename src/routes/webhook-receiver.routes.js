import express from 'express';
import {
  receberNotificacaoEstoque,
  healthCheckWebhook,
  sincronizarEstoque
} from '../controllers/webhook-receiver.controller.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// ============================================================
// WEBHOOK RECEIVER ROUTES (Públicas - sem autenticação)
// ============================================================
// Essas rotas recebem notificações do servidor central
// quando há mudanças de estoque

/**
 * GET /webhooks/estoque/health — Health check
 * Verificar se o receiver está saudável
 */
router.get('/estoque/health', healthCheckWebhook);

/**
 * POST /webhooks/estoque — Receber notificação de estoque
 * Chamado pelo servidor central quando há mudanças
 *
 * Validação:
 * - Verificar origem (IP whitelist ou signature HMAC)
 * - Verificar versão (evitar duplicatas)
 * - Processamento assíncrono
 */
router.post('/estoque', (req, res, next) => {
  // Log para auditoria
  logger.debug(`[webhook-receiver] POST /webhooks/estoque de ${req.ip}`);

  // Opcional: Validar assinatura HMAC
  // const signature = req.headers['x-webhook-signature'];
  // if (!validarAssinatura(req.body, signature)) {
  //   return res.status(401).json({ error: 'Assinatura inválida' });
  // }

  next();
}, receberNotificacaoEstoque);

/**
 * POST /webhooks/estoque/sync — Sincronizar estoque completo
 * Forçar sincronização após desconexão prolongada
 */
router.post('/estoque/sync', sincronizarEstoque);

export default router;
