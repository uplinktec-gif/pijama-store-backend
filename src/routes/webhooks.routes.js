import express from 'express';
import { verificarToken } from '../middleware/jwtAuth.js';
import {
  registrarConsumidor,
  notificarConsumidores,
  processarFilaMorta,
  listarConsumidores
} from '../services/webhooks/estoque.webhooks.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// ============================================================
// GESTÃO DE CONSUMIDORES (protegido por token admin)
// ============================================================

/**
 * GET /webhooks/consumidores — Listar consumidores registrados
 */
router.get('/consumidores', verificarToken, (req, res) => {
  try {
    const consumidores = listarConsumidores();
    res.json({
      success: true,
      consumidores,
      total: consumidores.length
    });
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao listar consumidores:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /webhooks/consumidores — Registrar novo consumidor
 * Body: { consumidor: string, url: string, ativo?: boolean }
 */
router.post('/consumidores', verificarToken, (req, res) => {
  try {
    const { consumidor, url, ativo } = req.body;

    if (!consumidor || !url) {
      return res.status(400).json({
        success: false,
        error: 'consumidor e url são obrigatórios'
      });
    }

    // Validar URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'URL inválida'
      });
    }

    const result = registrarConsumidor(consumidor, url, ativo !== false);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: `Consumidor '${consumidor}' registrado com sucesso`,
        consumidor
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao registrar consumidor:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /webhooks/fila-morta/processar — Processar itens da Dead Letter Queue
 * Tenta reenviar webhooks que falharam
 */
router.post('/fila-morta/processar', verificarToken, async (req, res) => {
  try {
    const result = await processarFilaMorta();
    res.json({
      success: true,
      message: `${result.processados} itens processados`,
      ...result
    });
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao processar fila_morta:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /webhooks/teste — Enviar notificação de teste para todos os consumidores
 * Útil para validar que webhooks estão funcionando
 */
router.post('/teste', verificarToken, async (req, res) => {
  try {
    const { sku = 'TEST_M_AZUL', operacao = 'UPDATE' } = req.body;

    const dados = {
      operacao,
      mudancas: {
        quantidade_total: { de: 10, para: 5 }
      },
      usuario_id: 'teste'
    };

    const result = await notificarConsumidores(sku, 0, dados);

    res.json({
      success: true,
      message: `Notificação de teste enviada para ${result.enviados} consumidor(es)`,
      ...result
    });
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao enviar teste:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
