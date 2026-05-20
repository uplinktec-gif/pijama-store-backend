import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';

const FOTOS_SHEET = 'FOTOS';

/**
 * Lê a aba FOTOS e retorna:
 * { fotos: { MODELO: { cor: [ids] } }, capas: { MODELO: 'cor' } }
 * Linhas com COR = '_capa' definem a foto de vitrine de cada modelo
 */
async function lerFotos() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return { fotos: {}, capas: {} };

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${FOTOS_SHEET}!A:C`
    });

    const rows = response.data.values || [];
    const fotos = {};
    const capas = {};

    for (let i = 1; i < rows.length; i++) {
      const [modelo, cor, idsRaw] = rows[i];
      if (!modelo || !cor) continue;

      const m = modelo.trim().toUpperCase();
      const c = cor.trim().toLowerCase();

      if (c === '_capa') {
        // Linha especial: define cor de vitrine
        capas[m] = (idsRaw || '').trim().toLowerCase();
        continue;
      }

      if (!idsRaw) continue;
      const ids = idsRaw.split(',').map(id => id.trim()).filter(Boolean);
      if (!fotos[m]) fotos[m] = {};
      fotos[m][c] = ids;
    }

    return { fotos, capas };
  } catch (error) {
    logger.error('[fotos] Erro ao ler aba FOTOS:', error.message);
    return { fotos: {}, capas: {} };
  }
}

/**
 * Atualiza a cor de capa de um modelo na planilha
 */
async function atualizarCapa(modelo, cor) {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${FOTOS_SHEET}!A:C` });
    const rows = res.data.values || [];

    const m = modelo.trim().toUpperCase();
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]?.toUpperCase() === m && rows[i][1]?.toLowerCase() === '_capa') {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${FOTOS_SHEET}!C${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[cor.toLowerCase()]] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${FOTOS_SHEET}!A:C`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[m, '_capa', cor.toLowerCase()]] }
      });
    }

    logger.info(`[fotos] Capa de ${m} → ${cor}`);
    return true;
  } catch (error) {
    logger.error('[fotos] Erro ao atualizar capa:', error.message);
    return false;
  }
}

/**
 * Cria a aba FOTOS se não existir e popula com os dados iniciais
 */
async function inicializarAbaFotos(dadosIniciais) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return false;

    const spreadsheetId = getSpreadsheetId();

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const abaExiste = meta.data.sheets.some(s => s.properties.title === FOTOS_SHEET);

    if (!abaExiste) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: FOTOS_SHEET } } }] }
      });
      logger.info('[fotos] Aba FOTOS criada');
    }

    const rows = [['MODELO', 'COR', 'IDS']];
    for (const [modelo, cores] of Object.entries(dadosIniciais)) {
      for (const [cor, ids] of Object.entries(cores)) {
        rows.push([modelo, cor, ids.join(',')]);
      }
    }

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${FOTOS_SHEET}!A:C` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${FOTOS_SHEET}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    logger.info(`[fotos] Aba FOTOS populada com ${rows.length - 1} entradas`);
    return true;
  } catch (error) {
    logger.error('[fotos] Erro ao inicializar aba FOTOS:', error.message);
    return false;
  }
}

export { lerFotos, inicializarAbaFotos, atualizarCapa };
