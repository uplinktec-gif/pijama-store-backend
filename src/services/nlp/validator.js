import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import * as estoqueService from '../sqlite/estoque.js';

/**
 * Valida se um modelo existe no catálogo
 */
function validarModelo(modelo) {
  if (!modelo) return { valid: false, error: 'Modelo não informado' };

  const modeloUpper = modelo.toUpperCase();
  if (!env.catalogoModelos.includes(modeloUpper)) {
    return {
      valid: false,
      error: `Modelo "${modelo}" não existe`,
      sugestoes: env.catalogoModelos
    };
  }

  return { valid: true, modelo: modeloUpper };
}

/**
 * Valida se um tamanho existe no catálogo
 */
function validarTamanho(tamanho) {
  if (!tamanho) return { valid: false, error: 'Tamanho não informado' };

  const tamanhoUpper = tamanho.toUpperCase();
  if (!env.catalogoTamanhos.includes(tamanhoUpper)) {
    return {
      valid: false,
      error: `Tamanho "${tamanho}" não existe`,
      sugestoes: env.catalogoTamanhos
    };
  }

  return { valid: true, tamanho: tamanhoUpper };
}

/**
 * Valida se uma cor existe no catálogo
 */
function validarCor(cor) {
  if (!cor) return { valid: false, error: 'Cor não informada' };

  const corLower = cor.toLowerCase();
  if (!env.catalogoCores.includes(corLower)) {
    return {
      valid: false,
      error: `Cor "${cor}" não existe`,
      sugestoes: env.catalogoCores
    };
  }

  return { valid: true, cor: corLower };
}

/**
 * Valida quantidade
 */
function validarQuantidade(quantidade) {
  if (!quantidade || quantidade <= 0) {
    return { valid: false, error: 'Quantidade deve ser maior que 0' };
  }

  if (!Number.isInteger(quantidade)) {
    return { valid: false, error: 'Quantidade deve ser um número inteiro' };
  }

  return { valid: true, quantidade };
}

/**
 * Valida tipo de entrega
 */
function validarTipoEntrega(tipo) {
  if (!tipo) return { valid: false, error: 'Tipo de entrega não informado' };

  const tipoUpper = tipo.toUpperCase();
  if (!['RETIRADA', 'ENTREGA'].includes(tipoUpper)) {
    return {
      valid: false,
      error: `Tipo de entrega "${tipo}" inválido`,
      sugestoes: ['RETIRADA', 'ENTREGA']
    };
  }

  return { valid: true, tipo: tipoUpper };
}

/**
 * Valida forma de pagamento
 */
function validarFormaPagamento(forma) {
  if (!forma) return { valid: false, error: 'Forma de pagamento não informada' };

  const formaUpper = forma.toUpperCase();
  if (!['PIX', 'CARTÃO', 'DINHEIRO', 'PENDENTE'].includes(formaUpper)) {
    return {
      valid: false,
      error: `Forma de pagamento "${forma}" inválida`,
      sugestoes: ['PIX', 'CARTÃO', 'DINHEIRO']
    };
  }

  return { valid: true, forma: formaUpper };
}

/**
 * Valida WhatsApp
 */
function validarWhatsApp(whatsapp) {
  if (!whatsapp) return { valid: false, error: 'WhatsApp não informado' };

  // Remover caracteres especiais para validação
  const apenas_numeros = whatsapp.replace(/\D/g, '');

  // WhatsApp brasileiro: mínimo 12 dígitos (Evolution API normaliza removendo o 9 extra)
  if (apenas_numeros.length < 12) {
    return { valid: false, error: 'WhatsApp inválido (mínimo 12 dígitos)' };
  }

  return { valid: true, whatsapp };
}

/**
 * Valida cliente_nome
 */
function validarClienteNome(nome) {
  if (!nome || nome.trim().length === 0) {
    return { valid: false, error: 'Nome do cliente não informado' };
  }

  return { valid: true, nome: nome.trim() };
}

/**
 * Valida um item (modelo + tamanho + cor)
 */
function validarItem(item) {
  const erros = [];

  const modeloCheck = validarModelo(item.modelo);
  if (!modeloCheck.valid) erros.push(modeloCheck.error);

  const tamanhoCheck = validarTamanho(item.tamanho);
  if (!tamanhoCheck.valid) erros.push(tamanhoCheck.error);

  const corCheck = validarCor(item.cor);
  if (!corCheck.valid) erros.push(corCheck.error);

  const qtdCheck = validarQuantidade(item.quantidade);
  if (!qtdCheck.valid) erros.push(qtdCheck.error);

  if (erros.length > 0) {
    return { valid: false, erros };
  }

  return {
    valid: true,
    item: {
      modelo: modeloCheck.modelo,
      tamanho: tamanhoCheck.tamanho,
      cor: corCheck.cor,
      quantidade: qtdCheck.quantidade
    }
  };
}

/**
 * Valida estoque para um item
 */
async function validarEstoque(modelo, tamanho, cor, quantidade) {
  try {
    const item = await estoqueService.findByModeloTamanhoCor(modelo, tamanho, cor);

    if (!item) {
      return {
        valid: false,
        error: `Produto não encontrado: ${modelo} ${tamanho} ${cor}`
      };
    }

    if (item.quantidade_disponivel < quantidade) {
      return {
        valid: false,
        error: `Estoque insuficiente: ${modelo} ${tamanho} ${cor}`,
        disponivel: item.quantidade_disponivel,
        solicitado: quantidade
      };
    }

    return { valid: true, item };
  } catch (error) {
    logger.error('Erro ao validar estoque:', error.message);
    return { valid: false, error: 'Erro ao verificar estoque' };
  }
}

/**
 * Valida pedido completo (chamado antes de criar pedido)
 */
async function validarPedidoCompleto(pedidoData) {
  const resultado = {
    valid: true,
    erros: [],
    avisos: [],
    faltando: []
  };

  // Validações obrigatórias
  const nomeCheck = validarClienteNome(pedidoData.cliente_nome);
  if (!nomeCheck.valid) resultado.faltando.push('cliente_nome');

  // WhatsApp do cliente é opcional — equipe nem sempre tem esse dado
  if (pedidoData.cliente_whatsapp) {
    const whatsappCheck = validarWhatsApp(pedidoData.cliente_whatsapp);
    if (!whatsappCheck.valid) {
      // Se inválido, limpa o campo em vez de bloquear o pedido
      pedidoData.cliente_whatsapp = null;
    }
  }

  if (!pedidoData.itens || pedidoData.itens.length === 0) {
    resultado.faltando.push('itens');
  }

  // tipo_entrega: assume ENTREGA por padrão se não informado
  if (!pedidoData.tipo_entrega) {
    pedidoData.tipo_entrega = 'ENTREGA';
  } else {
    const tipoCheck = validarTipoEntrega(pedidoData.tipo_entrega);
    if (!tipoCheck.valid) resultado.erros.push(tipoCheck.error);
  }

  // Endereço não é obrigatório — pode ser combinado depois
  // if (pedidoData.tipo_entrega === 'ENTREGA' && !pedidoData.endereco_entrega) {
  //   resultado.faltando.push('endereco_entrega');
  // }

  // Validar itens
  if (pedidoData.itens && pedidoData.itens.length > 0) {
    for (const item of pedidoData.itens) {
      const itemCheck = validarItem(item);
      if (!itemCheck.valid) {
        resultado.erros.push(`Item ${item.modelo} ${item.tamanho} ${item.cor}: ${itemCheck.erros.join(', ')}`);
      } else {
        // Validar estoque
        const estoqueCheck = await validarEstoque(
          item.modelo,
          item.tamanho,
          item.cor,
          item.quantidade
        );
        if (!estoqueCheck.valid) {
          resultado.erros.push(estoqueCheck.error);
        }
      }
    }
  }

  // Validar forma de pagamento se fornecida
  if (pedidoData.forma_pagamento) {
    const pagtoCheck = validarFormaPagamento(pedidoData.forma_pagamento);
    if (!pagtoCheck.valid) resultado.erros.push(pagtoCheck.error);
  }

  resultado.valid = resultado.erros.length === 0 && resultado.faltando.length === 0;

  return resultado;
}

/**
 * Calcula preço total de um pedido
 */
function calcularPrecoTotal(itens, valorCustomizado = null) {
  if (valorCustomizado && valorCustomizado > 0) {
    return valorCustomizado;
  }

  let total = 0;
  for (const item of itens) {
    const modelo = item.modelo?.toUpperCase() || item.modelo;
    const preco = env.modeloPrecos[modelo] || 0;
    total += preco * item.quantidade;
  }

  return total;
}

export {
  validarModelo,
  validarTamanho,
  validarCor,
  validarQuantidade,
  validarTipoEntrega,
  validarFormaPagamento,
  validarWhatsApp,
  validarClienteNome,
  validarItem,
  validarEstoque,
  validarPedidoCompleto,
  calcularPrecoTotal
};
