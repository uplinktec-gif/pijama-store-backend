import { logger } from '../../utils/logger.js';
import * as clientesSheets from '../sqlite/clientes.js';
import * as pedidosSheets from '../sqlite/pedidos.js';
import { analisarVendas, analisarEstoque } from './analytics.js';

/**
 * Gera recomendação personalizada para cliente específico
 */
async function gerarRecomendacaoCliente(whatsapp) {
  try {
    logger.info(`Gerando recomendação para cliente ${whatsapp}`);

    // Buscar dados do cliente
    const cliente = await clientesSheets.findByWhatsApp(whatsapp);
    if (!cliente) {
      return {
        success: false,
        mensagem: 'Cliente não encontrado'
      };
    }

    // Buscar histórico de compras do cliente
    const todosPedidos = await pedidosSheets.obterTodos();
    const pedidosCliente = todosPedidos.filter(p =>
      p.CLIENTE_WHATSAPP === whatsapp && p.STATUS_PAGAMENTO === 'PAGO'
    );

    // Analisar tendências do cliente
    const modelosComprados = {};
    const coresCompradas = {};
    const tamanhosComprados = {};

    pedidosCliente.forEach(pedido => {
      const itens = JSON.parse(pedido.ITENS_JSON || '[]');
      itens.forEach(item => {
        modelosComprados[item.modelo] = (modelosComprados[item.modelo] || 0) + 1;
        if (item.cor) coresCompradas[item.cor] = (coresCompradas[item.cor] || 0) + 1;
        if (item.tamanho) tamanhosComprados[item.tamanho] = (tamanhosComprados[item.tamanho] || 0) + 1;
      });
    });

    // Obter modelo favorito
    const modeloFavorito = Object.entries(modelosComprados)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || cliente.MODELO_FAVORITO;

    // Obter cor favorita
    const corFavorita = Object.entries(coresCompradas)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Obter tamanho favorito
    const tamanhoFavorito = Object.entries(tamanhosComprados)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Analisar produtos em alta e estoque baixo
    const vendas = await analisarVendas(7);
    const estoque = await analisarEstoque();

    // Produtos em alta que o cliente ainda não comprou
    const productsEmAlta = vendas.maisVendidos
      .filter(p => !modelosComprados[p.modelo])
      .slice(0, 2);

    // Cores em falta
    const cores_com_alerta = estoque.alertas
      .filter(a => a.tipo === 'URGENTE')
      .slice(0, 2);

    // Montar recomendação
    let mensagem = `💡 Recomendação Personalizada para ${cliente.NOME}:\n\n`;

    if (modeloFavorito) {
      mensagem += `⭐ Você adora ${modeloFavorito}!\n`;
      if (corFavorita) {
        mensagem += `   Que tal tentar em outra cor? Temos ${modeloFavorito} em várias cores.\n\n`;
      }
    }

    if (productsEmAlta.length > 0) {
      mensagem += `🔥 Em alta agora:\n`;
      productsEmAlta.forEach(p => {
        mensagem += `   • ${p.modelo} (${p.quantidade} vendidos essa semana)\n`;
      });
      mensagem += `\n`;
    }

    if (cores_com_alerta.length > 0) {
      mensagem += `⚠️ Estoque acabando:\n`;
      cores_com_alerta.forEach(a => {
        mensagem += `   • ${a.produto} (${a.diasRestantes} dias restantes)\n`;
      });
      mensagem += `\n`;
    }

    mensagem += `Quer fazer um novo pedido? 😊`;

    return {
      success: true,
      mensagem,
      dados: {
        cliente: cliente.NOME,
        modeloFavorito,
        corFavorita,
        tamanhofavorito: tamanhoFavorito,
        productsEmAlta,
        productsComAlerta: cores_com_alerta
      }
    };
  } catch (error) {
    logger.error('Erro ao gerar recomendação:', error.message);
    return {
      success: false,
      mensagem: 'Erro ao gerar recomendação',
      erro: error.message
    };
  }
}

/**
 * Recomendação geral: o que Felipe deveria encomendar
 */
async function gerarRecomendacaoEstoque() {
  try {
    logger.info('Gerando recomendação de estoque');

    const vendas = await analisarVendas(7);
    const estoque = await analisarEstoque();

    // Produtos com dias restantes <= 7
    const produtosParaEncomendar = estoque.statusEstoque
      .filter(p => p.diasRestantes <= 7)
      .map(p => ({
        modelo: p.modelo,
        cor: p.cor,
        diasRestantes: p.diasRestantes,
        sugestao: `${p.modelo} ${p.cor} - ${Math.ceil(p.disponivel * 2)} unidades`
      }));

    let mensagem = `📊 ANÁLISE DE ESTOQUE\n\n`;
    mensagem += `✅ Últimos 7 dias:\n`;
    mensagem += `   Total vendido: R$ ${vendas.totalVendido.toLocaleString('pt-BR')}\n`;
    mensagem += `   Pedidos: ${vendas.quantidadePedidos}\n`;
    mensagem += `   Ticket médio: R$ ${vendas.ticketMedio.toLocaleString('pt-BR')}\n\n`;

    mensagem += `🔥 Mais vendidos:\n`;
    vendas.maisVendidos.forEach(p => {
      mensagem += `   • ${p.modelo}: ${p.quantidade} unidades\n`;
    });

    if (produtosParaEncomendar.length > 0) {
      mensagem += `\n⚠️ RECOMENDAÇÃO DE COMPRA:\n`;
      produtosParaEncomendar.forEach(p => {
        mensagem += `   • ${p.sugestao}\n`;
      });
    } else {
      mensagem += `\n✅ Estoque em bom estado!\n`;
    }

    return {
      success: true,
      mensagem,
      produtosParaEncomendar,
      analiseVendas: vendas
    };
  } catch (error) {
    logger.error('Erro ao gerar recomendação de estoque:', error.message);
    return {
      success: false,
      mensagem: 'Erro ao gerar recomendação',
      erro: error.message
    };
  }
}

export {
  gerarRecomendacaoCliente,
  gerarRecomendacaoEstoque
};
