import { logger } from '../../utils/logger.js';
import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';

/**
 * Helper: buscar todos os pedidos da sheet
 */
async function buscarTodosPedidos() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'PEDIDOS_E_VENDAS!A:P'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    // Pular cabeçalho
    const pedidos = [];
    const headers = rows[0];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue; // Pular linhas vazias

      const pedido = {};
      headers.forEach((h, idx) => {
        pedido[h] = row[idx] || '';
      });
      pedidos.push(pedido);
    }
    return pedidos;
  } catch (error) {
    logger.error('Erro ao buscar pedidos:', error.message);
    return [];
  }
}

/**
 * Análise de vendas dos últimos N dias
 */
async function analisarVendas(diasRetroceder = 7) {
  try {
    logger.info(`Analisando vendas dos últimos ${diasRetroceder} dias`);

    // Buscar todos os pedidos
    const todosPedidos = await buscarTodosPedidos();

    // Filtrar pedidos pagos dos últimos N dias
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasRetroceder);

    const pedidosRecentes = todosPedidos.filter(p => {
      if (!p.DATA_PAGAMENTO) return false;
      const dataPedido = new Date(p.DATA_PAGAMENTO);
      return dataPedido >= dataLimite && (p.STATUS_PAGAMENTO === 'PAGO' || p.STATUS_PAGAMENTO === 'pago');
    });

    // Calcular métricas
    const totalVendido = pedidosRecentes.reduce((sum, p) => sum + (parseFloat(p.VALOR_TOTAL) || 0), 0);
    const quantidadePedidos = pedidosRecentes.length;
    const ticketMedio = quantidadePedidos > 0 ? totalVendido / quantidadePedidos : 0;

    // Análise por modelo
    const porModelo = {};
    pedidosRecentes.forEach(p => {
      try {
        const itens = JSON.parse(p.ITENS_JSON || '[]');
        itens.forEach(item => {
          if (!porModelo[item.modelo]) {
            porModelo[item.modelo] = { quantidade: 0, valor: 0 };
          }
          porModelo[item.modelo].quantidade += item.quantidade || 1;
          porModelo[item.modelo].valor += item.preco ? item.preco * (item.quantidade || 1) : 0;
        });
      } catch (e) {
        // Ignorar erros de parse
      }
    });

    // Produtos mais vendidos (ordenado por quantidade)
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
      const dia = new Date(p.DATA_PAGAMENTO).toISOString().slice(0, 10);
      if (vendasPorDia[dia] !== undefined) {
        vendasPorDia[dia] += parseFloat(p.VALOR_TOTAL) || 0;
      }
    });

    return {
      periodo: `últimos ${diasRetroceder} dias`,
      totalVendido: parseFloat(totalVendido.toFixed(2)),
      quantidadePedidos,
      ticketMedio: parseFloat(ticketMedio.toFixed(2)),
      maisVendidos,
      vendasPorDia: Object.entries(vendasPorDia).map(([data, valor]) => ({ data, valor: parseFloat(valor.toFixed(2)) }))
    };
  } catch (error) {
    logger.error('Erro ao analisar vendas:', error.message);
    throw error;
  }
}

/**
 * Helper: buscar todo estoque
 */
async function buscarTodoEstoque() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'ESTOQUE!A:K'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const estoque = [];
    const headers = rows[0];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const produto = {};
      headers.forEach((h, idx) => {
        produto[h] = row[idx] || '';
      });
      estoque.push(produto);
    }
    return estoque;
  } catch (error) {
    logger.error('Erro ao buscar estoque:', error.message);
    return [];
  }
}

/**
 * Análise de estoque (dias até esgotar)
 */
async function analisarEstoque() {
  try {
    logger.info('Analisando níveis de estoque');

    const todoProduto = await buscarTodoEstoque();

    // Calcular velocidade de venda (últimos 7 dias)
    const analiseVendas = await analisarVendas(7);
    const vendidosPorModelo = analiseVendas.maisVendidos;

    // Mapear velocidade
    const velocidade = {};
    vendidosPorModelo.forEach(v => {
      velocidade[v.modelo] = v.quantidade / 7; // por dia
    });

    // Analisar estoque
    const alertas = [];
    const statusEstoque = [];

    todoProduto.forEach(produto => {
      const status = (produto.STATUS || '').toLowerCase();
      if (status !== 'ativo' && status !== 'active') return;

      const disponivel = parseInt(produto.QUANTIDADE_DISPONIVEL) || 0;
      const velocidadeDiaria = velocidade[produto.MODELO] || 0.5;

      let diasRestantes = 999;
      if (velocidadeDiaria > 0) {
        diasRestantes = Math.floor(disponivel / velocidadeDiaria);
      }

      statusEstoque.push({
        modelo: produto.MODELO || 'N/A',
        cor: produto.COR || 'N/A',
        tamanho: produto.TAMANHO || 'N/A',
        disponivel,
        diasRestantes: Math.max(0, diasRestantes),
        velocidadeDiaria: parseFloat(velocidadeDiaria.toFixed(2))
      });

      // Alertas
      if (diasRestantes <= 3) {
        alertas.push({
          tipo: 'URGENTE',
          modelo: produto.MODELO,
          tamanho: produto.TAMANHO || 'N/A',
          cor: produto.COR || 'N/A',
          produto: `${produto.MODELO} ${produto.TAMANHO} ${produto.COR}`,
          disponivel,
          diasRestantes
        });
      } else if (diasRestantes <= 7) {
        alertas.push({
          tipo: 'AVISO',
          modelo: produto.MODELO,
          tamanho: produto.TAMANHO || 'N/A',
          cor: produto.COR || 'N/A',
          produto: `${produto.MODELO} ${produto.TAMANHO} ${produto.COR}`,
          disponivel,
          diasRestantes
        });
      }
    });

    // Ordenar por dias restantes
    statusEstoque.sort((a, b) => a.diasRestantes - b.diasRestantes);
    alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);

    return {
      statusEstoque: statusEstoque.slice(0, 10),
      alertas,
      totalProdutos: statusEstoque.length
    };
  } catch (error) {
    logger.error('Erro ao analisar estoque:', error.message);
    throw error;
  }
}

/**
 * Helper: buscar todos os clientes da sheet
 */
async function buscarTodosClientes() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'CLIENTES!A:N'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const clientes = [];
    const headers = rows[0];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const cliente = {};
      headers.forEach((h, idx) => {
        cliente[h] = row[idx] || '';
      });
      clientes.push(cliente);
    }
    return clientes;
  } catch (error) {
    logger.error('Erro ao buscar clientes:', error.message);
    return [];
  }
}

/**
 * Análise de clientes (VIPs, inativos)
 */
async function analisarClientes() {
  try {
    logger.info('Analisando base de clientes');

    const todosClientes = await buscarTodosClientes();

    // Calcular VIPs (maiores gastos)
    const vips = todosClientes
      .filter(c => c.TOTAL_GASTO && parseFloat(c.TOTAL_GASTO) > 0)
      .sort((a, b) => parseFloat(b.TOTAL_GASTO) - parseFloat(a.TOTAL_GASTO))
      .slice(0, 5)
      .map(c => ({
        nome: c.NOME,
        whatsapp: c.WHATSAPP,
        totalGasto: parseFloat(c.TOTAL_GASTO),
        quantidadePedidos: parseInt(c.QUANTIDADE_PEDIDOS) || 0,
        modeloFavorito: c.MODELO_FAVORITO || 'N/A'
      }));

    // Clientes inativos (>30 dias sem compra)
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);

    const inativos = todosClientes
      .filter(c => {
        if (!c.DATA_ULTIMO_PEDIDO) return true; // Nunca comprou
        const dataUltimo = new Date(c.DATA_ULTIMO_PEDIDO);
        return dataUltimo < dataLimite;
      })
      .map(c => ({
        nome: c.NOME,
        whatsapp: c.WHATSAPP,
        diasSemCompra: c.DATA_ULTIMO_PEDIDO ?
          Math.floor((new Date() - new Date(c.DATA_ULTIMO_PEDIDO)) / (1000 * 60 * 60 * 24)) :
          999,
        quantidadePedidos: parseInt(c.QUANTIDADE_PEDIDOS) || 0
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

    const vendas = await analisarVendas(1); // Apenas hoje
    const estoque = await analisarEstoque();
    const clientes = await analisarClientes();

    return {
      data: new Date().toLocaleDateString('pt-BR'),
      hora: new Date().toLocaleTimeString('pt-BR'),
      vendas,
      estoque,
      clientes
    };
  } catch (error) {
    logger.error('Erro ao gerar relatório diário:', error.message);
    throw error;
  }
}

export {
  analisarVendas,
  analisarEstoque,
  analisarClientes,
  gerarRelatorioDiario
};
