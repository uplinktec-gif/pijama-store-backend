// ============================================================================
// retiradaInterna.js — Rota administrativa (Bypass de Faturamento)
// "retirada 1 anne p bordô para jully" → deduz do estoque SEM criar pedido,
// SEM cobrar preço de varejo, SEM pedir endereço. Consumo interno dos sócios.
//
// Registra o Delta no log_estoque com motivo "Retirada Interna/Sócio" (custo
// R$ 0,00 — não infla faturamento). Só ADMIN (sócios) podem executar.
// ============================================================================
import { env } from '../../../config/env.js';
import { obterInfoUsuario, ROLES } from '../../../config/users.js';
import * as sheetsEstoque from '../../sqlite/estoque.js';
import { logger } from '../../../utils/logger.js';

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Parse do comando de retirada. Aceita "retirada/retirado/retirar [qtd] modelo
 * tamanho cor [para NOME]". Retorna {qtd, modelo, tamanho, cor, paraQuem} ou null.
 */
export function parseRetirada(msg) {
  const m = (msg || '').trim();
  const gatilho = /^(?:retirad[ao]|retirar)\s+/i;
  if (!gatilho.test(m)) return null;
  let rest = m.replace(gatilho, '');

  // "para NOME" / "pra NOME" no fim → quem retirou
  let paraQuem = null;
  const para = rest.match(/\s+(?:para|pra|pro|p\/)\s+(.+)$/i);
  if (para) { paraQuem = para[1].trim(); rest = rest.slice(0, para.index).trim(); }

  // quantidade no início (default 1)
  let qtd = 1;
  const q = rest.match(/^(\d+)\s+/);
  if (q) { qtd = parseInt(q[1]); rest = rest.replace(/^\d+\s+/, ''); }

  const restNorm = norm(rest);

  // modelo (mais longo primeiro p/ evitar match parcial)
  let modelo = null;
  for (const mo of [...env.catalogoModelos].sort((a, b) => b.length - a.length)) {
    if (restNorm.includes(norm(mo))) { modelo = mo; break; }
  }
  // cor (mais longa primeiro: "Azul Jeans" antes de "Azul")
  let cor = null;
  for (const c of [...env.catalogoCores].sort((a, b) => b.length - a.length)) {
    if (restNorm.includes(norm(c))) { cor = c; break; }
  }
  // tamanho (palavra isolada)
  let tamanho = null;
  for (const tm of env.catalogoTamanhos) {
    if (new RegExp(`(^|\\s)${tm}(\\s|$)`, 'i').test(rest)) { tamanho = tm; break; }
  }

  return { qtd, modelo, tamanho, cor, paraQuem };
}

/**
 * Executa a retirada interna (bypass). Direto, sem fricção de Sim/Não —
 * mas com mensagem de resultado clara para o sócio conferir na hora.
 * @returns {Promise<{resposta:string}>}
 */
export async function processarRetiradaInterna(msg, clienteWhatsApp) {
  // Permissão: SÓ sócios (ADMIN). Operador/cliente não fazem bypass silencioso.
  const info = obterInfoUsuario(clienteWhatsApp);
  if (info.role !== ROLES.ADMIN) {
    return { resposta: '🔒 Retirada interna é uma função exclusiva dos sócios (admin).' };
  }

  const p = parseRetirada(msg);
  if (!p || !p.modelo || !p.tamanho || !p.cor) {
    return {
      resposta: '🤔 Não entendi o item da retirada. Use:\n*"retirada 1 Anne P Bordô para Jully"*\n(quantidade, modelo, tamanho, cor + para quem)'
    };
  }

  const item = await sheetsEstoque.findByModeloTamanhoCor(p.modelo, p.tamanho, p.cor);
  if (!item) {
    return { resposta: `❌ Não encontrei *${p.modelo} ${p.tamanho} ${p.cor}* no estoque. Confere o nome?` };
  }
  if (item.quantidade_disponivel < p.qtd) {
    return { resposta: `⚠️ Só há *${item.quantidade_disponivel}* disponível de ${item.modelo} ${item.tamanho} ${item.cor} (retirada pedida: ${p.qtd}).` };
  }

  // Bypass: deduz via ajustarInventario (override absoluto), tag "Retirada Interna/Sócio"
  const novoTotal = item.quantidade_total - p.qtd;
  const quem = p.paraQuem || info.nome;
  const obs = `Retirada interna - ${quem} (sem faturamento, custo R$ 0,00)`;
  const r = await sheetsEstoque.ajustarInventario(
    item.sku, novoTotal, info.nome, obs, 'Retirada Interna/Sócio'
  );
  if (!r.success) {
    return { resposta: `❌ Não consegui registrar a retirada: ${r.error}` };
  }

  logger.info(`[retiradaInterna] ${item.sku} -${p.qtd} | ${quem} | log #${r.log_id} | SEM pedido/faturamento`);
  return {
    resposta: `✅ *Retirada interna registrada* (sem cobrança)\n` +
      `• Item: *${p.qtd}x ${item.modelo} ${item.tamanho} ${item.cor}*\n` +
      `• Para: ${quem}\n` +
      `• Novo saldo: ${novoTotal}\n` +
      `_Sem pedido gerado · custo R$ 0,00 · registrado no log de inventário._`
  };
}
