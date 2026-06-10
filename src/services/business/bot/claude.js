// ============================================================================
// claude.js — chamada à IA, retry e fallback
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
import { gerarResumoEstoque, gerarListaPlanaEstoque, gerarSaudacao } from './formatters.js';
import { salvarHistorico } from './historico.js';

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

   🚫 NÃO É VENDA — RETIRADA / CONSUMO INTERNO DOS SÓCIOS:
   Se a mensagem for retirada/uso interno/consumo dos sócios (ex: "retirada 1 anne p bordô para jully",
   "uso interno", "consumo interno", "tira pra loja"), NÃO crie pedido e NÃO cobre preço.
   Use action "responder" com: "Para retirada interna (sem cobrança), digite: retirada [qtd] [modelo] [tamanho] [cor] para [nome]".

   🚫 NÃO É VENDA — CONSULTA DE PREÇO: "quanto custa/fica/vale 4 luna", "preço de 3 zara" → NÃO crie pedido,
   NÃO valide cor/tamanho. Use action "responder" (o sistema calcula o preço base × quantidade).

   🛒 CARRINHO (MESMO CLIENTE = UM PEDIDO): se a mensagem tiver VÁRIOS itens para o MESMO cliente,
   agrupe TODOS em UM único criar_pedido, preenchendo dados.itens com o ARRAY completo.
   Ex: "1 luna g chocolate pra Karine, 1 luna g bordo pra Karine" →
   UM pedido, dados.nome_cliente="Karine", dados.itens=[{luna g chocolate}, {luna g bordo}].
   Só crie pedidos separados se os CLIENTES forem diferentes.

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

10. "consulta_historico" — resumo dos ÚLTIMOS pedidos (já pagos OU cancelados)
   Exemplos: "manda o resumo dos últimos pedidos", "histórico de pedidos",
             "últimos 10 pedidos", "últimos cancelados", "pedidos cancelados"
   → Default = pagos. Se mencionar "cancelado(s)" = cancelados. O sistema busca e formata.
   ATENÇÃO: diferente de "listar_pedidos_abertos" (que mostra pendentes/em aberto).

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

export { sanitizarParaWhatsApp, processarComClaude, responderSemClaude, processarComClaudeComRetry };
