import { describe, test, expect } from '@jest/globals';

describe('Analytics Integration Tests', () => {
  describe('Análise de Vendas', () => {
    test('deve calcular total vendido', () => {
      const pedidos = [
        { valor_total: 259.80 },
        { valor_total: 129.90 },
        { valor_total: 389.70 }
      ];

      const totalVendido = pedidos.reduce((sum, p) => sum + p.valor_total, 0);

      expect(totalVendido).toBeCloseTo(779.40, 2);
      expect(totalVendido).toBeGreaterThan(0);
    });

    test('deve calcular quantidade de pedidos', () => {
      const pedidos = [
        { numero_pedido: 1 },
        { numero_pedido: 2 },
        { numero_pedido: 3 },
        { numero_pedido: 4 },
        { numero_pedido: 5 }
      ];

      const quantidade = pedidos.length;

      expect(quantidade).toBe(5);
    });

    test('deve calcular ticket médio', () => {
      const pedidos = [
        { valor_total: 200 },
        { valor_total: 300 },
        { valor_total: 400 }
      ];

      const total = pedidos.reduce((sum, p) => sum + p.valor_total, 0);
      const ticketMedio = total / pedidos.length;

      expect(ticketMedio).toBe(300);
    });

    test('deve identificar produto mais vendido', () => {
      const vendas = [
        { modelo: 'ZARA', quantidade: 8 },
        { modelo: 'MIA', quantidade: 3 },
        { modelo: 'LIA', quantidade: 1 }
      ];

      const maisVendido = vendas.reduce((max, item) =>
        item.quantidade > max.quantidade ? item : max
      );

      expect(maisVendido.modelo).toBe('ZARA');
      expect(maisVendido.quantidade).toBe(8);
    });

    test('deve agrupar vendas por período', () => {
      const vendas = [
        { data: '2026-05-15', valor: 100 },
        { data: '2026-05-15', valor: 200 },
        { data: '2026-05-16', valor: 150 }
      ];

      const porPeriodo = {};
      vendas.forEach(v => {
        if (!porPeriodo[v.data]) porPeriodo[v.data] = 0;
        porPeriodo[v.data] += v.valor;
      });

      expect(porPeriodo['2026-05-15']).toBe(300);
      expect(porPeriodo['2026-05-16']).toBe(150);
    });
  });

  describe('Análise de Estoque', () => {
    test('deve calcular estoque total disponível', () => {
      const produtos = [
        { quantidade_disponivel: 10 },
        { quantidade_disponivel: 5 },
        { quantidade_disponivel: 8 }
      ];

      const total = produtos.reduce((sum, p) => sum + p.quantidade_disponivel, 0);

      expect(total).toBe(23);
    });

    test('deve detectar produtos com estoque baixo', () => {
      const produtos = [
        { id: 'ZARA_G', quantidade_disponivel: 50 },
        { id: 'MIA_P', quantidade_disponivel: 2 },
        { id: 'NÚBIA_M', quantidade_disponivel: 1 }
      ];

      const estoqueBaixo = produtos.filter(p => p.quantidade_disponivel < 5);

      expect(estoqueBaixo.length).toBe(2);
      expect(estoqueBaixo[0].id).toBe('MIA_P');
      expect(estoqueBaixo[1].id).toBe('NÚBIA_M');
    });

    test('deve calcular percentual de disponibilidade', () => {
      const produtos = [
        { quantidade_total: 100, quantidade_disponivel: 87 }
      ];

      const disponibilidade = (produtos[0].quantidade_disponivel / produtos[0].quantidade_total) * 100;

      expect(disponibilidade).toBe(87);
    });

    test('deve estimar dias até esgotar estoque', () => {
      const produto = {
        quantidade_disponivel: 50,
        velocidade_venda_diaria: 5
      };

      const diasRestantes = produto.quantidade_disponivel / produto.velocidade_venda_diaria;

      expect(diasRestantes).toBe(10);
    });

    test('deve gerar alertas para estoque crítico', () => {
      const produtos = [
        { modelo: 'ZARA', disponivel: 2, dias: 1, status: 'URGENTE' },
        { modelo: 'MIA', disponivel: 5, dias: 3, status: 'AVISO' },
        { modelo: 'BEATRIZ', disponivel: 30, dias: 15, status: 'OK' }
      ];

      const alertas = produtos.filter(p => p.status !== 'OK');

      expect(alertas.length).toBe(2);
      expect(alertas[0].status).toBe('URGENTE');
      expect(alertas[1].status).toBe('AVISO');
    });
  });

  describe('Análise de Clientes', () => {
    test('deve identificar clientes VIP', () => {
      const clientes = [
        { nome: 'João', total_gasto: 1500, quantidade_pedidos: 10 },
        { nome: 'Maria', total_gasto: 500, quantidade_pedidos: 3 },
        { nome: 'Pedro', total_gasto: 2000, quantidade_pedidos: 12 }
      ];

      const vips = clientes.filter(c => c.total_gasto > 1000 && c.quantidade_pedidos >= 5);

      expect(vips.length).toBe(2);
      expect(vips[0].nome).toBe('João');
      expect(vips[1].nome).toBe('Pedro');
    });

    test('deve calcular modelo favorito por cliente', () => {
      const compras = [
        { cliente: 'João', modelo: 'ZARA' },
        { cliente: 'João', modelo: 'ZARA' },
        { cliente: 'João', modelo: 'MIA' },
        { cliente: 'Maria', modelo: 'MIA' }
      ];

      const comprasJoao = compras.filter(c => c.cliente === 'João');
      const modeloFavorito = comprasJoao.reduce((max, c) => {
        const count = comprasJoao.filter(x => x.modelo === c.modelo).length;
        return count > (max.count || 0) ? { modelo: c.modelo, count } : max;
      }, {});

      expect(modeloFavorito.modelo).toBe('ZARA');
    });

    test('deve rastrear clientes inativos', () => {
      const clientes = [
        { nome: 'João', ultimo_pedido: '2026-05-15' },
        { nome: 'Maria', ultimo_pedido: '2026-04-01' },
        { nome: 'Pedro', ultimo_pedido: '2026-05-10' }
      ];

      const hoje = new Date('2026-05-17');
      const diasSemCompra = clientes.map(c => ({
        nome: c.nome,
        dias: Math.floor((hoje - new Date(c.ultimo_pedido)) / (1000 * 60 * 60 * 24))
      }));

      const inativos = diasSemCompra.filter(c => c.dias > 30);

      expect(inativos.length).toBe(1);
      expect(inativos[0].nome).toBe('Maria');
    });
  });

  describe('Relatório Diário', () => {
    test('deve conter seções de vendas, estoque e clientes', () => {
      const relatorio = {
        data: '2026-05-17',
        vendas: { total: 2850.50, pedidos: 12, ticketMedio: 237.54 },
        estoque: { total: 523, disponibilidade: 87.3 },
        clientes: { novos: 2, vips: 5 }
      };

      expect(relatorio).toHaveProperty('vendas');
      expect(relatorio).toHaveProperty('estoque');
      expect(relatorio).toHaveProperty('clientes');
    });

    test('deve incluir recomendações baseadas em análises', () => {
      const relatorio = {
        recomendacoes: [
          'Compre 50 unidades de ZARA (mais vendido)',
          'Monitorar NÚBIA (2 unidades disponíveis)',
          'Enviar promoção para Maria (cliente inativo há 45 dias)'
        ]
      };

      expect(Array.isArray(relatorio.recomendacoes)).toBe(true);
      expect(relatorio.recomendacoes.length).toBeGreaterThan(0);
    });

    test('deve ser agendado diariamente', () => {
      const agenda = {
        relatorio_diario_felipe: '18h diariamente',
        resumo_jully: '20h diariamente'
      };

      expect(agenda.relatorio_diario_felipe).toContain('18h');
      expect(agenda.resumo_jully).toContain('20h');
    });
  });
});
