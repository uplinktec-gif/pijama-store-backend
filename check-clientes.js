import { getSheetsClient, getSpreadsheetId } from './src/config/sheets.js';
import 'dotenv/config';

async function checkClientes() {
  const sheets = getSheetsClient();
  if (!sheets) {
    console.log('Sheets not initialized');
    return;
  }

  const spreadsheetId = getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'CLIENTES!A:P'
  });

  const rows = response.data.values || [];
  console.log('Total rows:', rows.length);
  
  // Show last 3 rows
  rows.slice(-3).forEach((row, idx) => {
    console.log(`\nRow ${rows.length - 3 + idx}:`);
    console.log(`  ID: ${row[0]}`);
    console.log(`  Nome: ${row[1]}`);
    console.log(`  WhatsApp: ${row[2]}`);
    console.log(`  Email: ${row[3]}`);
    console.log(`  CPF: ${row[14]}`);
    console.log(`  Google ID: ${row[15]}`);
  });
}

checkClientes().catch(console.error);
