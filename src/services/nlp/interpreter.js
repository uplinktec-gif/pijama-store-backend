import { callAI } from '../../config/claude.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

/**
 * Interpreta mensagem de pedido usando Claude API
 * Input: "2 zara g bordo 150 pra joão"
 * Output: { modelo, tamanho, cor, quantidade, valor_customizado, cliente_nome, cliente_whatsapp, ... }
 */
/**
 * Fallback: Interpreta pedido usando regex quando Claude não está disponível
 */
function interpretarPedidoFallback(mensagem, clienteWhatsApp) {
  try {
    // Regex para extrair padrões comuns
    // "2 zara g preto pra joao" -> { quantidade: 2, modelo: ZARA, tamanho: G, cor: preto, cliente_nome: joao }

    const models = env.catalogoModelos.map(m => m.toLowerCase());
    const sizes = env.catalogoTamanhos;
    const colors = env.catalogoCores.map(c => c.toLowerCase());

    // Tentar extrair quantidade (número no início)
    const qtdMatch = mensagem.match(/^(\d+)\s+/);
    const quantidade = qtdMatch ? parseInt(qtdMatch[1]) : 1;

    // Tentar extrair modelo
    let modelo = null;
    for (const m of models) {
      if (mensagem.toLowerCase().includes(m)) {
        modelo = m.toUpperCase();
        break;
      }
    }

    // Tentar extrair tamanho (case-insensitive)
    let tamanho = null;
    for (const s of sizes) {
      if (mensagem.toLowerCase().includes(s.toLowerCase())) {
        tamanho = s;
        break;
      }
    }

    // Tentar extrair cor
    let cor = null;
    const msgLower = mensagem.toLowerCase();
    logger.debug('Procurando cor em:', { msgLower, colors });
    for (const c of colors) {
      logger.debug(`Testando cor "${c}" em mensagem`);
      if (msgLower.includes(c)) {
        cor = c;
        logger.debug('Cor encontrada:', { cor });
        break;
      }
    }

    // Tentar extrair valor customizado (número seguido de "reais", "pila", "real")
    const valorMatch = mensagem.match(/(\d+)\s+(?:reais?|pila)/i);
    const valor_customizado = valorMatch ? parseInt(valorMatch[1]) : null;

    // Tentar extrair nome (palavra após "pra", "para", "pra ser para")
    const nomeMatch = mensagem.match(/(?:pra|para)\s+(\w+)/i);
    const cliente_nome = nomeMatch ? nomeMatch[1] : null;

    // Tentar extrair tipo de entrega
    let tipo_entrega = 'ENTREGA';
    if (/retirad|retire|loja|buscar/.test(mensagem)) {
      tipo_entrega = 'RETIRADA';
    }

    // Tentar extrair endereço (palavras-chave: rua, avenida, número)
    let endereco_entrega = null;
    if (/rua|avenida|av\.?|endereco|endereço|street|address/.test(mensagem)) {
      const enderecoMatch = mensagem.match(/(?:rua|avenida|av\.?|endereco|endereço)\s+([^,]+)/i);
      endereco_entrega = enderecoMatch ? enderecoMatch[1].trim() : null;
    }

    return {
      success: true,
      pedido: {
        quantidade,
        itens: [{ modelo: modelo || 'DESCONHECIDO', tamanho: tamanho || null, cor: cor || null, quantidade }],
        valor_customizado,
        cliente_nome,
        cliente_whatsapp: clienteWhatsApp,
        tipo_entrega,
        endereco_entrega: tipo_entrega === 'ENTREGA' ? (endereco_entrega || null) : null
      },
      faltando: !modelo || !tamanho || !cor ? ['modelo, tamanho ou cor não identificados'] : [],
      duvidas: []
    };
  } catch (error) {
    logger.error('Erro no fallback de interpretação:', error.message);
    return { success: false, error: 'Erro ao processar pedido' };
  }
}

async function interpretarPedido(mensagem, clienteWhatsApp, contextoAnterior = null) {
  try {
    // Sinônimos informais → cor do catálogo, ANTES do Claude interpretar.
    // O cliente fala "marrom"; o catálogo tem "Chocolate". Sem isso o Claude
    // devolve cor:null (não reconhece a cor) e o pedido fica incompleto.
    mensagem = (mensagem || '')
      .replace(/\bmarrom\b/gi, 'chocolate')
      .replace(/\bcaf[ée]\b/gi, 'chocolate');

    // Construir catálogo para o prompt
    const modelosList = env.catalogoModelos.join(', ');
    const tamanhosList = env.catalogoTamanhos.join(', ');
    const coresList = env.catalogoCores.join(', ');
    const modeloPrecos = JSON.stringify(env.modeloPrecos, null, 2);

    const systemPrompt = `Você é um assistente de loja de pijamas que interpreta pedidos em linguagem natural.

CATÁLOGO DISPONÍVEL:
- Modelos: ${modelosList}
- Tamanhos: ${tamanhosList}
- Cores: ${coresList}

PREÇOS POR MODELO:
${modeloPrecos}

INSTRUÇÕES:
1. Extraia do texto: modelo, tamanho, cor, quantidade
2. Se o preço for customizado (ex: "150 reais"), capture como valor_customizado
3. Se mencionar nome, extraia como cliente_nome
4. Se mencionar "retirada" ou "na loja", tipo_entrega = "RETIRADA", caso contrário = "ENTREGA"
5. Se mencionar endereço, extraia como endereco_entrega
6. Se o modelo não for mencionado mas for inferível pelo contexto, tente adivinhar
7. Se houver ambiguidade, marque como null para o sistema pedir clarificação

IMPORTANTE: Se a mensagem tiver múltiplos produtos (ex: "2 zara m preto e 1 mia g bordô pra joana"), extraia TODOS no array "itens" — não ignore nenhum produto.

FORMATO DE RESPOSTA (JSON):
{
  "sucesso": true/false,
  "erro": "mensagem se houver erro",
  "pedido": {
    "quantidade": número,
    "itens": [
      {
        "modelo": "MODELO_EM_MAIUSCULA",
        "tamanho": "TAMANHO",
        "cor": "cor em minúscula",
        "quantidade": número
      }
    ],
    "valor_customizado": número ou null,
    "cliente_nome": "nome ou null",
    "cliente_whatsapp": "número com +55 ou null",
    "tipo_entrega": "RETIRADA" ou "ENTREGA" ou null,
    "endereco_entrega": "endereço ou null",
    "observacoes": "notas adicionais ou null"
  },
  "faltando": ["campo1", "campo2"],
  "duvidas": ["dúvida1", "dúvida2"]
}`;

    const userMessage = `Mensagem do cliente: "${mensagem}"
WhatsApp do cliente: ${clienteWhatsApp}
${contextoAnterior ? `\nContexto anterior: ${JSON.stringify(contextoAnterior)}` : ''}

Interprete o pedido e retorne JSON.`;

    const responseText = await callAI(systemPrompt, userMessage, 1024);

    // Parse JSON da resposta
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Resposta da IA não contém JSON válido:', responseText);
      return interpretarPedidoFallback(mensagem, clienteWhatsApp);
    }

    const result = JSON.parse(jsonMatch[0]);

    // ── SANITIZAÇÃO IMEDIATA ──────────────────────────────────────────────────
    // Remove sufixos hallucinados ("azul marinho", "azul jeans", "azul com X")
    // ANTES de qualquer busca de SKU ou validação de estoque.
    // Sinônimos informais → cor oficial do catálogo (o cliente fala "marrom",
    // o catálogo tem "Chocolate"). Comparação sem acento/caixa.
    const SINONIMOS_COR = { marrom: 'Chocolate', cafe: 'Chocolate', 'café': 'Chocolate' };
    const sanitizarCorInterpreter = (cor) => {
      if (!cor) return cor;
      // "Azul Jeans" é cor legítima do catálogo — NÃO remover "jeans".
      // Apenas alucinações comuns: "marinho", "escuro/claro", "com X".
      let c = cor
        .replace(/[\s-]+marinho/ig, '')
        .replace(/[\s-]+escuro/ig, '')
        .replace(/[\s-]+claro/ig, '')
        .replace(/\s+com\s+\w+/ig, '')
        .trim();
      const chave = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (SINONIMOS_COR[chave]) c = SINONIMOS_COR[chave];
      return c;
    };
    if (result.pedido?.itens && Array.isArray(result.pedido.itens)) {
      result.pedido.itens.forEach(item => {
        const original = item.cor;
        item.cor = sanitizarCorInterpreter(item.cor);
        console.log(`[interpreter] Cor extraída: "${original}"${original !== item.cor ? ` → sanitizada: "${item.cor}"` : ' (sem alteração)'}`);
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!result.sucesso) {
      return {
        success: false,
        error: result.erro || 'Erro ao interpretar pedido',
        duvidas: result.duvidas,
        faltando: result.faltando
      };
    }

    // Adicionar WhatsApp do cliente se não foi extraído
    if (!result.pedido.cliente_whatsapp) {
      result.pedido.cliente_whatsapp = clienteWhatsApp;
    }

    logger.debug('Pedido interpretado:', result.pedido);

    return {
      success: true,
      pedido: result.pedido,
      faltando: result.faltando || [],
      duvidas: result.duvidas || []
    };
  } catch (error) {
    logger.error('Erro ao interpretar pedido com Claude:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Gera resposta humanizada para confirmação
 */
/**
 * Fallback: Gera resposta simples quando Claude não está disponível
 */
function gerarRespostaConfirmacaoFallback(pedido) {
  try {
    const itensStr = pedido.itens
      .map(item => `${item.quantidade}x ${item.modelo} ${item.tamanho} ${item.cor}`)
      .join(', ');

    const resposta = `Perfeito! Recebi seu pedido:\n${itensStr}\n\nVocê confirma?`;
    return { success: true, resposta };
  } catch (error) {
    logger.error('Erro no fallback de resposta:', error.message);
    return { success: false, error: 'Erro ao gerar resposta' };
  }
}

async function gerarRespostaConfirmacao(pedido, catalogo = null) {
  try {
    const pedidoJson = JSON.stringify(pedido, null, 2);

    const userMessage = `Gere uma resposta humanizada e amigável para confirmar este pedido de pijamas:

${pedidoJson}

A resposta deve:
1. Usar tom casual e amigável (estilo WhatsApp)
2. Confirmar os itens do pedido
3. Mencionar o valor total
4. Perguntar sobre detalhes faltando (tipo de entrega, endereço) se necessário
5. Manter máximo 3-4 linhas

Responda APENAS com a mensagem, sem explicações adicionais.`;

    const resposta = await callAI('', userMessage, 512);

    return { success: true, resposta };
  } catch (error) {
    logger.error('Erro ao gerar resposta de confirmação:', error.message);
    return gerarRespostaConfirmacaoFallback(pedido);
  }
}

/**
 * Gera resposta para pedido criado com sucesso
 */
async function gerarRespostaSucesso(numeroPedido, pedido, valorTotal) {
  try {
    const userMessage = `Gere uma resposta de confirmação para um pedido criado com sucesso:

Número do pedido: #${numeroPedido}
Cliente: ${pedido.cliente_nome || 'Cliente'}
Itens: ${pedido.quantidade} peça(s)
Valor total: R$ ${valorTotal.toFixed(2)}
Tipo de entrega: ${pedido.tipo_entrega || 'Pendente'}

A resposta deve:
1. Ser entusiasmada e profissional
2. Incluir o número do pedido destacado
3. Confirmar os detalhes principais
4. Explicar próximos passos (pagamento, entrega)
5. Oferecer disponibilidade para dúvidas
6. Máximo 5 linhas

Responda APENAS com a mensagem, sem explicações adicionais.`;

    const resposta = await callAI('', userMessage, 512);

    return { success: true, resposta };
  } catch (error) {
    logger.error('Erro ao gerar resposta de sucesso:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Interpreta atualização de status (pagamento, entrega, etc)
 */
async function interpretarStatusUpdate(mensagem, clienteWhatsApp) {
  try {
    const systemPrompt = `Você é um assistente que interpreta atualizações de status de pedidos.

TIPOS DE ATUALIZAÇÕES:
1. Pagamento: "pedido 123 foi pago no pix", "número do pedido 5 foi pago"
2. Entrega: "pedido 45 entregue", "número 10 foi retirado na loja"
3. Dúvidas sobre status: "qual é o status do pedido 7?"

RESPONDA EM JSON:
{
  "tipo": "pagamento" | "entrega" | "consulta" | "desconhecido",
  "numero_pedido": número ou null,
  "forma_pagamento": "PIX" | "CARTÃO" | "DINHEIRO" | null,
  "novo_status_entrega": "ENTREGUE" | "RETIRADA_NA_LOJA" | null,
  "sucesso": true/false,
  "erro": "mensagem se houver erro"
}`;

    const userMessage = `Mensagem: "${mensagem}"\nWhatsApp: ${clienteWhatsApp}\n\nInterprete e retorne JSON.`;

    const responseText = await callAI(systemPrompt, userMessage, 512);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'Não consegui interpretar a mensagem de status' };
    }

    const result = JSON.parse(jsonMatch[0]);
    return result;
  } catch (error) {
    logger.error('Erro ao interpretar atualização de status:', error.message);
    return { success: false, error: error.message };
  }
}

export {
  interpretarPedido,
  gerarRespostaConfirmacao,
  gerarRespostaSucesso,
  interpretarStatusUpdate
};
