import { logger } from '../utils/logger.js';

/**
 * Middleware de IP whitelist para proteger o painel admin.
 * Sem autenticação pesada — basta estar na lista de IPs permitidos.
 */
export function ipWhitelist(req, res, next) {
  const rawIp = req.ip || req.connection?.remoteAddress || '';
  // Remover prefixo ::ffff: (IPv4 mapeado em IPv6)
  const ip = rawIp.replace('::ffff:', '');

  const allowedStr = process.env.ADMIN_ALLOWED_IPS || '127.0.0.1,::1,::ffff:127.0.0.1';
  const allowed = allowedStr.split(',').map(s => s.trim()).filter(Boolean);

  const isAllowed = allowed.some(a => ip === a || ip.includes(a) || a.includes(ip));

  if (!isAllowed) {
    logger.warn(`[admin] IP bloqueado: ${ip}`);
    return res.status(403).json({ error: 'Acesso não autorizado', ip });
  }

  // Token opcional como segunda camada
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const tokenHeader = req.headers['x-admin-token'];
    if (tokenHeader !== adminToken) {
      logger.warn(`[admin] Token inválido de IP: ${ip}`);
      return res.status(403).json({ error: 'Token de admin inválido' });
    }
  }

  next();
}
