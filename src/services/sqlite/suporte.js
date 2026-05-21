import { query, run } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * No-op para compatibilidade com sheets/suporte.js
 */
export async function inicializarSheetSuporte() {
  return Promise.resolve();
}

/**
 * Salva uma mensagem de suporte
 */
export async function salvarMensagemSuporte(dadosMensagem) {
  try {
    const now = new Date().toISOString();

    const result = run(
      `INSERT INTO suporte
       (data_criacao, cliente_whatsapp, cliente_nome, mensagem, status, observacoes)
       VALUES (?, ?, ?, ?, 'ABERTO', ?)`,
      [
        now,
        dadosMensagem.cliente_whatsapp || '',
        dadosMensagem.cliente_nome || '',
        dadosMensagem.mensagem || '',
        dadosMensagem.observacoes || ''
      ]
    );

    return String(result.id); // Retornar como string para compatibilidade
  } catch (error) {
    logger.error('[sqlite:suporte] salvarMensagemSuporte:', error.message);
    return null;
  }
}

/**
 * Busca mensagens abertas de suporte
 */
export async function buscarMensagensAbertas() {
  try {
    return query(
      "SELECT * FROM suporte WHERE status = 'ABERTO' ORDER BY data_criacao"
    ).map(mapSuporte);
  } catch (error) {
    logger.error('[sqlite:suporte] buscarMensagensAbertas:', error.message);
    return [];
  }
}

/**
 * Registra resposta para uma mensagem de suporte
 */
export async function responderMensagem(id, resposta) {
  try {
    const now = new Date().toISOString();

    run(
      `UPDATE suporte
       SET resposta = ?,
           data_resposta = ?,
           status = 'RESPONDIDO',
           updated_at = ?
       WHERE id = ?`,
      [resposta, now, now, id]
    );
  } catch (error) {
    logger.error('[sqlite:suporte] responderMensagem:', error.message);
  }
}

function mapSuporte(row) {
  return {
    id: row.id,
    linha: row.id, // Alias para compatibilidade
    timestamp: row.data_criacao || '',
    data_criacao: row.data_criacao || '',
    cliente_whatsapp: row.cliente_whatsapp || '',
    cliente_nome: row.cliente_nome || '',
    mensagem: row.mensagem || '',
    status: row.status || 'ABERTO',
    resposta: row.resposta || '',
    data_resposta: row.data_resposta || '',
    observacoes: row.observacoes || ''
  };
}
