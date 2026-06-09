// ============================================================================
// lote.js — pedidos em lote (uma linha = um pedido)
// Gerado pela modularização da Sprint 0 — lógica idêntica ao conversas.js original.
// ============================================================================
import { logger } from '../../../utils/logger.js';
import * as sheetConversas from '../../sqlite/conversas.js';
import * as pedidosService from '../pedidos.js';
import { analisarVendas } from '../analytics.js';
import { gerarRecomendacaoCliente, gerarRecomendacaoEstoque } from '../recomendacoes.js';
import { temPermissao, obterInfoUsuario, ROLES } from '../../../config/users.js';
import { callAI } from '../../../config/claude.js';
import * as sheetsEstoque from '../../sqlite/estoque.js';
import * as sheetsPedidos from '../../sqlite/pedidos.js';
import { enviarMensagem } from '../../whatsapp/sender.js';
import { env } from '../../../config/env.js';

/**
 * Detecta uma linha de pedido: precisa ter "pra"/"para" seguido de um nome.
 * Ex: "1 Mia M azul-marinho pra Lidiane"  →  match (nome = "Lidiane")
 *     "2 zara g preto para a Karu"          →  match (nome = "Karu")
 * Captura o nome SEMPRE no fim da linha após "pra/para".
 */
const REGEX_LINHA_PEDIDO = /^\s*\d*\s*\S.*\b(?:pra|para)\s+(.+?)\s*$/i;

/**
 * Tenta processar a mensagem como um LOTE de pedidos (uma linha = um pedido).
 *
 * Regra: se a mensagem tiver 2+ linhas e ao menos 2 delas casarem o padrão
 * "<produto...> pra <Nome>", cada linha vira um pedido INDEPENDENTE, com seu
 * próprio número e cliente. Caso contrário, retorna null (fluxo normal segue).
 *
 * @returns {Promise<object|null>} resultado agregado ou null se não for lote.
 */
async function tentarProcessarLote(mensagem, clienteWhatsApp) {
  if (!mensagem || !mensagem.includes('\n')) return null; // lote exige múltiplas linhas

  const linhas = mensagem
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  // Linhas que parecem pedido (têm "pra/para <nome>")
  const linhasPedido = linhas.filter(l => REGEX_LINHA_PEDIDO.test(l));

  // Só ativa o modo lote com 2+ pedidos — 1 linha segue o fluxo normal
  if (linhasPedido.length < 2) return null;

  // 🛒 CARRINHO: agrupa as linhas pelo MESMO cliente → UM pedido com vários itens.
  // Antes cada linha virava um pedido isolado (#29, #30, #31, #32 p/ a mesma Karine).
  // Agora "1 luna g chocolate pra Karine" + "1 luna g bordo pra Karine" = 1 pedido.
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const grupos = new Map(); // chaveCliente → { cliente, itens: [textoItem...] }
  for (const linha of linhasPedido) {
    const m = linha.match(/^(.*?)\b(?:pra|para)\s+(.+?)\s*$/i);
    if (!m) continue;
    const itemTexto = m[1].trim();
    const cliente = m[2].trim();
    const chave = norm(cliente);
    if (!grupos.has(chave)) grupos.set(chave, { cliente, itens: [] });
    grupos.get(chave).itens.push(itemTexto);
  }

  logger.info(`[lote] Lote: ${linhasPedido.length} linha(s) → ${grupos.size} pedido(s) (agrupado por cliente)`);

  const sucessos = [];
  const falhas = [];

  // Um pedido por CLIENTE (itens concatenados com " e "), sequencial p/ evitar corrida no estoque
  for (const { cliente, itens } of grupos.values()) {
    const msgCombinada = `${itens.join(' e ')} pra ${cliente}`;
    try {
      const res = await pedidosService.processarMensagemPedido(msgCombinada, clienteWhatsApp);
      if (res?.success !== false && res?.numero_pedido) {
        sucessos.push({ numero: res.numero_pedido, linha: `${cliente} — ${itens.length} item(ns)`, msg: res.mensagem_usuario });
      } else {
        falhas.push({ linha: msgCombinada, motivo: res?.mensagem_usuario || res?.erro || 'não reconhecido' });
      }
    } catch (err) {
      logger.error(`[lote] Erro no pedido de "${cliente}": ${err.message}`);
      falhas.push({ linha: msgCombinada, motivo: 'erro ao processar' });
    }
  }

  // Limpa qualquer pedido parcial pendente — lote é sempre processado por completo
  await sheetConversas.salvarContexto(clienteWhatsApp, { historico: [] }).catch(() => {});

  // Monta resposta consolidada
  const partes = [`📦 *${sucessos.length} pedido(s) criado(s) em lote:*\n`];
  for (const s of sucessos) {
    partes.push(`✅ *#${String(s.numero).padStart(3, '0')}* — ${s.linha}`);
  }
  if (falhas.length > 0) {
    partes.push(`\n⚠️ *${falhas.length} linha(s) não processada(s):*`);
    for (const f of falhas) {
      partes.push(`❌ "${f.linha}" — ${f.motivo}`);
    }
  }

  return {
    success: sucessos.length > 0,
    resposta: partes.join('\n'),
    tipo: 'LOTE_PEDIDOS',
    totalLinhas: linhasPedido.length,
    criados: sucessos.map(s => s.numero)
  };
}

export { REGEX_LINHA_PEDIDO, tentarProcessarLote };
