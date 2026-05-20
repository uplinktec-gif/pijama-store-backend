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

(async () => {
  const sheets = google.sheets({ version: 'v4', auth });
  try {
    const result = await sheets.spreadsheets.get({
      spreadsheetId: '1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U'
    });
    console.log('Sheets existentes:');
    result.data.sheets.forEach(sheet => {
      console.log(`  - ${sheet.properties.title}`);
    });
  } catch (err) {
    console.error('Erro:', err.message);
  }
  process.exit(0);
})();
