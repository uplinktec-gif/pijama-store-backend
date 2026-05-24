import { logger } from '../utils/logger.js';
import * as businessEstoque from '../services/business/estoque.js';
import * as businessClientes from '../services/business/clientes.js';
import * as businessPedidos from '../services/business/pedidos.js';
import * as backupService from '../services/backup/backupSQLite.js';
import { temPermissao } from '../config/users.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

/**
 * GET /api/estoque - Retorna todo o estoque
 */
async function obterEstoque(req, res) {
  try {
    const resultado = await businessEstoque.obterEstoqueCompleto();
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter estoque:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/estoque/baixo - Retorna itens com estoque baixo
 */
async function obterEstoqueBaixo(req, res) {
  try {
    const limite = parseInt(req.query.limite) || 5;
    const resultado = await businessEstoque.obterEstoqueBaixo(limite);
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter estoque baixo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/estoque/modelo/:modelo - Retorna itens de um modelo específico
 */
async function obterPorModelo(req, res) {
  try {
    const { modelo } = req.params;
    const resultado = await businessEstoque.obterPorModelo(modelo);
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter por modelo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/estoque/relatorio - Retorna relatório de estoque
 */
async function obterRelatorioEstoque(req, res) {
  try {
    const resultado = await businessEstoque.gerarRelatorioEstoque();
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter relatório:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/clientes/:whatsapp - Retorna perfil do cliente
 */
async function obterPerfilCliente(req, res) {
  try {
    const { whatsapp } = req.params;
    const resultado = await businessClientes.obterPerfilCliente(whatsapp);
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter perfil do cliente:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/clientes/vips - Retorna clientes VIP
 */
async function obterVIPs(req, res) {
  try {
    const resultado = await businessClientes.listarVIPs();
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter VIPs:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/clientes/inativos - Retorna clientes inativos
 */
async function obterInativos(req, res) {
  try {
    const diasLimite = parseInt(req.query.dias) || 30;
    const resultado = await businessClientes.listarInativos(diasLimite);
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter inativos:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/clientes/relatorio - Retorna relatório de clientes
 */
async function obterRelatorioClientes(req, res) {
  try {
    const resultado = await businessClientes.gerarRelatorioClientes();
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter relatório de clientes:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/entregas-pendentes - Retorna entregas pendentes
 */
async function obterEntregasPendentes(req, res) {
  try {
    const resultado = await businessPedidos.listarEntregasPendentes();
    res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter entregas pendentes:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/backup/latest - Retorna informações do último backup (ADMIN only)
 */
function obterBackupLatest(req, res) {
  try {
    const whatsappNumber = req.query.whatsapp || req.headers['x-whatsapp'] || 'unknown';

    if (!temPermissao(whatsappNumber, 'VER_BACKUP')) {
      logger.warn(`[${whatsappNumber}] Acesso negado a GET /api/backup/latest`);
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para acessar backups.'
      });
    }

    const ultimoBackup = backupService.obterUltimoBackup();

    if (!ultimoBackup) {
      return res.json({
        success: false,
        message: 'Nenhum backup encontrado',
        backup: null
      });
    }

    res.json({
      success: true,
      backup: {
        filename: ultimoBackup.filename,
        size: ultimoBackup.size,
        sizeFormatted: formatarTamanhoArquivo(ultimoBackup.size),
        mtime: ultimoBackup.mtime,
        mtimeFormatted: ultimoBackup.mtime.toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro ao obter último backup:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/backup/listar - Retorna lista de todos os backups (ADMIN only)
 */
function listarBackups(req, res) {
  try {
    const whatsappNumber = req.query.whatsapp || req.headers['x-whatsapp'] || 'unknown';

    if (!temPermissao(whatsappNumber, 'VER_BACKUP')) {
      logger.warn(`[${whatsappNumber}] Acesso negado a GET /api/backup/listar`);
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para acessar backups.'
      });
    }

    const backups = backupService.listarBackups().map(b => ({
      filename: b.filename,
      size: b.size,
      sizeFormatted: formatarTamanhoArquivo(b.size),
      mtime: b.mtime,
      mtimeFormatted: b.mtime.toISOString()
    }));

    res.json({
      success: true,
      count: backups.length,
      backups
    });
  } catch (error) {
    logger.error('Erro ao listar backups:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/logs - Retorna logs recentes (ADMIN only)
 */
function obterLogs(req, res) {
  try {
    const whatsappNumber = req.query.whatsapp || req.headers['x-whatsapp'] || 'unknown';

    if (!temPermissao(whatsappNumber, 'VER_LOGS')) {
      logger.warn(`[${whatsappNumber}] Acesso negado a GET /api/logs`);
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para acessar logs.'
      });
    }

    const limit = parseInt(req.query.limit) || 100;
    const filtroUsuario = req.query.usuario || null;
    const filtroNivel = req.query.nivel || null;

    // Obter logs do arquivo combined-YYYY-MM-DD.log de hoje
    const hoje = new Date().toISOString().split('T')[0];
    const logPath = path.join(projectRoot, `logs/combined-${hoje}.log`);

    let linhas = [];

    if (fs.existsSync(logPath)) {
      const conteudo = fs.readFileSync(logPath, 'utf-8');
      linhas = conteudo.split('\n').filter(l => l.trim());
    }

    // Filtrar por usuário se solicitado
    if (filtroUsuario) {
      linhas = linhas.filter(l => l.includes(`[${filtroUsuario}]`));
    }

    // Filtrar por nível se solicitado
    if (filtroNivel) {
      linhas = linhas.filter(l => l.toUpperCase().includes(filtroNivel.toUpperCase()));
    }

    // Retornar últimas N linhas
    const linhasRetorno = linhas.slice(-limit);

    res.json({
      success: true,
      arquivo: logPath,
      filtros: {
        usuario: filtroUsuario,
        nivel: filtroNivel,
        limit
      },
      linhas: linhasRetorno.length,
      logs: linhasRetorno
    });
  } catch (error) {
    logger.error('Erro ao obter logs:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Formata tamanho de arquivo em bytes para formato legível
 */
function formatarTamanhoArquivo(bytes) {
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let tamanho = bytes;
  let unidadeIdx = 0;

  while (tamanho >= 1024 && unidadeIdx < unidades.length - 1) {
    tamanho /= 1024;
    unidadeIdx++;
  }

  return `${tamanho.toFixed(2)} ${unidades[unidadeIdx]}`;
}

export {
  obterEstoque,
  obterEstoqueBaixo,
  obterPorModelo,
  obterRelatorioEstoque,
  obterPerfilCliente,
  obterVIPs,
  obterInativos,
  obterRelatorioClientes,
  obterEntregasPendentes,
  obterBackupLatest,
  listarBackups,
  obterLogs
};
