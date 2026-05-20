import { logger } from '../../utils/logger.js';
import * as estoqueSheets from '../sheets/estoque.js';

/**
 * Retorna todo o estoque com formatação para análise
 */
async function obterEstoqueCompleto() {
  try {
    const estoque = await estoqueSheets.readAllEstoque();

    if (estoque.length === 0) {
      return { success: true, estoque: [], total: 0, disponivel: 0 };
    }

    const total = estoque.reduce((sum, item) => sum + item.quantidade_total, 0);
    const disponivel = estoque.reduce((sum, item) => sum + item.quantidade_disponivel, 0);
    const reservado = estoque.reduce((sum, item) => sum + item.quantidade_reservada, 0);

    return {
      success: true,
      estoque,
      stats: {
        total,
        disponivel,
        reservado,
        quantidade_itens: estoque.length
      }
    };
  } catch (error) {
    logger.error('Erro ao obter estoque completo:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Retorna itens com estoque baixo (< 5 unidades)
 */
async function obterEstoqueBaixo(limite = 5) {
  try {
    const estoque = await estoqueSheets.readAllEstoque();

    const baixo = estoque.filter(item => item.quantidade_disponivel < limite);

    return {
      success: true,
      itens: baixo,
      total: baixo.length
    };
  } catch (error) {
    logger.error('Erro ao obter estoque baixo:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Retorna items por modelo (para análise de vendas)
 */
async function obterPorModelo(modelo) {
  try {
    const estoque = await estoqueSheets.readAllEstoque();

    const itens = estoque.filter(
      item => item.modelo.toUpperCase() === modelo.toUpperCase()
    );

    const total_disponivel = itens.reduce((sum, item) => sum + item.quantidade_disponivel, 0);
    const preco_medio = itens.length > 0
      ? itens.reduce((sum, item) => sum + item.preco_unitario, 0) / itens.length
      : 0;

    return {
      success: true,
      modelo,
      itens,
      stats: {
        total_disponivel,
        preco_medio,
        cores_disponiveis: itens.map(i => i.cor),
        tamanhos_disponiveis: itens.map(i => i.tamanho)
      }
    };
  } catch (error) {
    logger.error('Erro ao obter itens por modelo:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Calcula dias até esgotar estoque (baseado em velocidade de venda)
 */
async function calcularDiasAteEsgotamento(modelo, diasHistorico = 7) {
  // Função futura que vai usar dados de pedidos para calcular velocidade
  logger.warn('calcularDiasAteEsgotamento: Função não implementada (requer dados históricos)');
  return { success: false, error: 'Função não implementada' };
}

/**
 * Gera relatório de estoque para análise
 */
async function gerarRelatorioEstoque() {
  try {
    const estoqueCompleto = await obterEstoqueCompleto();
    if (!estoqueCompleto.success) {
      return estoqueCompleto;
    }

    const estoqueBaixo = await obterEstoqueBaixo();

    // Agrupar por modelo
    const porModelo = {};
    estoqueCompleto.estoque.forEach(item => {
      if (!porModelo[item.modelo]) {
        porModelo[item.modelo] = {
          total_disponivel: 0,
          total_reservado: 0,
          total_quantidade: 0,
          cores: []
        };
      }
      porModelo[item.modelo].total_disponivel += item.quantidade_disponivel;
      porModelo[item.modelo].total_reservado += item.quantidade_reservada;
      porModelo[item.modelo].total_quantidade += item.quantidade_total;
      porModelo[item.modelo].cores.push(item.cor);
    });

    return {
      success: true,
      relatorio: {
        data_geracao: new Date().toISOString(),
        total_estoque: estoqueCompleto.stats,
        itens_baixos: estoqueBaixo.total,
        por_modelo: porModelo
      }
    };
  } catch (error) {
    logger.error('Erro ao gerar relatório de estoque:', error.message);
    return { success: false, error: error.message };
  }
}

export {
  obterEstoqueCompleto,
  obterEstoqueBaixo,
  obterPorModelo,
  calcularDiasAteEsgotamento,
  gerarRelatorioEstoque
};
