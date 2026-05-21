import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

/**
 * Middleware para validar token JWT do cliente (loja + portal)
 * Aceita tokens gerados pelo auth.controller.js (JWT_SECRET)
 */
export const clienteAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ sucesso: false, mensagem: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ sucesso: false, mensagem: 'Token inválido' });
    }

    // Validar com JWT_SECRET (mesmo usado em auth.controller.js)
    const secret = process.env.JWT_SECRET || 'pluma-jwt-secret-2025';
    const decoded = jwt.verify(token, secret);

    req.cliente = {
      id_cliente: decoded.id_cliente,
      nome_cliente: decoded.nome_cliente || decoded.nome,
      whatsapp: decoded.whatsapp,
      email: decoded.email
    };

    logger.debug(`[clienteAuth] ✓ Token válido para ${decoded.id_cliente}`);
    next();
  } catch (err) {
    logger.warn('[clienteAuth] Token inválido:', err.message);
    return res.status(401).json({ sucesso: false, mensagem: 'Token inválido ou expirado' });
  }
};

export default clienteAuth;
