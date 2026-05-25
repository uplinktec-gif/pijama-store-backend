import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import * as businessConversas from '../business/conversas.js';
import * as whatsappSender from './sender.js';

// ─── Deduplicação de mensagens ─────────────────────────────────────────────
// Armazena IDs processados nos últimos 5 minutos para evitar reprocessamento
// em caso de retry da Evolution API
const mensagensProcessadas = new Map(); // messageId → timestamp
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutos

function jaProcessada(messageId) {
  if (!messageId) return false;
  const agora = Date.now();

  // Limpar entradas expiradas
  for (const [id, ts] of mensagensProcessadas.entries()) {
    if (agora - ts > DEDUP_TTL_MS) mensagensProcessadas.delete(id);
  }

  if (mensagensProcessadas.has(messageId)) {
    logger.warn(`[webhook] ⚠️ Mensagem duplicada ignorada: ${messageId}`);
    return true;
  }

  mensagensProcessadas.set(messageId, agora);
  return false;
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida webhook do WhatsApp (verificação inicial)
 */
function validarWebhook(mode, token, challenge) {
  if (mode === 'subscribe' && token === env.whatsappVerifyToken) {
    logger.info('✓ WhatsApp webhook verificado');
    return challenge;
  }

  logger.warn('Tentativa de verificação com token inválido');
  return null;
}

/**
 * Processa mensagem recebida do WhatsApp (suporta Meta e Evolution API)
 */
async function processarMensagem(body) {
  try {
    // ─── Ignorar eventos de read receipts silenciosamente ────────
    // messages.update = mensagem foi lida, não é uma nova mensagem
    if (body?.event === 'messages.update') {
      logger.debug(`[webhook] ℹ️ Read receipt ignorado: ${body?.data?.key?.id}`);
      return { processed: false, reason: 'read_receipt' };
    }
    // ──────────────────────────────────────────────────────────────

    const messages = extrairMensagensDoPayload(body);

    if (!messages || messages.length === 0) {
      logger.debug('Webhook recebido sem mensagens');
      return { processed: false };
    }

    const resultados = [];

    for (const message of messages) {
      const clienteWhatsApp = message.from;
      const messageId = message.id || message.key?.id;
      const textoMensagem = message.text || message.text?.body || '';

      if (!clienteWhatsApp || !textoMensagem) {
        logger.debug('Mensagem incompleta, ignorando');
        continue;
      }

      // Verificar se o WhatsApp é autorizado
      if (!env.authorizedNumbers.includes(clienteWhatsApp)) {
        logger.warn(`Mensagem de WhatsApp não autorizado: ${clienteWhatsApp}`);
        await whatsappSender.enviarMensagem(
          clienteWhatsApp,
          '❌ Seu WhatsApp não está autorizado a usar este sistema.'
        );
        continue;
      }

      logger.info(`[${clienteWhatsApp}] Mensagem: "${textoMensagem}"`);

      // Processar mensagem com contexto multi-turno
      const resultado = await businessConversas.processarMensagemComContexto(textoMensagem, clienteWhatsApp);

      // Enviar resposta
      if (resultado.resposta) {
        await whatsappSender.enviarMensagem(clienteWhatsApp, resultado.resposta);
      }

      resultados.push({
        messageId,
        clienteWhatsApp,
        sucesso: resultado.success,
        numero_pedido: resultado.numero_pedido
      });
    }

    return { processed: true, resultados };
  } catch (error) {
    logger.error('Erro ao processar webhook WhatsApp:', error.message);
    return { processed: false, error: error.message };
  }
}

/**
 * Extrai mensagens do payload (suporta Meta e Evolution API)
 * Meta format: body.entry[0].changes[0].value.messages
 * Evolution format: body.data.message ou body.messages
 */
function extrairMensagensDoPayload(body) {
  const mensagens = [];

  // ============================================================
  // FORMATO EVOLUTION API 2.x (formato real)
  // {
  //   "event": "messages.upsert",
  //   "instance": "pijama-store",
  //   "data": {
  //     "key": { "remoteJid": "5595...@s.whatsapp.net", "fromMe": false, "id": "..." },
  //     "pushName": "Felipe",
  //     "message": { "conversation": "texto" },
  //     "messageType": "conversation"
  //   }
  // }
  // ============================================================
  if (body?.event === 'messages.upsert' && body?.data) {
    const data = body.data;
    const key = data.key || {};

    // Ignorar mensagens enviadas pelo próprio bot (evita loop)
    if (key.fromMe === true) {
      logger.debug('[webhook] Mensagem própria ignorada (fromMe=true)');
      return mensagens;
    }

    // Extrair número (remove @s.whatsapp.net e @c.us)
    const from = (key.remoteJid || '').replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '');

    // Extrair texto (pode estar em vários campos)
    const msg = data.message || {};
    const text = msg.conversation
      || msg.extendedTextMessage?.text
      || msg.imageMessage?.caption
      || msg.videoMessage?.caption
      || '';

    if (from && text) {
      // Deduplicação por ID da mensagem
      if (jaProcessada(key.id)) {
        return mensagens; // Já processada, ignora silenciosamente
      }
      logger.info(`[webhook] ✓ Evolution 2.x: de=${from} texto="${text.substring(0, 50)}"`);
      mensagens.push({
        from,
        id: key.id,
        text,
        timestamp: data.messageTimestamp,
        pushName: data.pushName
      });
    } else {
      logger.debug(`[webhook] Evolution 2.x: sem texto (messageType=${data.messageType})`);
    }
    return mensagens;
  }

  // ============================================================
  // FORMATO META WhatsApp Business API (fallback)
  // ============================================================
  const messagesMeta = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (messagesMeta && Array.isArray(messagesMeta)) {
    logger.info(`[webhook] ✓ Formato Meta detectado com ${messagesMeta.length} mensagem(ns)`);
    for (const msg of messagesMeta) {
      if (msg.type === 'text' || msg.text?.body) {
        mensagens.push({
          from: msg.from,
          id: msg.id,
          text: msg.text?.body || '',
          timestamp: msg.timestamp
        });
      }
    }
    return mensagens;
  }

  logger.warn(`[webhook] Formato desconhecido. event=${body?.event}, keys=${Object.keys(body || {}).join(',')}`);
  return mensagens;
}

/**
 * Valida se número WhatsApp está autorizado
 */
function validarWhatsAppAutorizado(numero) {
  return env.authorizedNumbers.includes(numero);
}

/**
 * Envia mensagem para cliente (função auxiliar)
 */
async function enviarMensagemCliente(clienteWhatsApp, mensagem) {
  return whatsappSender.enviarMensagem(clienteWhatsApp, mensagem);
}

export { validarWebhook, processarMensagem, enviarMensagemCliente, extrairMensagensDoPayload, validarWhatsAppAutorizado };
