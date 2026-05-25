import { query, run } from '../config/database.js';
import { logger } from '../utils/logger.js';

export async function getDashboardStats(req, res) {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const vendas = query('SELECT SUM(valor_total) as total, COUNT(*) as pedidos FROM pedidos WHERE status_pagamento = ? AND DATE(data_criacao) = ?', ['PAGO', hoje]);
    const critico = query('SELECT COUNT(*) as total FROM estoque WHERE quantidade_total <= 3 AND status = ?', ['ATIVO']);
    const pendentes = query('SELECT COUNT(*) as total FROM pedidos WHERE status_entrega NOT IN (?, ?) AND status_pagamento = ?', ['ENTREGUE', 'RETIRADA_NA_LOJA', 'PAGO']);
    const leads = query('SELECT COUNT(*) as total FROM leads WHERE status = ? AND DATE(data_criacao) = ?', ['novo', hoje]);
    res.json({ success: true, stats: { vendas_dia: vendas[0]?.total || 0, pedidos_dia: vendas[0]?.pedidos || 0, estoque_critico: critico[0]?.total || 0, pedidos_pendentes: pendentes[0]?.total || 0, leads_novos: leads[0]?.total || 0, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error('Erro em getDashboardStats:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listEstoque(req, res) {
  try {
    const { modelo, status, critico } = req.query;
    let sql = 'SELECT * FROM estoque WHERE 1=1';
    const params = [];
    if (modelo) { sql += ' AND modelo = ?'; params.push(modelo); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (critico === 'true') { sql += ' AND quantidade_total <= 3'; }
    sql += ' ORDER BY modelo, tamanho, cor';
    const estoque = query(sql, params);
    res.json({ success: true, estoque, total: estoque.length });
  } catch (err) {
    logger.error('Erro em listEstoque:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function createEstoque(req, res) {
  try {
    const { modelo, tamanho, cor, preco_unitario, quantidade_total } = req.body;
    const sku = `${modelo}_${tamanho}_${cor}`.toUpperCase().replace(/\s+/g, '_');
    const result = run('INSERT INTO estoque (sku, modelo, tamanho, cor, preco_unitario, quantidade_total, quantidade_reservada, status, data_atualizacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))', [sku, modelo, tamanho, cor, preco_unitario, quantidade_total, 0, 'ATIVO']);
    res.json({ success: true, sku, id: result.id });
  } catch (err) {
    logger.error('Erro em createEstoque:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEstoqueQuantidade(req, res) {
  try {
    const { sku } = req.params;
    const { quantidade_total } = req.body;
    run('UPDATE estoque SET quantidade_total = ?, data_atualizacao = datetime("now") WHERE sku = ?', [quantidade_total, sku]);
    res.json({ success: true, sku, quantidade_total });
  } catch (err) {
    logger.error('Erro em updateEstoqueQuantidade:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEstoquePreco(req, res) {
  try {
    const { sku } = req.params;
    const { preco_unitario } = req.body;
    run('UPDATE estoque SET preco_unitario = ?, data_atualizacao = datetime("now") WHERE sku = ?', [preco_unitario, sku]);
    res.json({ success: true, sku, preco_unitario });
  } catch (err) {
    logger.error('Erro em updateEstoquePreco:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listPedidos(req, res) {
  try {
    const { status_pagamento, status_entrega, busca, limite = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM pedidos WHERE 1=1';
    const params = [];
    if (status_pagamento) { sql += ' AND status_pagamento = ?'; params.push(status_pagamento); }
    if (status_entrega) { sql += ' AND status_entrega = ?'; params.push(status_entrega); }
    if (busca) { sql += ' AND (cliente_nome LIKE ? OR cliente_whatsapp LIKE ?)'; params.push(`%${busca}%`, `%${busca}%`); }
    sql += ' ORDER BY data_criacao DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));
    const pedidos = query(sql, params);
    res.json({ success: true, pedidos, total: pedidos.length });
  } catch (err) {
    logger.error('Erro em listPedidos:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getPedidoDetail(req, res) {
  try {
    const { numero } = req.params;
    const pedido = query('SELECT * FROM pedidos WHERE numero_pedido = ?', [numero]);
    if (!pedido || pedido.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
    const p = pedido[0];
    try { p.itens = JSON.parse(p.itens_json || '[]'); } catch { p.itens = []; }
    res.json({ success: true, pedido: p });
  } catch (err) {
    logger.error('Erro em getPedidoDetail:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updatePagamento(req, res) {
  try {
    const { numero } = req.params;
    const { status, forma_pagamento } = req.body;
    run('UPDATE pedidos SET status_pagamento = ?, forma_pagamento = ?, data_pagamento = datetime("now") WHERE numero_pedido = ?', [status, forma_pagamento, numero]);
    res.json({ success: true, numero, status, forma_pagamento });
  } catch (err) {
    logger.error('Erro em updatePagamento:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEntrega(req, res) {
  try {
    const { numero } = req.params;
    const { status } = req.body;
    run('UPDATE pedidos SET status_entrega = ?, data_entrega = datetime("now") WHERE numero_pedido = ?', [status, numero]);
    res.json({ success: true, numero, status });
  } catch (err) {
    logger.error('Erro em updateEntrega:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEndereco(req, res) {
  try {
    const { numero } = req.params;
    const { endereco } = req.body;
    run('UPDATE pedidos SET endereco_entrega = ? WHERE numero_pedido = ?', [endereco, numero]);
    res.json({ success: true, numero, endereco });
  } catch (err) {
    logger.error('Erro em updateEndereco:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listClientes(req, res) {
  try {
    const { busca, limite = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];
    if (busca) { sql += ' AND (nome LIKE ? OR whatsapp LIKE ?)'; params.push(`%${busca}%`, `%${busca}%`); }
    sql += ' ORDER BY total_gasto DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));
    const clientes = query(sql, params);
    res.json({ success: true, clientes, total: clientes.length });
  } catch (err) {
    logger.error('Erro em listClientes:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getClienteDetail(req, res) {
  try {
    const { id } = req.params;
    const cliente = query('SELECT * FROM clientes WHERE id_cliente = ?', [id]);
    if (!cliente || cliente.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json({ success: true, cliente: cliente[0] });
  } catch (err) {
    logger.error('Erro em getClienteDetail:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getClientePedidos(req, res) {
  try {
    const { id } = req.params;
    const pedidos = query('SELECT * FROM pedidos WHERE id_cliente = ? ORDER BY data_criacao DESC', [id]);
    res.json({ success: true, pedidos, total: pedidos.length });
  } catch (err) {
    logger.error('Erro em getClientePedidos:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listLeads(req, res) {
  try {
    const { status, limite = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY data_criacao DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));
    const leads = query(sql, params);
    res.json({ success: true, leads, total: leads.length });
  } catch (err) {
    logger.error('Erro em listLeads:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateLeadStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    run('UPDATE leads SET status = ? WHERE id_lead = ?', [status, id]);
    res.json({ success: true, id, status });
  } catch (err) {
    logger.error('Erro em updateLeadStatus:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export default { getDashboardStats, listEstoque, createEstoque, updateEstoqueQuantidade, updateEstoquePreco, listPedidos, getPedidoDetail, updatePagamento, updateEntrega, updateEndereco, listClientes, getClienteDetail, getClientePedidos, listLeads, updateLeadStatus };
