import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

/**
 * Middleware para validar JWT token
 */
export function validarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ sucesso: false, mensagem: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1]; // Bearer TOKEN
  if (!token) {
    return res.status(401).json({ sucesso: false, mensagem: 'Token inválido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pluma-jwt-secret-2025');
    req.clienteId = decoded.id_cliente;
    req.clienteInfo = decoded;
    next();
  } catch (error) {
    logger.error('Erro ao validar token:', error.message);
    return res.status(401).json({ sucesso: false, mensagem: 'Token expirado ou inválido' });
  }
}

/**
 * Middleware para validar CPF (11 dígitos)
 */
export function validarCPF(cpf) {
  // Remove caracteres não numéricos
  const cpfNumeros = cpf.replace(/\D/g, '');
  
  // Valida tamanho
  if (cpfNumeros.length !== 11) {
    return false;
  }

  // Valida se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpfNumeros)) {
    return false;
  }

  // Algoritmo de validação CPF (verificação de dígitos)
  let soma = 0;
  let resto;

  // Primeira validação
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpfNumeros.substring(i - 1, i)) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpfNumeros.substring(9, 10))) {
    return false;
  }

  // Segunda validação
  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpfNumeros.substring(i - 1, i)) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpfNumeros.substring(10, 11))) {
    return false;
  }

  return true;
}

/**
 * Formata CPF para +55 formato (remove tudo exceto números)
 */
export function normalizarCelular(celular) {
  let numeros = celular.replace(/\D/g, '');

  // Remover prefixo +55 ou 55 se presente (guardar só DDD + número)
  if (numeros.startsWith('55') && numeros.length > 11) {
    numeros = numeros.slice(2);
  }

  // Remover 0 inicial
  if (numeros.startsWith('0')) {
    numeros = numeros.slice(1);
  }

  return numeros; // Formato: DDD + número (ex: 95987654321)
}
