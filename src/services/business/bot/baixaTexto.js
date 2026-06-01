// ============================================================================
// baixaTexto.js — Baixa de estoque por texto informal no WhatsApp
// Fluxo com fricção intencional:
//   1) Parse do comando ("baixa 1 zara m preto [por defeito]")
//   2) Motivo OBRIGATÓRIO — se ausente, exige escolha (nunca assume padrão)
//   3) Confirmação final (Sim/Não) antes de efetivar a transação ACID + log
// ============================================================================
import { env } from '../../../config/env.js';
import { temPermissao } from '../../../config/users.js';
import * as sheetsEstoque from '../../sqlite/estoque.js';
import { logger } from '../../../utils/logger.js';

// Categorias oficiais (espelha MOTIVOS_BAIXA do backend, fonte da verdade)
const CATEGORIAS = [
  'Defeito de Fábrica / Avaria',
  'Ação de Marketing / Permuta',
  'Uso Pessoal / Presente',
  'Troca de Cliente',
  'Ajuste de Inventário (Perda/Roubo)'
];

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Mapeia texto livre de motivo → categoria oficial. Retorna null se não reconhecer.
 */
function mapearMotivo(texto) {
  const t = norm(texto);
  if (!t) return null;
  if (/(defeit|avaria|rasg|furad|estrag|manchad|com\s+defeito)/.test(t)) return 'Defeito de Fábrica / Avaria';
  if (/(permut|marketing|divulg|blogueir|influenc|public|sorteio|press kit|presskit)/.test(t)) return 'Ação de Marketing / Permuta';
  if (/(presente|uso\s+pessoal|pessoal|fiquei\s+com|pra\s+mim|para\s+mim|usar\s+eu)/.test(t)) return 'Uso Pessoal / Presente';
  if (/(troca)/.test(t)) return 'Troca de Cliente';
  if (/(ajuste|perda|perdi|roubo|roubad|sumiu|sumir|invent[a]rio|extravi)/.test(t)) return 'Ajuste de Inventário (Perda/Roubo)';
  return null;
}

/**
 * Interpreta a escolha do motivo: aceita número (1-5) ou palavra-chave.
 */
function interpretarEscolhaMotivo(msg) {
  const t = norm(msg);
  const n = parseInt(t, 10);
  if (Number.isInteger(n) && n >= 1 && n <= CATEGORIAS.length) return CATEGORIAS[n - 1];
  return mapearMotivo(msg);
}

/**
 * Parse do comando de baixa. Retorna {qtd, modelo, tamanho, cor, motivoTexto} ou null.
 */
export function parseComandoBaixa(msg) {
  const m = (msg || '').trim();
  const gatilho = /^(?:dar?\s+baixa(?:\s+em)?|baixa(?:r)?|tira(?:r)?|saiu|sa[ií]da\s+de)\s+/i;
  if (!gatilho.test(m)) return null;
  let rest = m.replace(gatilho, '');

  // motivo após "por" ou "motivo:"
  let motivoTexto = null;
  const mot = rest.match(/\b(?:por|motivo:?)\s+(.+)$/i);
  if (mot) { motivoTexto = mot[1].trim(); rest = rest.slice(0, mot.index).trim(); }

  // quantidade no início (default 1)
  let qtd = 1;
  const q = rest.match(/^(\d+)\s+/);
  if (q) { qtd = parseInt(q[1]); rest = rest.replace(/^\d+\s+/, ''); }

  const restNorm = norm(rest);

  // modelo (mais longo primeiro, p/ evitar match parcial)
  let modelo = null;
  for (const mo of [...env.catalogoModelos].sort((a, b) => b.length - a.length)) {
    if (restNorm.includes(norm(mo))) { modelo = mo; break; }
  }
  // cor (mais longa primeiro: "Azul Jeans" antes de "Azul")
  let cor = null;
  for (const c of [...env.catalogoCores].sort((a, b) => b.length - a.length)) {
    if (restNorm.includes(norm(c))) { cor = c; break; }
  }
  // tamanho (palavra isolada P/M/G/GG)
  let tamanho = null;
  for (const tm of env.catalogoTamanhos) {
    if (new RegExp(`(^|\\s)${tm}(\\s|$)`, 'i').test(rest)) { tamanho = tm; break; }
  }

  return { qtd, modelo, tamanho, cor, motivoTexto };
}

/** Lista numerada de categorias para o WhatsApp. */
function listaCategorias() {
  return CATEGORIAS.map((c, i) => `${i + 1}. ${c}`).join('\n');
}

/** Monta o resumo de confirmação. */
function resumoConfirmacao(p) {
  return `📉 *Confirmar baixa de estoque:*\n\n` +
    `• Item: *${p.qtd}x ${p.modelo} ${p.tamanho} ${p.cor}*\n` +
    `• SKU: ${p.sku}\n` +
    `• Motivo: *${p.motivo}*\n` +
    `• Disponível atual: ${p.disponivel}\n\n` +
    `Confirma? Responda *Sim* ou *Não*.`;
}

/**
 * Inicia o fluxo de baixa a partir do comando do usuário.
 * @returns {Promise<{resposta:string, contexto:object}>}
 */
export async function iniciarBaixa(msg, clienteWhatsApp, contexto) {
  // Permissão: baixa é operação sensível (admin/operador)
  if (!temPermissao(clienteWhatsApp, 'ANALYTICS_ESTOQUE')) {
    return { resposta: '❌ Você não tem permissão para dar baixa em estoque.', contexto: null };
  }

  const parsed = parseComandoBaixa(msg);
  if (!parsed || !parsed.modelo || !parsed.tamanho || !parsed.cor) {
    return {
      resposta: '🤔 Não entendi o item. Use o formato:\n*"baixa 1 Zara M Preto por defeito"*\n(quantidade, modelo, tamanho, cor + motivo)',
      contexto: null
    };
  }

  // Resolve o SKU real e o disponível
  const item = await sheetsEstoque.findByModeloTamanhoCor(parsed.modelo, parsed.tamanho, parsed.cor);
  if (!item) {
    return { resposta: `❌ Não encontrei *${parsed.modelo} ${parsed.tamanho} ${parsed.cor}* no estoque. Confere o nome?`, contexto: null };
  }
  if (item.quantidade_disponivel < parsed.qtd) {
    return { resposta: `⚠️ Só tem *${item.quantidade_disponivel}* disponível de ${item.modelo} ${item.tamanho} ${item.cor} (você pediu ${parsed.qtd}).`, contexto: null };
  }

  const base = {
    sku: item.sku, modelo: item.modelo, tamanho: item.tamanho, cor: item.cor,
    qtd: parsed.qtd, disponivel: item.quantidade_disponivel
  };

  // Motivo: tenta mapear o que veio no texto
  const motivo = parsed.motivoTexto ? mapearMotivo(parsed.motivoTexto) : null;

  if (!motivo) {
    // FRICÇÃO INTENCIONAL: sem motivo claro → exige classificação (nunca assume)
    const pend = { ...base, fase: 'motivo' };
    return {
      resposta: `📋 Qual o *motivo* da baixa de *${base.qtd}x ${base.modelo} ${base.tamanho} ${base.cor}*?\n\n${listaCategorias()}\n\n_Responda o número ou o nome._`,
      contexto: { ...contexto, baixa_pendente: pend }
    };
  }

  // Motivo reconhecido → vai direto pra confirmação
  const pend = { ...base, motivo, fase: 'confirmar' };
  return { resposta: resumoConfirmacao(pend), contexto: { ...contexto, baixa_pendente: pend } };
}

/**
 * Continua o fluxo quando há baixa pendente no contexto (escolha de motivo ou Sim/Não).
 * @returns {Promise<{resposta:string, contexto:object, executou?:boolean}>}
 */
export async function continuarBaixa(msg, clienteWhatsApp, contexto) {
  const pend = contexto.baixa_pendente;
  const t = norm(msg);

  // Cancelamento explícito a qualquer momento
  if (/^(cancela|cancelar|para|deixa|esquece)/.test(t)) {
    return { resposta: '🚫 Baixa cancelada. Nada foi alterado.', contexto: { ...contexto, baixa_pendente: null } };
  }

  if (pend.fase === 'motivo') {
    const motivo = interpretarEscolhaMotivo(msg);
    if (!motivo) {
      return {
        resposta: `Não reconheci o motivo. Escolha um número ou nome:\n\n${listaCategorias()}`,
        contexto // mantém pendente na mesma fase
      };
    }
    const novo = { ...pend, motivo, fase: 'confirmar' };
    return { resposta: resumoConfirmacao(novo), contexto: { ...contexto, baixa_pendente: novo } };
  }

  if (pend.fase === 'confirmar') {
    const sim = /^(sim|s|confirmo|confirmar|isso|ok|pode|aham|claro|👍)/.test(t);
    const nao = /^(n[aã]o|n|nao)/.test(t);
    if (sim) {
      // EFETIVAÇÃO — transação ACID + log_estoque
      const r = await sheetsEstoque.baixarEstoque(pend.sku, pend.qtd, pend.motivo, 'Baixa por WhatsApp', clienteWhatsApp.slice(-4));
      if (!r.success) {
        return { resposta: `❌ Não consegui efetivar: ${r.error}`, contexto: { ...contexto, baixa_pendente: null } };
      }
      logger.info(`[baixaTexto] Baixa efetivada ${pend.sku} -${pend.qtd} | ${pend.motivo} | log #${r.log_id}`);
      return {
        resposta: `✅ Baixa registrada!\n*${pend.qtd}x ${pend.modelo} ${pend.tamanho} ${pend.cor}* — ${pend.motivo}\nNovo total: ${r.quantidade_total} · log #${r.log_id}`,
        contexto: { ...contexto, baixa_pendente: null },
        executou: true
      };
    }
    if (nao) {
      return { resposta: '🚫 Baixa cancelada. Nada foi alterado.', contexto: { ...contexto, baixa_pendente: null } };
    }
    return { resposta: 'Responda *Sim* para confirmar a baixa ou *Não* para cancelar.', contexto };
  }

  // fase desconhecida → limpa
  return { resposta: 'Fluxo de baixa reiniciado. Mande o comando de novo.', contexto: { ...contexto, baixa_pendente: null } };
}

export { CATEGORIAS };
