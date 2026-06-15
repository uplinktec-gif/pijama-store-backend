// ============================================================================
// troca.js — Fluxo de troca de mercadoria (logística reversa) no WhatsApp
// Coleta multi-turno: pedido → peça a devolver → peça nova → confirmação.
// Ao confirmar: estoque atômico (+1 antigo / -1 novo) + alerta ao admin.
// Espelha o padrão de baixaTexto.js (fase + Sim/Não + cancelamento a qualquer hora).
// ============================================================================
import { env } from '../../../config/env.js';
import { temPermissao } from '../../../config/users.js';
import * as sheetsEstoque from '../../sqlite/estoque.js';
import * as sheetsPedidos from '../../sqlite/pedidos.js';
import { notificarAdminTroca } from './notificacoes.js';
import { logger } from '../../../utils/logger.js';

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Extrai {qtd, modelo, tamanho, cor} de texto livre usando o catálogo central.
 * Campos não reconhecidos voltam null. Mesma heurística do parseComandoBaixa.
 */
function parseItem(texto) {
  const rest = (texto || '').trim();
  const restNorm = norm(rest);

  let qtd = 1;
  const q = rest.match(/^(\d+)\s+/);
  if (q) qtd = parseInt(q[1], 10) || 1;

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

  return { qtd, modelo, tamanho, cor };
}

const itemCompleto = it => Boolean(it && it.modelo && it.tamanho && it.cor);
const fmtItem = it => `${it.qtd || 1}x ${it.modelo} ${it.tamanho} ${it.cor}`;

/** Sugere alternativas (mesmo modelo, com saldo) quando a peça nova está sem estoque. */
async function sugerirAlternativas(modelo) {
  try {
    const todos = await sheetsEstoque.readAllEstoque();
    return todos
      .filter(i => norm(i.modelo) === norm(modelo) && i.quantidade_disponivel > 0)
      .map(i => `• ${i.tamanho} ${i.cor} (${i.quantidade_disponivel} disp.)`);
  } catch (e) {
    logger.warn('[troca] sugerirAlternativas:', e.message);
    return [];
  }
}

function resumoConfirmacao(pend) {
  return `🔄 *Confirmar troca — pedido #${pend.numeroPedido}:*\n\n` +
    `↩️ Devolve: *${fmtItem(pend.itemAntigo)}*\n` +
    `📦 Recebe:  *${fmtItem(pend.itemNovo)}*\n\n` +
    `Confirma? Responda *Sim* ou *Não*.`;
}

/**
 * Valida o pedido e avança para a coleta da peça a devolver.
 * @returns {Promise<{resposta:string, contexto:object}>}
 */
async function registrarPedidoTroca(numeroPedido, contexto, pend) {
  const pedido = await sheetsPedidos.findPorNumeroPedido(numeroPedido);
  if (!pedido) {
    return {
      resposta: `❌ Não encontrei o pedido *#${numeroPedido}*. Confere o número?`,
      contexto: { ...contexto, troca_pendente: { ...pend, fase: 'pedido' } }
    };
  }
  const itensTxt = (pedido.itens || [])
    .map(i => `• ${i.quantidade || 1}x ${i.modelo} ${i.tamanho} ${i.cor}`)
    .join('\n') || '(sem itens detalhados)';
  const novoPend = { ...pend, numeroPedido, fase: 'item_antigo' };
  return {
    resposta: `📋 Pedido *#${numeroPedido}* — ${pedido.cliente_nome || 'cliente'}:\n${itensTxt}\n\n` +
      `Qual peça você quer *devolver*? (ex: _Zara M preto_)`,
    contexto: { ...contexto, troca_pendente: novoPend }
  };
}

/**
 * Inicia o fluxo de troca. Tenta extrair o nº do pedido já na 1ª mensagem.
 * @returns {Promise<{resposta:string, contexto:object}>}
 */
export async function iniciarTroca(msg, clienteWhatsApp, contexto) {
  // Troca é operação de ADMIN/OPERADOR (mexe no estoque) — nunca do cliente.
  if (!temPermissao(clienteWhatsApp, 'ANALYTICS_ESTOQUE')) {
    return {
      resposta: '🔄 Para registrar uma troca, fale direto com nossa equipe da Pluma 😊🌙',
      contexto: null
    };
  }

  const pend = { fase: 'pedido', numeroPedido: null, itemAntigo: null, itemNovo: null };
  const idMatch = (msg || '').match(/#?(\d{1,6})\b/);
  if (idMatch) {
    return await registrarPedidoTroca(parseInt(idMatch[1], 10), contexto, pend);
  }
  return {
    resposta: '🔄 Vamos registrar sua troca!\n\nQual o *número do pedido*? (ex: _#44_)',
    contexto: { ...contexto, troca_pendente: pend }
  };
}

/**
 * Continua o fluxo quando há troca pendente no contexto.
 * @returns {Promise<{resposta:string, contexto:object, executou?:boolean}>}
 */
export async function continuarTroca(msg, clienteWhatsApp, contexto) {
  const pend = contexto.troca_pendente;
  const t = norm(msg);

  // Cancelamento explícito a qualquer momento
  if (/^(cancela|cancelar|para|deixa|esquece|desisto)/.test(t)) {
    return { resposta: '🚫 Troca cancelada. Nada foi alterado.', contexto: { ...contexto, troca_pendente: null } };
  }

  // FASE 1 — número do pedido
  if (pend.fase === 'pedido') {
    const idMatch = (msg || '').match(/#?(\d{1,6})\b/);
    if (!idMatch) {
      return { resposta: 'Por favor, informe o *número do pedido* (ex: _#44_).', contexto };
    }
    return await registrarPedidoTroca(parseInt(idMatch[1], 10), contexto, pend);
  }

  // FASE 2 — peça a devolver
  if (pend.fase === 'item_antigo') {
    const item = parseItem(msg);
    if (!itemCompleto(item)) {
      return {
        resposta: '🤔 Não entendi a peça. Informe *modelo, tamanho e cor* (ex: _Zara M preto_).',
        contexto
      };
    }
    const novoPend = { ...pend, itemAntigo: item, fase: 'item_novo' };
    return {
      resposta: `Anotado: devolvendo *${fmtItem(item)}*.\n\nE qual a peça *nova* que você quer? (ex: _Zara G preto_)`,
      contexto: { ...contexto, troca_pendente: novoPend }
    };
  }

  // FASE 3 — peça nova (valida estoque; sem saldo → oferece alternativa)
  if (pend.fase === 'item_novo') {
    const item = parseItem(msg);
    if (!itemCompleto(item)) {
      return {
        resposta: '🤔 Não entendi a peça nova. Informe *modelo, tamanho e cor* (ex: _Zara G preto_).',
        contexto
      };
    }
    const estoqueNovo = await sheetsEstoque.findByModeloTamanhoCor(item.modelo, item.tamanho, item.cor);
    if (!estoqueNovo || estoqueNovo.quantidade_disponivel < (item.qtd || 1)) {
      const alternativas = await sugerirAlternativas(item.modelo);
      const sugestao = alternativas.length
        ? `\n\nDisponível em *${item.modelo}*:\n${alternativas.join('\n')}\n\nQual você prefere?`
        : '\n\nQual outra peça você gostaria?';
      return {
        resposta: `😕 Não temos *${fmtItem(item)}* disponível no momento.${sugestao}`,
        contexto // permanece na fase item_novo
      };
    }
    // Usa a cor real encontrada no banco (LIKE fallback pode normalizar)
    const novoPend = { ...pend, itemNovo: { ...item, cor: estoqueNovo.cor }, fase: 'confirmar' };
    return { resposta: resumoConfirmacao(novoPend), contexto: { ...contexto, troca_pendente: novoPend } };
  }

  // FASE 4 — confirmação
  if (pend.fase === 'confirmar') {
    const sim = /^(sim|s|confirmo|confirmar|isso|ok|pode|aham|claro|👍)/.test(t);
    const nao = /^(n[aã]o|n|nao)/.test(t);
    if (sim) {
      // EFETIVAÇÃO — estoque atômico (+1 antigo / -1 novo) + log_estoque
      const r = await sheetsEstoque.processarTroca(pend.numeroPedido, pend.itemAntigo, pend.itemNovo);
      if (!r.success) {
        // Falha típica: a peça nova ficou sem saldo entre a validação e a confirmação
        return {
          resposta: `❌ Não consegui efetivar a troca: ${r.error}\n\nTente novamente em instantes.`,
          contexto: { ...contexto, troca_pendente: null }
        };
      }

      // Alerta o admin (logística reversa exige ação física) — não bloqueia a resposta
      notificarAdminTroca({
        numeroPedido: pend.numeroPedido,
        itemAntigo: pend.itemAntigo,
        itemNovo: pend.itemNovo,
        clienteWhatsApp
      }).catch(e => logger.warn('[troca] Falha ao alertar admin:', e.message));

      logger.info(`[troca] Efetivada — pedido #${pend.numeroPedido} | +${fmtItem(pend.itemAntigo)} / -${fmtItem(pend.itemNovo)}`);
      return {
        resposta: `✅ *Troca registrada!* (pedido #${pend.numeroPedido})\n` +
          `↩️ Devolução: ${fmtItem(pend.itemAntigo)}\n` +
          `📦 Novo item: ${fmtItem(pend.itemNovo)}\n\n` +
          `Entraremos em contato com a *etiqueta de envio* para a logística reversa. Obrigada! 🌙`,
        contexto: { ...contexto, troca_pendente: null },
        executou: true
      };
    }
    if (nao) {
      return { resposta: '🚫 Troca cancelada. Nada foi alterado.', contexto: { ...contexto, troca_pendente: null } };
    }
    return { resposta: 'Responda *Sim* para confirmar a troca ou *Não* para cancelar.', contexto };
  }

  // fase desconhecida → limpa
  return {
    resposta: 'Fluxo de troca reiniciado. Diga "quero trocar" para começar de novo.',
    contexto: { ...contexto, troca_pendente: null }
  };
}
