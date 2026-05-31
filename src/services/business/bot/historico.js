// ============================================================================
// historico.js — persistência do histórico de conversa
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
 * Salva a troca atual no histórico do contexto.
 * Mantém no máximo 8 mensagens (4 trocas) para não sobrecarregar tokens.
 */
async function salvarHistorico(clienteWhatsApp, contextoAtual, mensagemUsuario, respostaBot) {
  try {
    const historico = [...(contextoAtual?.historico || [])];

    historico.push({ role: 'user', content: mensagemUsuario });
    historico.push({ role: 'assistant', content: respostaBot });

    // Manter apenas as últimas 8 mensagens (4 trocas)
    const historicoRecente = historico.slice(-8);

    const novoContexto = {
      ...contextoAtual,
      historico: historicoRecente,
      ultima_atividade: new Date().toISOString()
    };
    delete novoContexto.historico; // remove temporariamente para não duplicar
    novoContexto.historico = historicoRecente;

    await sheetConversas.salvarContexto(clienteWhatsApp, novoContexto);
  } catch (e) {
    logger.debug('[historico] Erro ao salvar histórico:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Funções auxiliares: pendentes, busca, notificações
// ---------------------------------------------------------------------------

export { salvarHistorico };
