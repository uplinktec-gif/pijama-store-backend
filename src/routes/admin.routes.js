import express from 'express';
import { adminAuth, gerarToken } from '../middleware/adminAuth.js';
import * as sheetsPedidos from '../services/sheets/pedidos.js';
import * as sheetsEstoque from '../services/sheets/estoque.js';
import * as sheetsClientes from '../services/sheets/clientes.js';
import { analisarVendas } from '../services/business/analytics.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// ─── Usuários do painel (configurados via .env) ───────────────────────────────
function getUsuarios() {
  return {
    felipe: {
      nome: 'Felipe',
      senha: process.env.ADMIN_SENHA_FELIPE || 'pijama2025',
      role: 'ADMIN'
    },
    jully: {
      nome: 'Júlly',
      senha: process.env.ADMIN_SENHA_JULLY || 'jully2025',
      role: 'OPERADOR'
    },
    pluma: {
      nome: 'Pluma',
      senha: process.env.ADMIN_SENHA_PLUMA || 'pluma2025',
      role: 'OPERADOR'
    }
  };
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/auth/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  }

  const usuarios = getUsuarios();
  const user = usuarios[usuario.toLowerCase()];

  if (!user || user.senha !== senha) {
    logger.warn(`[admin] Tentativa de login inválida: ${usuario}`);
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  }

  const token = gerarToken(user);
  logger.info(`[admin] Login: ${user.nome} (${user.role})`);
  res.json({ token, nome: user.nome, role: user.role });
});

// ─── STATS DO DASHBOARD ────────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [hoje, semana, mes] = await Promise.all([
      analisarVendas(1),
      analisarVendas(7),
      analisarVendas(30)
    ]);

    const pendentes = await sheetsPedidos.listarTodosPendentes();
    const estoqueList = await sheetsEstoque.readAllEstoque();
    const estoqueBaixo = estoqueList.filter(e => e.quantidade_disponivel > 0 && e.quantidade_disponivel <= 3);
    const semEstoque = estoqueList.filter(e => e.quantidade_disponivel === 0 && e.status === 'ativo');

    res.json({
      hoje: { total: hoje.totalVendido, pedidos: hoje.quantidadePedidos },
      semana: { total: semana.totalVendido, pedidos: semana.quantidadePedidos, ticketMedio: semana.ticketMedio },
      mes: { total: mes.totalVendido, pedidos: mes.quantidadePedidos, ticketMedio: mes.ticketMedio },
      pendentes: pendentes.length,
      estoqueBaixo: estoqueBaixo.length,
      semEstoque: semEstoque.length,
      graficoDias: semana.vendasPorDia || []
    });
  } catch (error) {
    logger.error('[admin] Erro em /stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
router.get('/pedidos', adminAuth, async (req, res) => {
  try {
    const { status, cliente, limite = 100 } = req.query;

    const sheets = (await import('../config/sheets.js')).getSheetsClient();
    const spreadsheetId = (await import('../config/sheets.js')).getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'PEDIDOS_E_VENDAS!A:P'
    });

    const rows = response.data.values || [];
    let pedidos = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || isNaN(parseInt(r[0]))) continue;

      pedidos.push({
        numero_pedido: parseInt(r[0]),
        data_pedido: r[1],
        cliente_nome: r[2],
        cliente_whatsapp: r[3],
        descricao_pedido: r[4],
        quantidade_total: parseInt(r[5]) || 0,
        valor_total: parseFloat(r[6]) || 0,
        tipo_entrega: r[7],
        endereco_entrega: r[8],
        status_pagamento: r[9],
        forma_pagamento: r[10],
        status_entrega: r[11],
        data_pagamento: r[13],
        data_entrega: r[14],
        observacoes: r[15]
      });
    }

    // Filtros
    if (status) pedidos = pedidos.filter(p => p.status_pagamento === status || p.status_entrega === status);
    if (cliente) pedidos = pedidos.filter(p => p.cliente_nome?.toLowerCase().includes(cliente.toLowerCase()));

    // Mais recente primeiro, limita
    pedidos.sort((a, b) => b.numero_pedido - a.numero_pedido);
    pedidos = pedidos.slice(0, parseInt(limite));

    res.json(pedidos);
  } catch (error) {
    logger.error('[admin] Erro em /pedidos:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/pedidos/:numero/pagamento', adminAuth, async (req, res) => {
  try {
    const { status, forma } = req.body;
    const result = await sheetsPedidos.atualizarStatusPagamento(req.params.numero, status, forma);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/pedidos/:numero/entrega', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await sheetsPedidos.atualizarStatusEntrega(req.params.numero, status);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── ESTOQUE ──────────────────────────────────────────────────────────────────
router.get('/estoque', adminAuth, async (req, res) => {
  try {
    const estoque = await sheetsEstoque.readAllEstoque();
    res.json(estoque);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/estoque/:sku/quantidade', adminAuth, async (req, res) => {
  try {
    const { quantidade } = req.body;
    const [modelo, tamanho, ...corParts] = req.params.sku.split('_');
    const cor = corParts.join(' ').toLowerCase();
    const result = await sheetsEstoque.atualizarQuantidadeTotal(modelo, tamanho, cor, parseInt(quantidade));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
router.get('/clientes', adminAuth, async (req, res) => {
  try {
    const { busca } = req.query;

    const sheets = (await import('../config/sheets.js')).getSheetsClient();
    const spreadsheetId = (await import('../config/sheets.js')).getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'CLIENTES!A:N'
    });

    const rows = response.data.values || [];
    let clientes = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      clientes.push({
        id: r[0],
        nome: r[1],
        whatsapp: r[2],
        endereco: r[4],
        bairro: r[5],
        cidade: r[6],
        data_primeiro_pedido: r[8],
        total_gasto: parseFloat(r[9]) || 0,
        quantidade_pedidos: parseInt(r[10]) || 0,
        modelo_favorito: r[11],
        data_ultimo_pedido: r[12]
      });
    }

    if (busca) {
      const b = busca.toLowerCase();
      clientes = clientes.filter(c =>
        c.nome?.toLowerCase().includes(b) || c.whatsapp?.includes(b)
      );
    }

    clientes.sort((a, b) => (b.total_gasto || 0) - (a.total_gasto || 0));
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
