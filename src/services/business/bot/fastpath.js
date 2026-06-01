// ============================================================================
// fastpath.js — regras regex que evitam chamar o Claude
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

// ---------------------------------------------------------------------------
// Fast-Path: detecta ações comuns sem chamar o Claude (economiza ~70% das calls)
// ---------------------------------------------------------------------------
const FAST_PATH_RULES = [
  // Saudações simples
  { regex: /^(oi|olá|ola|hey|bom dia|boa tarde|boa noite|eai|e aí|menu|ajuda|socorro|opa|oii|oeee?)$/i, action: 'saudacao' },

  // ⭐ CANCELAR PEDIDO — "cancelar pedido #16", "cancela o pedido 16"
  {
    regex: /cancela(?:r)?\s+(?:o\s+)?pedido\s+#?(\d+)/i,
    action: 'cancelar_pedido',
    extract: m => ({ numero_pedido: parseInt(m[1]) })
  },

  // ⭐ SUGESTÃO DE REPOSIÇÃO — "o que preciso repor/comprar", "reposição"
  {
    regex: /(?:o\s+que\s+(?:preciso|devo|tenho\s+que)\s+(?:repor|comprar)|sugest[ãa]o\s+de\s+reposi[çc][ãa]o|reposi[çc][ãa]o|o\s+que\s+comprar|o\s+que\s+repor|lista\s+de\s+compras?)/i,
    action: 'reposicao'
  },

  // ⭐ INTENÇÃO DE CRIAR PEDIDO — capturar ANTES de listar
  // Frases com verbos de ação + "pedido(s)" → sempre criar, nunca listar
  {
    regex: /(?:vamos?\s+|quero\s+|vai\s+|vou\s+|me\s+|pode\s+)?(?:adicionar|criar|fazer|anotar|registrar|incluir|lançar|abrir)\s+(?:um\s+|alguns\s+|os\s+|novos?\s+)?pedidos?/i,
    action: 'iniciar_pedido'
  },
  // "novo pedido", "outro pedido", "mais um", "adicionar mais um"
  {
    regex: /^(?:novo|outro|quero(?:\s+fazer)?|fazer|abrir|criar|anotar|mais\s+um|adicionar\s+mais\s+um|e\s+mais\s+um)\s*(?:um\s+)?pedidos?$/i,
    action: 'iniciar_pedido'
  },
  // "outro pedido" / "mais um pedido" como frase completa
  {
    regex: /^(?:outro|mais\s+um|e\s+mais\s+um)(?:\s+pedido)?$/i,
    action: 'iniciar_pedido'
  },

  // Listar pedidos abertos — só palavras isoladas, sem verbos de ação antes
  { regex: /^(@?pedidos?|@?pendentes?|abertos?)$/i, action: 'listar_pedidos_abertos' },
  // Analytics
  { regex: /^@estoque$/i, action: '@estoque' },
  { regex: /^@(an[aá]lise|analysis|vendas|relat[oó]rio?)$/i, action: '@analise' },
  { regex: /^@atualizar\s+/i, action: '@atualizar' },
  // ⭐ ALERTAS DE ESTOQUE — "alerta de estoque", "alertas", "@alertas"
  {
    regex: /(?:@?alerta[s]?\s+(?:de\s+)?estoque|estoque\s+(?:alerta[s]?|baixo|critico|cr[ií]tico)|quais?\s+(?:est[aá]\s+)?acabando|o\s+que\s+t[aá]\s+acabando)/i,
    action: 'alertas_estoque'
  },
  // ⭐ RESUMO COMPLETO DO ESTOQUE — "faça um resumo", "manda o estoque", "ver estoque"
  {
    regex: /(?:fa[çc]a?\s+(?:um\s+)?resumo|manda?\s+(?:o\s+)?estoque|ver\s+estoque|lista\s+(?:o\s+)?estoque|me\s+(?:manda|passa|d[aá])\s+(?:o\s+)?estoque|estoque\s+(?:atual|completo|todo))/i,
    action: 'resumo_estoque_completo'
  },
  // CONSULTAR ESTOQUE — apenas quando explicitamente mencionar pijama/peça/roupa
  // Perguntas genéricas com "temos" vão para o Claude para interpretar corretamente
  {
    regex: /(?:t[eê]m|temos|existe|há)\s+(?:algum|alguma|[oa]s?)?\s+(?:pijama|peça|roupa)s?\s+(.+)/i,
    action: 'consultar_estoque',
    extract: m => ({ criterio: m[1] })
  },
  // Confirmar pagamento: "pedido 5 pago pix" / "5 pago" / "pago pedido 5" / "pago 5 pix"
  {
    regex: /(?:pedido\s+)?#?(\d+)\s+pag[oa](?:u|ment[oa])?\s*(pix|cart[aã]o|dinheiro|boleto)?/i,
    action: 'confirmar_pagamento',
    extract: m => ({ numero_pedido: parseInt(m[1]), forma_pagamento: (m[2] || '').toUpperCase() || null })
  },
  {
    regex: /pag[oa](?:u|ment[oa])?\s+(?:pedido\s+)?#?(\d+)\s*(pix|cart[aã]o|dinheiro|boleto)?/i,
    action: 'confirmar_pagamento',
    extract: m => ({ numero_pedido: parseInt(m[1]), forma_pagamento: (m[2] || '').toUpperCase() || null })
  },
  // Atualizar entrega
  {
    regex: /entregue?\s+(?:pedido\s+)?#?(\d+)/i,
    action: 'atualizar_entrega',
    extract: m => ({ numero_pedido: parseInt(m[1]), tipo_entrega: 'ENTREGUE' })
  },
  {
    regex: /retirou?\s+(?:pedido\s+)?#?(\d+)/i,
    action: 'atualizar_entrega',
    extract: m => ({ numero_pedido: parseInt(m[1]), tipo_entrega: 'RETIRADA_NA_LOJA' })
  },
];

/**
 * Tenta detectar ação por regex sem chamar Claude.
 * Retorna { action, dados } ou null.
 */
function fastPath(mensagem, contexto) {
  const msg = mensagem.trim();

  for (const rule of FAST_PATH_RULES) {
    const match = msg.match(rule.regex);
    if (match) {
      const dados = rule.extract ? rule.extract(match) : {};
      return { action: rule.action, dados };
    }
  }

  // Endereço: contexto aguardando endereço
  if (contexto?.aguardando_endereco && msg.length > 5) {
    return { action: 'salvar_endereco', dados: { endereco: msg, numero_pedido: contexto.aguardando_endereco } };
  }

  return null;
}

export { FAST_PATH_RULES, fastPath };
