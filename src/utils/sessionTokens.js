import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

let SESSION_SECRET = null;

function inicializarSecretSessao(secret) {
  SESSION_SECRET = secret;
  logger.info('✓ Secret de sessão cliente inicializado');
}

function gerarTokenSessao(idCliente, nomeCliente) {
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET não inicializado. Configure CLIENTE_SESSION_SECRET no .env');
  }

  try {
    const token = jwt.sign(
      {
        id_cliente: idCliente,
        nome_cliente: nomeCliente,
        tipo: 'cliente_session',
        iat: Math.floor(Date.now() / 1000)
      },
      SESSION_SECRET,
      {
        // SEM expiração — token dura enquanto sessionStorage existir
        // Quando navegador fecha, sessionStorage é limpo automaticamente
        algorithm: 'HS256'
      }
    );

    logger.debug(`[sessionTokens] Token gerado para cliente ${idCliente}`);
    return token;
  } catch (err) {
    logger.error('[sessionTokens] Erro ao gerar token:', err.message);
    throw err;
  }
}

function validarTokenSessao(token) {
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET não inicializado');
  }

  try {
    const decoded = jwt.verify(token, SESSION_SECRET, {
      algorithms: ['HS256']
    });

    // Verificar se é um token de cliente (não admin)
    if (decoded.tipo !== 'cliente_session') {
      throw new Error('Token inválido (tipo incorreto)');
    }

    return decoded;
  } catch (err) {
    logger.debug('[sessionTokens] Token inválido:', err.message);
    throw new Error('Token expirado ou inválido');
  }
}

function extrairTokenDoHeader(authHeader) {
  if (!authHeader) return null;

  // Formato esperado: "Bearer token_aqui"
  const partes = authHeader.split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return null;
  }

  return partes[1];
}

export {
  inicializarSecretSessao,
  gerarTokenSessao,
  validarTokenSessao,
  extrairTokenDoHeader
};
