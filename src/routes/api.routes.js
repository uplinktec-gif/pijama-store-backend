import express from 'express';
import * as apiController from '../controllers/api.controller.js';

const router = express.Router();

// Rotas de Estoque
router.get('/estoque', apiController.obterEstoque);
router.get('/estoque/baixo', apiController.obterEstoqueBaixo);
router.get('/estoque/modelo/:modelo', apiController.obterPorModelo);
router.get('/estoque/relatorio', apiController.obterRelatorioEstoque);

// Rotas de Clientes
router.get('/clientes/:whatsapp', apiController.obterPerfilCliente);
router.get('/clientes/inativos', apiController.obterInativos);
router.get('/clientes/relatorio', apiController.obterRelatorioClientes);

// Rotas de Pedidos
router.get('/entregas-pendentes', apiController.obterEntregasPendentes);

// Rotas de Backup (ADMIN only)
router.get('/backup/latest', apiController.obterBackupLatest);
router.get('/backup/listar', apiController.listarBackups);

// Rotas de Logs (ADMIN only)
router.get('/logs', apiController.obterLogs);

export default router;
