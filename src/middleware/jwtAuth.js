import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'pluma-jwt-secret-2025';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// Middleware para validar JWT
export function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    logger.warn(`[JWT] Token inválido ou expirado: ${err.message}`);
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

// Gerar novo token
export function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}
