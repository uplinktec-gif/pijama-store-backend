import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  validarModelo,
  validarTamanho,
  validarCor,
  validarQuantidade,
  validarTipoEntrega,
  validarFormaPagamento,
  validarWhatsApp,
  validarClienteNome,
  calcularPrecoTotal
} from '../../src/services/nlp/validator.js';

describe('Validator Tests', () => {
  describe('validarModelo', () => {
    test('deve aceitar modelo válido', () => {
      const resultado = validarModelo('ZARA');
      expect(resultado.valid).toBe(true);
      expect(resultado.modelo).toBe('ZARA');
    });

    test('deve rejeitar modelo inválido', () => {
      const resultado = validarModelo('INVALIDO');
      expect(resultado.valid).toBe(false);
      expect(resultado.error).toBeDefined();
    });

    test('deve rejeitar modelo vazio', () => {
      const resultado = validarModelo(null);
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarTamanho', () => {
    test('deve aceitar tamanho válido', () => {
      const resultado = validarTamanho('G');
      expect(resultado.valid).toBe(true);
      expect(resultado.tamanho).toBe('G');
    });

    test('deve rejeitar tamanho inválido', () => {
      const resultado = validarTamanho('XG');
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarCor', () => {
    test('deve aceitar cor válida', () => {
      const resultado = validarCor('azul marinho');
      expect(resultado.valid).toBe(true);
    });

    test('deve rejeitar cor inválida', () => {
      const resultado = validarCor('verde fluor');
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarQuantidade', () => {
    test('deve aceitar quantidade positiva', () => {
      const resultado = validarQuantidade(2);
      expect(resultado.valid).toBe(true);
      expect(resultado.quantidade).toBe(2);
    });

    test('deve rejeitar quantidade zero', () => {
      const resultado = validarQuantidade(0);
      expect(resultado.valid).toBe(false);
    });

    test('deve rejeitar quantidade negativa', () => {
      const resultado = validarQuantidade(-1);
      expect(resultado.valid).toBe(false);
    });

    test('deve rejeitar quantidade não inteira', () => {
      const resultado = validarQuantidade(2.5);
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarTipoEntrega', () => {
    test('deve aceitar ENTREGA', () => {
      const resultado = validarTipoEntrega('ENTREGA');
      expect(resultado.valid).toBe(true);
      expect(resultado.tipo).toBe('ENTREGA');
    });

    test('deve aceitar RETIRADA', () => {
      const resultado = validarTipoEntrega('RETIRADA');
      expect(resultado.valid).toBe(true);
      expect(resultado.tipo).toBe('RETIRADA');
    });

    test('deve rejeitar tipo inválido', () => {
      const resultado = validarTipoEntrega('INVALIDO');
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarFormaPagamento', () => {
    test('deve aceitar PIX', () => {
      const resultado = validarFormaPagamento('PIX');
      expect(resultado.valid).toBe(true);
    });

    test('deve aceitar CARTÃO', () => {
      const resultado = validarFormaPagamento('CARTÃO');
      expect(resultado.valid).toBe(true);
    });

    test('deve aceitar DINHEIRO', () => {
      const resultado = validarFormaPagamento('DINHEIRO');
      expect(resultado.valid).toBe(true);
    });

    test('deve rejeitar forma inválida', () => {
      const resultado = validarFormaPagamento('BITCOIN');
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarWhatsApp', () => {
    test('deve aceitar WhatsApp válido', () => {
      const resultado = validarWhatsApp('+5595988123456');
      expect(resultado.valid).toBe(true);
    });

    test('deve rejeitar WhatsApp muito curto', () => {
      const resultado = validarWhatsApp('123');
      expect(resultado.valid).toBe(false);
    });
  });

  describe('validarClienteNome', () => {
    test('deve aceitar nome válido', () => {
      const resultado = validarClienteNome('João Silva');
      expect(resultado.valid).toBe(true);
      expect(resultado.nome).toBe('João Silva');
    });

    test('deve rejeitar nome vazio', () => {
      const resultado = validarClienteNome('   ');
      expect(resultado.valid).toBe(false);
    });
  });

  describe('calcularPrecoTotal', () => {
    test('deve retornar valor customizado se fornecido', () => {
      const itens = [{ modelo: 'ZARA', quantidade: 2 }];
      const total = calcularPrecoTotal(itens, 150);
      expect(total).toBe(150);
    });

    test('deve calcular preço por quantidade', () => {
      const itens = [{ modelo: 'ZARA', quantidade: 2 }];
      const total = calcularPrecoTotal(itens);
      expect(total).toBeGreaterThan(0);
    });
  });
});
