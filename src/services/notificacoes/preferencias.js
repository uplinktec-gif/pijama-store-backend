/**
 * src/services/notificacoes/preferencias.js
 *
 * Centro de Preferências de Notificação — combate à fadiga de alertas.
 * Cada admin tem toggles booleanos por categoria. O envio de push só ocorre
 * se a preferência da categoria estiver ligada para aquele número.
 *
 * Categorias: vendas | logistica | estoque | financeiro
 */
import { query, queryOne, run } from '../../config/database.js';
import { listarUsuariosConhecidos, obterInfoUsuario } from '../../config/users.js';
import { enviarMensagem } from '../whatsapp/sender.js';
import { logger } from '../../utils/logger.js';

export const CATEGORIAS = ['vendas', 'logistica', 'estoque', 'financeiro'];

const CATEGORIA_LABELS = {
  vendas: 'Novas Vendas/Pedidos',
  logistica: 'Logística/Baixas',
  estoque: 'Estoque/Reposição',
  financeiro: 'Financeiro/Cobrança'
};

// normaliza igual ao users.js (robusto a 11/12/13 dígitos)
function normalizarNumero(numero) {
  if (!numero) return '';
  const num = numero.toString().trim().replace(/^\+/, '');
  const n = num.startsWith('55') ? num : '55' + num;
  if (n.length === 13) return '55' + n.substring(2, 4) + n.substring(5);
  return n;
}

/**
 * Garante que cada usuário conhecido tenha uma linha de preferências (default tudo ON).
 */
export function garantirSeed() {
  try {
    for (const u of listarUsuariosConhecidos()) {
      run(
        `INSERT OR IGNORE INTO preferencias_notificacao (whatsapp, nome, vendas, logistica, estoque, financeiro)
         VALUES (?, ?, 1, 1, 1, 1)`,
        [u.whatsapp, u.nome]
      );
    }
  } catch (e) {
    logger.warn('[preferencias] seed:', e.message);
  }
}

/**
 * Retorna as preferências de todos os usuários conhecidos (com labels p/ a UI).
 */
export function listarPreferencias() {
  garantirSeed();
  const usuarios = listarUsuariosConhecidos();
  const linhas = usuarios.map(u => {
    const p = queryOne('SELECT vendas, logistica, estoque, financeiro FROM preferencias_notificacao WHERE whatsapp = ?', [u.whatsapp])
      || { vendas: 1, logistica: 1, estoque: 1, financeiro: 1 };
    return {
      whatsapp: u.whatsapp, nome: u.nome, role: u.role,
      vendas: !!p.vendas, logistica: !!p.logistica, estoque: !!p.estoque, financeiro: !!p.financeiro
    };
  });
  return { usuarios: linhas, categorias: CATEGORIAS, labels: CATEGORIA_LABELS };
}

/**
 * Atualiza as preferências de um usuário. Aceita subset de categorias.
 */
export function atualizarPreferencias(whatsapp, prefs) {
  const wa = normalizarNumero(whatsapp);
  const info = obterInfoUsuario(wa);
  garantirSeed();
  const campos = [];
  const params = [];
  for (const cat of CATEGORIAS) {
    if (prefs[cat] !== undefined) {
      campos.push(`${cat} = ?`);
      params.push(prefs[cat] ? 1 : 0);
    }
  }
  if (!campos.length) return { success: false, error: 'Nenhuma categoria informada' };
  params.push(wa);
  run(`UPDATE preferencias_notificacao SET ${campos.join(', ')}, updated_at = datetime('now') WHERE whatsapp = ?`, params);
  // se não existia (usuário não-seedado), cria
  const exists = queryOne('SELECT 1 AS x FROM preferencias_notificacao WHERE whatsapp = ?', [wa]);
  if (!exists) {
    run(`INSERT INTO preferencias_notificacao (whatsapp, nome, vendas, logistica, estoque, financeiro) VALUES (?, ?, ?, ?, ?, ?)`,
      [wa, info.nome, prefs.vendas ? 1 : 1, prefs.logistica ? 1 : 1, prefs.estoque ? 1 : 1, prefs.financeiro ? 1 : 1]);
  }
  logger.info(`[preferencias] ${info.nome} (${wa}) atualizou notificações`);
  return { success: true, whatsapp: wa };
}

/**
 * Verifica se um número quer receber alertas de uma categoria.
 * Default: true (se não houver linha, recebe tudo).
 */
export function podeNotificar(whatsapp, categoria) {
  if (!CATEGORIAS.includes(categoria)) return true;
  const wa = normalizarNumero(whatsapp);
  const p = queryOne(`SELECT ${categoria} AS v FROM preferencias_notificacao WHERE whatsapp = ?`, [wa]);
  if (!p) return true; // sem registro → recebe por padrão
  return !!p.v;
}

/**
 * Envia uma mensagem a TODOS os admins/operadores que aceitam a categoria.
 * Respeita as preferências individuais.
 * @param {string} categoria  vendas|logistica|estoque|financeiro
 * @param {string} mensagem
 * @param {string[]} [somente]  lista de números p/ restringir (ex: só Felipe)
 */
export async function notificarAdmins(categoria, mensagem, somente = null) {
  garantirSeed();
  const alvos = listarUsuariosConhecidos()
    .map(u => u.whatsapp)
    .filter(wa => !somente || somente.map(normalizarNumero).includes(wa))
    .filter(wa => podeNotificar(wa, categoria));

  let enviados = 0;
  for (const wa of alvos) {
    try {
      await enviarMensagem(wa, mensagem);
      enviados++;
    } catch (e) {
      logger.warn(`[preferencias] falha ao notificar ${wa}:`, e.message);
    }
  }
  logger.info(`[notificarAdmins] categoria=${categoria} → ${enviados} destinatário(s)`);
  return enviados;
}
