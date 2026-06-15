import { query, queryOne, run, transaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Gera SKU: MODELO_TAMANHO_COR
 * Normaliza cor para UPPERCASE com underscores (AZUL MARINHO → AZUL)
 * Também sanitiza sufixos hallucinados antes de normalizar.
 */
export function generateSKU(modelo, tamanho, cor) {
  // "Azul Jeans" é cor legítima — manter "jeans". Sanitizar apenas alucinações.
  const corSanitized = (cor || '')
    .replace(/[\s-]+marinho/ig, '')
    .replace(/[\s-]+escuro/ig, '')
    .replace(/[\s-]+claro/ig, '')
    .replace(/\s+com\s+\w+/ig, '')
    .trim();
  const corNorm = corSanitized.toUpperCase().replace(/\s+/g, '_');
  return `${(modelo || '').toUpperCase()}_${(tamanho || '').toUpperCase()}_${corNorm}`;
}

/**
 * Retorna lista de modelos com estoque disponível direto do banco.
 * Fonte única de verdade — nunca hardcoded.
 */
export function listarModelosDisponiveis() {
  try {
    const rows = query(
      `SELECT DISTINCT modelo FROM estoque
       WHERE UPPER(status) = 'ATIVO' AND (quantidade_total - quantidade_reservada) > 0
       ORDER BY modelo`
    );
    return rows.map(r => r.modelo);
  } catch (error) {
    logger.error('[sqlite:estoque] listarModelosDisponiveis:', error.message);
    return [];
  }
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
 * Busca por modelo, tamanho e cor — SKU exato primeiro, LIKE como fallback.
 * Ex: "azul" encontra "Azul" ou "Azul Jeans" se SKU exato não existir.
 */
export async function findByModeloTamanhoCor(modelo, tamanho, cor) {
  // 1. Tentativa exata via SKU
  const exato = await findBySKU(generateSKU(modelo, tamanho, cor));
  if (exato) return exato;

  // 2. Fallback: busca LIKE case-insensitive na cor
  // Útil quando IA retorna "azul" e o banco tem "Azul" (ou vice-versa)
  try {
    const row = queryOne(
      `SELECT * FROM estoque
       WHERE UPPER(modelo) = UPPER(?)
         AND UPPER(tamanho) = UPPER(?)
         AND LOWER(cor) LIKE LOWER(?)
         AND UPPER(status) = 'ATIVO'
       ORDER BY quantidade_disponivel DESC
       LIMIT 1`,
      [modelo, tamanho, `%${cor}%`]
    );
    if (row) {
      logger.info(`[estoque] LIKE fallback: "${modelo} ${tamanho} ${cor}" → encontrou "${row.cor}"`);
      return mapItem(row);
    }
  } catch (err) {
    logger.error('[sqlite:estoque] findByModeloTamanhoCor LIKE:', err.message);
  }

  return null;
}

/**
 * Reserva estoque (transação atômica para evitar oversell)
 */
export async function reservarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    // Resolve o item real — LIKE fallback garante que "azul" encontra "Azul" no banco
    const itemReal = await findByModeloTamanhoCor(modelo, tamanho, cor);
    if (!itemReal) {
      return { success: false, error: `Produto não encontrado: ${modelo} ${tamanho} ${cor}` };
    }
    const sku = itemReal.sku; // usa o SKU real do banco, não o gerado
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
      return { success: false, error: `Estoque insuficiente para ${modelo} ${tamanho} ${itemReal.cor}. Disponível: ${itemReal.quantidade_disponivel}` };
    }

    return { success: true, cor_real: itemReal.cor }; // retorna a cor real encontrada
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
 * TROCA DE MERCADORIA — logística reversa, operação ATÔMICA.
 *
 * Numa única transação:
 *   1) Subtrai (-1) a peça NOVA do total (sai para o cliente), guardada contra
 *      oversell via changes() — se não houver saldo, lança e NADA é alterado.
 *   2) Soma (+1) a peça ANTIGA de volta ao total (retorna ao estoque).
 *   3) Grava DUAS linhas no log_estoque (motivo "Troca de Cliente") para auditoria.
 *
 * Tudo-ou-nada: se a peça nova não tiver saldo, a devolução também é desfeita.
 *
 * @param {number} idPedido número do pedido de referência (rastreabilidade)
 * @param {{modelo,tamanho,cor,qtd?}} itemAntigo peça que VOLTA ao estoque
 * @param {{modelo,tamanho,cor,qtd?}} itemNovo   peça que SAI para o cliente
 * @returns {Promise<{success:boolean, error?:string, skuAntigo?:string, skuNovo?:string, corNova?:string}>}
 */
export async function processarTroca(idPedido, itemAntigo, itemNovo) {
  try {
    if (!itemAntigo?.modelo || !itemNovo?.modelo) {
      return { success: false, error: 'Itens da troca incompletos' };
    }
    const qtdAntigo = parseInt(itemAntigo.qtd, 10) || 1;
    const qtdNovo = parseInt(itemNovo.qtd, 10) || 1;

    // Resolve os itens reais (LIKE fallback para a cor) — a peça nova PRECISA existir
    const novoReal = await findByModeloTamanhoCor(itemNovo.modelo, itemNovo.tamanho, itemNovo.cor);
    if (!novoReal) {
      return { success: false, error: `Peça nova não encontrada: ${itemNovo.modelo} ${itemNovo.tamanho} ${itemNovo.cor}` };
    }
    const antigoReal = await findByModeloTamanhoCor(itemAntigo.modelo, itemAntigo.tamanho, itemAntigo.cor);
    const skuNovo = novoReal.sku;
    const skuAntigo = antigoReal?.sku || generateSKU(itemAntigo.modelo, itemAntigo.tamanho, itemAntigo.cor);
    const now = new Date().toISOString();

    transaction(() => {
      // 1) Peça NOVA SAI (-1 do total) — guardada contra oversell
      run(
        `UPDATE estoque
            SET quantidade_total     = quantidade_total - ?,
                quantidade_disponivel = (quantidade_total - ?) - quantidade_reservada,
                data_atualizacao = ?,
                updated_at = ?
          WHERE sku = ?
            AND (quantidade_total - quantidade_reservada) >= ?`,
        [qtdNovo, qtdNovo, now, now, skuNovo, qtdNovo]
      );
      const okNovo = queryOne('SELECT changes() as n')?.n ?? 0;
      if (okNovo === 0) {
        throw new Error(`Estoque insuficiente para ${novoReal.modelo} ${novoReal.tamanho} ${novoReal.cor}`);
      }

      // 2) Peça ANTIGA VOLTA (+1 no total). Se o SKU não existir no estoque, o
      //    UPDATE não altera linha alguma — o log abaixo ainda registra o retorno.
      run(
        `UPDATE estoque
            SET quantidade_total     = quantidade_total + ?,
                quantidade_disponivel = (quantidade_total + ?) - quantidade_reservada,
                data_atualizacao = ?,
                updated_at = ?
          WHERE sku = ?`,
        [qtdAntigo, qtdAntigo, now, now, skuAntigo]
      );

      // 3) Auditoria: duas linhas no log_estoque (saída da nova, retorno da antiga)
      run(
        `INSERT INTO log_estoque (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [now, skuNovo, novoReal.modelo, novoReal.tamanho, novoReal.cor, -qtdNovo,
         'Troca de Cliente', `Troca pedido #${idPedido}: saída da peça nova`, 'bot-troca']
      );
      run(
        `INSERT INTO log_estoque (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [now, skuAntigo, itemAntigo.modelo, itemAntigo.tamanho, itemAntigo.cor, qtdAntigo,
         'Troca de Cliente', `Troca pedido #${idPedido}: retorno da peça antiga`, 'bot-troca']
      );
    });

    logger.info(`[estoque] TROCA pedido #${idPedido}: +${qtdAntigo} ${skuAntigo} / -${qtdNovo} ${skuNovo}`);
    return { success: true, skuAntigo, skuNovo, corNova: novoReal.cor };
  } catch (error) {
    logger.error('[sqlite:estoque] processarTroca:', error.message);
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
 * Motivos de baixa permitidos. Cada saída manual DEVE usar um destes —
 * eles definem como a contabilidade trata a saída no fechamento.
 * A lista é a fonte da verdade: usada na validação (backend) e no dropdown (front).
 */
export const MOTIVOS_BAIXA = [
  'Ação de Marketing / Permuta',
  'Uso Pessoal / Presente',
  'Defeito de Fábrica / Avaria',
  'Troca de Cliente',
  'Ajuste de Inventário (Perda/Roubo)'
];

/**
 * Baixa manual de estoque com motivo obrigatório + registro em log_estoque.
 *
 * Tudo numa transação atômica: ou subtrai a quantidade E grava o log, ou nada.
 * Nunca permite baixar abaixo do que está reservado (vendas em aberto) nem
 * deixar o total negativo.
 *
 * @returns {{success:boolean, error?:string, log_id?:number, quantidade_total?:number}}
 */
export async function baixarEstoque(sku, quantidade, motivo, observacao = '', usuario = 'admin') {
  try {
    const qtd = parseInt(quantidade, 10);
    if (!sku) return { success: false, error: 'SKU é obrigatório' };
    if (!Number.isInteger(qtd) || qtd <= 0) {
      return { success: false, error: 'Quantidade a baixar deve ser um inteiro maior que zero' };
    }
    if (!motivo || !MOTIVOS_BAIXA.includes(motivo)) {
      return { success: false, error: 'Motivo da baixa inválido ou não informado' };
    }

    const item = await findBySKU(sku);
    if (!item) return { success: false, error: `SKU ${sku} não encontrado` };

    const disponivel = item.quantidade_total - item.quantidade_reservada;
    if (qtd > disponivel) {
      return {
        success: false,
        error: `Quantidade indisponível para baixa. Disponível: ${disponivel} (há ${item.quantidade_reservada} reservado/vendido)`
      };
    }

    const now = new Date().toISOString();
    let logId = null;
    let novoTotal = item.quantidade_total;

    transaction(() => {
      // 1) Subtrai do total — guarda só baixa o que está disponível (não toca reservado)
      run(
        `UPDATE estoque
         SET quantidade_total = quantidade_total - ?,
             quantidade_disponivel = (quantidade_total - ?) - quantidade_reservada,
             data_atualizacao = ?,
             updated_at = ?
         WHERE sku = ?
           AND (quantidade_total - quantidade_reservada) >= ?`,
        [qtd, qtd, now, now, sku, qtd]
      );
      const changed = queryOne('SELECT changes() as n')?.n ?? 0;
      if (changed === 0) {
        // Corrida concorrente consumiu o disponível entre a leitura e o update.
        throw new Error('Falha na baixa: estoque mudou durante a operação. Tente de novo.');
      }

      // 2) Registra a auditoria da saída
      const res = run(
        `INSERT INTO log_estoque
           (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [now, sku, item.modelo, item.tamanho, item.cor, qtd, motivo, (observacao || '').trim(), usuario]
      );
      logId = res.id;
      novoTotal = item.quantidade_total - qtd;
    });

    logger.info(`[estoque] BAIXA ${sku}: -${qtd} | motivo: ${motivo} | log #${logId}`);
    return { success: true, log_id: logId, quantidade_total: novoTotal };
  } catch (error) {
    logger.error('[sqlite:estoque] baixarEstoque:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * AJUSTE DE INVENTÁRIO (Auditoria) — override absoluto do saldo físico.
 *
 * O número contado vira a NOVA verdade do quantidade_total. O Delta
 * (físico − sistema) é calculado e gravado no log_estoque em background,
 * com sinal: negativo = quebra/perda, positivo = sobra encontrada — insumo
 * direto para o custo de quebra de estoque no DRE.
 *
 * Override direto, mas NÃO toca a reserva (vendas em aberto seguem válidas).
 * Se a contagem física for MENOR que o reservado, aplica mesmo assim (verdade
 * é verdade) mas devolve `alertaReserva: true` para a UI sinalizar o conflito.
 */
export async function ajustarInventario(sku, contagemFisica, usuario = 'admin', observacao = '', motivo = 'Auditoria de Inventário') {
  try {
    const fisico = parseInt(contagemFisica, 10);
    if (!sku) return { success: false, error: 'SKU é obrigatório' };
    if (!Number.isInteger(fisico) || fisico < 0) {
      return { success: false, error: 'Contagem física deve ser um inteiro >= 0' };
    }

    const item = await findBySKU(sku);
    if (!item) return { success: false, error: `SKU ${sku} não encontrado` };

    const delta = fisico - item.quantidade_total;
    if (delta === 0) {
      return { success: true, delta: 0, novoTotal: fisico, semMudanca: true, alertaReserva: false };
    }

    const now = new Date().toISOString();
    let logId = null;

    transaction(() => {
      // 1) Override absoluto do total; disponível = total - reservada (>= 0)
      run(
        `UPDATE estoque
         SET quantidade_total = ?,
             quantidade_disponivel = MAX(0, ? - quantidade_reservada),
             data_atualizacao = ?,
             updated_at = ?
         WHERE sku = ?`,
        [fisico, fisico, now, now, sku]
      );

      // 2) Auditoria: Delta assinado (negativo = quebra, positivo = sobra)
      const res = run(
        `INSERT INTO log_estoque
           (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [now, sku, item.modelo, item.tamanho, item.cor, delta, motivo,
         (observacao || `Sistema ${item.quantidade_total} -> Fisico ${fisico}`).trim(), usuario]
      );
      logId = res.id;
    });

    logger.info(`[estoque] AJUSTE ${sku}: ${item.quantidade_total} -> ${fisico} (D ${delta > 0 ? '+' : ''}${delta}) | log #${logId}`);
    return {
      success: true,
      delta,
      novoTotal: fisico,
      alertaReserva: fisico < item.quantidade_reservada,
      reservada: item.quantidade_reservada,
      log_id: logId
    };
  } catch (error) {
    logger.error('[sqlite:estoque] ajustarInventario:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista o histórico de baixas (log_estoque) para o Relatório de Baixas.
 * Filtros opcionais: motivo, sku, data_inicio, data_fim (YYYY-MM-DD).
 */
export function listarLogEstoque({ motivo, sku, data_inicio, data_fim, limite = 500 } = {}) {
  try {
    let sql = 'SELECT * FROM log_estoque WHERE 1=1';
    const params = [];
    if (motivo) { sql += ' AND motivo = ?'; params.push(motivo); }
    if (sku) { sql += ' AND sku = ?'; params.push(sku); }
    if (data_inicio) { sql += ' AND data_hora >= ?'; params.push(data_inicio); }
    if (data_fim) { sql += ' AND data_hora <= ?'; params.push(`${data_fim}T23:59:59.999Z`); }
    sql += ' ORDER BY data_hora DESC LIMIT ?';
    params.push(parseInt(limite, 10) || 500);
    return query(sql, params);
  } catch (error) {
    logger.error('[sqlite:estoque] listarLogEstoque:', error.message);
    return [];
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
