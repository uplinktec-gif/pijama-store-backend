import { env } from './env.js';

const ROLES = {
  ADMIN: 'ADMIN',
  OPERADOR: 'OPERADOR',
  CLIENTE: 'CLIENTE'
};

const PERMISSOES = {
  ANALYTICS_VENDAS: ['ADMIN', 'OPERADOR'],
  ANALYTICS_ESTOQUE: ['ADMIN', 'OPERADOR'],
  ANALYTICS_RECOMENDACAO: ['ADMIN'],
  CRIAR_PEDIDO: ['ADMIN', 'OPERADOR', 'CLIENTE'],
  VER_BACKUP: ['ADMIN'],
  VER_LOGS: ['ADMIN']
};

// Normalizar números para o formato que a Evolution usa (sem o 9 extra)
// Evolution remove o 9 extra de celulares BR: 55 + DDD + 9XXXXXXXX → 55 + DDD + XXXXXXXX
function normalizarNumero(numero) {
  if (!numero) return '';
  const num = numero.toString().trim().replace(/^\+/, '');
  const n = num.startsWith('55') ? num : '55' + num;
  // Se tem 13 dígitos (55+DDD+9+8dig), retorna versão sem o 9 extra (12 dígitos)
  // Porque a Evolution entrega os números no formato curto
  if (n.length === 13) {
    return '55' + n.substring(2, 4) + n.substring(5); // remove o 9 do celular
  }
  return n;
}

const NUMERO_FELIPE = normalizarNumero(process.env.NUMERO_FELIPE || '5595988123456');
const NUMERO_JULLY = normalizarNumero(process.env.NUMERO_JULLY || '5595987654321');
const NUMERO_PLUMA = normalizarNumero(process.env.NUMERO_PLUMA || '5595991228494');

const USUARIOS_CONHECIDOS = {
  // Felipe (ADMIN)
  [NUMERO_FELIPE]: {
    nome: 'Felipe',
    role: ROLES.ADMIN,
    descricao: 'Dono - Acesso total'
  },
  // Júlly (ADMIN — sócia, governança total)
  [NUMERO_JULLY]: {
    nome: 'Júlly',
    role: ROLES.ADMIN,
    descricao: 'Sócia - Acesso total (pedidos, estoque, análises, backup)'
  },
  // Pluma (OPERADOR)
  [NUMERO_PLUMA]: {
    nome: 'Pluma',
    role: ROLES.OPERADOR,
    descricao: 'Operadora - Acesso a análises e estoque'
  }
};

/**
 * Obtém o papel do usuário
 * Se não for um usuário conhecido, assume CLIENTE
 */
function obterRoleUsuario(whatsappNumber) {
  // Normaliza a entrada para casar com as chaves (robusto a 11/12/13 dígitos,
  // independente do formato que a Evolution entregar no webhook)
  const n = normalizarNumero(whatsappNumber);
  if (USUARIOS_CONHECIDOS[n]) {
    return USUARIOS_CONHECIDOS[n].role;
  }
  return ROLES.CLIENTE; // Padrão para desconhecidos
}

/**
 * Verifica se o usuário tem permissão para uma ação
 */
function temPermissao(whatsappNumber, acao) {
  const role = obterRoleUsuario(whatsappNumber);
  const rolesPermitidos = PERMISSOES[acao];

  if (!rolesPermitidos) {
    // Ação desconhecida - negar por segurança
    return false;
  }

  return rolesPermitidos.includes(role);
}

/**
 * Obtém informações do usuário
 */
function obterInfoUsuario(whatsappNumber) {
  const n = normalizarNumero(whatsappNumber);
  if (USUARIOS_CONHECIDOS[n]) {
    return USUARIOS_CONHECIDOS[n];
  }
  return {
    nome: 'Cliente',
    role: ROLES.CLIENTE,
    descricao: 'Cliente'
  };
}

/**
 * Valida se é um número autorizado (whitelist)
 */
function ehNumeroAutorizado(whatsappNumber) {
  return env.authorizedNumbers.length === 0 ||
    env.authorizedNumbers.includes(whatsappNumber);
}

/**
 * Lista os usuários conhecidos (admins/operadores) com número normalizado, nome e role.
 * Usado pelo Centro de Preferências de Notificação.
 */
function listarUsuariosConhecidos() {
  return Object.entries(USUARIOS_CONHECIDOS).map(([whatsapp, info]) => ({
    whatsapp, nome: info.nome, role: info.role
  }));
}

export {
  ROLES,
  PERMISSOES,
  USUARIOS_CONHECIDOS,
  obterRoleUsuario,
  temPermissao,
  obterInfoUsuario,
  ehNumeroAutorizado,
  listarUsuariosConhecidos
};
