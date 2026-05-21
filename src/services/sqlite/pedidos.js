import { query, queryOne, run } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Cria um novo pedido
 */
export async function criarPedido(pedidoData) {
  try {
    const now = new Date().toISOString();

    const result = run(
      `INSERT INTO pedidos
       (data_pedido, cliente_nome, cliente_whatsapp, descricao_pedido, quantidade_total,
        valor_total, tipo_entrega, endereco_entrega, status_pagamento, forma_pagamento,
        status_entrega, itens_json, data_pagamento, data_entrega, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pedidoData.data_pedido || now,
        pedidoData.cliente_nome || '',
        pedidoData.cliente_whatsapp || '',
        pedidoData.descricao_pedido || '',
        pedidoData.quantidade_total || 0,
        pedidoData.valor_total || 0,
        pedidoData.tipo_entrega || 'PENDENTE',
        pedidoData.endereco_entrega || '',
        'PEDIDO', // Sempre começa como PEDIDO
        pedidoData.forma_pagamento || 'PENDENTE',
        'PENDENTE', // Sempre começa como PENDENTE
        typeof pedidoData.itens_json === 'string'
          ? pedidoData.itens_json
          : JSON.stringify(pedidoData.itens_json || []),
        '', // data_pagamento vazio no início
        '', // data_entrega vazio no início
        pedidoData.observacoes || ''
      ]
    );

    if (!result.id) {
      return { success: false, error: 'Falha ao criar pedido — sem ID retornado' };
    }

    logger.info(`[sqlite:pedidos] Pedido #${result.id} criado`);
    return { success: true, numeroPedido: result.id };
  } catch (error) {
    logger.error('[sqlite:pedidos] criarPedido:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Busca pedido pelo número
 */
export async function findPorNumeroPedido(numeroPedido) {
  try {
    const row = queryOne('SELECT * FROM pedidos WHERE numero_pedido = ?', [numeroPedido]);
    return row ? mapPedido(row) : null;
  } catch (error) {
    logger.error('[sqlite:pedidos] findPorNumeroPedido:', error.message);
    return null;
  }
}

/**
 * Atualiza status de pagamento
 */
export async function atualizarStatusPagamento(numeroPedido, novoStatus, formaPagamento = null) {
  try {
    const now = new Date().toISOString();

    run(
      `UPDATE pedidos
       SET status_pagamento = ?,
           data_pagamento = CASE WHEN ? = 'PAGO' THEN ? ELSE data_pagamento END,
           forma_pagamento = COALESCE(CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE NULL END, forma_pagamento),
           updated_at = ?
       WHERE numero_pedido = ?`,
      [novoStatus, novoStatus, now, formaPagamento, formaPagamento, formaPagamento, now, numeroPedido]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:pedidos] atualizarStatusPagamento:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza status de entrega
 */
export async function atualizarStatusEntrega(numeroPedido, novoStatus) {
  try {
    const now = new Date().toISOString();

    run(
      `UPDATE pedidos
       SET status_entrega = ?,
           data_entrega = CASE WHEN ? IN ('ENTREGUE', 'RETIRADA_NA_LOJA') THEN ? ELSE data_entrega END,
           updated_at = ?
       WHERE numero_pedido = ?`,
      [novoStatus, novoStatus, now, now, numeroPedido]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:pedidos] atualizarStatusEntrega:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza endereço de entrega
 */
export async function atualizarEnderecoEntrega(numeroPedido, endereco) {
  try {
    const now = new Date().toISOString();
    run(
      'UPDATE pedidos SET endereco_entrega = ?, updated_at = ? WHERE numero_pedido = ?',
      [endereco, now, numeroPedido]
    );
    return { success: true };
  } catch (error) {
    logger.error('[sqlite:pedidos] atualizarEnderecoEntrega:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista entregas pendentes (pago mas não entregue)
 */
export async function listarEntregasPendentes() {
  try {
    return query(
      `SELECT * FROM pedidos
       WHERE status_entrega = 'PENDENTE'
         AND status_pagamento = 'PAGO'
       ORDER BY numero_pedido`
    ).map(mapPedido);
  } catch (error) {
    logger.error('[sqlite:pedidos] listarEntregasPendentes:', error.message);
    return [];
  }
}

/**
 * Lista todos os pedidos pendentes (ainda não entregues/retirados)
 */
export async function listarTodosPendentes() {
  try {
    return query(
      `SELECT * FROM pedidos
       WHERE status_entrega NOT IN ('ENTREGUE', 'RETIRADA_NA_LOJA')
       ORDER BY
         CASE WHEN status_pagamento = 'PAGO' THEN 0 ELSE 1 END,
         numero_pedido`
    ).map(mapPedido);
  } catch (error) {
    logger.error('[sqlite:pedidos] listarTodosPendentes:', error.message);
    return [];
  }
}

/**
 * Busca pedidos por WhatsApp do cliente
 */
export async function buscarPedidosPorWhatsApp(whatsapp) {
  try {
    return query(
      'SELECT * FROM pedidos WHERE cliente_whatsapp = ? ORDER BY numero_pedido DESC',
      [whatsapp]
    ).map(mapPedido);
  } catch (error) {
    logger.error('[sqlite:pedidos] buscarPedidosPorWhatsApp:', error.message);
    return [];
  }
}

/**
 * Busca pedidos por nome de cliente (busca parcial, case-insensitive)
 */
export async function buscarPedidosPorCliente(nomeCliente) {
  try {
    return query(
      `SELECT * FROM pedidos
       WHERE LOWER(cliente_nome) LIKE ?
       ORDER BY numero_pedido DESC`,
      [`%${(nomeCliente || '').toLowerCase()}%`]
    ).map(mapPedido);
  } catch (error) {
    logger.error('[sqlite:pedidos] buscarPedidosPorCliente:', error.message);
    return [];
  }
}

/**
 * Mapeia uma linha do banco para o objeto padronizado
 */
function mapPedido(row) {
  let itens = [];
  try {
    itens = JSON.parse(row.itens_json || '[]');
  } catch (_) { itens = []; }

  return {
    numero_pedido: row.numero_pedido,
    data_pedido: row.data_pedido || '',
    cliente_nome: row.cliente_nome || '',
    cliente_whatsapp: row.cliente_whatsapp || '',
    descricao_pedido: row.descricao_pedido || '',
    quantidade_total: parseInt(row.quantidade_total) || 0,
    valor_total: parseFloat(row.valor_total) || 0,
    tipo_entrega: row.tipo_entrega || '',
    endereco_entrega: row.endereco_entrega || '',
    status_pagamento: row.status_pagamento || 'PEDIDO',
    forma_pagamento: row.forma_pagamento || '',
    status_entrega: row.status_entrega || 'PENDENTE',
    itens_json: row.itens_json || '[]',
    itens: itens,
    data_pagamento: row.data_pagamento || '',
    data_entrega: row.data_entrega || '',
    observacoes: row.observacoes || ''
  };
}
