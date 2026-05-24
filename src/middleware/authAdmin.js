import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

/**
 * Middleware de autenticação JWT para admin
 * Verifica se o token é válido e anexa os dados do usuário ao req
 */
export function autenticarAdmin(req, res, next) {
  try {
    // Buscar token no header Authorization ou no cookie
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.admin_token) {
      token = req.cookies.admin_token;
    }

    if (!token) {
      logger.warn(`[${req.ip}] Acesso negado a rota admin: sem token`);
      return res.status(401).json({
        success: false,
        error: 'Token não fornecido'
      });
    }

    // Verificar e decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu-secret-aqui');

    // Anexar dados do usuário ao request
    req.admin = decoded;
    req.adminToken = token;

    logger.debug(`✓ Admin autenticado: ${decoded.username}`);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn(`[${req.ip}] Token expirado`);
      return res.status(401).json({
        success: false,
        error: 'Token expirado. Faça login novamente.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn(`[${req.ip}] Token inválido`);
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }

    logger.error('Erro ao verificar token:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao validar autenticação'
    });
  }
}

/**
 * Middleware para registrar ações de admin (auditoria)
 */
export function registrarAuditoria(acao, tabela = null) {
  return (req, res, next) => {
    // Guardar dados originais da response
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      // Se foi sucesso, registrar na auditoria (implementar depois com db)
      if (data.success !== false && req.admin) {
        logger.info(`[AUDITORIA] ${req.admin.username} - ${acao}${tabela ? ` em ${tabela}` : ''}`);
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Gera um novo JWT token
 */
export function gerarToken(usuarioData) {
  const secret = process.env.JWT_SECRET || 'seu-secret-aqui';
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';

  const token = jwt.sign(
    {
      id: usuarioData.id,
      username: usuarioData.username,
      email: usuarioData.email
    },
    secret,
    { expiresIn }
  );

  return token;
}

/**
 * Verifica se o token está próximo de expirar (nos últimos 30 minutos)
 */
export function tokenProximoExpiracao(token) {
  try {
    const decoded = jwt.decode(token);
    const agora = Math.floor(Date.now() / 1000);
    const tempoRestante = decoded.exp - agora;

    return tempoRestante < 1800; // 30 minutos
  } catch {
    return false;
  }
}
