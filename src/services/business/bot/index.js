// API pública do bot — re-exporta exatamente os mesmos símbolos que o
// conversas.js original exportava (compatibilidade total com os importadores).
export { processarMensagemComContexto } from './orquestrador.js';
export { processarComClaude } from './claude.js';
export { detectarComandoAnalitics, processarAnalyticsVendas, processarAnalyticsEstoque, processarAnalyticsRecomendacao } from './analytics.js';
export { gerarResumoEstoque, gerarSaudacao } from './formatters.js';
