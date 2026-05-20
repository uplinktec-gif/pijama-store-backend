import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const credentialsPath = path.resolve('./service-account.json');
if (!fs.existsSync(credentialsPath)) {
  console.error('service-account.json não encontrado');
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

(async () => {
  try {
    const spreadsheetId = '1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U';

    // Criar nova sheet CONVERSAS
    const batchUpdateRequest = {
      requests: [
        {
          addSheet: {
            properties: {
              title: 'CONVERSAS',
              sheetType: 'GRID',
              gridProperties: {
                rowCount: 1000,
                columnCount: 7
              }
            }
          }
        }
      ]
    };

    const createResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: batchUpdateRequest
    });

    console.log('✓ Sheet CONVERSAS criada com sucesso');

    // Adicionar headers
    const headerRow = [
      ['WHATSAPP', 'STATUS', 'CONTEXTO_JSON', 'DATA_INICIO', 'ULTIMA_ATUALIZACAO', 'NUMERO_PEDIDO_ATUAL', 'OBSERVACOES']
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'CONVERSAS!A1:G1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: headerRow
      }
    });

    console.log('✓ Headers adicionados à sheet CONVERSAS');
    console.log('\nStructura:');
    console.log('  A: WHATSAPP');
    console.log('  B: STATUS (ATIVA/FINALIZADA)');
    console.log('  C: CONTEXTO_JSON');
    console.log('  D: DATA_INICIO');
    console.log('  E: ULTIMA_ATUALIZACAO');
    console.log('  F: NUMERO_PEDIDO_ATUAL');
    console.log('  G: OBSERVACOES');

  } catch (err) {
    console.error('Erro:', err.message);
  }
  process.exit(0);
})();
