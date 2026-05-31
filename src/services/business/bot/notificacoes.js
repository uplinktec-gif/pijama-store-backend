// ============================================================================
// notificacoes.js — avisos automáticos ao cliente
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

export { notificarClientePagamento, notificarClienteSaindo, notificarClienteEntrega };
