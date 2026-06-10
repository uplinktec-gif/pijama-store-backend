// ============================================================================
// formatters.js — formatação de mensagens WhatsApp
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

// Formata a data de criação do pedido no fuso de Boa Vista (DD/MM HH:MM)
function formatarDataHoraBV(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '—';
  const data = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Boa_Vista', day: '2-digit', month: '2-digit' });
  const hora = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Boa_Vista', hour: '2-digit', minute: '2-digit' });
  return `${data} ${hora}`;
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
    const autor = p.criado_por || 'Sistema';

    linhas.push(
      `${numero} *Pedido #${String(p.numero_pedido).padStart(3, '0')}* — ${p.cliente_nome}`,
      `   📅 ${formatarDataHoraBV(p.data_pedido)} | 👤 Autor: ${autor}`,
      `   ${p.descricao_pedido}`,
      `   💰 R$ ${Number(p.valor_total).toFixed(2)} | ${pago} | ${entregue}`,
      ''
    );
  }

  linhas.push(`💬 Use o número do pedido para editar: "pago 001", "entregar 002", etc.`);

  return linhas.join('\n').trim();
}

/**
 * Resumo executivo de histórico de pedidos para o WhatsApp.
 * Conciso: 1 linha por pedido (SEM itens) + totalizador financeiro.
 * Formato: [✅|❌] #ID — Cliente — R$ Valor
 */
function formatarHistoricoPedidos(pedidos, cancelados, periodoLabel = null) {
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Data curta DD/MM no fuso de Boa Vista (economiza espaço na tela)
  const dataCurta = (iso) => {
    if (!iso) return '--/--';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--/--';
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Boa_Vista', day: '2-digit', month: '2-digit' });
  };

  const sufixoPeriodo = periodoLabel ? ` (${periodoLabel})` : '';
  if (!pedidos || pedidos.length === 0) {
    return cancelados
      ? `✅ Nenhum pedido cancelado${sufixoPeriodo}.`
      : `ℹ️ Nenhum pedido pago${sufixoPeriodo}.`;
  }

  const icone = cancelados ? '❌' : '✅';
  const tipo = cancelados ? 'CANCELADOS' : 'PAGOS';
  // Com período (data): "Pedidos PAGOS (desde 08/06)". Sem período: "Últimos N pedidos PAGOS".
  const titulo = periodoLabel
    ? `${icone} *Pedidos ${tipo} — ${periodoLabel}* (${pedidos.length})`
    : `${icone} *Últimos ${pedidos.length} pedidos ${tipo}*`;

  const linhas = [titulo, ''];
  let total = 0;
  for (const p of pedidos) {
    total += Number(p.valor_total) || 0;
    linhas.push(`${icone} #${String(p.numero_pedido).padStart(3, '0')} (${dataCurta(p.data_pedido)}) — ${p.cliente_nome || 'Cliente'} — R$ ${brl(p.valor_total)}`);
  }
  linhas.push('');
  linhas.push(`💰 *Total do Lote: R$ ${brl(total)}*`);
  return linhas.join('\n');
}

export { gerarResumoEstoque, gerarListaPlanaEstoque, formatarEstoqueWhatsApp, gerarSaudacao, formatarPedidosCliente, formatarEntregasPendentes, formatarPedidosAbertos, formatarHistoricoPedidos };
