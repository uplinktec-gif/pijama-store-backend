/**
 * Monitor de Evolution API
 * Verifica se a API está respondendo e envia alertas via WhatsApp quando cai
 *
 * Uso:
 *   node src/services/monitor/evolution-monitor.js
 *
 * Ou agendar no PM2:
 *   pm2 start src/services/monitor/evolution-monitor.js --name "evolution-monitor" --watch
 */

import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { enviarMensagem } from '../whatsapp/sender.js';

// Estado do monitor
let statusAtual = 'DESCONHECIDO';
let ultimaVerificacao = null;
let tentativasFalhadas = 0;
const MAX_TENTATIVAS_ANTES_ALERTA = 2; // Alerta após 2 falhas consecutivas
const INTERVALO_VERIFICACAO = 30 * 1000; // 30 segundos

// Números para alertar (Felipe, Júlly, Pluma)
const NUMEROS_ALERTA = [
  '95981188675',  // Felipe
  '95981225668',  // Júlly
  '95991268494'   // Pluma
];

/**
 * Verifica se Evolution API está respondendo
 */
async function verificarEvolutionAPI() {
  try {
    const apiUrl = env.evolutionApiUrl;
    const apiKey = env.evolutionApiKey;
    const instance = env.evolutionInstance;

    if (!apiUrl || !apiKey || !instance) {
      logger.warn('[Evolution Monitor] Credenciais não configuradas');
      return { online: false, reason: 'CREDENCIAIS_FALTANDO' };
    }

    // Tentar conexão com timeout de 5 segundos
    const response = await axios.get(
      `${apiUrl}/instance/connect/${instance}`,
      {
        headers: { 'apikey': apiKey },
        timeout: 5000
      }
    );

    // API respondeu
    if (response.status === 200) {
      return {
        online: true,
        status: response.data?.instance?.state || 'connected',
        timestamp: new Date().toISOString()
      };
    }

    return { online: false, reason: 'STATUS_NAO_200', status: response.status };
  } catch (error) {
    const razao = error.code === 'ECONNREFUSED'
      ? 'CONEXAO_RECUSADA'
      : error.code === 'ETIMEDOUT'
      ? 'TIMEOUT'
      : error.code === 'ENOTFOUND'
      ? 'DNS_FALHOU'
      : 'ERRO_DESCONHECIDO';

    return {
      online: false,
      reason: razao,
      error: error.message,
      code: error.code
    };
  }
}

/**
 * Envia alerta via WhatsApp para todos os números configurados
 */
async function enviarAlerta(titulo, mensagem) {
  const textoCompleto = `🚨 *ALERTA EVOLUTION API*\n\n${titulo}\n\n${mensagem}\n\n⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' })}`;

  const promises = NUMEROS_ALERTA.map(numero =>
    enviarMensagem(numero, textoCompleto).catch(err => {
      logger.error(`[Evolution Monitor] Erro ao enviar alerta para ${numero}:`, err.message);
    })
  );

  await Promise.all(promises);
}

/**
 * Registra mudança de status
 */
function registrarMudancaStatus(statusAnterior, statusNovo, detalhes) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' });

  if (statusAnterior !== statusNovo) {
    logger.warn(`[Evolution Monitor] Mudança de status: ${statusAnterior} → ${statusNovo}`);
    logger.warn(`[Evolution Monitor] Detalhes:`, detalhes);
  }

  ultimaVerificacao = {
    timestamp,
    statusAnterior,
    statusNovo,
    detalhes
  };
}

/**
 * Loop principal de monitoramento
 */
async function executarMonitor() {
  logger.info('🔍 [Evolution Monitor] Iniciando monitor de Evolution API');
  logger.info(`[Evolution Monitor] Verificação a cada ${INTERVALO_VERIFICACAO / 1000}s`);
  logger.info(`[Evolution Monitor] Alertas para: ${NUMEROS_ALERTA.join(', ')}`);
  logger.info(`[Evolution Monitor] URL: ${env.evolutionApiUrl}`);
  logger.info(`[Evolution Monitor] Instance: ${env.evolutionInstance}`);

  // Verificação inicial
  await verificacaoUnica();

  // Loop contínuo
  setInterval(verificacaoUnica, INTERVALO_VERIFICACAO);
}

/**
 * Executa uma verificação única
 */
async function verificacaoUnica() {
  const resultado = await verificarEvolutionAPI();
  const statusNovo = resultado.online ? 'ONLINE' : 'OFFLINE';

  // Registrar no log
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' });

  if (resultado.online) {
    logger.info(`[Evolution Monitor] ✓ ${timestamp} — API está ONLINE (${resultado.status})`);
    tentativasFalhadas = 0;

    // Se estava offline e voltou online → alerta
    if (statusAtual === 'OFFLINE') {
      registrarMudancaStatus(statusAtual, statusNovo, resultado);
      statusAtual = statusNovo;

      logger.warn(`[Evolution Monitor] ✓ API VOLTOU ONLINE!`);
      await enviarAlerta(
        '✅ Evolution API VOLTOU ONLINE',
        `A API está respondendo normalmente novamente.\n\nStatus: ${resultado.status}`
      );
    } else {
      statusAtual = statusNovo;
    }
  } else {
    tentativasFalhadas++;
    logger.warn(`[Evolution Monitor] ✗ ${timestamp} — API está OFFLINE (Tentativa ${tentativasFalhadas}/${MAX_TENTATIVAS_ANTES_ALERTA})`);
    logger.warn(`[Evolution Monitor] Razão:`, resultado.reason, resultado.error || '');

    // Após N falhas consecutivas → alerta
    if (tentativasFalhadas >= MAX_TENTATIVAS_ANTES_ALERTA && statusAtual !== 'OFFLINE') {
      registrarMudancaStatus(statusAtual, statusNovo, resultado);
      statusAtual = statusNovo;

      logger.error(`[Evolution Monitor] ✗ ALERTA: Evolution API está OFFLINE!`);
      await enviarAlerta(
        '❌ Evolution API OFFLINE',
        `A API não está respondendo.\n\nRazão: ${resultado.reason}\nErro: ${resultado.error || 'Sem detalhes'}\n\nO bot não conseguirá enviar mensagens até a API voltar online.`
      );
    } else if (tentativasFalhadas < MAX_TENTATIVAS_ANTES_ALERTA) {
      statusAtual = 'VERIFICANDO'; // Status intermediário
    }
  }
}

/**
 * Endpoint HTTP para status manual (GET /health/evolution-monitor)
 */
function registrarRotasMonitor(app) {
  app.get('/health/evolution-monitor', (req, res) => {
    res.json({
      service: 'evolution-monitor',
      status: statusAtual,
      ultimaVerificacao,
      tentativasFalhadas,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  logger.info('[Evolution Monitor] Rota /health/evolution-monitor registrada');
}

// Iniciar monitor se executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  executarMonitor().catch(err => {
    logger.error('[Evolution Monitor] Erro fatal:', err);
    process.exit(1);
  });
}

export { executarMonitor, verificarEvolutionAPI, registrarRotasMonitor };
