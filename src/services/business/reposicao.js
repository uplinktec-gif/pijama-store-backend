/**
 * src/services/business/reposicao.js
 *
 * Sugestão de Reposição com Curva ABC (giro de 30 dias).
 * Regra:
 *   - ALTO GIRO  (> 10 un/30d): alerta quando disponível <= 5
 *   - BAIXO GIRO (<= 10 un/30d): alerta apenas quando zerar (disponível <= 0)
 *
 * Somente leitura. Reaproveita o estoque e os pedidos pagos do SQLite.
 */
import { query } from '../../config/database.js';
import { readAllEstoque } from '../sqlite/estoque.js';
import { logger } from '../../utils/logger.js';

const LIMIAR_ALTO_GIRO = 10;   // > 10 un nos últimos 30 dias = alto giro
const GATILHO_ALTO = 5;        // alto giro alerta com <= 5 disponíveis
const GATILHO_BAIXO = 0;       // baixo giro alerta só ao zerar

/** Normaliza modelo: maiúsculas sem acento (para casar estoque × vendas). */
function normModelo(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/**
 * Calcula o giro (unidades vendidas) por modelo nos últimos `dias` dias,
 * a partir dos pedidos PAGOS (itens_json).
 * @returns {Map<string, number>} modeloNorm -> unidades
 */
function calcularGiroPorModelo(dias = 30) {
  const corte = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();
  const pagos = query(
    `SELECT itens_json FROM pedidos
      WHERE status_pagamento = 'PAGO'
        AND COALESCE(data_pagamento, data_pedido) >= ?`,
    [corte]
  );
  const giro = new Map();
  for (const p of pagos) {
    try {
      const itens = JSON.parse(p.itens_json || '[]');
      for (const it of itens) {
        const m = normModelo(it.modelo);
        if (!m) continue;
        giro.set(m, (giro.get(m) || 0) + (Number(it.quantidade) || 1));
      }
    } catch (_) {}
  }
  return giro;
}

/**
 * Analisa a reposição cruzando giro × estoque atual.
 * @returns {Promise<{alaltos:Array, zerados:Array, total:number}>}
 */
export async function analisarReposicao() {
  const giro = calcularGiroPorModelo(30);
  const estoque = await readAllEstoque();

  const altos = [];   // alto giro com estoque baixo (≤5)
  const zerados = [];  // baixo giro zerado

  for (const sku of estoque) {
    const disp = sku.quantidade_disponivel ?? (sku.quantidade_total - sku.quantidade_reservada);
    const g = giro.get(normModelo(sku.modelo)) || 0;
    const altoGiro = g > LIMIAR_ALTO_GIRO;

    if (altoGiro && disp <= GATILHO_ALTO) {
      const sugestao = Math.max(Math.ceil(g) - disp, 1); // cobrir ~1 mês de giro
      altos.push({
        modelo: sku.modelo, tamanho: sku.tamanho, cor: sku.cor,
        disponivel: disp, giro30d: g, sugestao
      });
    } else if (!altoGiro && disp <= GATILHO_BAIXO) {
      zerados.push({
        modelo: sku.modelo, tamanho: sku.tamanho, cor: sku.cor,
        disponivel: disp, giro30d: g
      });
    }
  }

  // ordenar altos por urgência (menor disponível, maior giro)
  altos.sort((a, b) => (a.disponivel - b.disponivel) || (b.giro30d - a.giro30d));
  zerados.sort((a, b) => b.giro30d - a.giro30d);

  return { altos, zerados, total: altos.length + zerados.length };
}

/**
 * Mensagem WhatsApp da sugestão de reposição.
 */
export async function gerarMensagemReposicao() {
  try {
    const { altos, zerados, total } = await analisarReposicao();
    if (total === 0) {
      return '✅ *Reposição* — Estoque saudável. Nada crítico para comprar agora. 👍';
    }
    const linhas = ['📦 *SUGESTÃO DE REPOSIÇÃO* _(giro 30 dias)_\n'];

    if (altos.length) {
      linhas.push('🔴 *ALTO GIRO — comprar já (≤5 un):*');
      for (const a of altos) {
        linhas.push(`• *${a.modelo} ${a.tamanho} ${a.cor}* — ${a.disponivel} un · giro ${a.giro30d}/mês → comprar ~${a.sugestao}`);
      }
      linhas.push('');
    }
    if (zerados.length) {
      linhas.push('🟡 *ZERADOS (baixo giro):*');
      for (const z of zerados) {
        linhas.push(`• ${z.modelo} ${z.tamanho} ${z.cor} — 0 un · giro ${z.giro30d}/mês`);
      }
    }
    return linhas.join('\n').trim();
  } catch (error) {
    logger.error('[reposicao] Erro ao gerar mensagem:', error.message);
    return '⚠️ Não consegui calcular a reposição agora. Tente de novo.';
  }
}
