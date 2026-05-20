import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const SUPORTE_SHEET = 'SUPORTE';
const SUPORTE_RANGE = 'SUPORTE!A2:G';

/**
 * Salvar mensagem de "Fale Conosco" em sheet SUPORTE
 * @param {Object} dadosMensagem - { cliente_whatsapp, cliente_nome, mensagem, status }
 * @returns {string} mensagem_id
 */
export async function salvarMensagemSuporte(dadosMensagem) {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const mensagem_id = uuidv4();
    const timestamp = new Date().toISOString();

    // Preparar dados para inserir
    const values = [[
      timestamp,                          // A: timestamp
      dadosMensagem.cliente_whatsapp,     // B: cliente_whatsapp
      dadosMensagem.cliente_nome,         // C: cliente_nome
      dadosMensagem.mensagem,             // D: mensagem
      dadosMensagem.status || 'ABERTO',   // E: status
      '',                                 // F: resposta (vazia inicialmente)
      ''                                  // G: data_resposta (vazia inicialmente)
    ]];

    // Inserir linha
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SUPORTE_RANGE,
      valueInputOption: 'RAW',
      values
    });

    logger.debug(`[suporte] ✓ Mensagem ${mensagem_id} salva em SUPORTE`);
    return mensagem_id;
  } catch (err) {
    logger.error('[suporte] Erro ao salvar mensagem:', err.message);
    throw err;
  }
}

/**
 * Buscar mensagens de suporte em aberto
 * @returns {Array} Array de mensagens
 */
export async function buscarMensagensAbertas() {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SUPORTE_SHEET}!A2:G`
    });

    const rows = response.data.values || [];
    const mensagens = [];

    rows.forEach((row, idx) => {
      // Verificar se status é ABERTO
      if (row[4] === 'ABERTO') {
        mensagens.push({
          linha: idx + 2,  // +2 pois começa em A2 (linha 2)
          timestamp: row[0],
          cliente_whatsapp: row[1],
          cliente_nome: row[2],
          mensagem: row[3],
          status: row[4],
          resposta: row[5] || '',
          data_resposta: row[6] || ''
        });
      }
    });

    logger.debug(`[suporte] ${mensagens.length} mensagens abertas encontradas`);
    return mensagens;
  } catch (err) {
    logger.error('[suporte] Erro ao buscar mensagens abertas:', err.message);
    throw err;
  }
}

/**
 * Responder mensagem de suporte
 * @param {number} linha - Número da linha na planilha
 * @param {string} resposta - Texto da resposta
 */
export async function responderMensagem(linha, resposta) {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const timestamp = new Date().toISOString();

    // Atualizar coluna F (resposta) e G (data_resposta)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SUPORTE_SHEET}!F${linha}:G${linha}`,
      valueInputOption: 'RAW',
      values: [[resposta, timestamp]]
    });

    // Atualizar status para RESPONDIDO
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SUPORTE_SHEET}!E${linha}`,
      valueInputOption: 'RAW',
      values: [['RESPONDIDO']]
    });

    logger.info(`[suporte] ✓ Mensagem linha ${linha} respondida`);
  } catch (err) {
    logger.error('[suporte] Erro ao responder mensagem:', err.message);
    throw err;
  }
}

/**
 * Inicializar sheet SUPORTE se não existir
 */
export async function inicializarSheetSuporte() {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // Tentar ler headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SUPORTE_SHEET}!A1:G1`
    });

    const headers = response.data.values?.[0];

    if (!headers || headers.length === 0) {
      // Sheet não existe ou está vazio — criar headers
      const headersRow = [
        'timestamp',
        'cliente_whatsapp',
        'cliente_nome',
        'mensagem',
        'status',
        'resposta',
        'data_resposta'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SUPORTE_SHEET}!A1:G1`,
        valueInputOption: 'RAW',
        values: [headersRow]
      });

      logger.info('[suporte] ✓ Sheet SUPORTE inicializado com headers');
    } else {
      logger.debug('[suporte] Sheet SUPORTE já existe');
    }
  } catch (err) {
    logger.error('[suporte] Erro ao inicializar sheet:', err.message);
    // Não lançar erro — sheet pode estar em outro lugar
  }
}

export default {
  salvarMensagemSuporte,
  buscarMensagensAbertas,
  responderMensagem,
  inicializarSheetSuporte
};
