/**
 * Script para inicializar a aba LEADS no Google Sheets
 * Cria a aba com headers se não existir
 */

import { google } from 'googleapis';
import fs from 'fs';

const credentialsPath = './service-account.json';
const spreadsheetId = process.env.GOOGLE_SHEETS_ID || '1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U';
const SHEET_NAME = 'LEADS';

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const authClient = await auth.getClient();
const sheets = google.sheets({ version: 'v4', auth: authClient });

try {
  console.log(`🔍 Verificando aba "${SHEET_NAME}" no spreadsheet...`);

  // Obter lista de abas
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId
  });

  const leadsSheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME);

  if (leadsSheet) {
    console.log(`✓ Aba "${SHEET_NAME}" já existe`);

    // Verificar headers
    const range = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:K1`
    });

    const headers = range.data.values?.[0] || [];
    const expectedHeaders = [
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
    ];

    if (headers.length === expectedHeaders.length && headers.every((h, i) => h === expectedHeaders[i])) {
      console.log(`✓ Headers estão corretos`);
    } else {
      console.log(`⚠️ Headers não correspondem aos esperados`);
      console.log(`  Encontrados: ${headers.join(' | ')}`);
      console.log(`  Esperados:  ${expectedHeaders.join(' | ')}`);
    }
  } else {
    console.log(`📝 Criando aba "${SHEET_NAME}"...`);

    // Criar nova aba
    const createResult = await sheets.spreadsheets.batchUpdate({
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

    console.log(`✓ Aba criada com ID: ${createResult.data.replies[0].addSheet.properties.sheetId}`);

    // Inserir headers
    const headers = [
      [
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
      ]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: headers
      }
    });

    console.log(`✓ Headers inseridos`);
  }

  console.log(`\n✅ Aba LEADS inicializada com sucesso!\n`);
} catch (error) {
  console.error('❌ Erro ao inicializar aba LEADS:', error.message);
  process.exit(1);
}
