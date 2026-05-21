import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { getDatabase, saveDatabase } from '../../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '../../../data/pijama-store.db');
const BACKUP_DIR = join(__dirname, '../../../data/backups');

/**
 * Realiza backup do banco SQLite
 */
export async function realizarBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Forçar save antes de copiar
    saveDatabase(true);

    if (!fs.existsSync(DB_PATH)) {
      logger.warn('[backup] Arquivo de banco não encontrado:', DB_PATH);
      return { success: false, error: 'Banco não encontrado' };
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const backupFile = join(BACKUP_DIR, `pijama-${timestamp}.db`);

    fs.copyFileSync(DB_PATH, backupFile);

    const stats = fs.statSync(backupFile);
    const sizeKB = Math.round(stats.size / 1024);

    logger.info(`✓ Backup criado: ${backupFile} (${sizeKB}KB)`);

    // Limpar backups com mais de 30 dias
    await limparBackupsAntigos(30);

    return { success: true, filename: backupFile, size: sizeKB };
  } catch (error) {
    logger.error('[backup] Erro ao realizar backup:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista backups disponíveis
 */
export function listarBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stats = fs.statSync(join(BACKUP_DIR, f));
        return {
          filename: f,
          path: join(BACKUP_DIR, f),
          size: Math.round(stats.size / 1024),
          created: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
  } catch (error) {
    logger.error('[backup] Erro ao listar backups:', error.message);
    return [];
  }
}

/**
 * Remove backups mais antigos que N dias
 */
async function limparBackupsAntigos(diasLimite = 30) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;

    const corte = Date.now() - (diasLimite * 86400000);
    const arquivos = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));

    let removidos = 0;
    for (const arquivo of arquivos) {
      const caminho = join(BACKUP_DIR, arquivo);
      const stats = fs.statSync(caminho);
      if (stats.mtime.getTime() < corte) {
        fs.unlinkSync(caminho);
        removidos++;
      }
    }

    if (removidos > 0) {
      logger.info(`[backup] ${removidos} backup(s) antigo(s) removido(s)`);
    }
  } catch (error) {
    logger.warn('[backup] Erro ao limpar backups antigos:', error.message);
  }
}
