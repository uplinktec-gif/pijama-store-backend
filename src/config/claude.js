import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

let claudeInstance = null;

/**
 * Inicializa o cliente Claude (Anthropic)
 */
export function initializeClaude() {
  try {
    if (claudeInstance) return claudeInstance;

    const apiKey = env.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error('ANTHROPIC_API_KEY não configurada — IA desativada');
      return null;
    }

    claudeInstance = new Anthropic({ apiKey });
    logger.info('✓ Claude API inicializado com sucesso');
    return claudeInstance;
  } catch (error) {
    logger.error('Erro ao inicializar Claude:', error.message);
    return null;
  }
}

/**
 * Alias mantido para compatibilidade com server.js
 */
export const initializeGemini = initializeClaude;

export function getClaudeClient() {
  if (!claudeInstance) logger.warn('Claude não inicializado. Chame initializeClaude() primeiro.');
  return claudeInstance;
}

/**
 * Chama o Claude com system prompt, mensagem do usuário e histórico.
 * Modelo: claude-haiku-4-5 (rápido, ideal para respostas de bot em tempo real)
 */
export async function callAI(systemPrompt, userMessage, maxTokens = 512, history = []) {
  if (!claudeInstance) {
    throw new Error('Claude não inicializado. Configure ANTHROPIC_API_KEY no .env');
  }

  // Montar histórico (somente roles user/assistant)
  const messages = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  const response = await claudeInstance.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages
  });

  return response.content[0]?.text || '';
}
