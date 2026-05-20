import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

let anthropicClient = null;

async function initializeGemini() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn('ANTHROPIC_API_KEY não configurada — IA desativada');
      return null;
    }
    anthropicClient = new Anthropic({ apiKey });
    logger.info('✓ Claude Haiku (Anthropic) inicializado');
    return anthropicClient;
  } catch (error) {
    logger.error('Erro ao inicializar Claude:', error.message);
    return null;
  }
}

function getGeminiClient() {
  return anthropicClient;
}

async function callAI(systemPrompt, userMessage, maxTokens = 1024, history = []) {
  if (!anthropicClient) {
    throw new Error('Claude não está inicializado. Configure ANTHROPIC_API_KEY no .env');
  }

  const messages = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages
  });

  return response.content[0]?.text || '';
}

export { initializeGemini, getGeminiClient, callAI };
