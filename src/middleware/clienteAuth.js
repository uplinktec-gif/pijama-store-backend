import { validarTokenSessao, extrairTokenDoHeader } from '../utils/sessionTokens.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware para validar token de sessão do cliente
 * Extrai o token do header Authorization: Bearer <token>
 * Valida e adiciona dados do cliente ao req.cliente
 */
export const clienteAuth = (req, res, next) => {
  try {
    // Extrair header Authorization
    const authHeader = req.headers.authorization;
    const token = extrairTokenDoHeader(authHeader);

    if (!token) {
      logger.warn('[clienteAuth] Token não fornecido no header Authorization');
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token não fornecido. Use header: Authorization: Bearer <token>'
      });
    }

    // Validar token
    const decoded = validarTokenSessao(token);

    // Adicionar dados do cliente ao request
    req.cliente = {
      id_cliente: decoded.id_cliente,
      nome_cliente: decoded.nome_cliente
    };

    logger.debug(`[clienteAuth] ✓ Token válido para cliente ${decoded.id_cliente}`);
    next();
  } catch (err) {
    logger.warn('[clienteAuth] Erro ao validar token:', err.message);
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido ou expirado'
    });
  }
};

export default clienteAuth;
