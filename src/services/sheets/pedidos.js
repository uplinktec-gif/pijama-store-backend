import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';

const PEDIDOS_SHEET = 'PEDIDOS_E_VENDAS';
const HEADER_ROW = 1;

/**
 * Retorna o próximo número de pedido (sequencial)
 */
async function getNextNumeroPedido() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return 1;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!A:A`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return 1; // Apenas cabeçalho

    let maxNumber = 0;
    for (let i = HEADER_ROW; i < rows.length; i++) {
      const num = parseInt(rows[i][0]) || 0;
      if (num > maxNumber) maxNumber = num;
    }

    return maxNumber + 1;
  } catch (error) {
    logger.error('Erro ao obter próximo número de pedido:', error.message);
    return 1;
  }
}

/**
 * Cria um novo pedido
 */
async function criarPedido(pedidoData) {
  try {
    logger.debug(`[sheets:criarPedido] Iniciando`);

    const sheets = getSheetsClient();
    if (!sheets) {
      logger.error(`[sheets:criarPedido] Google Sheets não está inicializado`);
      return { success: false, error: 'Google Sheets não está inicializado' };
    }

    logger.debug(`[sheets:criarPedido] Google Sheets cliente obtido com sucesso`);

    const numeroPedido = await getNextNumeroPedido();
    const spreadsheetId = getSpreadsheetId();
    const now = new Date().toISOString();

    logger.debug(`[sheets:criarPedido] Próximo número de pedido: ${numeroPedido}`, {
      spreadsheetId,
      sheet: PEDIDOS_SHEET
    });

    const row = [
      numeroPedido,
      pedidoData.data_pedido || now,
      pedidoData.cliente_nome || '',
      pedidoData.cliente_whatsapp || '',
      pedidoData.descricao_pedido || '',
      pedidoData.quantidade_total || 0,
      pedidoData.valor_total || 0,
      pedidoData.tipo_entrega || 'PENDENTE',
      pedidoData.endereco_entrega || '',
      'PEDIDO', // STATUS_PAGAMENTO (sempre começa como PEDIDO)
      pedidoData.forma_pagamento || 'PENDENTE',
      'PENDENTE', // STATUS_ENTREGA
      pedidoData.itens_json || '[]',
      '', // DATA_PAGAMENTO (vazio no início)
      '', // DATA_ENTREGA
      pedidoData.observacoes || ''
    ];

    logger.info(`[sheets:criarPedido] Fazendo append para ${PEDIDOS_SHEET}!A2`);
    logger.debug(`[sheets:criarPedido] Linha a inserir:`, row);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });

    logger.info(`[sheets:criarPedido] ✓ Pedido #${numeroPedido} inserido com sucesso no Sheets`);
    return { success: true, numeroPedido };
  } catch (error) {
    logger.error(`[sheets:criarPedido] Erro ao criar pedido: ${error.message}`);
    logger.error(`[sheets:criarPedido] Stack trace:`, error.stack);
    return { success: false, error: error.message };
  }
}

/**
 * Busca um pedido por número
 */
async function findPorNumeroPedido(numeroPedido) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!A:P`
    });

    const rows = response.data.values || [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (parseInt(row[0]) === numeroPedido) {
        return {
          rowIndex: i + 1,
          numero_pedido: parseInt(row[0]),
          data_pedido: row[1],
          cliente_nome: row[2],
          cliente_whatsapp: row[3],
          descricao_pedido: row[4],
          quantidade_total: parseInt(row[5]) || 0,
          valor_total: parseFloat(row[6]) || 0,
          tipo_entrega: row[7],
          endereco_entrega: row[8],
          status_pagamento: row[9],
          forma_pagamento: row[10],
          status_entrega: row[11],
          itens_json: row[12],
          data_pagamento: row[13],
          data_entrega: row[14],
          observacoes: row[15]
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao buscar pedido:', error.message);
    return null;
  }
}

/**
 * Atualiza status de pagamento de um pedido
 */
async function atualizarStatusPagamento(numeroPedido, novoStatus, formaPagamento = null) {
  try {
    const pedido = await findPorNumeroPedido(numeroPedido);
    if (!pedido) {
      return { success: false, error: `Pedido #${numeroPedido} não encontrado` };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const now = new Date().toISOString();

    // Atualiza STATUS_PAGAMENTO (coluna J = 10)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!J${pedido.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novoStatus]]
      }
    });

    // Atualiza DATA_PAGAMENTO (coluna N = 14)
    if (novoStatus === 'PAGO') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${PEDIDOS_SHEET}!N${pedido.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[now]]
        }
      });
    }

    // Atualiza FORMA_PAGAMENTO se fornecida (coluna K = 11)
    if (formaPagamento) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${PEDIDOS_SHEET}!K${pedido.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[formaPagamento]]
        }
      });
    }

    logger.info(`✓ Pedido #${numeroPedido} atualizado: ${novoStatus}`);
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar status pagamento:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza status de entrega de um pedido
 */
async function atualizarStatusEntrega(numeroPedido, novoStatus) {
  try {
    const pedido = await findPorNumeroPedido(numeroPedido);
    if (!pedido) {
      return { success: false, error: `Pedido #${numeroPedido} não encontrado` };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const now = new Date().toISOString();

    // Atualiza STATUS_ENTREGA (coluna L = 12)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!L${pedido.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novoStatus]]
      }
    });

    // Atualiza DATA_ENTREGA se for ENTREGUE (coluna O = 15)
    if (novoStatus === 'ENTREGUE') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${PEDIDOS_SHEET}!O${pedido.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[now]]
        }
      });
    }

    logger.info(`✓ Pedido #${numeroPedido} entrega: ${novoStatus}`);
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar status entrega:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista todos os pedidos com status de entrega PENDENTE
 */
async function listarEntregasPendentes() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!A:P`
    });

    const rows = response.data.values || [];
    const pendentes = [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (row[11] === 'PENDENTE' && row[9] === 'PAGO') { // status_entrega = PENDENTE e status_pagamento = PAGO
        pendentes.push({
          numero_pedido: parseInt(row[0]),
          cliente_nome: row[2],
          descricao_pedido: row[4],
          quantidade_total: parseInt(row[5]) || 0,
          valor_total: parseFloat(row[6]) || 0,
          tipo_entrega: row[7],
          endereco_entrega: row[8],
          data_pedido: row[1]
        });
      }
    }

    return pendentes;
  } catch (error) {
    logger.error('Erro ao listar entregas pendentes:', error.message);
    return [];
  }
}

/**
 * Lista TODOS os pedidos pendentes (pagos aguardando entrega + não pagos)
 * Usado pelo comando @pendentes
 */
async function listarTodosPendentes() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!A:P`
    });

    const rows = response.data.values || [];
    const pendentes = [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const statusEntrega = row[11] || '';
      const statusPagamento = row[9] || '';
      const numPedido = parseInt(row[0]);

      // Inclui pedidos que ainda não foram entregues/retirados (ignora linhas inválidas)
      if (!isNaN(numPedido) && statusEntrega !== 'ENTREGUE' && statusEntrega !== 'RETIRADA_NA_LOJA') {
        pendentes.push({
          numero_pedido: numPedido,
          data_pedido: row[1],
          cliente_nome: row[2],
          cliente_whatsapp: row[3],
          descricao_pedido: row[4],
          valor_total: parseFloat(row[6]) || 0,
          tipo_entrega: row[7],
          status_pagamento: statusPagamento,
          status_entrega: statusEntrega
        });
      }
    }

    // Ordena: pagos primeiro, depois por número
    pendentes.sort((a, b) => {
      if (a.status_pagamento === 'PAGO' && b.status_pagamento !== 'PAGO') return -1;
      if (a.status_pagamento !== 'PAGO' && b.status_pagamento === 'PAGO') return 1;
      return a.numero_pedido - b.numero_pedido;
    });

    return pendentes;
  } catch (error) {
    logger.error('Erro ao listar pendentes:', error.message);
    return [];
  }
}

/**
 * Busca pedidos pelo nome do cliente (busca parcial, case-insensitive)
 */
async function buscarPedidosPorCliente(nomeCliente) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!A:P`
    });

    const rows = response.data.values || [];
    const resultado = [];
    const busca = nomeCliente.toLowerCase().trim();

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const nomeRow = (row[2] || '').toLowerCase();
      if (nomeRow.includes(busca)) {
        resultado.push({
          numero_pedido: parseInt(row[0]),
          data_pedido: row[1],
          cliente_nome: row[2],
          cliente_whatsapp: row[3],
          descricao_pedido: row[4],
          valor_total: parseFloat(row[6]) || 0,
          status_pagamento: row[9] || '',
          status_entrega: row[11] || ''
        });
      }
    }

    // Mais recente primeiro
    resultado.sort((a, b) => b.numero_pedido - a.numero_pedido);
    return resultado;
  } catch (error) {
    logger.error('Erro ao buscar pedidos por cliente:', error.message);
    return [];
  }
}

/**
 * Atualiza endereço de entrega de um pedido
 */
async function atualizarEnderecoEntrega(numeroPedido, endereco) {
  try {
    const pedido = await findPorNumeroPedido(numeroPedido);
    if (!pedido) return { success: false };
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PEDIDOS_SHEET}!I${pedido.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[endereco]] }
    });
    logger.info(`✓ Endereço atualizado no pedido #${numeroPedido}`);
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar endereço:', error.message);
    return { success: false };
  }
}

export {
  getNextNumeroPedido,
  criarPedido,
  findPorNumeroPedido,
  atualizarStatusPagamento,
  atualizarStatusEntrega,
  atualizarEnderecoEntrega,
  listarEntregasPendentes,
  listarTodosPendentes,
  buscarPedidosPorCliente
};
