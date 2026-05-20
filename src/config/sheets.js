import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

let sheetsClient = null;
let sheetsInstance = null;

async function initializeSheets() {
  try {
    if (sheetsClient) {
      logger.debug('Google Sheets já inicializado');
      return sheetsClient;
    }

    const credentialsPath = path.resolve(env.googleSheetsCredentialsPath);

    // Verificar se o arquivo de credenciais existe
    if (!fs.existsSync(credentialsPath)) {
      logger.error(`Arquivo de credenciais não encontrado: ${credentialsPath}`);
      logger.warn('Para usar Google Sheets, coloque service-account.json na raiz do projeto');
      return null;
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const authClient = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    sheetsInstance = sheetsClient;

    logger.info('✓ Google Sheets inicializado com sucesso');
    return sheetsClient;
  } catch (error) {
    logger.error('Erro ao inicializar Google Sheets:', error.message);
    return null;
  }
}

function getSheetsClient() {
  if (!sheetsInstance) {
    logger.warn('Google Sheets não está inicializado. Chame initializeSheets() primeiro.');
    return null;
  }
  return sheetsInstance;
}

function getSpreadsheetId() {
  return env.googleSheetsId;
}

export { initializeSheets, getSheetsClient, getSpreadsheetId };
