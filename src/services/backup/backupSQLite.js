import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../../..');
const backupDir = path.join(projectRoot, 'data/backups');

/**
 * Garante que diretório de backups existe
 */
function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

/**
 * Retorna informações do último backup
 */
function obterUltimoBackup() {
  ensureBackupDir();

  try {
    const arquivos = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size: stat.size,
          mtime: stat.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    return arquivos.length > 0 ? arquivos[0] : null;
  } catch (error) {
    logger.error('Erro ao obter último backup:', error.message);
    return null;
  }
}

/**
 * Lista todos os backups
 */
function listarBackups() {
  ensureBackupDir();

  try {
    const arquivos = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size: stat.size,
          mtime: stat.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    return arquivos;
  } catch (error) {
    logger.error('Erro ao listar backups:', error.message);
    return [];
  }
}

/**
 * Realiza backup do banco de dados
 */
function realizarBackup(sourceDbPath = null) {
  ensureBackupDir();

  try {
    const dbPath = sourceDbPath || path.join(projectRoot, 'data/pijama-store.db');

    if (!fs.existsSync(dbPath)) {
      logger.warn('Arquivo de banco de dados não encontrado:', dbPath);
      return {
        success: false,
        error: 'Banco de dados não encontrado'
      };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `pijama-store-backup-${timestamp}.db`;
    const backupPath = path.join(backupDir, backupFileName);

    fs.copyFileSync(dbPath, backupPath);

    logger.info(`✓ Backup realizado: ${backupFileName}`);

    return {
      success: true,
      filename: backupFileName,
      path: backupPath,
      size: fs.statSync(backupPath).size
    };
  } catch (error) {
    logger.error('Erro ao realizar backup:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export {
  obterUltimoBackup,
  listarBackups,
  realizarBackup,
  ensureBackupDir
};
