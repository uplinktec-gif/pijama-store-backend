import express from 'express';
import { autenticarAdmin as adminAuth } from '../middleware/authAdmin.js';
import * as adminCtrl from '../controllers/admin.controller.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// AUTH — rota pública (sem token, sem IP whitelist)
// ---------------------------------------------------------------------------
router.post('/auth/login', adminCtrl.adminLogin);

// Proteger todas as outras rotas com JWT
router.use(adminAuth);

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
router.get('/stats', adminCtrl.getDashboardStats);

// ---------------------------------------------------------------------------
// ESTOQUE
// ---------------------------------------------------------------------------
router.get('/estoque', adminCtrl.getEstoque);
router.post('/estoque', adminCtrl.createEstoqueItem);
router.patch('/estoque/:sku/quantidade', adminCtrl.updateEstoqueQuantidade);
router.patch('/estoque/:sku/preco', adminCtrl.updateEstoquePreco);

// ---------------------------------------------------------------------------
// PEDIDOS
// ---------------------------------------------------------------------------
router.get('/pedidos', adminCtrl.getPedidos);
router.get('/pedidos/:numero', adminCtrl.getPedidoDetalhe);
router.patch('/pedidos/:numero/pagamento', adminCtrl.updatePedidoPagamento);
router.patch('/pedidos/:numero/entrega', adminCtrl.updatePedidoEntrega);
router.patch('/pedidos/:numero/endereco', adminCtrl.updatePedidoEndereco);

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
router.get('/clientes', adminCtrl.getClientes);
router.get('/clientes/:id', adminCtrl.getClienteDetalhe);
router.get('/clientes/:id/pedidos', adminCtrl.getClientePedidos);
router.patch('/clientes/:id', adminCtrl.updateCliente);

// ---------------------------------------------------------------------------
// LEADS
// ---------------------------------------------------------------------------
router.get('/leads', adminCtrl.getLeads);
router.patch('/leads/:id/status', adminCtrl.updateLeadStatus);

// ---------------------------------------------------------------------------
// SUPORTE
// ---------------------------------------------------------------------------
router.get('/suporte', adminCtrl.getSuporte);
router.patch('/suporte/:id/responder', adminCtrl.responderSuporte);

export default router;
