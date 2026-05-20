import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'pluma-pijamas-secret-2025';

/**
 * Middleware que valida o JWT do painel admin
 */
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminUser = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/**
 * Gera um token JWT para o usuário autenticado
 */
function gerarToken(usuario) {
  return jwt.sign(
    { nome: usuario.nome, role: usuario.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export { adminAuth, gerarToken };
