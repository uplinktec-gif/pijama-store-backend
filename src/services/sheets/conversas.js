import { getSheetsClient } from '../../config/sheets.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const SHEET_NAME = 'CONVERSAS';

/**
 * Carrega contexto de conversa ativa para um cliente
 */
async function carregarContexto(clienteWhatsApp) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) {
      logger.error('Google Sheets não está inicializado');
      return null;
    }

    const range = `${SHEET_NAME}!A:G`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSheetsId,
      range
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return null;

    const headers = rows[0];
    const whatsappIdx = headers.indexOf('WHATSAPP');
    const statusIdx = headers.indexOf('STATUS');
    const contextoIdx = headers.indexOf('CONTEXTO_JSON');
    const dataInicioIdx = headers.indexOf('DATA_INICIO');
    const ultimaAtualizacaoIdx = headers.indexOf('ULTIMA_ATUALIZACAO');

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[whatsappIdx] === clienteWhatsApp && row[statusIdx] === 'ATIVA') {
        return {
          rowIndex: i + 1,
          whatsapp: row[whatsappIdx],
          status: row[statusIdx],
          contexto: row[contextoIdx] ? JSON.parse(row[contextoIdx]) : {},
          dataInicio: row[dataInicioIdx],
          ultimaAtualizacao: row[ultimaAtualizacaoIdx]
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao carregar contexto:', error.message);
    throw error;
  }
}

/**
 * Salva ou atualiza contexto de conversa
 */
async function salvarContexto(clienteWhatsApp, contexto, status = 'ATIVA') {
  try {
    const sheets = getSheetsClient();
    if (!sheets) {
      logger.error('Google Sheets não está inicializado');
      return;
    }

    const range = `${SHEET_NAME}!A:G`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSheetsId,
      range
    });

    const rows = response.data.values || [];
    const headers = rows[0] || [
      'WHATSAPP', 'STATUS', 'CONTEXTO_JSON', 'DATA_INICIO',
      'ULTIMA_ATUALIZACAO', 'NUMERO_PEDIDO_ATUAL', 'OBSERVACOES'
    ];

    if (rows.length === 1) {
      // Criar headers se não existem
      await sheets.spreadsheets.values.update({
        spreadsheetId: env.googleSheetsId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });
    }

    const whatsappIdx = headers.indexOf('WHATSAPP');
    const statusIdx = headers.indexOf('STATUS');
    const contextoIdx = headers.indexOf('CONTEXTO_JSON');
    const ultimaAtualizacaoIdx = headers.indexOf('ULTIMA_ATUALIZACAO');
    const dataInicioIdx = headers.indexOf('DATA_INICIO');

    let existingRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[whatsappIdx] === clienteWhatsApp && row[statusIdx] === 'ATIVA') {
        existingRowIndex = i;
        break;
      }
    }

    const now = new Date().toISOString();
    const contextJson = JSON.stringify(contexto);

    if (existingRowIndex !== -1) {
      // Atualizar contexto existente
      const rowNum = existingRowIndex + 1;
      const updateRange = `${SHEET_NAME}!A${rowNum}:G${rowNum}`;
      const values = [
        clienteWhatsApp,
        status,
        contextJson,
        rows[existingRowIndex][dataInicioIdx] || now,
        now,
        contexto.numero_pedido_atual || '',
        ''
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: env.googleSheetsId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] }
      });
    } else {
      // Criar nova conversa
      const newRow = [
        clienteWhatsApp,
        status,
        contextJson,
        now,
        now,
        '',
        ''
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: env.googleSheetsId,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] }
      });
    }
  } catch (error) {
    logger.error('Erro ao salvar contexto:', error.message);
    throw error;
  }
}

/**
 * Encerra conversa (marca como FINALIZADA)
 */
async function encerrarConversa(clienteWhatsApp) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) {
      logger.error('Google Sheets não está inicializado');
      return;
    }

    const range = `${SHEET_NAME}!A:G`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.googleSheetsId,
      range
    });

    const rows = response.data.values || [];
    const headers = rows[0];
    const whatsappIdx = headers.indexOf('WHATSAPP');
    const statusIdx = headers.indexOf('STATUS');

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[whatsappIdx] === clienteWhatsApp && row[statusIdx] === 'ATIVA') {
        const rowNum = i + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: env.googleSheetsId,
          range: `${SHEET_NAME}!B${rowNum}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['FINALIZADA']] }
        });
        break;
      }
    }
  } catch (error) {
    logger.error('Erro ao encerrar conversa:', error.message);
    throw error;
  }
}

export {
  carregarContexto,
  salvarContexto,
  encerrarConversa
};
