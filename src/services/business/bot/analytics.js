// ============================================================================
// analytics.js — handlers dos comandos @ (vendas, estoque, etc.)
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

export { detectarComandoAnalitics, processarAnalyticsVendas, processarAnalyticsEstoque, processarAnalyticsRecomendacao, processarAtualizarEstoque, normStr, consultarEstoqueReal, processarPendentes };
