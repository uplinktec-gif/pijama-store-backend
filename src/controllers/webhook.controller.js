import { logger } from '../utils/logger.js';
import * as webhookService from '../services/whatsapp/webhook.js';
import * as senderService from '../services/whatsapp/sender.js';
import * as conversasService from '../services/business/conversas.js';
import { extrairMensagensDoPayload } from '../services/whatsapp/webhook.js';

/**
 * GET /api/webhook/whatsapp - Verificação do webhook (challenge)
 */
function verificarWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.debug(`Verificação de webhook: mode=${mode}, token=${token}`);

  const resultado = webhookService.validarWebhook(mode, token, challenge);

  if (resultado) {
    logger.info('✓ Webhook verificado com sucesso');
    res.status(200).send(resultado);
  } else {
    logger.warn('❌ Falha na verificação do webhook');
    res.status(403).send('Verification failed');
  }
}

/**
 * POST /api/webhook/whatsapp - Recebimento de mensagens com contexto multi-turno
 */
async function receberMensagem(req, res) {
  const body = req.body;

  logger.debug(`[webhook] Recebido — event: ${body?.event}, keys: ${Object.keys(body || {}).join(',')}`)

  // Responder imediatamente com JSON (Evolution API e Meta webhook esperam resposta rápida)
  res.status(200).json({ success: true, message: 'EVENT_RECEIVED' });

  try {
    logger.debug(`[webhook] Processando payload assincronamente`);

    // Extrair mensagens do payload (suporta Meta e Evolution API)
    const mensagens = extrairMensagensDoPayload(body);

    logger.info(`[webhook] ${mensagens?.length || 0} mensagem(ns) extraída(s) do payload`);

    if (!mensagens || mensagens.length === 0) {
      logger.debug('[webhook] Webhook recebido sem mensagens');
      return;
    }

    for (const msg of mensagens) {
      try {
        const clienteWhatsApp = msg.from;
        const texto = msg.text;

        logger.info(`[webhook] Processando mensagem`, {
          clienteWhatsApp,
          texto: texto?.substring(0, 50)
        });

        if (!clienteWhatsApp || !texto) {
          logger.debug('[webhook] Mensagem incompleta, ignorando');
          continue;
        }

        // Validar número autorizado
        if (!webhookService.validarWhatsAppAutorizado(clienteWhatsApp)) {
          logger.warn(`[webhook] Mensagem de número não autorizado: ${clienteWhatsApp}`);
          await senderService.enviarMensagem(
            clienteWhatsApp,
            '❌ Seu WhatsApp não está autorizado a usar este sistema.'
          );
          continue;
        }

        logger.info(`[webhook] ✓ Número autorizado, iniciando processamento`);

        // Processar com contexto multi-turno
        const resultado = await conversasService.processarMensagemComContexto(
          texto,
          clienteWhatsApp
        );

        logger.info(`[webhook] Resultado do processamento:`, {
          success: resultado.success,
          tipo: resultado.tipo,
          numero_pedido: resultado.numero_pedido
        });

        // Sempre envia resposta ao usuário — seja sucesso, erro de negócio ou erro técnico
        if (resultado.resposta) {
          let mensagemFinal = resultado.resposta.trim();

          // PROTEÇÃO FINAL: se parecer JSON, extrai só o texto do campo "resposta"
          const pareceJSON = mensagemFinal.startsWith('{') || mensagemFinal.includes('"action":') || mensagemFinal.includes('"resposta":');
          if (pareceJSON) {
            logger.warn(`[webhook] ⚠️ JSON detectado — extraindo texto`);
            try {
              const jsonStr = mensagemFinal.match(/\{[\s\S]*\}/)?.[0];
              const obj = JSON.parse(jsonStr || '{}');
              let inner = (obj.resposta || '').replace(/\\n/g, '\n').trim();
              // Segunda camada se ainda for JSON
              if (inner.startsWith('{')) {
                const obj2 = JSON.parse(inner.match(/\{[\s\S]*\}/)?.[0] || '{}');
                inner = (obj2.resposta || '').replace(/\\n/g, '\n').trim();
              }
              mensagemFinal = inner || 'Como posso ajudar? 😊';
            } catch {
              mensagemFinal = 'Como posso ajudar? 😊';
            }
            logger.warn(`[webhook] Corrigido para: "${mensagemFinal.substring(0, 80)}"`);
          }

          logger.info(`[webhook] Enviando: "${mensagemFinal.substring(0, 80)}"`);
          await senderService.enviarMensagem(clienteWhatsApp, mensagemFinal);
        } else if (resultado.erro) {
          logger.error(`[webhook] Erro técnico: ${resultado.erro}`);
          await senderService.enviarMensagem(
            clienteWhatsApp,
            'Desculpe, ocorreu um erro interno. Tente novamente.'
          );
        }
      } catch (error) {
        logger.error(`[webhook] Erro ao processar mensagem individual: ${error.message}`);
        logger.error(`[webhook] Stack:`, error.stack);
      }
    }
  } catch (error) {
    logger.error(`[webhook] Erro fatal ao receber webhook: ${error.message}`);
    logger.error(`[webhook] Stack:`, error.stack);
  }
}

export { verificarWebhook, receberMensagem };
