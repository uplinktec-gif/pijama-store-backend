import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

/**
 * Envia mensagem de texto via WhatsApp (Evolution API 2.x)
 */
async function enviarMensagem(numeroWhatsApp, texto) {
  try {
    const apiUrl = env.evolutionApiUrl;
    const apiKey = env.evolutionApiKey;
    const instance = env.evolutionInstance;

    if (!apiUrl || !apiKey || !instance) {
      logger.warn('Evolution API não está configurada');
      logger.info(`[SIMULADO] Mensagem para ${numeroWhatsApp}: ${texto}`);
      return { success: true, simulado: true };
    }

    // Evolution API 2.x: POST /message/sendText/{instanceName}
    const url = `${apiUrl}/message/sendText/${instance}`;
    const numeroFormatado = formatarNumeroWhatsApp(numeroWhatsApp);

    const payload = {
      number: numeroFormatado,
      text: texto,
      delay: 0
    };

    const response = await axios.post(url, payload, {
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    logger.info(`✓ Mensagem enviada para ${numeroWhatsApp} (ID: ${response.data.key?.id || 'N/A'})`);

    return {
      success: true,
      messageId: response.data.key?.id || response.data.id
    };
  } catch (error) {
    logger.error(`Erro ao enviar mensagem para ${numeroWhatsApp}:`, error.response?.data || error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      logger.warn('Evolution API não está acessível, simulando envio');
      return { success: true, simulado: true };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Envia mensagem com opções numeradas (Evolution API não suporta botões interativos)
 */
async function enviarMensagemComBotoes(numeroWhatsApp, texto, botoes) {
  const botoesFomatados = botoes
    .map((btn, idx) => `${idx + 1}. ${btn.title || btn}`)
    .join('\n');

  const textoComBotoes = `${texto}\n\nEscolha uma opção:\n${botoesFomatados}`;
  return enviarMensagem(numeroWhatsApp, textoComBotoes);
}

/**
 * Envia mensagem com lista numerada (Evolution API não suporta listas interativas)
 */
async function enviarMensagemComLista(numeroWhatsApp, texto, items) {
  const itensFomatados = items
    .map((item, idx) => `${idx + 1}. ${item}`)
    .join('\n');

  const textoComLista = `${texto}\n\n${itensFomatados}`;
  return enviarMensagem(numeroWhatsApp, textoComLista);
}

/**
 * Valida formato do número WhatsApp
 */
function validarNumeroWhatsApp(numero) {
  if (!numero) return false;
  const apenasNumeros = numero.replace(/\D/g, '');
  // WhatsApp Brasil: mínimo 12 dígitos (55 + DDD + número)
  return apenasNumeros.length >= 12;
}

/**
 * Formata número para envio (adiciona 55 se necessário)
 */
function formatarNumeroWhatsApp(numero) {
  const apenasNumeros = numero.replace(/\D/g, '');

  if (apenasNumeros.startsWith('55')) {
    return apenasNumeros;
  }

  return '55' + apenasNumeros;
}

export {
  enviarMensagem,
  enviarMensagemComBotoes,
  enviarMensagemComLista,
  validarNumeroWhatsApp,
  formatarNumeroWhatsApp
};
