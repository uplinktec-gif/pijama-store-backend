import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import { realizarBackup } from '../backup/backupSQLite.js';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../../..');

/**
 * Sincroniza banco de dados local com VPS via SCP
 * Requer SSH sem senha configurado (ssh-keygen)
 */
export async function sincronizarComVPS() {
  try {
    // VPS info
    const vpsUser = 'root';
    const vpsIp = '177.7.47.211';
    const vpsDbPath = '/opt/pijama-store/data/pijama-store.db';
    const localDbPath = path.join(projectRoot, 'data/pijama-store.db');

    logger.info(`📤 [SYNC] Iniciando sincronização com VPS...`);

    // 1. Fazer backup local primeiro (para segurança)
    const backupResult = await realizarBackup();
    if (!backupResult.success) {
      logger.warn(`[SYNC] Aviso: backup local falhou, continuando mesmo assim`);
    }

    // 2. Verificar se arquivo de banco existe
    const fs = await import('fs');
    if (!fs.existsSync(localDbPath)) {
      return {
        success: false,
        error: 'Banco de dados local não encontrado'
      };
    }

    logger.info(`📁 [SYNC] Banco local encontrado (${fs.statSync(localDbPath).size} bytes)`);

    // 3. Sincronizar com VPS via SCP
    logger.info(`🔄 [SYNC] Transferindo para VPS (${vpsIp})...`);
    const scpCommand = `scp "${localDbPath}" ${vpsUser}@${vpsIp}:${vpsDbPath}`;

    try {
      const { stdout, stderr } = await execAsync(scpCommand, { timeout: 30000 });
      logger.info(`✅ [SYNC] SCP concluído com sucesso`);

      if (stderr && stderr.length > 0) {
        logger.debug(`[SYNC] SCP warnings: ${stderr}`);
      }

      // 4. Verificar integridade no VPS (opcional, mas seguro)
      const checkCommand = `ssh ${vpsUser}@${vpsIp} "ls -lh ${vpsDbPath} && file ${vpsDbPath}"`;
      const { stdout: checkOutput } = await execAsync(checkCommand, { timeout: 10000 });

      logger.info(`✅ [SYNC] Banco no VPS verificado:`);
      checkOutput.split('\n').forEach(line => {
        if (line.trim()) logger.info(`   ${line}`);
      });

      return {
        success: true,
        localSize: fs.statSync(localDbPath).size,
        timestamp: new Date().toISOString()
      };
    } catch (scpError) {
      logger.error(`❌ [SYNC] Erro ao executar SCP:`, scpError.message);

      // Verificar se é erro de SSH não configurado
      if (scpError.message.includes('permission denied') || scpError.message.includes('authenticity')) {
        logger.warn(`[SYNC] ⚠️  Parece que SSH sem senha não está configurado`);
        logger.warn(`[SYNC] Execute no seu PC: ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`);
        logger.warn(`[SYNC] Depois: ssh-copy-id -i ~/.ssh/id_ed25519.pub root@177.7.47.211`);
      }

      return {
        success: false,
        error: scpError.message
      };
    }
  } catch (error) {
    logger.error(`❌ [SYNC] Erro geral na sincronização:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verifica se SSH sem senha está configurado
 */
export async function verificarSSHConfigurado() {
  try {
    const testCommand = `ssh -o ConnectTimeout=5 root@177.7.47.211 "echo SSH_OK"`;
    const { stdout } = await execAsync(testCommand, { timeout: 10000 });

    if (stdout.includes('SSH_OK')) {
      logger.info(`✅ [SSH] Acesso SSH sem senha configurado e funcionando`);
      return true;
    }
  } catch (error) {
    logger.warn(`❌ [SSH] Falha ao conectar - SSH pode não estar configurado`);
    return false;
  }
}

export default {
  sincronizarComVPS,
  verificarSSHConfigurado
};
