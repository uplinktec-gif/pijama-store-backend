import express from 'express';
import { conectarSSEEstoque, statusSSE } from '../controllers/sse.controller.js';

const router = express.Router();

/**
 * GET /api/sse/estoque — Conexão SSE para atualizações em tempo real
 */
router.get('/estoque', conectarSSEEstoque);

/**
 * GET /api/sse/status — Status das conexões SSE
 */
router.get('/status', statusSSE);

export default router;
