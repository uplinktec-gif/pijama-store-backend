import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const credentialsPath = path.resolve('./service-account.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

(async () => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: '1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U',
      range: 'PEDIDOS_E_VENDAS!A1:G100'
    });

    const rows = result.data.values || [];
    console.log(`✓ Total de pedidos (incluindo header): ${rows.length}`);

    if (rows.length > 1) {
      console.log('\nÚltimos 5 pedidos:');
      rows.slice(Math.max(1, rows.length - 5)).forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.join(' | ')}`);
      });
    } else {
      console.log('Nenhum pedido encontrado ainda');
    }

    // Verificar CONVERSAS
    console.log('\n\n--- CONVERSAS ---');
    const conversasResult = await sheets.spreadsheets.values.get({
      spreadsheetId: '1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U',
      range: 'CONVERSAS!A1:G100'
    });

    const conversasRows = conversasResult.data.values || [];
    console.log(`✓ Total de conversas: ${conversasRows.length - 1}`);

    if (conversasRows.length > 1) {
      console.log('\nÚltimas conversas:');
      conversasRows.slice(Math.max(1, conversasRows.length - 3)).forEach((row, idx) => {
        const whatsapp = row[0];
        const status = row[1];
        console.log(`  ${idx + 1}. WhatsApp: ${whatsapp} | Status: ${status}`);
      });
    }

  } catch (err) {
    console.error('Erro:', err.message);
  }
  process.exit(0);
})();
