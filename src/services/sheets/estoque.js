import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';

const ESTOQUE_SHEET = 'ESTOQUE';
const HEADER_ROW = 1;

/**
 * Gera SKU: MODELO_TAMANHO_COR
 * Exemplo: ZARA_G_BORDÔ
 */
function generateSKU(modelo, tamanho, cor) {
  return `${modelo}_${tamanho}_${cor.toUpperCase()}`;
}

/**
 * Lê todos os itens de estoque
 */
async function readAllEstoque() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${ESTOQUE_SHEET}!A:K`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Apenas cabeçalho ou vazio

    // Parse dados (linha 1 = cabeçalho)
    const estoque = [];
    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0) continue;

      estoque.push({
        sku: row[0],
        modelo: row[1],
        tamanho: row[2],
        cor: row[3],
        preco_unitario: parseFloat(row[4]) || 0,
        quantidade_total: parseInt(row[5]) || 0,
        quantidade_reservada: parseInt(row[6]) || 0,
        quantidade_disponivel: parseInt(row[7]) || 0,
        data_atualizacao: row[8],
        observacoes: row[9],
        status: row[10]
      });
    }

    return estoque;
  } catch (error) {
    logger.error('Erro ao ler estoque:', error.message);
    return [];
  }
}

/**
 * Busca um item específico de estoque por SKU
 */
async function findBySKU(sku) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${ESTOQUE_SHEET}!A:K`
    });

    const rows = response.data.values || [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === sku) {
        return {
          rowIndex: i + 1,
          sku: row[0],
          modelo: row[1],
          tamanho: row[2],
          cor: row[3],
          preco_unitario: parseFloat(row[4]) || 0,
          quantidade_total: parseInt(row[5]) || 0,
          quantidade_reservada: parseInt(row[6]) || 0,
          quantidade_disponivel: parseInt(row[7]) || 0,
          data_atualizacao: row[8],
          observacoes: row[9],
          status: row[10]
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao buscar SKU:', error.message);
    return null;
  }
}

/**
 * Busca por modelo, tamanho e cor
 */
async function findByModeloTamanhoCor(modelo, tamanho, cor) {
  const sku = generateSKU(modelo, tamanho, cor);
  return findBySKU(sku);
}

/**
 * Atualiza quantidade reservada (quando cria um pedido)
 */
async function reservarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    const item = await findByModeloTamanhoCor(modelo, tamanho, cor);

    if (!item) {
      logger.warn(`SKU não encontrado: ${generateSKU(modelo, tamanho, cor)}`);
      return { success: false, error: 'SKU não encontrado' };
    }

    if (item.quantidade_disponivel < quantidade) {
      return {
        success: false,
        error: `Estoque insuficiente. Disponível: ${item.quantidade_disponivel}, Solicitado: ${quantidade}`
      };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // Atualiza quantidade_reservada (coluna G = 7)
    const novaReservada = item.quantidade_reservada + quantidade;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ESTOQUE_SHEET}!G${item.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novaReservada]]
      }
    });

    logger.info(`✓ Reservado ${quantidade}x ${item.sku}`);
    return { success: true, reservedQuantity: quantidade };
  } catch (error) {
    logger.error('Erro ao reservar estoque:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Libera estoque (quando cancela um pedido)
 */
async function liberarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    const item = await findByModeloTamanhoCor(modelo, tamanho, cor);

    if (!item) {
      logger.warn(`SKU não encontrado: ${generateSKU(modelo, tamanho, cor)}`);
      return { success: false, error: 'SKU não encontrado' };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const novaReservada = Math.max(0, item.quantidade_reservada - quantidade);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ESTOQUE_SHEET}!G${item.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novaReservada]]
      }
    });

    logger.info(`✓ Liberado ${quantidade}x ${item.sku}`);
    return { success: true, releasedQuantity: quantidade };
  } catch (error) {
    logger.error('Erro ao liberar estoque:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza quantidade total de estoque (quando recebe pedido de compra)
 */
async function atualizarQuantidadeTotal(modelo, tamanho, cor, novaQuantidade) {
  try {
    const item = await findByModeloTamanhoCor(modelo, tamanho, cor);

    if (!item) {
      logger.warn(`SKU não encontrado: ${generateSKU(modelo, tamanho, cor)}`);
      return { success: false, error: 'SKU não encontrado' };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${ESTOQUE_SHEET}!F${item.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novaQuantidade]]
      }
    });

    logger.info(`✓ Quantidade total atualizada: ${item.sku} = ${novaQuantidade}`);
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar quantidade total:', error.message);
    return { success: false, error: error.message };
  }
}

export {
  generateSKU,
  readAllEstoque,
  findBySKU,
  findByModeloTamanhoCor,
  reservarEstoque,
  liberarEstoque,
  atualizarQuantidadeTotal
};
