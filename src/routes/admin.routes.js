import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  adminLogin,
  getDashboardStats,
  getCatalog,
  syncPrecosCatalogo,
  listEstoque,
  createEstoque,
  updateEstoqueQuantidade,
  updateEstoquePreco,
  baixaEstoque,
  listBaixas,
  listPedidos,
  getPedidoDetail,
  updatePagamento,
  updateEntrega,
  updateEndereco,
  deletePedido,
  updateStatusPedido,
  listClientes,
  getClienteDetail,
  getClientePedidos,
  listLeads,
  updateLeadStatus
} from '../controllers/admin.controller.js';

const router = Router();

// ─── LOGIN (público — sem auth) ───────────────────────────────────────────────
// Montado em /admin/api → este handler responde em /admin/api/auth/login
router.post('/auth/login', adminLogin);

// ─── ROTAS PROTEGIDAS — JWT obrigatório ──────────────────────────────────────
router.use(adminAuth);

// DASHBOARD  →  /admin/api/dashboard/stats
router.get('/dashboard/stats', getDashboardStats);

// CATÁLOGO (fonte única da verdade para preços)
router.get('/catalog', getCatalog);
router.post('/catalog/sync-precos', syncPrecosCatalogo);

// ESTOQUE  →  /admin/api/estoque
router.get('/estoque', listEstoque);
// Relatório de Baixas (precisa vir antes das rotas com :sku)
router.get('/estoque/baixas', listBaixas);
router.post('/estoque', createEstoque);
router.patch('/estoque/:sku/quantidade', updateEstoqueQuantidade);
router.patch('/estoque/:sku/preco', updateEstoquePreco);
// Baixa manual de estoque (motivo obrigatório + log de auditoria)
router.post('/estoque/:sku/baixa', baixaEstoque);

// PEDIDOS  →  /admin/api/pedidos
router.get('/pedidos', listPedidos);
router.get('/pedidos/:numero', getPedidoDetail);
router.patch('/pedidos/:numero/pagamento', updatePagamento);
router.patch('/pedidos/:numero/entrega', updateEntrega);
router.patch('/pedidos/:numero/endereco', updateEndereco);

router.delete('/pedidos/:numero', deletePedido);
router.put('/pedidos/:numero/status', updateStatusPedido);

// CLIENTES  →  /admin/api/clientes
router.get('/clientes', listClientes);
router.get('/clientes/:id', getClienteDetail);
router.get('/clientes/:id/pedidos', getClientePedidos);

// LEADS  →  /admin/api/leads
router.get('/leads', listLeads);
router.patch('/leads/:id/status', updateLeadStatus);

export default router;
