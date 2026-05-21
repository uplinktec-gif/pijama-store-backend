import { logger } from '../../utils/logger.js';
import * as clientesSheets from '../sqlite/clientes.js';
import * as pedidosSheets from '../sqlite/pedidos.js';

/**
 * Obtém perfil completo do cliente com estatísticas
 */
async function obterPerfilCliente(whatsapp) {
  try {
    const cliente = await clientesSheets.findByWhatsApp(whatsapp);

    if (!cliente) {
      return { success: false, error: 'Cliente não encontrado' };
    }

    return {
      success: true,
      cliente,
      stats: {
        total_gasto: cliente.total_gasto,
        quantidade_pedidos: cliente.quantidade_pedidos,
        ticket_medio: cliente.quantidade_pedidos > 0 ? cliente.total_gasto / cliente.quantidade_pedidos : 0,
        modelo_favorito: cliente.modelo_favorito || 'Nenhum',
        dias_sem_comprar: cliente.data_ultimo_pedido
          ? Math.floor((new Date() - new Date(cliente.data_ultimo_pedido)) / (1000 * 60 * 60 * 24))
          : 0
      }
    };
  } catch (error) {
    logger.error('Erro ao obter perfil do cliente:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista clientes VIP (maior valor gasto)
 */
async function listarVIPs() {
  try {
    const vips = await clientesSheets.listarVIPs();

    const vipsOrdenados = vips.sort((a, b) => b.total_gasto - a.total_gasto);

    return {
      success: true,
      vips: vipsOrdenados,
      total: vipsOrdenados.length
    };
  } catch (error) {
    logger.error('Erro ao listar VIPs:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista clientes inativos (sem compras há X dias)
 */
async function listarInativos(diasLimite = 30) {
  try {
    const inativos = await clientesSheets.listarInativos(diasLimite);

    return {
      success: true,
      inativos: inativos.sort((a, b) => {
        const dataA = new Date(a.data_ultimo_pedido);
        const dataB = new Date(b.data_ultimo_pedido);
        return dataA - dataB;
      }),
      total: inativos.length,
      dias_limite: diasLimite
    };
  } catch (error) {
    logger.error('Erro ao listar inativos:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Calcula LTV (Lifetime Value) de um cliente
 */
async function calcularLTV(whatsapp) {
  try {
    const perfil = await obterPerfilCliente(whatsapp);

    if (!perfil.success) {
      return perfil;
    }

    const cliente = perfil.cliente;

    // LTV simples = total gasto
    // LTV previsivo = ticket_médio * frequência esperada * duração esperada
    const diasCliente = Math.floor((new Date() - new Date(cliente.data_primeiro_pedido)) / (1000 * 60 * 60 * 24)) || 1;
    const frequenciaDias = cliente.quantidade_pedidos > 0 ? diasCliente / cliente.quantidade_pedidos : diasCliente;

    const ltv = {
      atual: cliente.total_gasto,
      previsao_30dias: cliente.quantidade_pedidos > 0 ? perfil.stats.ticket_medio * (30 / frequenciaDias) : 0,
      previsao_1ano: cliente.quantidade_pedidos > 0 ? perfil.stats.ticket_medio * (365 / frequenciaDias) : 0
    };

    return {
      success: true,
      cliente: cliente.nome,
      ltv
    };
  } catch (error) {
    logger.error('Erro ao calcular LTV:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Gera recomendação de produto para cliente baseado no histórico
 */
async function gerarRecomendacao(whatsapp) {
  try {
    const perfil = await obterPerfilCliente(whatsapp);

    if (!perfil.success) {
      return perfil;
    }

    // Recomendação simples: sugerir modelo favorito com cor diferente
    const modeloFavorito = perfil.cliente.modelo_favorito;

    if (!modeloFavorito) {
      return {
        success: true,
        recomendacao: 'Explore nossos modelos! Temos ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ e ANNE.'
      };
    }

    const cores = ['azul marinho', 'preto', 'bordô', 'cinza', 'marrom'];
    const coremensagem = cores.join(', ');

    return {
      success: true,
      recomendacao: `Você já comprou ${modeloFavorito}. Que tal tentar em outra cor? Disponível em: ${coremensagem}.`
    };
  } catch (error) {
    logger.error('Erro ao gerar recomendação:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Gera relatório de clientes para análise
 */
async function gerarRelatorioClientes() {
  try {
    const vips = await listarVIPs();
    const inativos = await listarInativos(30);

    const vipsData = vips.success ? vips.vips : [];
    const inatcvosData = inativos.success ? inativos.inativos : [];

    return {
      success: true,
      relatorio: {
        data_geracao: new Date().toISOString(),
        vips_count: vipsData.length,
        inativos_count: inatcvosData.length,
        top_3_vips: vipsData.slice(0, 3).map(v => ({
          nome: v.nome,
          total_gasto: v.total_gasto,
          quantidade_pedidos: v.quantidade_pedidos
        })),
        clientes_para_reengajamento: inatcvosData.slice(0, 5).map(c => ({
          nome: c.nome,
          dias_sem_comprar: Math.floor((new Date() - new Date(c.data_ultimo_pedido)) / (1000 * 60 * 60 * 24)),
          total_historico: c.total_gasto
        }))
      }
    };
  } catch (error) {
    logger.error('Erro ao gerar relatório de clientes:', error.message);
    return { success: false, error: error.message };
  }
}

export {
  obterPerfilCliente,
  listarVIPs,
  listarInativos,
  calcularLTV,
  gerarRecomendacao,
  gerarRelatorioClientes
};
