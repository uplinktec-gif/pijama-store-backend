import { query, queryOne, run, transaction } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Normaliza número de celular para apenas dígitos
 */
function normalizarCelular(celular) {
  return (celular || '').replace(/\D/g, '');
}

/**
 * No-op para compatibilidade com sheets/leads.js
 */
export async function inicializarSheetLeads() {
  return Promise.resolve();
}

/**
 * Cria um novo lead (idempotente — não duplica por celular)
 */
export async function criarLead(nome, celular, email, fonte) {
  try {
    const celularNorm = normalizarCelular(celular);
    if (!celularNorm) {
      return { success: false, error: 'Celular inválido' };
    }

    // Verificar se já existe
    const existente = await buscarLeadPorCelular(celular);
    if (existente) {
      logger.debug(`[sqlite:leads] Lead já existe para celular: ${celularNorm.slice(-4)}`);
      return { success: true, existente: true };
    }

    const now = new Date().toISOString();

    run(
      `INSERT INTO leads
       (data_criacao, nome, celular, email, fonte, primeira_interacao, ultima_interacao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')`,
      [now, nome || '', celularNorm, email || null, fonte || 'site', now, now]
    );

    logger.info(`[sqlite:leads] Lead criado: ${nome} (${celularNorm.slice(-4)})`);
    return { success: true };
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      return { success: true, existente: true };
    }
    logger.error('[sqlite:leads] criarLead:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Busca lead por celular (normalizado)
 */
export async function buscarLeadPorCelular(celular) {
  try {
    const celularNorm = normalizarCelular(celular);
    const row = queryOne('SELECT * FROM leads WHERE celular = ?', [celularNorm]);
    return row ? mapLead(row) : null;
  } catch (error) {
    logger.error('[sqlite:leads] buscarLeadPorCelular:', error.message);
    return null;
  }
}

/**
 * Atualiza status do lead
 */
export async function atualizarStatusLead(celular, status) {
  try {
    const celularNorm = normalizarCelular(celular);
    const now = new Date().toISOString();

    run(
      'UPDATE leads SET status = ?, ultima_interacao = ?, updated_at = ? WHERE celular = ?',
      [status, now, now, celularNorm]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:leads] atualizarStatusLead:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza total gasto do lead e ajusta status para VIP se >= 500
 */
export async function atualizarTotalGastoLead(celular, valor, numeroPedido) {
  try {
    const celularNorm = normalizarCelular(celular);
    const now = new Date().toISOString();

    let newTotal = 0;
    let isVip = false;

    transaction(() => {
      const atual = queryOne('SELECT total_gasto FROM leads WHERE celular = ?', [celularNorm]);
      if (!atual) return;

      newTotal = (parseFloat(atual.total_gasto) || 0) + (parseFloat(valor) || 0);
      isVip = newTotal >= 500;
      const novoStatus = isVip ? 'vip' : 'cliente';

      run(
        `UPDATE leads
         SET total_gasto = ?,
             numero_pedidos = numero_pedidos + 1,
             status = ?,
             ultima_interacao = ?,
             updated_at = ?
         WHERE celular = ?`,
        [newTotal, novoStatus, now, now, celularNorm]
      );
    });

    return { success: true, newTotal, isVip };
  } catch (error) {
    logger.error('[sqlite:leads] atualizarTotalGastoLead:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista leads novos (últimas 24h)
 */
export async function listarLeadsNovos() {
  try {
    const ontemISO = new Date(Date.now() - 86400000).toISOString();
    return query(
      `SELECT * FROM leads
       WHERE status = 'novo' AND data_criacao >= ?
       ORDER BY data_criacao DESC`,
      [ontemISO]
    ).map(mapLead);
  } catch (error) {
    logger.error('[sqlite:leads] listarLeadsNovos:', error.message);
    return [];
  }
}

/**
 * Lista clientes para ações de marketing (status cliente ou vip)
 */
export async function listarClientesParaMerchan() {
  try {
    return query(
      `SELECT * FROM leads
       WHERE status IN ('cliente', 'vip')
       ORDER BY total_gasto DESC`
    ).map(mapLead);
  } catch (error) {
    logger.error('[sqlite:leads] listarClientesParaMerchan:', error.message);
    return [];
  }
}

/**
 * Adiciona observação a um lead
 */
export async function adicionarObservacao(celular, observacao) {
  try {
    const celularNorm = normalizarCelular(celular);
    const now = new Date().toISOString();

    run(
      'UPDATE leads SET observacoes = ?, updated_at = ? WHERE celular = ?',
      [observacao, now, celularNorm]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:leads] adicionarObservacao:', error.message);
    return { success: false, error: error.message };
  }
}

function mapLead(row) {
  return {
    id: row.id,
    data_criacao: row.data_criacao || '',
    nome: row.nome || '',
    celular: row.celular || '',
    email: row.email || '',
    fonte: row.fonte || '',
    primeira_interacao: row.primeira_interacao || '',
    ultima_interacao: row.ultima_interacao || '',
    status: row.status || 'novo',
    total_gasto: parseFloat(row.total_gasto) || 0,
    numero_pedidos: parseInt(row.numero_pedidos) || 0,
    observacoes: row.observacoes || '',
    totalGasto: parseFloat(row.total_gasto) || 0, // alias para compatibilidade
    rowIndex: row.id // alias para compatibilidade
  };
}
