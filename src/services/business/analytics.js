import { logger } from '../../utils/logger.js';
import { query } from '../../config/database.js';

/**
 * Análise de vendas dos últimos N dias (usando SQLite)
 */
async function analisarVendas(diasRetroceder = 7) {
  try {
    logger.info(`Analisando vendas dos últimos ${diasRetroceder} dias`);

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasRetroceder);
    const dataLimiteISO = dataLimite.toISOString();

    // Buscar pedidos pagos no período
    const pedidosRecentes = query(
      `SELECT * FROM pedidos
       WHERE status_pagamento = 'PAGO'
         AND data_pagamento >= ?`,
      [dataLimiteISO]
    );

    // Métricas gerais
    const totalVendido = pedidosRecentes.reduce((sum, p) => sum + (parseFloat(p.valor_total) || 0), 0);
    const quantidadePedidos = pedidosRecentes.length;
    const ticketMedio = quantidadePedidos > 0 ? totalVendido / quantidadePedidos : 0;

    // Análise por modelo
    const porModelo = {};
    pedidosRecentes.forEach(p => {
      try {
        const itens = JSON.parse(p.itens_json || '[]');
        itens.forEach(item => {
          if (!porModelo[item.modelo]) {
            porModelo[item.modelo] = { quantidade: 0, valor: 0 };
          }
          porModelo[item.modelo].quantidade += item.quantidade || 1;
          porModelo[item.modelo].valor += (item.preco || 0) * (item.quantidade || 1);
        });
      } catch (_) {}
    });

    const maisVendidos = Object.entries(porModelo)
      .sort((a, b) => b[1].quantidade - a[1].quantidade)
      .slice(0, 5)
      .map(([modelo, dados]) => ({
        modelo,
        quantidade: dados.quantidade,
        valor: parseFloat(dados.valor.toFixed(2))
      }));

    // Vendas por dia (para gráfico)
    const vendasPorDia = {};
    for (let i = diasRetroceder - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      vendasPorDia[d.toISOString().slice(0, 10)] = 0;
    }
    pedidosRecentes.forEach(p => {
      if (!p.data_pagamento) return;
      const dia = p.data_pagamento.slice(0, 10);
      if (vendasPorDia[dia] !== undefined) {
        vendasPorDia[dia] += parseFloat(p.valor_total) || 0;
      }
    });

    return {
      periodo: `últimos ${diasRetroceder} dias`,
      totalVendido: parseFloat(totalVendido.toFixed(2)),
      quantidadePedidos,
      ticketMedio: parseFloat(ticketMedio.toFixed(2)),
      maisVendidos,
      vendasPorDia: Object.entries(vendasPorDia).map(([data, valor]) => ({
        data,
        valor: parseFloat(valor.toFixed(2))
      }))
    };
  } catch (error) {
    logger.error('Erro ao analisar vendas:', error.message);
    throw error;
  }
}

/**
 * Análise de estoque (alertas de baixo estoque)
 */
async function analisarEstoque() {
  try {
    logger.info('Analisando níveis de estoque');

    const todoProduto = query(
      "SELECT * FROM estoque WHERE UPPER(status) = 'ATIVO' ORDER BY (quantidade_total - quantidade_reservada) ASC"
    );

    // Velocidade de venda dos últimos 7 dias
    const analiseVendas = await analisarVendas(7);
    const velocidade = {};
    analiseVendas.maisVendidos.forEach(v => {
      velocidade[v.modelo] = v.quantidade / 7;
    });

    const alertas = [];
    const statusEstoque = [];

    todoProduto.forEach(produto => {
      const disponivel = (parseInt(produto.quantidade_total) || 0) - (parseInt(produto.quantidade_reservada) || 0);
      const velocidadeDiaria = velocidade[produto.modelo] || 0.5;
      const diasRestantes = velocidadeDiaria > 0 ? Math.floor(disponivel / velocidadeDiaria) : 999;

      statusEstoque.push({
        modelo: produto.modelo,
        cor: produto.cor,
        tamanho: produto.tamanho,
        disponivel,
        diasRestantes: Math.max(0, diasRestantes),
        velocidadeDiaria: parseFloat(velocidadeDiaria.toFixed(2))
      });

      if (disponivel === 0) {
        alertas.push({ tipo: 'SEM_ESTOQUE', produto: `${produto.modelo} ${produto.tamanho} ${produto.cor}`, disponivel, diasRestantes: 0 });
      } else if (diasRestantes <= 3) {
        alertas.push({ tipo: 'URGENTE', produto: `${produto.modelo} ${produto.tamanho} ${produto.cor}`, disponivel, diasRestantes });
      } else if (diasRestantes <= 7) {
        alertas.push({ tipo: 'AVISO', produto: `${produto.modelo} ${produto.tamanho} ${produto.cor}`, disponivel, diasRestantes });
      }
    });

    alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);

    return {
      statusEstoque: statusEstoque.slice(0, 10),
      alertas,
      totalProdutos: statusEstoque.length,
      zerados: statusEstoque.filter(s => s.disponivel === 0).length
    };
  } catch (error) {
    logger.error('Erro ao analisar estoque:', error.message);
    throw error;
  }
}

/**
 * Análise de clientes (VIPs, inativos)
 */
async function analisarClientes() {
  try {
    logger.info('Analisando base de clientes');

    const todosClientes = query('SELECT * FROM clientes ORDER BY total_gasto DESC');

    const vips = todosClientes
      .filter(c => parseFloat(c.total_gasto) > 0)
      .slice(0, 5)
      .map(c => ({
        nome: c.nome,
        whatsapp: c.whatsapp,
        totalGasto: parseFloat(c.total_gasto),
        quantidadePedidos: parseInt(c.quantidade_pedidos) || 0,
        modeloFavorito: c.modelo_favorito || 'N/A'
      }));

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);

    const inativos = todosClientes
      .filter(c => !c.data_ultimo_pedido || new Date(c.data_ultimo_pedido) < dataLimite)
      .map(c => ({
        nome: c.nome,
        whatsapp: c.whatsapp,
        diasSemCompra: c.data_ultimo_pedido
          ? Math.floor((Date.now() - new Date(c.data_ultimo_pedido)) / 86400000)
          : 999,
        quantidadePedidos: parseInt(c.quantidade_pedidos) || 0
      }))
      .sort((a, b) => b.diasSemCompra - a.diasSemCompra)
      .slice(0, 10);

    return {
      totalClientes: todosClientes.length,
      vips,
      inativos
    };
  } catch (error) {
    logger.error('Erro ao analisar clientes:', error.message);
    throw error;
  }
}

/**
 * Relatório completo do dia
 */
async function gerarRelatorioDiario() {
  try {
    logger.info('Gerando relatório diário completo');
    const vendas = await analisarVendas(1);
    const estoque = await analisarEstoque();
    const clientes = await analisarClientes();

    return {
      data: new Date().toLocaleDateString('pt-BR'),
      hora: new Date().toLocaleTimeString('pt-BR'),
      vendas, estoque, clientes
    };
  } catch (error) {
    logger.error('Erro ao gerar relatório diário:', error.message);
    throw error;
  }
}

export { analisarVendas, analisarEstoque, analisarClientes, gerarRelatorioDiario };
