// ============================================================================
// configSistema.js — Feature flags GLOBAIS de disparos automáticos do bot.
// Default OFF: o sistema só dispara alertas que o dono ligar no painel.
// ============================================================================
import { query, queryOne, run } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

// Flags reconhecidas (chave → descrição). Fonte única da verdade.
export const FLAGS = {
  alerta_estoque_critico: 'Alerta de Estoque Crítico (pós-venda)',
  aviso_sem_estoque: 'Aviso de "Sem Estoque" (pós-venda)',
  relatorio_reposicao: 'Relatório de Sugestão de Reposição (giro/ABC)'
};

/** Semeia as flags ausentes com valor 0 (OFF). Não sobrescreve valores já definidos. */
export function garantirSeed() {
  try {
    for (const [chave, descricao] of Object.entries(FLAGS)) {
      run('INSERT OR IGNORE INTO config_sistema (chave, valor, descricao) VALUES (?, 0, ?)', [chave, descricao]);
    }
  } catch (e) {
    logger.warn('[configSistema] Falha ao semear flags:', e.message);
  }
}

/**
 * Retorna se uma flag está LIGADA. Default = false (OFF) se a flag não existir
 * — garante que nada dispara por omissão.
 */
export function flagLigada(chave) {
  try {
    const row = queryOne('SELECT valor FROM config_sistema WHERE chave = ?', [chave]);
    return row ? Number(row.valor) === 1 : false;
  } catch (e) {
    logger.warn(`[configSistema] Erro ao ler flag ${chave}:`, e.message);
    return false; // fail-safe: silêncio em caso de erro
  }
}

/** Define o valor de uma flag (true/false). Retorna {success}. */
export function definirFlag(chave, ligado) {
  if (!(chave in FLAGS)) return { success: false, error: 'Flag desconhecida' };
  try {
    run(
      `INSERT INTO config_sistema (chave, valor, descricao, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP`,
      [chave, ligado ? 1 : 0, FLAGS[chave]]
    );
    logger.info(`[configSistema] ${chave} = ${ligado ? 'ON' : 'OFF'}`);
    return { success: true };
  } catch (e) {
    logger.error(`[configSistema] Erro ao definir ${chave}:`, e.message);
    return { success: false, error: e.message };
  }
}

/** Lista todas as flags com seu estado atual (para o painel). */
export function listarFlags() {
  garantirSeed();
  const rows = query('SELECT chave, valor, descricao FROM config_sistema');
  const mapa = Object.fromEntries(rows.map(r => [r.chave, Number(r.valor) === 1]));
  // Garante que toda flag conhecida aparece (mesmo que o seed tenha falhado)
  return Object.entries(FLAGS).map(([chave, descricao]) => ({
    chave, descricao, ligado: mapa[chave] ?? false
  }));
}
