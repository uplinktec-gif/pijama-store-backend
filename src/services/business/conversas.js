import { logger } from '../../utils/logger.js';
import * as sheetConversas from '../sqlite/conversas.js';
import * as pedidosService from './pedidos.js';
import { analisarVendas } from './analytics.js';
import { gerarRecomendacaoCliente, gerarRecomendacaoEstoque } from './recomendacoes.js';
import { temPermissao, obterInfoUsuario, ROLES } from '../../config/users.js';
import { callAI } from '../../config/claude.js';
import * as sheetsEstoque from '../sqlite/estoque.js';
import * as sheetsPedidos from '../sqlite/pedidos.js';
import { enviarMensagem } from '../whatsapp/sender.js';
import { env } from '../../config/env.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converte a lista bruta do Google Sheets em um resumo compacto por modelo/cor.
 * Exemplo de saída:
 *   ZARA: azul M=6, G=1 | preto M=9 | bordô G=2
 *   MIA: preto P=2, M=3 | azul M=3
 */
function gerarResumoEstoque(estoqueList) {
  if (!estoqueList || estoqueList.length === 0) {
    return 'Estoque não disponível no momento.';
  }

  // Agrupa por modelo → cor → tamanho: quantidade
  const mapa = {};
  for (const item of estoqueList) {
    if (item.quantidade_disponivel <= 0) continue;

    const modelo = (item.modelo || '').toUpperCase();
    const cor = (item.cor || '').toLowerCase();
    const tam = (item.tamanho || '').toUpperCase();
    const qtd = item.quantidade_disponivel;

    if (!mapa[modelo]) mapa[modelo] = {};
    if (!mapa[modelo][cor]) mapa[modelo][cor] = {};
    mapa[modelo][cor][tam] = (mapa[modelo][cor][tam] || 0) + qtd;
  }

  const linhas = [];
  for (const modelo of Object.keys(mapa).sort()) {
    const partesCor = [];
    for (const cor of Object.keys(mapa[modelo]).sort()) {
      const parteTam = Object.entries(mapa[modelo][cor])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tam, qtd]) => `${tam}=${qtd}`)
        .join(', ');
      partesCor.push(`${cor} ${parteTam}`);
    }
    linhas.push(`${modelo}: ${partesCor.join(' | ')}`);
  }

  return linhas.join('\n');
}

/**
 * Gera lista plana de TODOS os itens com estoque disponível.
 * Formato: "MODELO TAMANHO cor: quantidade"
 * Permite ao Groq filtrar por QUALQUER combinação (tamanho, cor, modelo, ou mistura).
 * Exemplos de perguntas que responde:
 *   "o que temos no G?"
 *   "tem alguma coisa bordô no P?"
 *   "quais modelos têm azul marinho?"
 *   "bordô tamanho M quais modelos?"
 */
function gerarListaPlanaEstoque(estoqueList) {
  if (!estoqueList || estoqueList.length === 0) return '';

  const precos = env.modeloPrecos || {};

  const linhas = estoqueList
    .filter(item => item.quantidade_disponivel > 0)
    .sort((a, b) => {
      if (a.modelo !== b.modelo) return a.modelo.localeCompare(b.modelo);
      const ordemTam = ['P', 'M', 'G', 'GG'];
      return ordemTam.indexOf(a.tamanho) - ordemTam.indexOf(b.tamanho);
    })
    .map(item => {
      const preco = precos[item.modelo];
      const precoStr = preco ? ` — R$ ${Number(preco).toFixed(2)}` : '';
      return `${item.modelo} ${item.tamanho} ${item.cor}: ${item.quantidade_disponivel} un${precoStr}`;
    });

  return linhas.join('\n');
}

/**
 * Formata o estoque do banco em texto limpo para WhatsApp.
 * Agrupa por Modelo → Cor → tamanhos com quantidades.
 * Fonte única de verdade: SQLite. Sem IA, sem alucinação.
 */
function formatarEstoqueWhatsApp(estoqueList) {
  if (!estoqueList || estoqueList.length === 0) {
    return '📦 Nenhum item em estoque no momento.';
  }

  // Ordenar: P < M < G < GG
  const ordemTam = { P: 0, M: 1, G: 2, GG: 3 };

  // Agrupar: modelo → cor → { tamanho: qtd }
  const mapa = {};
  let totalGeral = 0;
  for (const item of estoqueList) {
    const qtd = item.quantidade_disponivel || 0;
    if (qtd <= 0) continue;
    const modelo = item.modelo || '?';
    const cor    = item.cor    || '?';
    const tam    = item.tamanho || '?';
    if (!mapa[modelo]) mapa[modelo] = {};
    if (!mapa[modelo][cor]) mapa[modelo][cor] = {};
    mapa[modelo][cor][tam] = (mapa[modelo][cor][tam] || 0) + qtd;
    totalGeral += qtd;
  }

  const linhas = [`📦 *ESTOQUE PLUMA — ${totalGeral} peças*\n`];

  for (const modelo of Object.keys(mapa).sort()) {
    linhas.push(`*${modelo}*`);
    for (const cor of Object.keys(mapa[modelo]).sort()) {
      const tamStr = Object.entries(mapa[modelo][cor])
        .sort(([a], [b]) => (ordemTam[a] ?? 9) - (ordemTam[b] ?? 9))
        .map(([t, q]) => `${t}:${q}`)
        .join(' ');
      linhas.push(`  ${cor} — ${tamStr}`);
    }
  }

  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Função principal: Claude como cérebro para mensagens livres
// ---------------------------------------------------------------------------

/**
 * Envia a mensagem + contexto para o Claude e interpreta a resposta JSON.
 */

/**
 * Garante que nenhum JSON seja enviado ao WhatsApp.
 * Extrai o campo "resposta" se for JSON; retorna null se não conseguir.
 * NUNCA usa regex para remover JSON parcialmente (deixa fragmentos).
 */
function sanitizarParaWhatsApp(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const t = texto.trim();
  if (!t) return null;

  // Não parece JSON → retorna o texto como está
  const pareceJSON = t.startsWith('{') || t.includes('"action":') || t.includes('"resposta":');
  if (!pareceJSON) return t;

  // É JSON → extrai só o campo "resposta"
  try {
    const jsonStr = t.match(/\{[\s\S]*\}/)?.[0];
    if (jsonStr) {
      const obj = JSON.parse(jsonStr
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, ''));
      const resposta = (obj.resposta || '').replace(/\\n/g, '\n').trim();
      if (resposta && !resposta.startsWith('{')) return resposta;
      if (resposta.startsWith('{')) return sanitizarParaWhatsApp(resposta);
    }
  } catch { /* parse falhou */ }

  return null; // não conseguiu extrair texto limpo
}

async function processarComClaude(mensagem, clienteWhatsApp, contexto) {
  // Buscar estoque atual (uma única chamada para todos os resumos)
  let resumoEstoque = 'Não foi possível carregar o estoque.';
  let listaPlanaEstoque = '';
  try {
    const lista = await sheetsEstoque.readAllEstoque();
    resumoEstoque = gerarResumoEstoque(lista);
    listaPlanaEstoque = gerarListaPlanaEstoque(lista);
  } catch (err) {
    logger.warn('[processarComClaude] Erro ao buscar estoque para o prompt:', err.message);
  }

  // Info do usuário
  const usuario = obterInfoUsuario(clienteWhatsApp);
  const nomeUsuario = usuario.nome || 'usuário';
  const roleUsuario = usuario.role || ROLES.CLIENTE;

  // Recuperar histórico de conversa (últimas 6 mensagens = 3 trocas)
  const historico = (contexto?.historico || []).slice(-6);

  // Contexto da conversa (sem o histórico — vai separado)
  const contextoSemHistorico = { ...contexto };
  delete contextoSemHistorico.historico;
  const contextoTexto = Object.keys(contextoSemHistorico).length > 0
    ? JSON.stringify(contextoSemHistorico, null, 2)
    : 'Nenhum contexto anterior.';


  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' });
  const systemPrompt = `Você é assistente da loja Pluma Pijamas (Boa Vista-RR). Responde via WhatsApp.
Usuário: ${nomeUsuario} (${roleUsuario}).
Data/Hora: ${agora} (Horário de Boa Vista)

╔══════════════════════════════════════════╗
║  ESTOQUE REAL — FONTE ÚNICA DE VERDADE  ║
║  USE APENAS ESTES DADOS. PROIBIDO       ║
║  inventar modelos, cores ou tamanhos    ║
║  que não estejam listados abaixo.       ║
╚══════════════════════════════════════════╝
${listaPlanaEstoque || '(estoque vazio)'}

CONTEXTO: ${contextoTexto}

═══════════════════════════════
REGRA ÚNICA: responda APENAS com JSON puro, sem texto fora do JSON, sem markdown.
═══════════════════════════════

FORMATO OBRIGATÓRIO:
{"action":"ACTION","resposta":"texto natural em português","dados":{"numero_pedido":null,"forma_pagamento":null,"tipo_entrega":null,"nome_cliente":null,"itens":null}}

AÇÕES E QUANDO USAR:

1. "criar_pedido" — quando mencionar produto + cliente OU quando a intenção for INICIAR/ADICIONAR um pedido
   Exemplos diretos: "1 zara M preto pra Maria", "adicionar pra entrega 2 mia P azul pra João", "anota aí 1 lia bordô G pra Ana"
   Exemplos de INTENÇÃO (mesmo sem produto/cliente ainda):
     "vamos adicionar alguns pedidos", "quero fazer um pedido", "novo pedido", "criar um pedido",
     "adicionar pedido", "anotar um pedido", "fazer um pedido agora",
     "outro pedido", "mais um pedido", "adicionar mais um", "e mais um"
   → Se tiver produto+cliente: preencha dados.itens e dados.nome_cliente normalmente
   → Se só tiver intenção sem detalhes: resposta = "Claro! Qual o cliente e o que deseja pedir?" e dados vazios
   Quantidade padrão é 1 se não mencionada.

   ⚠️ REGRA CRÍTICA SOBRE CORES: Use EXATAMENTE a cor que o usuário digitou. NUNCA adicione complementos.
   Exemplos CORRETOS:
     usuário diz "azul"      → cor: "azul"         (NÃO "azul marinho", NÃO "azul jeans")
     usuário diz "preto"     → cor: "preto"        (NÃO "preto com bege")
     usuário diz "chocolate" → cor: "chocolate"    (NÃO "marrom")
   Se o usuário não especificar a cor, deixe cor: null e pergunte qual cor.

2. "confirmar_pagamento" — quando falar que pagou
   Exemplos: "pedido 3 pago no pix", "confirmei o pix do 5", "pagou cartão pedido 2", "recebi o pagamento do 4"
   → dados.numero_pedido = 3, dados.forma_pagamento = "PIX"

3. "atualizar_entrega" — quando entregar ou retirar
   Exemplos: "entregue pedido 3", "retirou o 2", "entregou pedido 5"
   → dados.numero_pedido = 3, dados.tipo_entrega = "ENTREGUE" ou "RETIRADA_NA_LOJA"

4. "saindo_entrega" — quando sair para entregar
   Exemplos: "saindo entregar pra Maria", "vou levar o pedido 3", "indo entregar agora"
   → dados.numero_pedido ou dados.nome_cliente

5. "listar_pedidos_abertos" — quando CONSULTAR/VER pedidos existentes
   Exemplos: "pedidos", "manda os pedidos", "quais pedidos", "o que tá pendente", "mostra os pedidos"
   ATENÇÃO: "adicionar pedido", "novo pedido", "criar pedido", "vamos adicionar" → NÃO é listar → é criar_pedido

6. "buscar_cliente" — quando perguntar sobre pedidos de alguém
   Exemplos: "pedidos da Maria", "o que João comprou"
   → dados.nome_cliente = "Maria"

7. "consultar_pedido" — quando perguntar sobre pedido específico por número
   Exemplos: "status do pedido 3", "como tá o pedido 5"
   → dados.numero_pedido = 3

8. "responder" — para todo o resto (saudações, perguntas de estoque, dúvidas)
   → resposta natural em português, amigável, máximo 5 linhas
   → Para estoque: USE EXCLUSIVAMENTE os dados listados em ESTOQUE REAL acima.
     NUNCA invente cores, modelos ou quantidades que não estejam nessa lista.

9. "listar_entregas_pendentes" — quando perguntar o que falta entregar ou enviar
   Exemplos: "temos algum pedido pra ser entregue?", "o que falta entregar?",
             "quais pedidos precisam de entrega?", "tem pedido aguardando entrega?",
             "o que está pendente de entrega?", "pedidos pra entregar hoje"
   → Não precisa de dados extras, o sistema consulta o banco automaticamente

EXEMPLOS COMPLETOS:
Entrada: "1 zara M preto pra Maria"
Saída: {"action":"criar_pedido","resposta":"Anotado!","dados":{"numero_pedido":null,"forma_pagamento":null,"tipo_entrega":null,"nome_cliente":"Maria","itens":[{"modelo":"ZARA","tamanho":"M","cor":"preto","quantidade":1}]}}

Entrada: "adicionar pedido: zara preto m para veronica"
Saída: {"action":"criar_pedido","resposta":"Anotado! Pedido de 1x ZARA preto M para Veronica.","dados":{"numero_pedido":null,"forma_pagamento":null,"tipo_entrega":null,"nome_cliente":"Veronica","itens":[{"modelo":"ZARA","tamanho":"M","cor":"preto","quantidade":1}]}}

Entrada: "pedido 3 pago no pix"
Saída: {"action":"confirmar_pagamento","resposta":"Pagamento confirmado!","dados":{"numero_pedido":3,"forma_pagamento":"PIX","tipo_entrega":null,"nome_cliente":null,"itens":null}}

Entrada: "tem zara M?"
Saída: {"action":"responder","resposta":"ZARA M disponível:\n- preto: 9 un\n- cinza: 7 un\n- bordô: 2 un","dados":{"numero_pedido":null,"forma_pagamento":null,"tipo_entrega":null,"nome_cliente":null,"itens":null}}`;

  try {
    const raw = await callAI(systemPrompt, mensagem, 512, historico);
    logger.debug('[processarComClaude] Resposta Groq raw:', raw.substring(0, 150));

    let resultado;

    // Remove blocos markdown ```json ... ``` se existirem
    const rawLimpo = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();

    // Tenta extrair JSON da resposta
    const jsonMatch = rawLimpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const jsonSanitizado = jsonMatch[0]
          .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '');

        const parsed = JSON.parse(jsonSanitizado);

        // Extrai campo "resposta" — se for JSON aninhado, sanitiza recursivamente
        let respostaTexto = (parsed.resposta || '').replace(/\\n/g, '\n').trim();
        const respostaSanitizada = sanitizarParaWhatsApp(respostaTexto);
        respostaTexto = respostaSanitizada ?? respostaTexto; // usa o sanitizado se não-nulo

        resultado = {
          action: parsed.action || 'responder',
          resposta: respostaTexto || 'Como posso ajudar?',
          dados: parsed.dados || {}
        };
      } catch (parseErr) {
        logger.warn('[processarComClaude] JSON inválido:', parseErr.message);
        // Parse falhou — usa mensagem genérica (não tenta extrair do raw, deixaria fragmentos)
        resultado = { action: 'responder', resposta: 'Entendido! Como posso ajudar?' };
      }
    } else {
      // Sem JSON — usa o texto diretamente (pode ser resposta textual do Groq)
      const textoLimpo = rawLimpo.replace(/```[\s\S]*?```/g, '').trim();
      resultado = { action: 'responder', resposta: textoLimpo || 'Como posso ajudar?' };
    }

    // FALLBACK REMOVIDO — não sobrescrever mais a decisão do Claude por palavra-chave.
    // "vamos adicionar alguns pedidos" contém "pedido" mas a intenção é criar, não listar.
    // O Claude já está instruído a distinguir listar vs criar. Confiamos nele.

    // Salvar esta troca no histórico (assíncrono, não bloqueia)
    if (resultado.resposta) {
      salvarHistorico(clienteWhatsApp, contexto, mensagem, resultado.resposta).catch(() => {});
    }

    return resultado;

  } catch (error) {
    logger.error('[processarComClaude] Erro ao chamar Claude:', error.message);
    return responderSemClaude(mensagem, clienteWhatsApp, resumoEstoque);
  }
}

/**
 * Fallback inteligente quando Claude não está disponível.
 * Responde perguntas básicas de estoque e saudações sem IA.
 */
function responderSemClaude(mensagem, clienteWhatsApp, resumoEstoque) {
  const msg = mensagem.toLowerCase().trim();
  const usuario = obterInfoUsuario(clienteWhatsApp);
  const nome = usuario.nome !== 'Cliente' ? usuario.nome : '';

  // Padrão de pedido: número + modelo OU "pra" + nome → tenta criar pedido
  const pareceOrdem = /^\d+\s+\w+|\bpra\b|\bpara\b|\bnovo pedido\b/.test(msg);
  if (pareceOrdem) {
    return { action: 'criar_pedido', resposta: 'Processando seu pedido...' };
  }

  // Saudações
  if (/^(oi|olá|ola|hey|bom dia|boa tarde|boa noite|eai|e aí|menu|ajuda)/.test(msg)) {
    return { action: 'responder', resposta: gerarSaudacao(clienteWhatsApp) };
  }

  // Perguntas EXPLÍCITAS sobre estoque — modelos lidos do banco, não hardcoded
  const perguntaEstoque = /quantos?|tem\b|temos|disponív|sobrou|resta|quanto/.test(msg);
  if (perguntaEstoque) {
    const modelosBanco = sheetsEstoque.listarModelosDisponiveis();
    for (const m of modelosBanco) {
      const mNorm = m.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const msgNorm = msg.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (msgNorm.includes(mNorm)) {
        const linhas = resumoEstoque.split('\n').filter(l => l.toUpperCase().startsWith(m.toUpperCase()));
        if (linhas.length > 0) {
          return { action: 'responder', resposta: `${nome ? nome + ', t' : 'T'}emos ${m}:\n${linhas[0]}` };
        }
        return { action: 'responder', resposta: `Sem estoque de ${m} no momento.` };
      }
    }
    return {
      action: 'responder',
      resposta: `Estoque atual${nome ? ', ' + nome : ''}:\n\n${resumoEstoque}\n\nQuer mais detalhes?`
    };
  }

  // Default: menu de ajuda
  return { action: 'responder', resposta: gerarSaudacao(clienteWhatsApp) };
}

// ---------------------------------------------------------------------------
// Função principal exportada
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fast-Path: detecta ações comuns sem chamar o Claude (economiza ~70% das calls)
// ---------------------------------------------------------------------------
const FAST_PATH_RULES = [
  // Saudações simples
  { regex: /^(oi|olá|ola|hey|bom dia|boa tarde|boa noite|eai|e aí|menu|ajuda|socorro|opa|oii|oeee?)$/i, action: 'saudacao' },

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

/**
 * Chama processarComClaude com retry + backoff exponencial
 */
async function processarComClaudeComRetry(mensagem, clienteWhatsApp, contexto, maxTentativas = 3) {
  for (let i = 1; i <= maxTentativas; i++) {
    try {
      return await processarComClaude(mensagem, clienteWhatsApp, contexto);
    } catch (err) {
      logger.warn(`[Claude] Tentativa ${i}/${maxTentativas} falhou: ${err.message}`);
      if (i === maxTentativas) {
        logger.error(`[Claude] Todas as tentativas falharam, usando fallback`);
        const estoque = await sheetsEstoque.readAllEstoque().catch(() => []);
        return responderSemClaude(mensagem, clienteWhatsApp, gerarResumoEstoque(estoque));
      }
      await new Promise(r => setTimeout(r, 1000 * i));
    }
  }
}

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

  logger.info(`[lote] Detectado lote: ${linhasPedido.length} pedido(s) em ${linhas.length} linha(s)`);

  const sucessos = [];
  const falhas = [];

  // Processa CADA linha como um pedido independente (sequencial, evita corrida no estoque)
  for (const linha of linhasPedido) {
    try {
      // Cada linha passa pelo interpretador de pedido isoladamente → número próprio
      const res = await pedidosService.processarMensagemPedido(linha, clienteWhatsApp);
      if (res?.success !== false && res?.numero_pedido) {
        sucessos.push({ numero: res.numero_pedido, linha, msg: res.mensagem_usuario });
      } else {
        falhas.push({ linha, motivo: res?.mensagem_usuario || res?.erro || 'não reconhecido' });
      }
    } catch (err) {
      logger.error(`[lote] Erro na linha "${linha}": ${err.message}`);
      falhas.push({ linha, motivo: 'erro ao processar' });
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

/**
 * Processa mensagem com suporte a contexto multi-turno.
 * Comandos @ específicos vão para analytics; tudo mais passa pelo Claude.
 */
async function processarMensagemComContexto(mensagem, clienteWhatsApp) {
  const inicio = Date.now();
  let usouFastPath = false;

  try {
    // 📦 PEDIDOS EM LOTE: várias linhas, cada uma com "pra/para NOME" → pedidos separados.
    // Detecta ANTES de tudo: se há 2+ linhas no formato de pedido, processa cada linha
    // como um pedido INDEPENDENTE (número próprio, cliente próprio).
    const loteResultado = await tentarProcessarLote(mensagem, clienteWhatsApp);
    if (loteResultado) {
      logger.info(`[lote] ${loteResultado.totalLinhas} linha(s) processada(s) em ${Date.now() - inicio}ms`);
      return loteResultado;
    }

    // 1. Carregar contexto existente
    const contextoCarregado = await sheetConversas.carregarContexto(clienteWhatsApp);
    const contexto = contextoCarregado?.contexto || {};

    // ⚡ FAST-PATH: Verificar se conseguimos responder sem Claude
    const fp = fastPath(mensagem, contexto);
    if (fp) {
      usouFastPath = true;
      logger.info(`[FastPath] action=${fp.action} | ${clienteWhatsApp.slice(-4)} | "${mensagem.substring(0, 40)}"`);

      // Tratar ação de endereço diretamente
      if (fp.action === 'salvar_endereco') {
        const numPedido = fp.dados.numero_pedido;
        await sheetsPedidos.atualizarEnderecoEntrega(numPedido, fp.dados.endereco).catch(() => {});
        await sheetConversas.salvarContexto(clienteWhatsApp, { ...contexto, aguardando_endereco: null }).catch(() => {});
        logger.info(`[FastPath] Endereço salvo em ${Date.now() - inicio}ms`);
        return {
          success: true,
          resposta: `✅ Endereço salvo no pedido *#${numPedido}*!\n📍 ${fp.dados.endereco}`,
          tipo: 'ENDERECO_ENTREGA'
        };
      }

      // Tratar saudação
      if (fp.action === 'saudacao') {
        const resposta = gerarSaudacao(clienteWhatsApp);
        logger.info(`[FastPath] Saudação em ${Date.now() - inicio}ms`);
        return { success: true, resposta, tipo: 'SAUDACAO' };
      }

      // ⭐ Intenção de criar pedido sem produto/cliente ainda
      if (fp.action === 'iniciar_pedido') {
        // Resetar histórico da sessão — evita que o Claude leia erros antigos e repita padrões
        sheetConversas.salvarContexto(clienteWhatsApp, { historico: [] }).catch(() => {});
        logger.info(`[FastPath] Iniciar pedido — histórico resetado em ${Date.now() - inicio}ms`);
        return {
          success: true,
          resposta: '📝 Claro! Me passa o cliente e os itens.\nEx: "1 Zara M preto pra Maria" ou "2 Anne P azul pra João"',
          tipo: 'INICIAR_PEDIDO'
        };
      }

      // ⭐ Alertas de estoque (consulta banco real — mostra o que está acabando)
      if (fp.action === 'alertas_estoque') {
        try {
          const { analisarEstoque } = await import('./analytics.js');
          const resultado = await analisarEstoque();
          const alertas = resultado.alertas || [];

          if (alertas.length === 0) {
            return { success: true, resposta: '✅ Estoque está ok! Nenhum item crítico no momento.', tipo: 'ALERTAS_ESTOQUE' };
          }

          let msg = `⚠️ *ALERTAS DE ESTOQUE*\n\n`;
          const urgentes = alertas.filter(a => a.tipo === 'URGENTE' || a.tipo === 'SEM_ESTOQUE');
          const avisos = alertas.filter(a => a.tipo === 'AVISO');

          if (urgentes.length > 0) {
            msg += `🔴 *URGENTE (encomendar HOJE):*\n`;
            urgentes.forEach(a => {
              msg += `   📦 *${a.produto}*\n`;
              msg += `       ${a.disponivel} un • ${a.diasRestantes} dias restantes\n`;
            });
            msg += `\n`;
          }
          if (avisos.length > 0) {
            msg += `🟡 *AVISO (encomendar essa semana):*\n`;
            avisos.slice(0, 5).forEach(a => {
              msg += `   📦 *${a.produto}*\n`;
              msg += `       ${a.disponivel} un • ${a.diasRestantes} dias restantes\n`;
            });
          }

          logger.info(`[FastPath] Alertas estoque em ${Date.now() - inicio}ms`);
          return { success: true, resposta: msg, tipo: 'ALERTAS_ESTOQUE' };
        } catch (err) {
          logger.error('[FastPath] Erro alertas estoque:', err.message);
          return { success: false, resposta: 'Erro ao consultar alertas. Tenta de novo?', tipo: 'ALERTAS_ESTOQUE' };
        }
      }

      // ⭐ Resumo completo do estoque (NOVO: consulta banco real)
      if (fp.action === 'resumo_estoque_completo') {
        try {
          const lista = await sheetsEstoque.readAllEstoque();
          const listaPlana = gerarListaPlanaEstoque(lista);
          const resposta = listaPlana
            ? `📦 *ESTOQUE ATUAL:*\n\n${listaPlana}`
            : 'Nenhum item em estoque no momento.';
          logger.info(`[FastPath] Resumo estoque completo em ${Date.now() - inicio}ms`);
          return { success: true, resposta, tipo: 'RESUMO_ESTOQUE' };
        } catch (err) {
          logger.error('[FastPath] Erro ao gerar resumo estoque:', err.message);
          return { success: false, resposta: 'Erro ao consultar estoque. Tenta de novo?', tipo: 'RESUMO_ESTOQUE' };
        }
      }

      // ⭐ Consultar estoque (NOVO: consulta banco real, sem alucinação)
      if (fp.action === 'consultar_estoque') {
        const resposta = await consultarEstoqueReal(fp.dados.criterio);
        logger.info(`[FastPath] Estoque consultado em ${Date.now() - inicio}ms | criterio="${fp.dados.criterio.substring(0, 50)}"`);
        return { success: true, resposta, tipo: 'CONSULTAR_ESTOQUE' };
      }

      // Tratar listar pedidos abertos
      if (fp.action === 'listar_pedidos_abertos') {
        const pedidosAbertos = await sheetsPedidos.listarTodosPendentes();
        const resposta = formatarPedidosAbertos(pedidosAbertos);
        logger.info(`[FastPath] Pedidos listados em ${Date.now() - inicio}ms`);
        return { success: true, resposta, tipo: 'LISTAR_PEDIDOS' };
      }

      // @estoque — lê DIRETAMENTE do banco, zero IA, zero alucinação
      if (fp.action === '@estoque') {
        if (!temPermissao(clienteWhatsApp, 'ANALYTICS_ESTOQUE')) {
          return { success: false, resposta: '❌ Sem permissão para ver estoque.', tipo: 'ANALYTICS_ESTOQUE' };
        }
        try {
          const lista = await sheetsEstoque.readAllEstoque();
          const resposta = formatarEstoqueWhatsApp(lista);
          logger.info(`[FastPath] @estoque direto do banco em ${Date.now() - inicio}ms`);
          return { success: true, resposta, tipo: 'ANALYTICS_ESTOQUE' };
        } catch (err) {
          logger.error('[FastPath] Erro @estoque:', err.message);
          return { success: false, resposta: 'Erro ao consultar estoque. Tenta de novo?', tipo: 'ANALYTICS_ESTOQUE' };
        }
      }

      if (fp.action === '@analise') {
        if (!temPermissao(clienteWhatsApp, 'ANALYTICS_VENDAS')) {
          return { success: false, resposta: '❌ Sem permissão para ver análise.', tipo: 'ANALYTICS_VENDAS' };
        }
        const resposta = await processarAnalyticsVendas();
        return { success: true, resposta, tipo: 'ANALYTICS_VENDAS' };
      }

      if (fp.action === '@atualizar') {
        if (!temPermissao(clienteWhatsApp, 'ANALYTICS_ESTOQUE')) {
          return { success: false, resposta: '❌ Sem permissão para atualizar estoque.', tipo: 'ATUALIZAR_ESTOQUE' };
        }
        const matchAtualizar = mensagem.match(/@atualizar\s+(\w+)\s+(\w+)\s+([\w\s]+?)\s+(\d+)$/i);
        if (matchAtualizar) {
          const [, modelo, tamanho, cor, qtdStr] = matchAtualizar;
          const resposta = await processarAtualizarEstoque(modelo, tamanho, cor.trim(), parseInt(qtdStr));
          return { success: true, resposta, tipo: 'ATUALIZAR_ESTOQUE' };
        }
      }

      // Fast-path para confirmar_pagamento
      if (fp.action === 'confirmar_pagamento') {
        const { numero_pedido, forma_pagamento } = fp.dados;
        if (numero_pedido) {
          await sheetsPedidos.atualizarStatusPagamento(numero_pedido, 'PAGO', forma_pagamento || 'PENDENTE').catch(() => {});
          notificarClientePagamento(numero_pedido).catch(() => {});
          await sheetConversas.salvarContexto(clienteWhatsApp, { ...contexto, pagamento_confirmado: true }, 'FINALIZADA').catch(() => {});
          const formaStr = forma_pagamento ? ` no ${forma_pagamento}` : '';
          logger.info(`[FastPath] Pagamento confirmado #${numero_pedido} em ${Date.now() - inicio}ms`);
          return {
            success: true,
            resposta: `✅ Pagamento${formaStr} do pedido *#${numero_pedido}* confirmado! Obrigado 🙏`,
            tipo: 'CONFIRMAR_PAGAMENTO'
          };
        }
      }

      // Fast-path para atualizar_entrega
      if (fp.action === 'atualizar_entrega') {
        const { numero_pedido, tipo_entrega } = fp.dados;
        if (numero_pedido) {
          await sheetsPedidos.atualizarStatusEntrega(numero_pedido, tipo_entrega).catch(() => {});
          notificarClienteEntrega(numero_pedido, tipo_entrega).catch(() => {});
          const emoji = tipo_entrega === 'ENTREGUE' ? '✅' : '🏪';
          logger.info(`[FastPath] Entrega #${numero_pedido} em ${Date.now() - inicio}ms`);
          return {
            success: true,
            resposta: `${emoji} Pedido *#${numero_pedido}* marcado como ${tipo_entrega === 'ENTREGUE' ? 'entregue' : 'retirado'}!`,
            tipo: 'ATUALIZAR_ENTREGA'
          };
        }
      }
    }

    // 2. Detectar comandos @ específicos (alta prioridade)
    const tipoComando = detectarComandoAnalitics(mensagem);

    // Detecção por palavra-chave removida — Claude interpreta a intenção corretamente.

    // Completar pedido parcial (quando bot está esperando informação faltante)
    if (contexto.pedido_parcial && !tipoComando) {
      const parcial = contexto.pedido_parcial;
      const faltando = contexto.faltando || [];

      // Monta mensagem completa combinando o parcial com a resposta atual
      let mensagemCompleta = mensagem;

      if (faltando.includes('cliente_nome')) {
        // Extrai nome da resposta e injeta no parcial
        const nomeMatch = mensagem.match(/(?:pra\s+)?([A-Za-zÀ-ú]+)/i);
        const nome = nomeMatch?.[1] || mensagem.trim();
        if (parcial.itens?.length > 0) {
          const itensStr = parcial.itens.map(i => `${i.quantidade} ${i.modelo} ${i.tamanho} ${i.cor}`).join(' e ');
          mensagemCompleta = `${itensStr} pra ${nome}`;
        } else {
          mensagemCompleta = `${mensagem}`;
        }
      } else if (faltando.includes('itens')) {
        // Resposta tem os itens, cliente já está no parcial
        if (parcial.cliente_nome) mensagemCompleta = `${mensagem} pra ${parcial.cliente_nome}`;
      } else {
        // Tamanho/cor/modelo faltando — reconstrói com os dados do parcial + resposta
        const item = parcial.itens?.[0];
        if (item) {
          const modelo = item.modelo !== 'DESCONHECIDO' ? item.modelo : '';
          const tamanho = item.tamanho || mensagem.toUpperCase();
          const cor = item.cor || mensagem.toLowerCase();
          const cliente = parcial.cliente_nome || '';
          mensagemCompleta = `${item.quantidade || 1} ${modelo || mensagem} ${tamanho} ${cor} pra ${cliente}`.trim();
        }
      }

      logger.info(`[pedido_parcial] Completando com: "${mensagemCompleta}"`);

      // Limpa contexto parcial antes de tentar criar
      await sheetConversas.salvarContexto(clienteWhatsApp, {
        ...contexto, pedido_parcial: null, faltando: []
      }).catch(() => {});

      const resPedido = await pedidosService.processarMensagemPedido(mensagemCompleta, clienteWhatsApp);

      if (resPedido.pedido_parcial) {
        // Ainda falta algo — salva e pergunta de novo
        await sheetConversas.salvarContexto(clienteWhatsApp, {
          ...contexto, pedido_parcial: resPedido.pedido_parcial, faltando: resPedido.faltando || []
        }).catch(() => {});
      } else if (resPedido.success !== false && resPedido.numero_pedido) {
        await sheetConversas.salvarContexto(clienteWhatsApp, {
          numero_pedido_atual: resPedido.numero_pedido, historico: []
        }).catch(() => {});
      }

      return {
        success: resPedido.success !== false,
        resposta: resPedido.mensagem_usuario,
        tipo: 'NOVO_PEDIDO',
        numero_pedido: resPedido.numero_pedido
      };
    }

    // Captura de endereço (quando aguardando após criação de pedido de entrega)
    if (contexto.aguardando_endereco && mensagem.length > 5) {
      const numPedido = contexto.aguardando_endereco;
      await sheetsPedidos.atualizarEnderecoEntrega(numPedido, mensagem).catch(() => {});
      await sheetConversas.salvarContexto(clienteWhatsApp, {
        ...contexto, aguardando_endereco: null
      }).catch(() => {});
      return {
        success: true,
        resposta: `✅ Endereço salvo no pedido *#${numPedido}*!\n📍 ${mensagem}`,
        tipo: 'ENDERECO_ENTREGA'
      };
    }

    // Comando @pendentes — lista todos os pedidos em aberto
    if (/@pendentes|pendentes/i.test(mensagem.trim()) && tipoComando === null) {
      if (!temPermissao(clienteWhatsApp, 'ANALYTICS_VENDAS')) {
        return { success: false, resposta: '❌ Sem permissão para ver pedidos pendentes.', tipo: 'PENDENTES' };
      }
      return { success: true, resposta: await processarPendentes(), tipo: 'PENDENTES' };
    }

    // Comando @atualizar — atualiza quantidade do estoque
    // Formato: "@atualizar zara m preto 15" ou "@estoque atualizar zara m preto 15"
    const matchAtualizar = mensagem.match(/@atualizar\s+(\w+)\s+(\w+)\s+([\w\s]+?)\s+(\d+)$/i)
      || mensagem.match(/@estoque\s+atualizar\s+(\w+)\s+(\w+)\s+([\w\s]+?)\s+(\d+)$/i);
    if (matchAtualizar) {
      if (!temPermissao(clienteWhatsApp, 'ANALYTICS_ESTOQUE')) {
        return { success: false, resposta: '❌ Sem permissão para atualizar estoque.', tipo: 'ATUALIZAR_ESTOQUE' };
      }
      const [, modelo, tamanho, cor, qtdStr] = matchAtualizar;
      return { success: true, resposta: await processarAtualizarEstoque(modelo, tamanho, cor.trim(), parseInt(qtdStr)), tipo: 'ATUALIZAR_ESTOQUE' };
    }
    logger.info(`Tipo detectado: ${tipoComando || 'LIVRE'}`, {
      clienteWhatsApp,
      mensagem: mensagem.substring(0, 60)
    });

    // --- Bloco de comandos analytics (mantidos como estão) ---
    if (tipoComando === 'ANALYTICS_VENDAS') {
      if (!temPermissao(clienteWhatsApp, 'ANALYTICS_VENDAS')) {
        logger.warn(`[${clienteWhatsApp}] Acesso negado a ANALYTICS_VENDAS`);
        return {
          success: false,
          resposta: '❌ Você não tem permissão para acessar análises de vendas.',
          tipo: tipoComando,
          contextoAtualizado: false
        };
      }
      const resposta = await processarAnalyticsVendas();
      return { success: true, resposta, tipo: tipoComando, contextoAtualizado: false };
    }

    if (tipoComando === 'ANALYTICS_ESTOQUE') {
      if (!temPermissao(clienteWhatsApp, 'ANALYTICS_ESTOQUE')) {
        logger.warn(`[${clienteWhatsApp}] Acesso negado a ANALYTICS_ESTOQUE`);
        return {
          success: false,
          resposta: '❌ Você não tem permissão para acessar análises de estoque.',
          tipo: tipoComando,
          contextoAtualizado: false
        };
      }
      const resposta = await processarAnalyticsEstoque();
      return { success: true, resposta, tipo: tipoComando, contextoAtualizado: false };
    }

    if (tipoComando === 'ANALYTICS_RECOMENDACAO') {
      if (!temPermissao(clienteWhatsApp, 'ANALYTICS_RECOMENDACAO')) {
        logger.warn(`[${clienteWhatsApp}] Acesso negado a ANALYTICS_RECOMENDACAO`);
        return {
          success: false,
          resposta: '❌ Você não tem permissão para acessar recomendações de estoque.',
          tipo: tipoComando,
          contextoAtualizado: false
        };
      }
      const resposta = await processarAnalyticsRecomendacao(clienteWhatsApp);
      return { success: true, resposta, tipo: tipoComando, contextoAtualizado: false };
    }

    // --- Para TODAS as outras mensagens: Claude decide (com retry) ---
    const resultado = await processarComClaudeComRetry(mensagem, clienteWhatsApp, contexto);
    logger.info(`[Claude] action=${resultado.action} | ${clienteWhatsApp.slice(-4)} | ${Date.now() - inicio}ms | fastPath=${usouFastPath}`);

    switch (resultado.action) {
      case 'criar_pedido': {
        try {
          // Se Groq extraiu os itens no dados, reconstrói a mensagem para o interpreter
          let mensagemParaPedido = mensagem;
          if (resultado.dados?.itens?.length > 0 && resultado.dados?.nome_cliente) {
            // ── SANITIZAÇÃO ANTI-ALUCINAÇÃO ──────────────────────────────────
            // O LLM tem o vício de adicionar "marinho", "jeans", "com bege", etc.
            // Limpamos os complementos indevidos ANTES de passar ao banco.
            const sanitizarCor = (cor) => {
              if (!cor) return cor;
              // "Azul Jeans" é cor LEGÍTIMA do catálogo — não remover "jeans".
              return cor
                .replace(/[\s-]+marinho/ig, '') // "azul marinho"/"azul-marinho" → "azul"
                .replace(/[\s-]+escuro/ig, '')  // "azul escuro"  → "azul"
                .replace(/\s+com\s+\w+/ig, '')  // "preto com bege" → "preto"
                .trim();
            };

            resultado.dados.itens = resultado.dados.itens.map(i => {
              const corOriginal = i.cor;
              const corLimpa = sanitizarCor(i.cor);
              if (corOriginal !== corLimpa) {
                logger.info(`[sanitize] Cor corrigida: "${corOriginal}" → "${corLimpa}"`);
              }
              return { ...i, cor: corLimpa };
            });
            // ─────────────────────────────────────────────────────────────────

            const itensStr = resultado.dados.itens
              .map(i => `${i.quantidade} ${i.modelo} ${i.tamanho} ${i.cor}`)
              .join(' e ');
            mensagemParaPedido = `${itensStr} pra ${resultado.dados.nome_cliente}`;
            logger.info(`[criar_pedido] Mensagem reconstruída: "${mensagemParaPedido}"`);
          }
          const resPedido = await pedidosService.processarMensagemPedido(mensagemParaPedido, clienteWhatsApp);

          if (resPedido.success !== false && resPedido.numero_pedido) {
            // Pedido criado — limpa contexto de pedido parcial
            const novoCtx = { numero_pedido_atual: resPedido.numero_pedido, historico: [] };
            if (resPedido.aguardando_endereco) novoCtx.aguardando_endereco = resPedido.numero_pedido;
            sheetConversas.salvarContexto(clienteWhatsApp, novoCtx).catch(() => {});
          } else if (resPedido.pedido_parcial) {
            // Pedido incompleto — salva parcial e continua esperando
            sheetConversas.salvarContexto(clienteWhatsApp, {
              ...contexto,
              pedido_parcial: resPedido.pedido_parcial,
              faltando: resPedido.faltando || []
            }).catch(() => {});
          }

          return {
            success: resPedido.success !== false,
            resposta: resPedido.mensagem_usuario || resPedido.resposta || resultado.resposta,
            tipo: 'NOVO_PEDIDO',
            contextoAtualizado: false,
            numero_pedido: resPedido.numero_pedido
          };
        } catch (errPedido) {
          logger.error('[criar_pedido] Erro ao criar pedido:', errPedido.message);
          return {
            success: false,
            resposta: resultado.resposta || 'Tive um problema ao registrar o pedido. Pode tentar de novo? 🙏',
            tipo: 'NOVO_PEDIDO',
            erro: errPedido.message
          };
        }
      }

      case 'confirmar_pagamento': {
        const numeroPedido = resultado.dados?.numero_pedido || contexto.numero_pedido_atual;
        const formaPagamento = resultado.dados?.forma_pagamento || 'PENDENTE';

        if (numeroPedido) {
          // Atualiza no Sheets
          await sheetsPedidos.atualizarStatusPagamento(numeroPedido, 'PAGO', formaPagamento).catch(() => {});

          // Notifica o cliente automaticamente
          notificarClientePagamento(numeroPedido).catch(e =>
            logger.warn('[notificar] Erro ao notificar cliente:', e.message)
          );

          await sheetConversas.salvarContexto(clienteWhatsApp, {
            ...contexto, pagamento_confirmado: true, forma_pagamento: formaPagamento
          }, 'FINALIZADA').catch(() => {});
        }

        return { success: true, resposta: resultado.resposta, tipo: 'CONFIRMAR_PAGAMENTO' };
      }

      case 'saindo_entrega': {
        const numPedido = resultado.dados?.numero_pedido;
        const nomeCliente = resultado.dados?.nome_cliente;

        // Busca pedido por número ou por nome do cliente
        let pedidoAlvo = null;
        if (numPedido) {
          pedidoAlvo = await sheetsPedidos.findPorNumeroPedido(numPedido);
        } else if (nomeCliente) {
          const lista = await sheetsPedidos.buscarPedidosPorCliente(nomeCliente);
          // Pega o pendente mais recente
          pedidoAlvo = lista.find(p => p.status_entrega !== 'ENTREGUE' && p.status_entrega !== 'RETIRADA_NA_LOJA') || lista[0];
        }

        if (!pedidoAlvo) {
          return {
            success: false,
            resposta: numPedido
              ? `Não encontrei o pedido #${numPedido}. Confere o número?`
              : `Não encontrei pedido pendente para "${nomeCliente}". Confere o nome?`,
            tipo: 'SAINDO_ENTREGA'
          };
        }

        // Atualiza status para EM_TRANSITO no Sheets
        await sheetsPedidos.atualizarStatusEntrega(pedidoAlvo.numero_pedido, 'EM_TRANSITO').catch(() => {});

        // Notifica o cliente
        await notificarClienteSaindo(pedidoAlvo).catch(e =>
          logger.warn('[notificar] Erro ao notificar saindo:', e.message)
        );

        return {
          success: true,
          resposta: `🚚 Saindo para entregar pedido *#${pedidoAlvo.numero_pedido}* de *${pedidoAlvo.cliente_nome}*!\n\nCliente já foi avisado no WhatsApp. ✅`,
          tipo: 'SAINDO_ENTREGA'
        };
      }

      case 'atualizar_entrega': {
        const numPedido = resultado.dados?.numero_pedido;
        const tipoEntrega = resultado.dados?.tipo_entrega || 'ENTREGUE';

        if (numPedido) {
          const upd = await sheetsPedidos.atualizarStatusEntrega(numPedido, tipoEntrega);
          if (!upd.success) {
            return { success: false, resposta: `Não encontrei o pedido #${numPedido}. Confirma o número?`, tipo: 'ATUALIZAR_ENTREGA' };
          }

          // Notifica o cliente que o pedido foi entregue
          notificarClienteEntrega(numPedido, tipoEntrega).catch(e =>
            logger.warn('[notificar] Erro ao notificar entrega:', e.message)
          );
        }

        return { success: true, resposta: resultado.resposta, tipo: 'ATUALIZAR_ENTREGA' };
      }

      case 'buscar_cliente': {
        const nomeCliente = resultado.dados?.nome_cliente;
        if (!nomeCliente) {
          return { success: true, resposta: 'Qual o nome do cliente que você quer buscar?', tipo: 'BUSCAR_CLIENTE' };
        }

        const pedidos = await sheetsPedidos.buscarPedidosPorCliente(nomeCliente);
        const resposta = formatarPedidosCliente(nomeCliente, pedidos);
        return { success: true, resposta, tipo: 'BUSCAR_CLIENTE' };
      }

      case 'consultar_pedido': {
        return { success: true, resposta: resultado.resposta, tipo: 'CONSULTAR_PEDIDO' };
      }

      case 'listar_pedidos_abertos': {
        try {
          const pedidosAbertos = await sheetsPedidos.listarTodosPendentes();
          const resposta = formatarPedidosAbertos(pedidosAbertos);
          return { success: true, resposta, tipo: 'LISTAR_PEDIDOS' };
        } catch (err) {
          logger.error('[listar_pedidos_abertos] Erro:', err.message);
          return { success: false, resposta: 'Erro ao carregar pedidos em aberto. Tenta de novo?', tipo: 'LISTAR_PEDIDOS' };
        }
      }

      case 'listar_entregas_pendentes': {
        try {
          // Busca todos os pedidos não finalizados e filtra os pagos sem entrega
          const todos = await sheetsPedidos.listarTodosPendentes();
          const resposta = formatarEntregasPendentes(todos);
          logger.info(`[Claude] listar_entregas_pendentes — ${todos.length} pedido(s) pendentes`);
          return { success: true, resposta, tipo: 'LISTAR_ENTREGAS' };
        } catch (err) {
          logger.error('[listar_entregas_pendentes] Erro:', err.message);
          return { success: false, resposta: 'Erro ao consultar entregas pendentes. Tenta de novo?', tipo: 'LISTAR_ENTREGAS' };
        }
      }

      default: {
        // action = 'responder' ou qualquer outro valor
        return {
          success: true,
          resposta: resultado.resposta,
          tipo: 'LIVRE',
          contextoAtualizado: false
        };
      }
    }

  } catch (error) {
    logger.error('Erro ao processar mensagem com contexto:', error.message);
    return {
      success: false,
      resposta: 'Desculpe, ocorreu um erro. Tente novamente.',
      erro: error.message
    };
  }
}

// ---------------------------------------------------------------------------
// Detecção de comandos @ específicos (mínima, alta precisão)
// ---------------------------------------------------------------------------

/**
 * Detecta APENAS os comandos @ de analytics. Retorna null para todo o resto.
 */
function detectarComandoAnalitics(mensagem) {
  const msg = mensagem.toLowerCase().trim();

  if (/@(an[aá]lise|analysis|vendas)/.test(msg)) return 'ANALYTICS_VENDAS';
  if (/@estoque/.test(msg)) return 'ANALYTICS_ESTOQUE';
  if (/@(recomenda[cç][aã]o|recomendacao)/.test(msg)) return 'ANALYTICS_RECOMENDACAO';

  return null;
}

// ---------------------------------------------------------------------------
// Funções de analytics (preservadas do original)
// ---------------------------------------------------------------------------

/**
 * Processa comando @análise - retorna análise de vendas dos últimos 7 dias
 */
async function processarAnalyticsVendas() {
  try {
    logger.info('Processando comando @análise');
    const vendas = await analisarVendas(7);

    let mensagem = `📊 ANÁLISE DE VENDAS (ÚLTIMOS 7 DIAS)\n\n`;
    mensagem += `💰 TOTAL: R$ ${vendas.totalVendido.toLocaleString('pt-BR')}\n`;
    mensagem += `📋 PEDIDOS: ${vendas.quantidadePedidos}\n`;
    mensagem += `🎯 TICKET MÉDIO: R$ ${vendas.ticketMedio.toLocaleString('pt-BR')}\n\n`;

    if (vendas.maisVendidos && vendas.maisVendidos.length > 0) {
      mensagem += `🔥 MAIS VENDIDOS:\n`;
      vendas.maisVendidos.forEach((p, idx) => {
        mensagem += `   ${idx + 1}. ${p.modelo}: ${p.quantidade} un (R$ ${p.valor.toLocaleString('pt-BR')})\n`;
      });
    } else {
      mensagem += `Nenhuma venda nos últimos 7 dias.`;
    }

    return mensagem;
  } catch (error) {
    logger.error('Erro ao processar @análise:', error.message);
    return 'Erro ao gerar análise de vendas. Tente novamente.';
  }
}

/**
 * Processa comando @estoque - retorna recomendação de estoque
 */
async function processarAnalyticsEstoque() {
  try {
    logger.info('Processando comando @estoque');
    const recomendacao = await gerarRecomendacaoEstoque();

    if (recomendacao.success) {
      return recomendacao.mensagem;
    } else {
      return 'Erro ao gerar análise de estoque. Tente novamente.';
    }
  } catch (error) {
    logger.error('Erro ao processar @estoque:', error.message);
    return 'Erro ao gerar análise de estoque. Tente novamente.';
  }
}

/**
 * Processa comando @recomendação - retorna recomendação personalizada para cliente
 */
async function processarAnalyticsRecomendacao(clienteWhatsApp) {
  try {
    logger.info('Processando comando @recomendação para', { clienteWhatsApp });
    const recomendacao = await gerarRecomendacaoCliente(clienteWhatsApp);

    if (recomendacao.success) {
      return recomendacao.mensagem;
    } else {
      return recomendacao.mensagem;
    }
  } catch (error) {
    logger.error('Erro ao processar @recomendação:', error.message);
    return 'Erro ao gerar recomendação. Tente novamente.';
  }
}

// ---------------------------------------------------------------------------
// Saudação humanizada (preservada do original)
// ---------------------------------------------------------------------------

/**
 * Gera saudação humanizada com menu de opções baseado no perfil do usuário
 */
function gerarSaudacao(clienteWhatsApp) {
  const usuario = obterInfoUsuario(clienteWhatsApp);
  const nome = usuario.nome !== 'Cliente' ? usuario.nome : '';
  const isAdmin = usuario.role === ROLES.ADMIN;
  const isOperador = usuario.role === ROLES.OPERADOR;

  const saudacao = nome ? `Oi, ${nome}! 👋` : `Oi! 👋`;

  if (isAdmin || isOperador) {
    return [
      saudacao,
      '',
      'O que você precisa hoje?',
      '',
      '🛍️ *Novo pedido* — Ex: "2 zara m preto pra João"',
      '✅ *Confirmar pagamento* — Ex: "pedido 12 foi pago no pix"',
      '🚚 *Atualizar entrega* — Ex: "entregue pedido 5"',
      '🔍 *Pedidos de cliente* — Ex: "pedidos da maria"',
      '📋 *Pendentes* — digite @pendentes',
      '📊 *Estoque* — @estoque | 📈 *Vendas* — @análise',
      '',
      '_Ou é só digitar direto que eu entendo!_'
    ].join('\n');
  } else {
    return [
      saudacao,
      '',
      'Seja bem-vindo(a) à *Pluma Pijamas*! 🌙',
      '',
      'Como posso te ajudar?',
      '',
      '🛍️ Fazer um pedido',
      '📦 Ver status do meu pedido',
      '❓ Tirar uma dúvida',
      '',
      '_Pode digitar o que precisar!_'
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Atualização de estoque via WhatsApp
// ---------------------------------------------------------------------------

/**
 * Atualiza quantidade de um SKU via WhatsApp
 * Uso: @atualizar zara m preto 15
 */
async function processarAtualizarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    const modeloUp = modelo.toUpperCase();
    const tamanhoUp = tamanho.toUpperCase();
    const corLower = cor.toLowerCase()
      .replace(/azul$/i, 'azul marinho')
      .replace(/marinho/i, '')
      .replace('azul marinho marinho', 'azul marinho')
      .trim();

    const resultado = await sheetsEstoque.atualizarQuantidadeTotal(modeloUp, tamanhoUp, corLower, quantidade);

    if (resultado?.success !== false) {
      return `✅ Estoque atualizado!\n*${modeloUp} ${tamanhoUp} ${corLower}*: ${quantidade} unidades`;
    }
    return `❌ Não encontrei *${modeloUp} ${tamanhoUp} ${corLower}* no estoque. Verifique o nome e tente de novo.`;
  } catch (error) {
    logger.error('[processarAtualizarEstoque] Erro:', error.message);
    return '❌ Erro ao atualizar estoque. Tente de novo.';
  }
}

/**
 * ⭐ NOVO: Consulta estoque REAL no banco de dados (não inventa informações)
 * Extrai modelo/cor/tamanho da pergunta e retorna apenas o que existe
 * Exemplos:
 *   "tem algum pijama na cor cinza tamanho p?" → procura ZARA/MIA/etc cinza P
 *   "temos azul marinho?" → lista tudo em azul marinho
 *   "existe ZARA?" → lista todas as cores/tamanhos da ZARA
 */
// Normaliza string: lowercase + remove acentos (para comparação fuzzy)
function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function consultarEstoqueReal(criterio) {
  try {
    const tamanhos = ['p', 'm', 'g', 'gg'];

    // Modelos lidos do banco em tempo real — nunca hardcoded
    const estoqueCompleto = await sheetsEstoque.readAllEstoque();
    if (!estoqueCompleto || estoqueCompleto.length === 0) {
      return 'Desculpe, não consegui consultar o estoque neste momento. Tenta de novo?';
    }

    const modelosBanco = [...new Set(estoqueCompleto.map(i => i.modelo))];
    const coresBanco   = [...new Set(estoqueCompleto.map(i => i.cor))];

    const criterioNorm = normStr(criterio);

    // Filtrar por critério — comparação case-insensitive e sem acento
    const resultados = estoqueCompleto.filter(item => {
      const modeloMatch = modelosBanco.some(m => criterioNorm.includes(normStr(m)) && normStr(item.modelo) === normStr(m));
      const corMatch    = coresBanco.some(c => criterioNorm.includes(normStr(c)) && normStr(item.cor).includes(normStr(c)));
      const tamanhoMatch = tamanhos.some(t => criterioNorm.includes(t) && item.tamanho.toLowerCase() === t);

      if (!modeloMatch && !corMatch && !tamanhoMatch) return item.quantidade_disponivel > 0;
      return (modeloMatch || corMatch || tamanhoMatch) && item.quantidade_disponivel > 0;
    });

    // Nenhum resultado encontrado
    if (resultados.length === 0) {
      let naoTemQue = criterio;
      for (const m of modelosBanco) {
        if (criterioNorm.includes(normStr(m))) { naoTemQue = m; break; }
      }
      const disponiveis = modelosBanco.join(', ');
      return `Não temos *${naoTemQue}* disponível no momento.\nModelos em estoque: ${disponiveis} 🙏`;
    }

    // Formatar resposta: agrupar por modelo → cor
    const mapa = {};
    for (const item of resultados) {
      const modelo = item.modelo.toUpperCase();
      const cor = item.cor.toUpperCase();

      if (!mapa[modelo]) mapa[modelo] = {};
      if (!mapa[modelo][cor]) mapa[modelo][cor] = [];
      mapa[modelo][cor].push(`${item.tamanho}=${item.quantidade_disponivel}`);
    }

    // Montar mensagem
    const linhas = ['✅ *Temos disponível:*\n'];
    for (const modelo of Object.keys(mapa).sort()) {
      const parteCores = [];
      for (const cor of Object.keys(mapa[modelo]).sort()) {
        const tamanhosStr = mapa[modelo][cor].join(', ');
        parteCores.push(`${cor}: ${tamanhosStr}`);
      }
      linhas.push(`*${modelo}*`);
      for (const parte of parteCores) {
        linhas.push(`  ${parte}`);
      }
      linhas.push('');
    }

    linhas.push('_Qual você prefere?_');
    return linhas.join('\n').trim();

  } catch (error) {
    logger.error('[consultarEstoqueReal] Erro:', error.message);
    return 'Desculpe, tive um problema ao consultar o estoque. Tenta de novo? 🙏';
  }
}

// ---------------------------------------------------------------------------
// Histórico de conversa
// ---------------------------------------------------------------------------

/**
 * Salva a troca atual no histórico do contexto.
 * Mantém no máximo 8 mensagens (4 trocas) para não sobrecarregar tokens.
 */
async function salvarHistorico(clienteWhatsApp, contextoAtual, mensagemUsuario, respostaBot) {
  try {
    const historico = [...(contextoAtual?.historico || [])];

    historico.push({ role: 'user', content: mensagemUsuario });
    historico.push({ role: 'assistant', content: respostaBot });

    // Manter apenas as últimas 8 mensagens (4 trocas)
    const historicoRecente = historico.slice(-8);

    const novoContexto = {
      ...contextoAtual,
      historico: historicoRecente,
      ultima_atividade: new Date().toISOString()
    };
    delete novoContexto.historico; // remove temporariamente para não duplicar
    novoContexto.historico = historicoRecente;

    await sheetConversas.salvarContexto(clienteWhatsApp, novoContexto);
  } catch (e) {
    logger.debug('[historico] Erro ao salvar histórico:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Funções auxiliares: pendentes, busca, notificações
// ---------------------------------------------------------------------------

/**
 * Processa @pendentes — lista todos os pedidos em aberto formatados para WhatsApp
 */
async function processarPendentes() {
  try {
    const pendentes = await sheetsPedidos.listarTodosPendentes();

    if (pendentes.length === 0) {
      return '✅ Nenhum pedido pendente no momento!';
    }

    const linhas = [`📋 *PEDIDOS PENDENTES (${pendentes.length})*\n`];

    for (const p of pendentes) {
      const pago = p.status_pagamento === 'PAGO' ? '✅ Pago' : '⏳ Aguard. pagto';
      const entregaStatus = p.status_entrega === 'EM_TRANSITO' ? '🚚 A caminho!' : (p.tipo_entrega === 'RETIRADA' ? '🏪 Retirada' : '📦 Pendente');
      const entrega = entregaStatus;
      linhas.push(
        `*#${p.numero_pedido}* — ${p.cliente_nome}`,
        `${p.descricao_pedido}`,
        `R$ ${p.valor_total.toFixed(2)} | ${pago} | ${entrega}`,
        ''
      );
    }

    return linhas.join('\n').trim();
  } catch (error) {
    logger.error('[processarPendentes] Erro:', error.message);
    return 'Erro ao buscar pendentes. Tenta de novo?';
  }
}

/**
 * Formata lista de pedidos de um cliente para WhatsApp
 */
function formatarPedidosCliente(nome, pedidos) {
  if (pedidos.length === 0) {
    return `Não encontrei pedidos para "${nome}". Confere o nome?`;
  }

  const linhas = [`🔍 *Pedidos de ${pedidos[0].cliente_nome} (${pedidos.length} no total)*\n`];

  for (const p of pedidos) {
    const pago = p.status_pagamento === 'PAGO' ? '✅' : '⏳';
    const entregue = p.status_entrega === 'ENTREGUE' || p.status_entrega === 'RETIRADA_NA_LOJA' ? '📦 Entregue' : '🚚 Pendente';
    linhas.push(
      `*#${p.numero_pedido}* ${pago} ${entregue}`,
      `${p.descricao_pedido}`,
      `R$ ${p.valor_total.toFixed(2)}`,
      ''
    );
  }

  return linhas.join('\n').trim();
}

/**
 * Formata lista de TODOS os pedidos em aberto (com números para referência)
 * Mostra pedidos que ainda não foram entregues/retirados
 */
/**
 * Formata lista de entregas pendentes para WhatsApp.
 * Mostra apenas pedidos PAGOS que ainda não foram entregues — o que de fato precisa sair.
 */
function formatarEntregasPendentes(pedidos) {
  // Filtrar: pagos e não entregues
  const paraEntregar = pedidos.filter(p =>
    p.status_pagamento === 'PAGO' &&
    p.status_entrega !== 'ENTREGUE' &&
    p.status_entrega !== 'RETIRADA_NA_LOJA'
  );

  if (paraEntregar.length === 0) {
    return '✅ *Nenhuma entrega pendente!*\nTodos os pedidos pagos já foram entregues ou retirados. 🙌';
  }

  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const linhas = [`🚚 *${paraEntregar.length} Entrega(s) Pendente(s)*\n`];

  for (let i = 0; i < paraEntregar.length; i++) {
    const p = paraEntregar[i];
    const num = i < emojis.length ? emojis[i] : `${i + 1}.`;

    // Formatar itens
    let itensStr = p.descricao_pedido || '—';
    try {
      const itens = JSON.parse(p.itens_json || '[]');
      if (itens.length > 0) {
        itensStr = itens.map(it => `${it.quantidade}x ${it.modelo} ${it.tamanho} ${it.cor}`).join(', ');
      }
    } catch (_) {}

    const tipoEntrega = p.tipo_entrega === 'RETIRADA' ? '🏪 Retirada' : '🚚 Entrega';
    const endereco = p.endereco_entrega ? `\n   📍 ${p.endereco_entrega}` : '';

    linhas.push(
      `${num} *Pedido #${String(p.numero_pedido).padStart(3,'0')}* — ${p.cliente_nome}`,
      `   📦 ${itensStr}`,
      `   💰 R$ ${Number(p.valor_total).toFixed(2)} | ${tipoEntrega}${endereco}`,
      ''
    );
  }

  linhas.push(`💬 Para marcar como entregue: "entregue pedido 001"`);
  return linhas.join('\n').trim();
}

function formatarPedidosAbertos(pedidos) {
  if (pedidos.length === 0) {
    return `✅ Nenhum pedido em aberto! Tá tudo quitado e entregue.`;
  }

  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const linhas = [`📋 *${pedidos.length} Pedido(s) em Aberto*\n`];

  for (let i = 0; i < pedidos.length; i++) {
    const p = pedidos[i];
    const pago = p.status_pagamento === 'PAGO' ? '✅ PAGO' : '⏳ PENDENTE';
    const entregue = p.status_entrega === 'ENTREGUE' || p.status_entrega === 'RETIRADA_NA_LOJA' ? '📦 Entregue' : '🚚 PENDENTE ENTREGA';

    // Use emoji numbers or numeric index
    const numero = (i < emojis.length) ? emojis[i] : `${i + 1}.`;

    linhas.push(
      `${numero} *Pedido #${String(p.numero_pedido).padStart(3, '0')}* — ${p.cliente_nome}`,
      `   ${p.descricao_pedido}`,
      `   💰 R$ ${Number(p.valor_total).toFixed(2)} | ${pago} | ${entregue}`,
      ''
    );
  }

  linhas.push(`💬 Use o número do pedido para editar: "pago 001", "entregar 002", etc.`);

  return linhas.join('\n').trim();
}

/**
 * Notifica o cliente via WhatsApp quando o pagamento for confirmado
 */
async function notificarClientePagamento(numeroPedido) {
  const pedido = await sheetsPedidos.findPorNumeroPedido(numeroPedido);
  if (!pedido?.cliente_whatsapp) return;

  const msg = [
    `✅ *Pagamento confirmado!*`,
    ``,
    `Olá${pedido.cliente_nome ? ', ' + pedido.cliente_nome : ''}! 😊`,
    `Recebemos seu pagamento do pedido *#${numeroPedido}*.`,
    ``,
    `📦 ${pedido.descricao_pedido}`,
    `💰 R$ ${Number(pedido.valor_total).toFixed(2)}`,
    ``,
    `Em breve você receberá a confirmação da entrega. Obrigada! 🌙`
  ].join('\n');

  await enviarMensagem(pedido.cliente_whatsapp, msg);
  logger.info(`[notificar] Cliente ${pedido.cliente_whatsapp} notificado — pagamento #${numeroPedido}`);
}

/**
 * Notifica o cliente que o pedido está a caminho
 */
async function notificarClienteSaindo(pedido) {
  if (!pedido?.cliente_whatsapp) return;

  const msg = [
    `🚚 *Seu pedido está a caminho!*`,
    ``,
    `Olá${pedido.cliente_nome ? ', ' + pedido.cliente_nome : ''}! 😊`,
    `Estamos saindo agora para entregar seu pedido *#${pedido.numero_pedido}*.`,
    ``,
    `📦 ${pedido.descricao_pedido || ''}`,
    ``,
    `Fique de olho! Chegamos em breve. 🌙`
  ].join('\n');

  await enviarMensagem(pedido.cliente_whatsapp, msg);
  logger.info(`[notificar] Cliente ${pedido.cliente_whatsapp} notificado — saindo entrega #${pedido.numero_pedido}`);
}

/**
 * Notifica o cliente via WhatsApp quando o pedido for entregue/retirado
 */
async function notificarClienteEntrega(numeroPedido, tipoEntrega) {
  const pedido = await sheetsPedidos.findPorNumeroPedido(numeroPedido);
  if (!pedido?.cliente_whatsapp) return;

  const acao = tipoEntrega === 'RETIRADA_NA_LOJA' ? 'retirado na loja' : 'entregue';
  const emoji = tipoEntrega === 'RETIRADA_NA_LOJA' ? '🏪' : '🚚';

  const msg = [
    `${emoji} *Pedido ${acao}!*`,
    ``,
    `Olá${pedido.cliente_nome ? ', ' + pedido.cliente_nome : ''}! 😊`,
    `Seu pedido *#${numeroPedido}* foi ${acao} com sucesso.`,
    ``,
    `📦 ${pedido.descricao_pedido}`,
    ``,
    `Obrigada pela preferência! Esperamos que aproveite muito 🌙`
  ].join('\n');

  await enviarMensagem(pedido.cliente_whatsapp, msg);
  logger.info(`[notificar] Cliente ${pedido.cliente_whatsapp} notificado — entrega #${numeroPedido}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  processarMensagemComContexto,
  detectarComandoAnalitics,
  processarComClaude,
  gerarResumoEstoque,
  processarAnalyticsVendas,
  processarAnalyticsEstoque,
  processarAnalyticsRecomendacao,
  gerarSaudacao
};
