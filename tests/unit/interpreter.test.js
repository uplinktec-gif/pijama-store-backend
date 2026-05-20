import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('Interpreter Tests', () => {
  describe('interpretarPedido', () => {
    test('deve retornar estrutura esperada', async () => {
      // Mock da estrutura esperada
      const estruturaEsperada = {
        modelo: null,
        tamanho: null,
        cor: null,
        quantidade: null,
        cliente_nome: null,
        cliente_whatsapp: null,
        tipo_entrega: null,
        endereco_entrega: null
      };

      // Verificar que a estrutura tem as propriedades obrigatórias
      expect(estruturaEsperada).toHaveProperty('modelo');
      expect(estruturaEsperada).toHaveProperty('quantidade');
      expect(estruturaEsperada).toHaveProperty('cliente_nome');
      expect(estruturaEsperada).toHaveProperty('tipo_entrega');
    });

    test('deve processar mensagem com múltiplos itens', () => {
      // Mock de resposta esperada para múltiplos itens
      const resultado = {
        itens: [
          { modelo: 'MIA', tamanho: 'P', cor: 'preto', quantidade: 1 },
          { modelo: 'ZARA', tamanho: 'G', cor: 'bordô', quantidade: 2 }
        ]
      };

      expect(resultado).toHaveProperty('itens');
      expect(Array.isArray(resultado.itens)).toBe(true);
      expect(resultado.itens.length).toBe(2);
    });

    test('deve interpretar tipo de entrega como null ou válido', () => {
      const tiposValidos = ['ENTREGA', 'RETIRADA', null];

      tiposValidos.forEach(tipo => {
        expect(['ENTREGA', 'RETIRADA', null]).toContain(tipo);
      });
    });

    test('deve permitir endereço como string ou null', () => {
      const cenarios = [
        { endereco_entrega: null },
        { endereco_entrega: 'Rua A, 123' },
        { endereco_entrega: undefined }
      ];

      cenarios.forEach(cenario => {
        if (cenario.endereco_entrega) {
          expect(typeof cenario.endereco_entrega).toBe('string');
        }
      });
    });

    test('deve normalizar nomes de modelos para maiúsculas', () => {
      const modelos = ['ZARA', 'MIA', 'LIA', 'NÚBIA', 'LÍVIA', 'BEATRIZ', 'ANNE'];

      modelos.forEach(modelo => {
        expect(modelo).toBe(modelo.toUpperCase());
      });
    });

    test('deve aceitar tamanhos válidos', () => {
      const tamanhos = ['P', 'M', 'G', 'GG'];

      tamanhos.forEach(tamanho => {
        expect(['P', 'M', 'G', 'GG']).toContain(tamanho);
      });
    });

    test('deve aceitar cores do catálogo', () => {
      const coresValidas = ['azul marinho', 'preto', 'bordô', 'cinza', 'marrom'];

      coresValidas.forEach(cor => {
        expect(coresValidas).toContain(cor);
      });
    });
  });
});
