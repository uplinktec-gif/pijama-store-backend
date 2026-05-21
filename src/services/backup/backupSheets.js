import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = './backups';

/**
 * Garante que o diretório de backups existe
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    logger.info(`📁 Diretório de backups criado: ${BACKUP_DIR}`);
  }
}

/**
 * Realiza backup de todas as abas do Google Sheets
 */
async function realizarBackup() {
  try {
    ensureBackupDir();

    const sheets = getSheetsClient();
    if (!sheets) {
      logger.warn('Google Sheets não está inicializado, backup não realizado');
      return { success: false, error: 'Google Sheets não está inicializado' };
    }

    const spreadsheetId = getSpreadsheetId();
    logger.info('[BACKUP] Iniciando backup do Google Sheets...');

    const sheetNames = ['ESTOQUE', 'PEDIDOS_E_VENDAS', 'CLIENTES', 'CONVERSAS'];
    const backup = {
      timestamp: new Date().toISOString(),
      spreadsheetId,
      sheets: {}
    };

    // Ler dados de cada aba
    for (const sheetName of sheetNames) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:P`
        });

        backup.sheets[sheetName] = response.data.values || [];
        logger.debug(`[BACKUP] ${sheetName}: ${backup.sheets[sheetName].length} linhas`);
      } catch (error) {
        logger.warn(`[BACKUP] Erro ao ler ${sheetName}: ${error.message}`);
        backup.sheets[sheetName] = [];
      }
    }

    // Salvar backup em arquivo JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const hora = new Date().toISOString().split('T')[1].replace(/[:.]/g, '-').slice(0, 6);
    const filename = `pijama-store-${timestamp}-${hora}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

    // Obter tamanho do arquivo
    const stats = fs.statSync(filepath);
    const tamanhoKb = Math.round(stats.size / 1024);

    logger.info(`✅ Backup realizado: ${filename} (${Object.values(backup.sheets).reduce((a, b) => a + b.length, 0)} linhas totais, ${tamanhoKb}KB)`);

    // Limpar backups antigos (manter últimos 30 dias)
    limparBackupsAntigos();

    return {
      success: true,
      arquivo: filename,
      tamanho_kb: tamanhoKb,
      data_backup: backup.timestamp
    };
  } catch (error) {
    logger.error(`[BACKUP] Erro ao realizar backup: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Limpa backups mais antigos que 30 dias
 */
function limparBackupsAntigos() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const agora = Date.now();
    const DIAS_30 = 30 * 24 * 60 * 60 * 1000;

    let deletados = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filepath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filepath);
      const idade = agora - stats.mtime.getTime();

      if (idade > DIAS_30) {
        fs.unlinkSync(filepath);
        deletados++;
        logger.debug(`[BACKUP] Backup antigo deletado: ${file}`);
      }
    }

    if (deletados > 0) {
      logger.info(`🗑️ ${deletados} backup(s) antigo(s) deletado(s)`);
    }
  } catch (error) {
    logger.warn(`[BACKUP] Erro ao limpar backups antigos: ${error.message}`);
  }
}

/**
 * Lista todos os backups disponíveis
 */
function listarBackups() {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filepath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(filepath);
        return {
          filename: f,
          size: stats.size,
          mtime: stats.mtime,
          path: filepath
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    return files;
  } catch (error) {
    logger.error(`Erro ao listar backups: ${error.message}`);
    return [];
  }
}

/**
 * Obtém informações do último backup
 */
function obterUltimoBackup() {
  const backups = listarBackups();
  return backups.length > 0 ? backups[0] : null;
}

export {
  realizarBackup,
  limparBackupsAntigos,
  listarBackups,
  obterUltimoBackup
};
