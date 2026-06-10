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

  // ⭐ DÚVIDA/FAQ sobre retirada ou baixa — NÃO inicia fluxo, só explica em linguagem natural
  // "como faço uma retirada?", "como funciona a baixa?", "o que é retirada interna"
  {
    regex: /(?:como\s+(?:fa[çc]o|funciona|faz|fa[çc]er)|o\s+que\s+[eé]|pra\s+que\s+serve).*(retirad|baixa\s+(?:de\s+)?estoque|baixa\s+interna|consumo\s+interno)/i,
    action: 'faq_retirada'
  },

  // ⭐ RETIRADA INTERNA (Bypass de faturamento) — consumo dos sócios
  // "retirada 1 anne p bordô para jully" → deduz estoque, SEM pedido/preço/endereço
  {
    regex: /^(?:retirad[ao]|retirar)\s+\d*\s*\S+/i,
    action: 'admin_retirada'
  },

  // ⭐ CONSULTA GENÉRICA DE PREÇO — "quanto custa 4 luna", "quanto fica 2 anne", "preço de 3 zara"
  // NÃO valida estoque/cor/tamanho: pega preço base do modelo × quantidade.
  {
    regex: /\b(?:quanto\s+(?:custa|fica|sai|vale|[ée])|pre[çc]o\s+(?:de|d[oa])?)\b/i,
    action: 'consulta_preco'
  },

  // ⭐ PAGAR TODOS (batch) — "todos pagos", "pagar todos", "paga tudo", "marca todos como pago"
  {
    regex: /\b(?:todos?\s+pagos?|pag(?:ar|a|os)?\s+(?:todos|tudo)|marca(?:r)?\s+(?:todos|tudo)\s+(?:como\s+)?pago?|tudo\s+pago)/i,
    action: 'pagar_todos'
  },

  // ⭐ BAIXA DE ESTOQUE POR TEXTO — "baixa 1 zara m preto por defeito"
  {
    regex: /^(?:dar?\s+baixa(?:\s+em)?|baixa(?:r)?|tira(?:r)?|saiu|sa[ií]da\s+de)\s+\d*\s*\S+/i,
    action: 'baixa_texto'
  },

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

  // ⭐ CONSULTA DE HISTÓRICO (resumo executivo) — "resumo dos últimos pedidos",
  // "histórico de pedidos", "últimos cancelados". Default = pagos; "cancelad" = cancelados.
  {
    regex: /(?:hist[óo]rico\s+(?:de\s+|dos?\s+)?pedidos?|resumo\s+(?:dos?\s+|de\s+)?[úu]ltimos?\s+pedidos?|[úu]ltimos?\s+(?:\d+\s+)?pedidos?\s*(?:pagos?|cancelad[oa]s?)?|[úu]ltimos?\s+cancelad[oa]s?|pedidos?\s+cancelad[oa]s?)/i,
    action: 'consulta_historico'
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

  // Endereço: contexto aguardando endereço.
  // Captura qualquer resposta curta (ex: "casa", len 4) DESDE QUE não seja um
  // comando. Antes o guard `length > 5` derrubava "casa" (amnésia) e depois
  // capturava "pedido #25" como endereço (vazamento). Agora: len >= 2 + filtro.
  if (contexto?.aguardando_endereco && msg.length >= 2 && !ehComando(msg)) {
    return { action: 'salvar_endereco', dados: { endereco: msg, numero_pedido: contexto.aguardando_endereco } };
  }

  return null;
}

/**
 * Detecta se a mensagem é um COMANDO (não um endereço). Evita que, durante o
 * estado `aguardando_endereco`, comandos como "pedido #25", "@estoque",
 * "retirada ...", saudações etc. sejam salvos como endereço por engano.
 */
function ehComando(mensagem) {
  const t = (mensagem || '').trim().toLowerCase();
  return /^@/.test(t)
    || /\bpedidos?\b/.test(t)
    || /^(oi|ola|olá|hey|menu|ajuda|opa|bom dia|boa tarde|boa noite)/.test(t)
    || /^(retirad|retirar|baixa|baixar|tira|tirar|saiu|cancela|pag[oa]|paga|entregue|retirou|reposi|estoque|alerta|quanto|pre[çc]o|todos|hist[óo]rico|resumo|[úu]ltimos?)/.test(t)
    || /^\d+\s+\S+\s+(p|m|g|gg)\b/i.test(t); // "1 anne p ..." → parece pedido/retirada
}

export { FAST_PATH_RULES, fastPath, ehComando };
