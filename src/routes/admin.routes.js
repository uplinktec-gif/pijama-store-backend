import express from 'express';
import { verificarToken } from '../middleware/jwtAuth.js';
import { adminLogin } from '../controllers/admin.controller.js';
import {
  getDashboardStats,
  // Estoque
  getEstoque,
  updateEstoqueQuantidade,
  updateEstoquePreco,
  createEstoqueItem,
  getEstoqueHistorico,
  // Pedidos
  getPedidos,
  getPedidoDetalhe,
  updatePedidoPagamento,
  updatePedidoEntrega,
  updatePedidoEndereco,
  // Clientes
  getClientes,
  getClienteDetalhe,
  getClientePedidos,
  updateCliente,
  // Leads
  getLeads,
  updateLeadStatus,
  // Suporte
  getSuporte,
  responderSuporte
} from '../controllers/admin.controller.js';

const router = express.Router();

// ============================================================
// AUTENTICAÇÃO (pública)
// ============================================================
router.post('/auth/login', adminLogin);

// ============================================================
// DASHBOARD (protegido)
// ============================================================
router.get('/stats', verificarToken, getDashboardStats);

// ============================================================
// ESTOQUE (protegido)
// ============================================================
router.get('/estoque', verificarToken, getEstoque);
router.get('/estoque/historico', verificarToken, getEstoqueHistorico);
router.post('/estoque', verificarToken, createEstoqueItem);
router.patch('/estoque/:sku/quantidade', verificarToken, updateEstoqueQuantidade);
router.patch('/estoque/:sku/preco', verificarToken, updateEstoquePreco);

// ============================================================
// PEDIDOS (protegido)
// ============================================================
router.get('/pedidos', verificarToken, getPedidos);
router.get('/pedidos/:numero', verificarToken, getPedidoDetalhe);
router.patch('/pedidos/:numero/pagamento', verificarToken, updatePedidoPagamento);
router.patch('/pedidos/:numero/entrega', verificarToken, updatePedidoEntrega);
router.patch('/pedidos/:numero/endereco', verificarToken, updatePedidoEndereco);

// ============================================================
// CLIENTES (protegido)
// ============================================================
router.get('/clientes', verificarToken, getClientes);
router.get('/clientes/:id', verificarToken, getClienteDetalhe);
router.get('/clientes/:id/pedidos', verificarToken, getClientePedidos);
router.patch('/clientes/:id', verificarToken, updateCliente);

// ============================================================
// LEADS (protegido)
// ============================================================
router.get('/leads', verificarToken, getLeads);
router.patch('/leads/:id/status', verificarToken, updateLeadStatus);

// ============================================================
// SUPORTE (protegido)
// ============================================================
router.get('/suporte', verificarToken, getSuporte);
router.patch('/suporte/:id/responder', verificarToken, responderSuporte);

export default router;
