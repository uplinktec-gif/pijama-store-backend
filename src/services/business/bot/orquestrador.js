// ============================================================================
// orquestrador.js — ponto de entrada e dispatch de ações
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
import { fastPath, ehComando } from './fastpath.js';
import { processarRetiradaInterna } from './retiradaInterna.js';
import { tentarProcessarLote } from './lote.js';
import { processarComClaudeComRetry } from './claude.js';
import { detectarComandoAnalitics, processarAnalyticsVendas, processarAnalyticsEstoque, processarAnalyticsRecomendacao, processarAtualizarEstoque, consultarEstoqueReal, processarPendentes } from './analytics.js';
import { gerarResumoEstoque, gerarListaPlanaEstoque, formatarEstoqueWhatsApp, gerarSaudacao, formatarPedidosCliente, formatarEntregasPendentes, formatarPedidosAbertos, formatarHistoricoPedidos } from './formatters.js';
import { notificarClientePagamento, notificarClienteSaindo, notificarClienteEntrega } from './notificacoes.js';
import { salvarHistorico } from './historico.js';
import { iniciarBaixa, continuarBaixa } from './baixaTexto.js';

/**
 * Consulta genérica de preço: preço BASE do modelo × quantidade.
 * Não valida estoque, cor nem tamanho. Retorna texto pronto ou null se não
 * reconhecer o modelo (aí o fluxo segue para o Claude).
 */
function calcularConsultaPreco(mensagem) {
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const msgNorm = norm(mensagem);
  const qMatch = mensagem.match(/(\d+)/);
  const qtd = qMatch ? Math.max(1, parseInt(qMatch[1])) : 1;

  let modelo = null;
  for (const mo of [...env.catalogoModelos].sort((a, b) => b.length - a.length)) {
    if (msgNorm.includes(norm(mo))) { modelo = mo; break; }
  }
  if (!modelo) return null;

  const precos = env.modeloPrecos || {};
  let preco = precos[modelo];
  if (preco == null) {
    for (const [k, v] of Object.entries(precos)) { if (norm(k) === norm(modelo)) { preco = v; break; } }
  }
  if (preco == null) return null;

  const fmt = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = preco * qtd;
  return qtd > 1
    ? `💰 *${qtd}x ${modelo}*\nUnitário: R$ ${fmt(preco)}\n*Total: R$ ${fmt(total)}*`
    : `💰 *${modelo}*: R$ ${fmt(preco)} a unidade`;
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
      // Guarda os IDs criados na sessão p/ "todos pagos" (batch update)
      if (loteResultado.criados?.length) {
        await sheetConversas.salvarContexto(clienteWhatsApp, { historico: [], ultimos_pedidos: loteResultado.criados }).catch(() => {});
      }
      logger.info(`[lote] ${loteResultado.totalLinhas} linha(s) processada(s) em ${Date.now() - inicio}ms`);
      return loteResultado;
    }

    // 1. Carregar contexto existente
    const contextoCarregado = await sheetConversas.carregarContexto(clienteWhatsApp);
    const contexto = contextoCarregado?.contexto || {};

    // 📉 BAIXA POR TEXTO — continuação de fluxo pendente (escolha de motivo ou Sim/Não)
    // Tem prioridade sobre tudo: "sim"/"não"/motivo são respostas, não comandos novos.
    if (contexto.baixa_pendente) {
      const r = await continuarBaixa(mensagem, clienteWhatsApp, contexto);
      await sheetConversas.salvarContexto(clienteWhatsApp, r.contexto).catch(() => {});
      logger.info(`[baixaTexto] continuação (${contexto.baixa_pendente.fase}) em ${Date.now() - inicio}ms`);
      return { success: true, resposta: r.resposta, tipo: 'BAIXA_TEXTO' };
    }

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

      // ⭐ Baixa por texto — inicia fluxo (parse → motivo obrigatório → confirmação)
      if (fp.action === 'baixa_texto') {
        const r = await iniciarBaixa(mensagem, clienteWhatsApp, contexto);
        if (r.contexto) await sheetConversas.salvarContexto(clienteWhatsApp, r.contexto).catch(() => {});
        logger.info(`[FastPath] Baixa iniciada em ${Date.now() - inicio}ms`);
        return { success: true, resposta: r.resposta, tipo: 'BAIXA_TEXTO' };
      }

      // ⭐ RETIRADA INTERNA (bypass de faturamento) — consumo dos sócios.
      // NÃO cria pedido, NÃO cobra, NÃO pede endereço. Deduz + log "Retirada Interna/Sócio".
      if (fp.action === 'admin_retirada') {
        const r = await processarRetiradaInterna(mensagem, clienteWhatsApp);
        logger.info(`[FastPath] Retirada interna em ${Date.now() - inicio}ms`);
        return { success: true, resposta: r.resposta, tipo: 'RETIRADA_INTERNA' };
      }

      // ⭐ CONSULTA GENÉRICA DE PREÇO — preço base do modelo × qtd, SEM validar estoque/variante
      if (fp.action === 'consulta_preco') {
        const r = calcularConsultaPreco(mensagem);
        if (r) {
          logger.info(`[FastPath] Consulta preço em ${Date.now() - inicio}ms`);
          return { success: true, resposta: r, tipo: 'CONSULTA_PRECO' };
        }
        // sem modelo reconhecido → deixa o Claude responder normalmente
      }

      // ⭐ PAGAR TODOS (batch) — marca como PAGO os últimos pedidos da sessão
      if (fp.action === 'pagar_todos') {
        const ids = contexto.ultimos_pedidos || [];
        if (ids.length === 0) {
          return { success: true, tipo: 'PAGAR_TODOS', resposta: '🤔 Não tenho pedidos recentes na memória desta conversa. Me diz os números (ex: "pago 33").' };
        }
        const okIds = [];
        for (const num of ids) {
          const r = await sheetsPedidos.atualizarStatusPagamento(num, 'PAGO', 'PENDENTE').catch(() => null);
          if (r?.success) okIds.push(num);
        }
        await sheetConversas.salvarContexto(clienteWhatsApp, { ...contexto, ultimos_pedidos: [] }).catch(() => {});
        logger.info(`[FastPath] Pagar todos (${okIds.length}/${ids.length}) em ${Date.now() - inicio}ms`);
        const lista = okIds.map(n => `#${String(n).padStart(3, '0')}`).join(', ');
        return { success: true, tipo: 'PAGAR_TODOS', resposta: `✅ ${okIds.length} pedido(s) marcado(s) como *PAGO*: ${lista}` };
      }

      // ⭐ CONSULTA DE HISTÓRICO (resumo executivo) — pagos (padrão) ou cancelados
      if (fp.action === 'consulta_historico') {
        if (!temPermissao(clienteWhatsApp, 'ANALYTICS_VENDAS')) {
          return { success: false, resposta: '❌ Sem permissão para ver o histórico de pedidos.', tipo: 'HISTORICO' };
        }
        const cancelados = /cancelad[oa]s?/i.test(mensagem);
        const pedidos = await sheetsPedidos.listarHistoricoPedidos({ cancelados, limite: 10 });
        const resposta = formatarHistoricoPedidos(pedidos, cancelados);
        logger.info(`[FastPath] Histórico (${cancelados ? 'cancelados' : 'pagos'}, ${pedidos.length}) em ${Date.now() - inicio}ms`);
        return { success: true, resposta, tipo: 'HISTORICO' };
      }

      // ⭐ FAQ sobre retirada/baixa — explica em linguagem natural, NÃO inicia fluxo
      if (fp.action === 'faq_retirada') {
        return {
          success: true,
          tipo: 'FAQ',
          resposta: '📦 *Como funciona a retirada interna (sócios):*\n\n' +
            'Digite: *retirada [qtd] [modelo] [tamanho] [cor] para [nome]*\n' +
            'Ex: _"retirada 1 Anne P Bordô para Jully"_\n\n' +
            'Isso deduz do estoque *sem gerar pedido nem cobrança* (consumo interno, custo R$ 0).\n\n' +
            'Já a *baixa* (defeito, perda, permuta) use: _"baixa 1 Zara M Preto por defeito"_ — ela pede o motivo e confirmação.'
        };
      }

      // ⭐ Cancelar pedido — estorno REAL (devolve estoque + grava log + marca CANCELADO)
      if (fp.action === 'cancelar_pedido') {
        const num = fp.dados.numero_pedido;
        const r = await pedidosService.cancelarPedido(num, { usuario: clienteWhatsApp.slice(-4) });
        logger.info(`[FastPath] Cancelar #${num} — ${r.success ? 'ok' : 'falha'} em ${Date.now() - inicio}ms`);
        return { success: r.success, resposta: r.mensagem_usuario, tipo: 'CANCELAR_PEDIDO' };
      }

      // ⭐ Sugestão de reposição (Curva ABC — giro 30 dias)
      if (fp.action === 'reposicao') {
        try {
          const { gerarMensagemReposicao } = await import('../reposicao.js');
          const resposta = await gerarMensagemReposicao();
          logger.info(`[FastPath] Reposição em ${Date.now() - inicio}ms`);
          return { success: true, resposta, tipo: 'REPOSICAO' };
        } catch (err) {
          logger.error('[FastPath] Erro reposição:', err.message);
          return { success: false, resposta: 'Erro ao calcular reposição. Tenta de novo?', tipo: 'REPOSICAO' };
        }
      }

      // ⭐ Alertas de estoque (consulta banco real — mostra o que está acabando)
      if (fp.action === 'alertas_estoque') {
        try {
          const { analisarEstoque } = await import('../analytics.js');
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
          // Baixa definitiva no inventário (subtrai total + reservada) + log
          await pedidosService.entregarPedido(numero_pedido, tipo_entrega).catch(() => {});
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
    if (contexto.aguardando_endereco && mensagem.trim().length >= 2 && !ehComando(mensagem)) {
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
            const novoCtx = { numero_pedido_atual: resPedido.numero_pedido, historico: [], ultimos_pedidos: [resPedido.numero_pedido] };
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
          // Baixa definitiva no inventário (subtrai total + reservada) + log
          const upd = await pedidosService.entregarPedido(numPedido, tipoEntrega);
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

      case 'consulta_historico': {
        if (!temPermissao(clienteWhatsApp, 'ANALYTICS_VENDAS')) {
          return { success: false, resposta: '❌ Sem permissão para ver o histórico de pedidos.', tipo: 'HISTORICO' };
        }
        const cancelados = /cancelad[oa]s?/i.test(mensagem);
        const pedidos = await sheetsPedidos.listarHistoricoPedidos({ cancelados, limite: 10 });
        return { success: true, resposta: formatarHistoricoPedidos(pedidos, cancelados), tipo: 'HISTORICO' };
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

export { processarMensagemComContexto };
