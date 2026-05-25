import { logger } from '../../utils/logger.js';
import { query, run } from '../../config/database.js';

/**
 * Registra um consumidor de webhooks de estoque
 * @param {string} consumidor - ID do consumidor (ex: 'vps', 'site', 'bot')
 * @param {string} url - URL para enviar notificações
 * @param {boolean} ativo - Status do consumidor
 */
export function registrarConsumidor(consumidor, url, ativo = true) {
  try {
    run(
      'INSERT OR REPLACE INTO webhooks_consumidores (consumidor, url, ativo) VALUES (?, ?, ?)',
      [consumidor, url, ativo ? 1 : 0]
    );
    logger.info(`✓ Consumidor de webhook registrado: ${consumidor} → ${url}`);
    return { success: true };
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao registrar consumidor:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Notifica todos os consumidores sobre alteração de estoque
 * Utiliza retry logic com exponential backoff
 * @param {string} sku - SKU do produto alterado
 * @param {number} versao - Versão da alteração
 * @param {object} dados - Dados da alteração {operacao, mudancas, usuario_id}
 */
export async function notificarConsumidores(sku, versao, dados) {
  try {
    const consumidores = query('SELECT consumidor, url, ativo FROM webhooks_consumidores WHERE ativo = 1');

    if (consumidores.length === 0) {
      logger.warn(`[WEBHOOKS] Nenhum consumidor ativo para notificar: ${sku}`);
      return { enviados: 0, falhas: [] };
    }

    const payload = {
      sku,
      versao,
      timestamp: new Date().toISOString(),
      operacao: dados.operacao,
      mudancas: dados.mudancas,
      usuario_id: dados.usuario_id
    };

    const falhas = [];
    let enviados = 0;

    for (const consumidor of consumidores) {
      const sucesso = await enviarComRetry(
        consumidor.consumidor,
        consumidor.url,
        payload,
        sku,
        versao
      );

      if (sucesso) {
        enviados++;
      } else {
        falhas.push(consumidor.consumidor);
      }
    }

    logger.info(`[WEBHOOKS] Notificação enviada: ${enviados}/${consumidores.length} consumidores (${sku} v${versao})`);

    return { enviados, falhas };
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao notificar consumidores:', error.message);
    return { enviados: 0, falhas: [], erro: error.message };
  }
}

/**
 * Envia webhook com retry logic (exponential backoff)
 * Máximo 3 tentativas com delay de 1s, 2s, 4s
 */
async function enviarComRetry(consumidor, url, payload, sku, versao, tentativa = 0) {
  const maxTentativas = 3;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 5000 // 5 segundos
    });

    if (response.ok) {
      logger.debug(`✓ Webhook enviado para ${consumidor}: ${sku} v${versao}`);
      return true;
    }

    // Status error — vai para fila de morte
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  } catch (error) {
    if (tentativa < maxTentativas - 1) {
      const delay = 1000 * Math.pow(2, tentativa); // 1s, 2s, 4s
      logger.warn(`[WEBHOOKS] Tentativa ${tentativa + 1}/${maxTentativas} para ${consumidor} em ${delay}ms`);

      await new Promise(r => setTimeout(r, delay));
      return enviarComRetry(consumidor, url, payload, sku, versao, tentativa + 1);
    }

    // Todas as tentativas falharam — guardar em fila de morte
    logger.error(`✗ Webhook falhou após ${maxTentativas} tentativas para ${consumidor}: ${error.message}`);

    try {
      run(
        'INSERT INTO webhooks_fila_morta (consumidor, sku, versao, tentativas, erro_mensagem) VALUES (?, ?, ?, ?, ?)',
        [consumidor, sku, versao, maxTentativas, error.message]
      );
      logger.debug(`[WEBHOOKS] Erro registrado em fila_morta para posterior processamento`);
    } catch (dbError) {
      logger.error('[WEBHOOKS] Erro ao registrar em fila_morta:', dbError.message);
    }

    return false;
  }
}

/**
 * Obtém e processa itens da fila de morte (Dead Letter Queue)
 * Tenta reenviar após 1 hora
 */
export async function processarFilaMorta() {
  try {
    // Buscar itens com mais de 1 hora de tentativa falha
    const agora = new Date();
    const umHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000).toISOString();

    const filaItems = query(
      `SELECT id, consumidor, sku, versao, tentativas, erro_mensagem
       FROM webhooks_fila_morta
       WHERE timestamp < ?
       LIMIT 10`,
      [umHoraAtras]
    );

    if (filaItems.length === 0) {
      logger.debug('[WEBHOOKS] Fila de morte vazia');
      return { processados: 0 };
    }

    let processados = 0;

    for (const item of filaItems) {
      try {
        // Buscar URL do consumidor
        const consumidor = query(
          'SELECT url FROM webhooks_consumidores WHERE consumidor = ? AND ativo = 1',
          [item.consumidor]
        )[0];

        if (!consumidor) {
          // Consumidor não existe mais, remover de fila
          run('DELETE FROM webhooks_fila_morta WHERE id = ?', [item.id]);
          continue;
        }

        // Tentar reenviar
        const sucesso = await enviarComRetry(
          item.consumidor,
          consumidor.url,
          {
            sku: item.sku,
            versao: item.versao,
            timestamp: new Date().toISOString(),
            retry: true,
            tentativas_anteriores: item.tentativas
          },
          item.sku,
          item.versao,
          0
        );

        if (sucesso) {
          // Remover de fila de morte
          run('DELETE FROM webhooks_fila_morta WHERE id = ?', [item.id]);
          processados++;
          logger.info(`✓ Item retirado da fila_morta e reenviado: ${item.sku} v${item.versao}`);
        } else {
          // Incrementar tentativas
          run(
            'UPDATE webhooks_fila_morta SET tentativas = tentativas + 1 WHERE id = ?',
            [item.id]
          );
        }
      } catch (error) {
        logger.error(`[WEBHOOKS] Erro ao processar item da fila_morta id=${item.id}:`, error.message);
      }
    }

    logger.info(`[WEBHOOKS] Processados ${processados}/${filaItems.length} itens da fila_morta`);
    return { processados };
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao processar fila_morta:', error.message);
    return { processados: 0, erro: error.message };
  }
}

/**
 * Lista todos os consumidores registrados
 */
export function listarConsumidores() {
  try {
    return query('SELECT consumidor, url, ativo FROM webhooks_consumidores ORDER BY consumidor');
  } catch (error) {
    logger.error('[WEBHOOKS] Erro ao listar consumidores:', error.message);
    return [];
  }
}
