import { queryOne, run } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Carrega contexto de conversa ativa para um WhatsApp
 */
export async function carregarContexto(clienteWhatsApp) {
  try {
    const row = queryOne(
      "SELECT * FROM conversas WHERE whatsapp = ? AND status = 'ativa'",
      [clienteWhatsApp]
    );

    if (!row) return null;

    // Parsear contexto JSON com segurança
    let contexto = {};
    try {
      contexto = JSON.parse(row.contexto_json || '{}');
    } catch (_) {
      logger.warn(`[sqlite:conversas] contexto_json inválido para ${clienteWhatsApp.slice(-4)}`);
      contexto = {};
    }

    return {
      whatsapp: row.whatsapp,
      status: row.status,
      contexto,
      dataInicio: row.created_at || '',
      ultimaAtualizacao: row.updated_at || '',
      rowIndex: 0 // Sem rowIndex no SQLite, mantido para compatibilidade
    };
  } catch (error) {
    logger.error('[sqlite:conversas] carregarContexto:', error.message);
    return null;
  }
}

/**
 * Salva (cria ou atualiza) contexto de conversa (UPSERT)
 */
export async function salvarContexto(clienteWhatsApp, contexto, status = 'ativa') {
  try {
    const now = new Date().toISOString();
    const contextoJson = JSON.stringify(contexto || {});

    run(
      `INSERT INTO conversas (whatsapp, contexto_json, status, ultimo_mensagem_timestamp, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(whatsapp) DO UPDATE SET
         contexto_json = excluded.contexto_json,
         status = excluded.status,
         ultimo_mensagem_timestamp = excluded.ultimo_mensagem_timestamp,
         updated_at = excluded.updated_at`,
      [clienteWhatsApp, contextoJson, status, now, now]
    );
  } catch (error) {
    logger.error('[sqlite:conversas] salvarContexto:', error.message);
  }
}

/**
 * Encerra conversa ativa
 */
export async function encerrarConversa(clienteWhatsApp) {
  try {
    const now = new Date().toISOString();
    run(
      "UPDATE conversas SET status = 'finalizada', updated_at = ? WHERE whatsapp = ? AND status = 'ativa'",
      [now, clienteWhatsApp]
    );
  } catch (error) {
    logger.error('[sqlite:conversas] encerrarConversa:', error.message);
  }
}
