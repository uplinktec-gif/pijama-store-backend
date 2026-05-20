import express from 'express';
import clienteAuth from '../middleware/clienteAuth.js';
import {
  autenticarCliente,
  obterPedidosCliente,
  obterPerfilCliente,
  obterRecomendacoesCliente,
  enviarMensagemContato
} from '../controllers/cliente.controller.js';

const router = express.Router();

/**
 * POST /api/cliente/autenticar
 * Autenticar cliente por CPF
 * Body: { cpf: "12345678900" }
 */
router.post('/autenticar', autenticarCliente);

/**
 * GET /api/cliente/:id/pedidos
 * Listar pedidos do cliente
 * Headers: Authorization: Bearer <token>
 */
router.get('/:id/pedidos', clienteAuth, obterPedidosCliente);

/**
 * GET /api/cliente/:id/perfil
 * Obter dados de perfil do cliente
 * Headers: Authorization: Bearer <token>
 */
router.get('/:id/perfil', clienteAuth, obterPerfilCliente);

/**
 * GET /api/cliente/:id/recomendacoes
 * Obter recomendações personalizadas
 * Headers: Authorization: Bearer <token>
 */
router.get('/:id/recomendacoes', clienteAuth, obterRecomendacoesCliente);

/**
 * POST /api/cliente/:id/contato
 * Enviar mensagem "Fale Conosco"
 * Headers: Authorization: Bearer <token>
 * Body: { mensagem: "Quero trocar o tamanho..." }
 */
router.post('/:id/contato', clienteAuth, enviarMensagemContato);

export default router;
