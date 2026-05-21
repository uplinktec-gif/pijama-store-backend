import { query, queryOne, run, transaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Gera SKU: MODELO_TAMANHO_COR
 * Normaliza cor para UPPERCASE com underscores (AZUL MARINHO → AZUL_MARINHO)
 */
export function generateSKU(modelo, tamanho, cor) {
  const corNorm = (cor || '').toUpperCase().replace(/\s+/g, '_');
  return `${(modelo || '').toUpperCase()}_${(tamanho || '').toUpperCase()}_${corNorm}`;
}

/**
 * Lê todos os itens de estoque
 */
export async function readAllEstoque() {
  try {
    const rows = query("SELECT * FROM estoque WHERE UPPER(status) = 'ATIVO' ORDER BY modelo, tamanho, cor");
    return rows.map(mapItem);
  } catch (error) {
    logger.error('[sqlite:estoque] readAllEstoque:', error.message);
    return [];
  }
}

/**
 * Busca item por SKU
 */
export async function findBySKU(sku) {
  try {
    const row = queryOne('SELECT * FROM estoque WHERE sku = ?', [sku]);
    return row ? mapItem(row) : null;
  } catch (error) {
    logger.error('[sqlite:estoque] findBySKU:', error.message);
    return null;
  }
}

/**
 * Busca por modelo, tamanho e cor
 */
export async function findByModeloTamanhoCor(modelo, tamanho, cor) {
  return findBySKU(generateSKU(modelo, tamanho, cor));
}

/**
 * Reserva estoque (transação atômica para evitar oversell)
 */
export async function reservarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    const sku = generateSKU(modelo, tamanho, cor);
    const now = new Date().toISOString();

    let changes = 0;
    transaction(() => {
      run(
        `UPDATE estoque
         SET quantidade_reservada = quantidade_reservada + ?,
             updated_at = ?
         WHERE sku = ?
           AND (quantidade_total - quantidade_reservada) >= ?`,
        [quantidade, now, sku, quantidade]
      );
      const result = queryOne('SELECT changes() as n');
      changes = result?.n ?? 0;
    });

    if (changes === 0) {
      const item = await findBySKU(sku);
      if (!item) return { success: false, error: `SKU não encontrado: ${sku}` };
      return { success: false, error: `Estoque insuficiente. Disponível: ${item.quantidade_disponivel}` };
    }

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:estoque] reservarEstoque:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Libera estoque reservado (ex: pedido cancelado)
 */
export async function liberarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    const sku = generateSKU(modelo, tamanho, cor);
    const now = new Date().toISOString();

    run(
      `UPDATE estoque
       SET quantidade_reservada = MAX(0, quantidade_reservada - ?),
           updated_at = ?
       WHERE sku = ?`,
      [quantidade, now, sku]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:estoque] liberarEstoque:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza quantidade total de um item
 */
export async function atualizarQuantidadeTotal(modelo, tamanho, cor, novaQuantidade) {
  try {
    const sku = generateSKU(modelo, tamanho, cor);
    const item = await findBySKU(sku);

    if (!item) return { success: false, error: 'Item não encontrado' };

    if (novaQuantidade < item.quantidade_reservada) {
      return { success: false, error: `Não é possível definir quantidade ${novaQuantidade} — há ${item.quantidade_reservada} reservado(s)` };
    }

    const now = new Date().toISOString();
    run(
      `UPDATE estoque
       SET quantidade_total = ?,
           quantidade_disponivel = ? - quantidade_reservada,
           data_atualizacao = ?,
           updated_at = ?
       WHERE sku = ?`,
      [novaQuantidade, novaQuantidade, now, now, sku]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:estoque] atualizarQuantidadeTotal:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mapeia uma linha do banco para o objeto padronizado
 */
function mapItem(row) {
  const total = parseInt(row.quantidade_total) || 0;
  const reservado = parseInt(row.quantidade_reservada) || 0;
  return {
    sku: row.sku,
    modelo: row.modelo,
    tamanho: row.tamanho,
    cor: row.cor,
    preco_unitario: parseFloat(row.preco_unitario) || 0,
    quantidade_total: total,
    quantidade_reservada: reservado,
    quantidade_disponivel: total - reservado, // Recalcular sempre
    data_atualizacao: row.data_atualizacao || '',
    observacoes: row.observacoes || '',
    status: row.status || 'ATIVO'
  };
}
