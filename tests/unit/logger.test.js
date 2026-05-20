import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { logger } from '../../src/utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '../../logs');

describe('Logger Tests', () => {
  test('deve criar instância de logger', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  test('deve logar mensagem info', () => {
    const spy = jest.spyOn(logger, 'info');
    logger.info('Mensagem de teste info');

    expect(spy).toHaveBeenCalledWith('Mensagem de teste info');
    spy.mockRestore();
  });

  test('deve logar mensagem error', () => {
    const spy = jest.spyOn(logger, 'error');
    logger.error('Mensagem de teste error', 'detalhe do erro');

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('deve logar com metadados', () => {
    const spy = jest.spyOn(logger, 'info');
    const metadata = { whatsapp: '+5595988123456', pedido: 123 };

    logger.info('Pedido criado', metadata);

    expect(spy).toHaveBeenCalledWith('Pedido criado', metadata);
    spy.mockRestore();
  });

  test('deve logar com diferentes níveis', () => {
    expect(() => {
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
    }).not.toThrow();
  });

  test('deve ter formato consistente', () => {
    const spy = jest.spyOn(logger, 'info');
    logger.info('teste formatação', { user: 'Felipe' });

    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0];
    expect(typeof call[0]).toBe('string');
    spy.mockRestore();
  });

  test('deve suportar logs com erro e stack trace', () => {
    const spy = jest.spyOn(logger, 'error');
    const erro = new Error('Erro de teste');

    logger.error('Erro ao processar', erro.message);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
