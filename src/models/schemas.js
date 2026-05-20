import Joi from 'joi';

/**
 * Schema para criar pedido
 */
const schemaPedidoCreate = Joi.object({
  cliente_nome: Joi.string().required().min(2).max(100),
  cliente_whatsapp: Joi.string()
    .required()
    .regex(/^\+?55?\d{10,11}$/)
    .messages({
      'string.pattern.base': 'WhatsApp inválido. Use formato: +5595988123456'
    }),
  descricao_pedido: Joi.string().max(500),
  quantidade_total: Joi.number().positive().integer(),
  valor_total: Joi.number().positive(),
  tipo_entrega: Joi.string().valid('RETIRADA', 'ENTREGA'),
  endereco_entrega: Joi.string().max(500),
  forma_pagamento: Joi.string().valid('PIX', 'CARTÃO', 'DINHEIRO', 'PENDENTE'),
  itens_json: Joi.string(),
  observacoes: Joi.string().max(500)
});

/**
 * Schema para atualizar status de pagamento
 */
const schemaStatusPagamento = Joi.object({
  numero_pedido: Joi.number().required().positive().integer(),
  novo_status: Joi.string().required().valid('PEDIDO', 'PAGO'),
  forma_pagamento: Joi.string().valid('PIX', 'CARTÃO', 'DINHEIRO')
});

/**
 * Schema para atualizar status de entrega
 */
const schemaStatusEntrega = Joi.object({
  numero_pedido: Joi.number().required().positive().integer(),
  novo_status: Joi.string()
    .required()
    .valid('PENDENTE', 'ENTREGUE', 'RETIRADA_NA_LOJA')
});

/**
 * Schema para criar cliente
 */
const schemaClienteCreate = Joi.object({
  nome: Joi.string().required().min(2).max(100),
  whatsapp: Joi.string()
    .required()
    .regex(/^\+?55?\d{10,11}$/)
    .messages({
      'string.pattern.base': 'WhatsApp inválido'
    }),
  email: Joi.string().email().allow(''),
  endereco: Joi.string().max(500).allow(''),
  bairro: Joi.string().max(100).allow(''),
  cidade: Joi.string().max(100).allow(''),
  telefone_alternativo: Joi.string().max(20).allow(''),
  observacoes: Joi.string().max(500).allow('')
});

/**
 * Schema para atualizar cliente
 */
const schemaClienteUpdate = Joi.object({
  id_cliente: Joi.string().required().uuid(),
  nome: Joi.string().min(2).max(100),
  email: Joi.string().email().allow(''),
  endereco: Joi.string().max(500).allow(''),
  bairro: Joi.string().max(100).allow(''),
  cidade: Joi.string().max(100).allow(''),
  telefone_alternativo: Joi.string().max(20).allow(''),
  observacoes: Joi.string().max(500).allow('')
});

/**
 * Schema para criar item de estoque
 */
const schemaEstoqueItem = Joi.object({
  modelo: Joi.string().required().min(2).max(50),
  tamanho: Joi.string().required().length(2),
  cor: Joi.string().required().min(2).max(50),
  preco_unitario: Joi.number().required().positive(),
  quantidade_total: Joi.number().required().integer().min(0),
  observacoes: Joi.string().max(500).allow('')
});

/**
 * Schema para contexto de conversa
 */
const schemaContextoConversa = Joi.object({
  whatsapp: Joi.string()
    .required()
    .regex(/^\+?55?\d{10,11}$/),
  status: Joi.string()
    .required()
    .valid('ATIVA', 'FINALIZADA'),
  contexto: Joi.object({
    pedido_incompleto: Joi.boolean().allow(null),
    numero_pedido_atual: Joi.number().allow(null),
    modelo: Joi.string().allow(null),
    tamanho: Joi.string().allow(null),
    cor: Joi.string().allow(null),
    quantidade: Joi.number().allow(null),
    valor_total: Joi.number().allow(null),
    tipo_entrega: Joi.string().allow(null).valid('RETIRADA', 'ENTREGA'),
    endereco_entrega: Joi.string().allow(null),
    forma_pagamento: Joi.string().allow(null).valid('PIX', 'CARTÃO', 'DINHEIRO'),
    aguardando: Joi.string().allow(null),
    pagamento_confirmado: Joi.boolean().allow(null)
  }),
  dataInicio: Joi.date(),
  ultimaAtualizacao: Joi.date()
});

/**
 * Função auxiliar para validar dados
 */
function validarDados(dados, schema) {
  const { error, value } = schema.validate(dados, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const erros = error.details.map(detail => ({
      campo: detail.path.join('.'),
      mensagem: detail.message
    }));
    return { valid: false, erros };
  }

  return { valid: true, dados: value };
}

export {
  schemaPedidoCreate,
  schemaStatusPagamento,
  schemaStatusEntrega,
  schemaClienteCreate,
  schemaClienteUpdate,
  schemaEstoqueItem,
  schemaContextoConversa,
  validarDados
};
