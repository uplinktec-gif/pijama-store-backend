import { Router } from 'express';
import { ipWhitelist } from '../middleware/ipWhitelist.js';
import {
  getDashboardStats,
  listEstoque,
  createEstoque,
  updateEstoqueQuantidade,
  updateEstoquePreco,
  listPedidos,
  getPedidoDetail,
  updatePagamento,
  updateEntrega,
  updateEndereco,
  listClientes,
  getClienteDetail,
  getClientePedidos,
  listLeads,
  updateLeadStatus
} from '../controllers/admin.controller.js';

const router = Router();

// Aplicar middleware de IP whitelist a todos os endpoints
router.use(ipWhitelist);

// DASHBOARD
router.get('/api/dashboard/stats', getDashboardStats);

// ESTOQUE (4 endpoints)
router.get('/api/estoque', listEstoque);
router.post('/api/estoque', createEstoque);
router.patch('/api/estoque/:sku/quantidade', updateEstoqueQuantidade);
router.patch('/api/estoque/:sku/preco', updateEstoquePreco);

// PEDIDOS (5 endpoints)
router.get('/api/pedidos', listPedidos);
router.get('/api/pedidos/:numero', getPedidoDetail);
router.patch('/api/pedidos/:numero/pagamento', updatePagamento);
router.patch('/api/pedidos/:numero/entrega', updateEntrega);
router.patch('/api/pedidos/:numero/endereco', updateEndereco);

// CLIENTES (3 endpoints)
router.get('/api/clientes', listClientes);
router.get('/api/clientes/:id', getClienteDetail);
router.get('/api/clientes/:id/pedidos', getClientePedidos);

// LEADS (2 endpoints)
router.get('/api/leads', listLeads);
router.patch('/api/leads/:id/status', updateLeadStatus);

export default router;
