/**
 * src/routes/ai-dashboard.routes.js
 *
 * IA Diretor de Operações (COO) — chat protegido para o painel admin.
 *
 * Injeta o estado real do banco (estoque crítico, top vendidos, vendas do mês)
 * como contexto no system prompt, antes de chamar o Claude.
 *
 * Endpoint: POST /api/ai-dashboard/chat
 * Body: { pergunta: string, historico?: [{role:'user'|'assistant', content:string}] }
 */
import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { query } from '../config/database.js';
import { callAI } from '../config/claude.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const router = Router();

// Rate limit simples em memória (proteção de custo)
// 30 perguntas/hora por IP — descarta automaticamente após 1h
const rateMap = new Map();
function rateLimitOk(ip) {
  const now = Date.now();
  const HORA = 60 * 60 * 1000;
  const arr = (rateMap.get(ip) || []).filter(t => now - t < HORA);
  if (arr.length >= 30) return false;
  arr.push(now);
  rateMap.set(ip, arr);
  return true;
}

/**
 * Coleta o snapshot real do banco para alimentar o COO.
 * Tudo é resumido em markdown para a IA ler com clareza.
 */
function coletarContextoOperacional() {
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── 1. Estoque crítico (disponível ≤ 3) ──────────────────────────────────
  const criticos = query(`
    SELECT modelo, tamanho, cor, preco_unitario,
           (quantidade_total - quantidade_reservada) AS disponivel
      FROM estoque
     WHERE UPPER(status) = 'ATIVO' AND (quantidade_total - quantidade_reservada) <= 3
     ORDER BY disponivel ASC, modelo, tamanho
     LIMIT 50
  `);

  // ── 2. Top 5 modelos mais vendidos nos últimos 30 dias ───────────────────
  // Strategy: parsear itens_json dos pedidos PAGOS dos últimos 30 dias
  const agora = new Date();
  const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 3600 * 1000 - 4 * 3600 * 1000);
  const corteISO = trintaDiasAtras.toISOString();

  const pedidosPagos = query(`
    SELECT itens_json, valor_total, data_pedido
      FROM pedidos
     WHERE status_pagamento = 'PAGO' AND data_pedido >= ?
  `, [corteISO]);

  const contadorModelos = {};
  let totalUnidadesVendidas = 0;
  for (const ped of pedidosPagos) {
    try {
      const itens = JSON.parse(ped.itens_json || '[]');
      for (const it of itens) {
        const m = (it.modelo || '').toUpperCase();
        const qtd = Number(it.quantidade) || 0;
        if (!m) continue;
        contadorModelos[m] = (contadorModelos[m] || 0) + qtd;
        totalUnidadesVendidas += qtd;
      }
    } catch (_) {}
  }
  const topVendidos = Object.entries(contadorModelos)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([modelo, qtd]) => ({ modelo, vendidos_30d: qtd }));

  // ── 3. Vendas mês (em Boa Vista UTC-4) ───────────────────────────────────
  const hojeStr = new Date(Date.now() - 4 * 3600 * 1000).toISOString().split('T')[0];
  const mesStr  = hojeStr.substring(0, 8) + '01';
  const FMT     = "strftime('%Y-%m-%d', data_pedido, '-4 hours')";

  const vMes = query(
    `SELECT COALESCE(SUM(valor_total),0) AS total, COUNT(*) AS pedidos
       FROM pedidos WHERE status_pagamento = 'PAGO' AND ${FMT} >= ?`,
    [mesStr]
  );
  const vHoje = query(
    `SELECT COALESCE(SUM(valor_total),0) AS total, COUNT(*) AS pedidos
       FROM pedidos WHERE status_pagamento = 'PAGO' AND ${FMT} = ?`,
    [hojeStr]
  );

  // ── 4. Pedidos pendentes ─────────────────────────────────────────────────
  const pendentes = query(
    `SELECT COUNT(*) AS qtd FROM pedidos
      WHERE status_entrega NOT IN ('ENTREGUE','RETIRADA_NA_LOJA')`
  );
  const aguardandoPag = query(
    `SELECT COUNT(*) AS qtd FROM pedidos
      WHERE status_pagamento != 'PAGO'`
  );

  // ── 5. Resumo do estoque total ───────────────────────────────────────────
  const estoque = query(
    `SELECT COUNT(*) AS skus,
            COALESCE(SUM(quantidade_total - quantidade_reservada),0) AS pecas
       FROM estoque WHERE UPPER(status) = 'ATIVO'`
  );

  // ── Monta markdown ───────────────────────────────────────────────────────
  let md = `## SNAPSHOT OPERACIONAL — ${agora.toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' })}\n\n`;

  md += `### Indicadores principais\n`;
  md += `- Vendas hoje (PAGO): R$ ${fmt(vHoje[0]?.total)} em ${vHoje[0]?.pedidos || 0} pedido(s)\n`;
  md += `- Vendas mês corrente (PAGO): R$ ${fmt(vMes[0]?.total)} em ${vMes[0]?.pedidos || 0} pedido(s)\n`;
  md += `- Pedidos pendentes de entrega: ${pendentes[0]?.qtd || 0}\n`;
  md += `- Pedidos aguardando pagamento: ${aguardandoPag[0]?.qtd || 0}\n`;
  md += `- Estoque total ativo: ${estoque[0]?.skus || 0} SKUs · ${estoque[0]?.pecas || 0} peças\n`;
  md += `- Unidades vendidas nos últimos 30 dias: ${totalUnidadesVendidas}\n\n`;

  md += `### Top 5 modelos vendidos (últimos 30 dias)\n`;
  if (topVendidos.length === 0) {
    md += `_Nenhuma venda PAGO nos últimos 30 dias._\n\n`;
  } else {
    md += `| Modelo | Unidades vendidas |\n|---|---|\n`;
    for (const t of topVendidos) md += `| ${t.modelo} | ${t.vendidos_30d} |\n`;
    md += `\n`;
  }

  md += `### Estoque crítico (≤ 3 unidades disponíveis)\n`;
  if (criticos.length === 0) {
    md += `_Nenhum item em estoque crítico — situação confortável._\n\n`;
  } else {
    md += `| Modelo | Tamanho | Cor | Disponível | Preço |\n|---|---|---|---|---|\n`;
    for (const c of criticos) {
      md += `| ${c.modelo} | ${c.tamanho} | ${c.cor} | ${c.disponivel} | R$ ${fmt(c.preco_unitario)} |\n`;
    }
    md += `\n`;
  }

  md += `### Catálogo de preços oficial\n`;
  const precos = env.modeloPrecos || {};
  for (const [m, p] of Object.entries(precos)) md += `- ${m}: R$ ${fmt(p)}\n`;

  return md;
}

const SYSTEM_PROMPT_BASE = `Você é o **COO (Diretor de Operações)** da Pluma Pijamas — loja de pijamas femininos em Boa Vista-RR.

REGRAS RÍGIDAS:
1. Baseie TODAS as suas respostas **exclusivamente** no SNAPSHOT OPERACIONAL fornecido abaixo. Nunca invente números, modelos, cores ou preços que não estejam no contexto.
2. Se uma pergunta exigir dado que não está no snapshot, responda: "Não tenho essa informação no contexto atual."
3. Foque em recomendações **acionáveis**: o que pedir, em que quantidade, qual modelo está com giro alto e estoque baixo (prioridade de reposição), etc.
4. Seja direto, organizado e use Markdown (tabelas, listas, negrito). Mantenha respostas concisas — máximo ~10 linhas, exceto se a pergunta exigir relatório.
5. Quando sugerir reposição: compare giro (vendidos_30d) vs estoque atual. Itens com vendas altas e estoque crítico = prioridade máxima.
6. Valores em R$ formato pt-BR. Datas em pt-BR.
7. NÃO peça desculpas, NÃO use rodeios. Vá direto ao ponto.
8. NUNCA dê conselhos financeiros pessoais ou jurídicos — apenas operacionais sobre o estoque/vendas.

`;

/**
 * POST /api/ai-dashboard/chat
 */
router.post('/chat', adminAuth, async (req, res) => {
  try {
    const ip = (req.ip || '').replace('::ffff:', '');
    if (!rateLimitOk(ip)) {
      return res.status(429).json({ error: 'Limite de perguntas atingido — tente novamente em alguns minutos.' });
    }

    const { pergunta, historico = [] } = req.body || {};
    if (!pergunta || typeof pergunta !== 'string' || pergunta.trim().length === 0) {
      return res.status(400).json({ error: 'Pergunta vazia' });
    }
    if (pergunta.length > 2000) {
      return res.status(400).json({ error: 'Pergunta muito longa (máx 2000 caracteres)' });
    }

    // Coleta snapshot real do banco
    const contextoMd = coletarContextoOperacional();
    const systemPrompt = SYSTEM_PROMPT_BASE + '\n\n' + contextoMd;

    // Mantém apenas os últimos 6 turnos para controlar tokens
    const histLimpo = Array.isArray(historico)
      ? historico.slice(-6).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      : [];

    const t0 = Date.now();
    const resposta = await callAI(systemPrompt, pergunta, 1024, histLimpo);
    const ms = Date.now() - t0;

    logger.info(`[ai-dashboard] resposta gerada em ${ms}ms | pergunta: "${pergunta.substring(0, 60)}"`);

    return res.json({
      success: true,
      resposta,
      tempo_ms: ms
    });
  } catch (err) {
    logger.error('[ai-dashboard] Erro:', err.message);
    return res.status(500).json({ error: 'Erro ao processar pergunta. Tente novamente.' });
  }
});

export default router;
