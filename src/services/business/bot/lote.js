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

  // 🛒 CARRINHO com 2 formatos:
  //   (A) item com nome em cada linha:  "1 luna g chocolate pra Karine"
  //   (B) CABEÇALHO uma vez + itens sem nome:
  //         pedido pra Karine
  //         1 luna g marrom
  //         1 zara p preto
  // Em ambos, itens do MESMO cliente viram UM pedido.
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const temProduto = (l) => /^\s*\d/.test(l) || env.catalogoModelos.some(mo => norm(l).includes(norm(mo)));
  const grupos = new Map(); // chaveCliente → { cliente, itens: [textoItem...] }
  const addItem = (cliente, itemTexto) => {
    const chave = norm(cliente);
    if (!grupos.has(chave)) grupos.set(chave, { cliente, itens: [] });
    grupos.get(chave).itens.push(itemTexto);
  };

  let clienteAtual = null;
  let totalItens = 0;
  for (const linha of linhas) {
    if (temProduto(linha)) {
      // Tem "pra/para NOME" próprio? (e o NOME não é outro produto)
      const mi = linha.match(/^(.*?)\b(?:pra|para)\s+(.+?)\s*$/i);
      if (mi && !temProduto(mi[2])) {
        clienteAtual = mi[2].trim();
        addItem(clienteAtual, mi[1].trim());
      } else if (clienteAtual) {
        // item sem nome → herda o cliente do cabeçalho
        addItem(clienteAtual, linha.trim());
      } else {
        continue; // item sem cliente conhecido → ignora (não dá pra atribuir)
      }
      totalItens++;
    } else {
      // Linha sem produto → pode ser cabeçalho "pedido pra NOME" / "cliente: NOME"
      const mh = linha.match(/^(?:pedido\s+)?(?:pra|para|cliente)\s*:?\s*(.+?)\s*:?\s*$/i);
      if (mh && mh[1] && !temProduto(mh[1])) clienteAtual = mh[1].trim();
    }
  }

  // Só ativa o modo lote com 2+ itens reconhecidos — senão segue fluxo normal
  if (grupos.size === 0 || totalItens < 2) return null;

  logger.info(`[lote] Lote: ${totalItens} item(ns) → ${grupos.size} pedido(s) (agrupado por cliente)`);

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
    totalLinhas: totalItens,
    criados: sucessos.map(s => s.numero)
  };
}

export { REGEX_LINHA_PEDIDO, tentarProcessarLote };
