import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';

const SHEET_NAME = 'LEADS';

/**
 * Inicializar aba LEADS
 * Cria a aba com headers se não existir
 */
export async function inicializarSheetLeads() {
  try {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) {
      logger.warn('[LEADS] Spreadsheet ID não configurado, pulando inicialização');
      return;
    }

    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      logger.warn('[LEADS] Google Sheets não está inicializado');
      return;
    }

    // Obter lista de abas
    const spreadsheet = await googleSheets.spreadsheets.get({
      spreadsheetId
    });

    const leadsSheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME);

    if (leadsSheet) {
      logger.info(`✓ Aba LEADS já existe`);
    } else {
      logger.info(`📝 Criando aba LEADS...`);

      // Criar nova aba
      const createResult = await googleSheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_NAME,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 11
                  }
                }
              }
            }
          ]
        }
      });

      logger.info(`✓ Aba LEADS criada`);

      // Inserir headers
      const headers = [[
        'DATA_CRIACAO',
        'NOME',
        'CELULAR',
        'EMAIL',
        'FONTE',
        'PRIMEIRA_INTERACAO',
        'ULTIMA_INTERACAO',
        'STATUS',
        'TOTAL_GASTO',
        'NUMERO_PEDIDOS',
        'OBSERVACOES'
      ]];

      await googleSheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:K1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: headers
        }
      });

      logger.info(`✓ Headers LEADS inseridos`);
    }
  } catch (error) {
    logger.error('[LEADS] Erro ao inicializar sheet:', error.message);
  }
}

/**
 * Criar novo lead no Google Sheets
 * @param {string} nome - Nome do lead
 * @param {string} celular - Celular (OBRIGATÓRIO)
 * @param {string} email - Email (opcional)
 * @param {string} fonte - Fonte ('site_cadastro' | 'site_compra' | 'google_oauth' | 'cpf')
 * @returns {Promise<{success: boolean, error?: string, rowIndex?: number}>}
 */
export async function criarLead(nome, celular, email, fonte) {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return { success: false, error: 'Google Sheets não está inicializado' };
    }

    // Validações
    if (!nome || nome.trim().length === 0) {
      return { success: false, error: 'Nome é obrigatório' };
    }

    if (!celular || celular.replace(/\D/g, '').length < 10) {
      return { success: false, error: 'Celular inválido (mínimo 10 dígitos)' };
    }

    if (!fonte) {
      return { success: false, error: 'Fonte do lead é obrigatória' };
    }

    // Buscar lead existente por celular
    const leadExistente = await buscarLeadPorCelular(celular);
    if (leadExistente) {
      logger.info(`[LEADS] Lead já existe: ${celular}`);
      return { success: true, rowIndex: leadExistente.rowIndex };
    }

    // Montar dados do novo lead
    const agora = new Date().toISOString();
    const valores = [
      [
        agora,                                    // A: DATA_CRIACAO
        nome.trim(),                              // B: NOME
        celular.replace(/\D/g, ''),              // C: CELULAR
        email?.trim() || '',                      // D: EMAIL
        fonte,                                    // E: FONTE
        agora,                                    // F: PRIMEIRA_INTERACAO
        agora,                                    // G: ULTIMA_INTERACAO
        'novo',                                   // H: STATUS
        0,                                        // I: TOTAL_GASTO
        0,                                        // J: NUMERO_PEDIDOS
        ''                                        // K: OBSERVACOES
      ]
    ];

    // Inserir linha na sheet
    const response = await googleSheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:K`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: valores }
    });

    logger.info(`[LEADS] Novo lead criado: ${nome} (${celular})`);
    return { success: true, rowIndex: response.data.updates.updatedRows };

  } catch (error) {
    logger.error('[LEADS] Erro ao criar lead:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Buscar lead por celular
 * @param {string} celular - Celular normalizado
 * @returns {Promise<{rowIndex: number, nome: string, celular: string, status: string} | null>}
 */
export async function buscarLeadPorCelular(celular) {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return null;
    }

    const celularNorm = celular.replace(/\D/g, '');

    const response = await googleSheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!C:K`
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return null;

    // Procurar lead (skip header em índice 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[0].replace(/\D/g, '') === celularNorm) {
        return {
          rowIndex: i + 1, // Google Sheets usa 1-based indexing
          nome: row[1] || '',
          celular: row[0],
          status: row[7] || 'novo',
          totalGasto: parseFloat(row[8]) || 0
        };
      }
    }

    return null;

  } catch (error) {
    logger.error('[LEADS] Erro ao buscar lead:', error.message);
    return null;
  }
}

/**
 * Atualizar status de um lead
 * @param {string} celular - Celular do lead
 * @param {string} status - Novo status ('novo' | 'visitante' | 'cliente' | 'vip')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function atualizarStatusLead(celular, status) {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return { success: false, error: 'Google Sheets não está inicializado' };
    }

    const lead = await buscarLeadPorCelular(celular);
    if (!lead) {
      return { success: false, error: 'Lead não encontrado' };
    }

    // Atualizar coluna H (STATUS) na linha do lead
    const agora = new Date().toISOString();

    await googleSheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!H${lead.rowIndex}:G${lead.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status, agora]] // H: STATUS, G: ULTIMA_INTERACAO
      }
    });

    logger.info(`[LEADS] Status atualizado: ${celular} → ${status}`);
    return { success: true };

  } catch (error) {
    logger.error('[LEADS] Erro ao atualizar status:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualizar total gasto de um lead
 * @param {string} celular - Celular do lead
 * @param {number} valor - Valor gasto no pedido
 * @param {number} numeroPedido - Número do pedido
 * @returns {Promise<{success: boolean, newTotal?: number, isVip?: boolean}>}
 */
export async function atualizarTotalGastoLead(celular, valor, numeroPedido) {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return { success: false, error: 'Google Sheets não está inicializado' };
    }

    const lead = await buscarLeadPorCelular(celular);
    if (!lead) {
      return { success: false, error: 'Lead não encontrado' };
    }

    // Calcular novo total
    const novoTotal = lead.totalGasto + valor;
    const novoStatus = novoTotal >= 500 ? 'vip' : 'cliente';

    const agora = new Date().toISOString();

    // Atualizar: I (TOTAL_GASTO), J (NUMERO_PEDIDOS), H (STATUS), G (ULTIMA_INTERACAO)
    await googleSheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!H${lead.rowIndex}:J${lead.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novoStatus, novoTotal, (lead.rowIndex - 1)]] // H: STATUS, I: TOTAL_GASTO, J: NUMERO_PEDIDOS
      }
    });

    logger.info(`[LEADS] Total gasto atualizado: ${celular} → R$ ${novoTotal.toFixed(2)} (VIP: ${novoStatus === 'vip'})`);

    return {
      success: true,
      newTotal: novoTotal,
      isVip: novoStatus === 'vip'
    };

  } catch (error) {
    logger.error('[LEADS] Erro ao atualizar total gasto:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Listar todos os leads novos (últimas 24h)
 * @returns {Promise<Array>}
 */
export async function listarLeadsNovos() {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return [];
    }

    const response = await googleSheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:K`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const agora = new Date();
    const ontemUTC = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const leads = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const dataCriacao = row[0] || '';

      if (dataCriacao >= ontemUTC && row[7] === 'novo') {
        leads.push({
          rowIndex: i + 1,
          dataCriacao,
          nome: row[1],
          celular: row[2],
          email: row[3],
          fonte: row[4],
          status: row[7]
        });
      }
    }

    return leads;

  } catch (error) {
    logger.error('[LEADS] Erro ao listar leads novos:', error.message);
    return [];
  }
}

/**
 * Listar clientes para merchan (status = 'cliente' ou 'vip')
 * @returns {Promise<Array>}
 */
export async function listarClientesParaMerchan() {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return [];
    }

    const response = await googleSheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:K`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const clientes = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = row[7] || '';

      if (['cliente', 'vip'].includes(status)) {
        clientes.push({
          rowIndex: i + 1,
          nome: row[1],
          celular: row[2],
          email: row[3],
          status,
          totalGasto: parseFloat(row[8]) || 0,
          numeroPedidos: parseInt(row[9]) || 0,
          ultimaInteracao: row[6]
        });
      }
    }

    // Ordenar por total gasto (DESC)
    return clientes.sort((a, b) => b.totalGasto - a.totalGasto);

  } catch (error) {
    logger.error('[LEADS] Erro ao listar clientes para merchan:', error.message);
    return [];
  }
}

/**
 * Adicionar observação a um lead
 * @param {string} celular - Celular do lead
 * @param {string} observacao - Observação a adicionar
 * @returns {Promise<{success: boolean}>}
 */
export async function adicionarObservacao(celular, observacao) {
  try {
    const spreadsheetId = getSpreadsheetId();
    const googleSheets = getSheetsClient();
    if (!googleSheets) {
      return { success: false, error: 'Google Sheets não está inicializado' };
    }

    const lead = await buscarLeadPorCelular(celular);
    if (!lead) {
      return { success: false, error: 'Lead não encontrado' };
    }

    // Atualizar coluna K (OBSERVACOES)
    await googleSheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!K${lead.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[observacao]]
      }
    });

    return { success: true };

  } catch (error) {
    logger.error('[LEADS] Erro ao adicionar observação:', error.message);
    return { success: false, error: error.message };
  }
}

export default {
  criarLead,
  buscarLeadPorCelular,
  atualizarStatusLead,
  atualizarTotalGastoLead,
  listarLeadsNovos,
  listarClientesParaMerchan,
  adicionarObservacao
};
