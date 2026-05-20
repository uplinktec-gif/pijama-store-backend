import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

let claudeInstance = null;

function initializeClaude() {
  try {
    if (claudeInstance) {
      logger.debug('Claude API já inicializado');
      return claudeInstance;
    }

    if (!env.anthropicApiKey) {
      logger.error('ANTHROPIC_API_KEY não está configurada');
      return null;
    }

    claudeInstance = new Anthropic({
      apiKey: env.anthropicApiKey
    });

    logger.info('✓ Claude API inicializado com sucesso');
    return claudeInstance;
  } catch (error) {
    logger.error('Erro ao inicializar Claude API:', error.message);
    return null;
  }
}

function getClaudeClient() {
  if (!claudeInstance) {
    logger.warn('Claude API não está inicializado. Chame initializeClaude() primeiro.');
    return null;
  }
  return claudeInstance;
}

export { initializeClaude, getClaudeClient };
