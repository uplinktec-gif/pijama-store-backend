import { gerarTokenSessao } from '../utils/sessionTokens.js';
import { logger } from '../utils/logger.js';
import { buscarClientePorCPF, obterClientePorId } from '../services/sqlite/clientes.js';
import { buscarPedidosPorCliente, buscarPedidosPorWhatsApp } from '../services/sqlite/pedidos.js';
import { salvarMensagemSuporte } from '../services/sqlite/suporte.js';
import { enviarMensagem } from '../services/whatsapp/sender.js';
import { callAI } from '../config/claude.js';

/**
 * POST /api/cliente/autenticar
 * Autentica cliente por CPF
 * Retorna token de sessão
 */
export const autenticarCliente = async (req, res) => {
  try {
    const { cpf } = req.body;

    // Validar entrada
    if (!cpf) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF é obrigatório'
      });
    }

    // Limpar CPF: apenas números
    const cpfLimpo = cpf.replace(/\D/g, '');

    if (cpfLimpo.length !== 11) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF deve ter 11 dígitos'
      });
    }

    logger.info(`[autenticar] Tentativa de autenticação com CPF: ${cpfLimpo.slice(-4)}...`);

    // Buscar cliente por CPF
    const cliente = await buscarClientePorCPF(cpfLimpo);

    if (!cliente) {
      logger.warn(`[autenticar] Cliente com CPF ${cpfLimpo.slice(-4)}... não encontrado`);
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado. Verifique o CPF e tente novamente.'
      });
    }

    // Gerar token de sessão
    const token = gerarTokenSessao(cliente.id_cliente, cliente.nome);

    // Buscar quantidade de pedidos
    const pedidos = await buscarPedidosPorCliente(cliente.whatsapp);
    const pedidosCount = pedidos ? pedidos.length : 0;

    logger.info(`[autenticar] ✓ Cliente autenticado: ${cliente.nome} (${pedidosCount} pedidos)`);

    return res.status(200).json({
      sucesso: true,
      nome: cliente.nome,
      token,
      id_cliente: cliente.id_cliente,
      pedidos_count: pedidosCount,
      ultimos_dois_cpf: cpfLimpo.slice(-2)
    });
  } catch (err) {
    logger.error('[autenticar] Erro ao autenticar cliente:', err.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao processar autenticação'
    });
  }
};

/**
 * GET /api/cliente/{id}/pedidos
 * Retorna pedidos do cliente autenticado
 */
export const obterPedidosCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const clienteAuth = req.cliente;

    // Segurança: validar que cliente só acessa seus próprios pedidos
    if (id !== clienteAuth.id_cliente) {
      logger.warn(`[pedidos] Cliente ${clienteAuth.id_cliente} tentou acessar pedidos de ${id}`);
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para acessar estes pedidos'
      });
    }

    // Buscar dados do cliente
    const cliente = await obterClientePorId(id);
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    // Buscar pedidos por WhatsApp do cliente (SQLite)
    const pedidos = await buscarPedidosPorWhatsApp(cliente.whatsapp);

    // Formatar resposta — manter campos que o frontend usa
    const pedidosFormatados = (pedidos || []).map(p => {
      let itens = [];
      try { itens = JSON.parse(p.itens_json || '[]'); } catch (_) {}
      return {
        numero_pedido: p.numero_pedido,
        numero: p.numero_pedido,       // alias para compatibilidade
        data_pedido: p.data_pedido,
        data: p.data_pedido,           // alias
        descricao_pedido: p.descricao_pedido,
        itens_json: p.itens_json,
        itens,
        valor_total: parseFloat(p.valor_total) || 0,
        status_pagamento: p.status_pagamento,
        status_entrega: p.status_entrega,
        forma_pagamento: p.forma_pagamento,
        data_pagamento: p.data_pagamento,
        data_entrega: p.data_entrega,
        tipo_entrega: p.tipo_entrega,
        endereco_entrega: p.endereco_entrega
      };
    });

    logger.debug(`[pedidos] ✓ ${pedidosFormatados.length} pedidos para cliente ${id}`);

    return res.status(200).json({
      sucesso: true,
      pedidos: pedidosFormatados
    });
  } catch (err) {
    logger.error('[pedidos] Erro ao buscar pedidos:', err.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar pedidos'
    });
  }
};

/**
 * GET /api/cliente/{id}/perfil
 * Retorna dados de perfil do cliente
 */
export const obterPerfilCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const clienteAuth = req.cliente;

    // Segurança
    if (id !== clienteAuth.id_cliente) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para acessar este perfil'
      });
    }

    const cliente = await obterClientePorId(id);
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    return res.status(200).json({
      sucesso: true,
      perfil: {
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email,
        endereco: cliente.endereco,
        bairro: cliente.bairro,
        cidade: cliente.cidade,
        total_gasto: parseFloat(cliente.total_gasto),
        quantidade_pedidos: parseInt(cliente.quantidade_pedidos),
        modelo_favorito: cliente.modelo_favorito,
        data_primeiro_pedido: cliente.data_primeiro_pedido,
        data_ultimo_pedido: cliente.data_ultimo_pedido
      }
    });
  } catch (err) {
    logger.error('[perfil] Erro ao buscar perfil:', err.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar perfil'
    });
  }
};

/**
 * GET /api/cliente/{id}/recomendacoes
 * Gera recomendações personalizadas com Claude Haiku
 */
export const obterRecomendacoesCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const clienteAuth = req.cliente;

    if (id !== clienteAuth.id_cliente) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para acessar estas recomendações'
      });
    }

    const cliente = await obterClientePorId(id);
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    // Buscar pedidos para contexto
    const pedidos = await buscarPedidosPorCliente(cliente.whatsapp);
    const modelosComprados = new Set();
    const cores = [];
    const tamanhos = [];

    (pedidos || []).forEach(p => {
      try {
        const itens = JSON.parse(p.itens_json || '[]');
        itens.forEach(item => {
          modelosComprados.add(item.modelo);
          if (item.cor) cores.push(item.cor);
          if (item.tamanho) tamanhos.push(item.tamanho);
        });
      } catch (e) {
        // Ignorar itens com JSON inválido
      }
    });

    const MODELOS_DISPONIVEIS = ['ZARA', 'MIA', 'LIA', 'NÚBIA', 'LÍVIA', 'BEATRIZ', 'ANNE'];
    const CORES_DISPONIVEIS = ['azul marinho', 'preto', 'bordô', 'cinza'];
    const TAMANHOS_DISPONIVEIS = ['P', 'M', 'G', 'GG'];

    const modelosNaoComprados = MODELOS_DISPONIVEIS.filter(m => !modelosComprados.has(m));

    // Usar Claude para gerar recomendações
    const systemPrompt = `Você é um assistente de vendas da Pluma Pijamas.
Gere 3 recomendações personalizadas para ${cliente.nome}.

Informações do cliente:
- Modelo favorito: ${cliente.modelo_favorito || 'Nenhum ainda'}
- Modelos já comprados: ${Array.from(modelosComprados).join(', ') || 'Nenhum ainda'}
- Cores mais usadas: ${cores.slice(0, 3).join(', ') || 'Variadas'}
- Tamanhos: ${[...new Set(tamanhos)].join(', ') || 'P'}
- Modelos ainda não comprados: ${modelosNaoComprados.join(', ')}

Modelos disponíveis: ${MODELOS_DISPONIVEIS.join(', ')}
Cores: ${CORES_DISPONIVEIS.join(', ')}
Tamanhos: ${TAMANHOS_DISPONIVEIS.join(', ')}

Retorne APENAS um JSON válido (sem markdown, sem explicação):
[
  {"modelo":"NOME_MODELO","cor":"cor","tamanho":"tamanho","motivo":"motivo curto em português","preco":89.90},
  ...
]`;

    const resposta = await callAI(systemPrompt, 'Gerar recomendações', 512);

    // Tentar extrair JSON da resposta
    let recomendacoes = [];
    try {
      // Remover markdown se existir
      const jsonLimpo = resposta.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
      const jsonMatch = jsonLimpo.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        recomendacoes = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      logger.warn('[recomendacoes] Erro ao fazer parse de recomendações:', parseErr.message);
      // Retornar recomendações genéricas se Claude falhar
      recomendacoes = [
        {
          modelo: 'BEATRIZ',
          cor: 'preto',
          tamanho: 'M',
          motivo: 'Modelo popular e confortável',
          preco: 89.90
        }
      ];
    }

    logger.debug(`[recomendacoes] ✓ ${recomendacoes.length} recomendações para cliente ${id}`);

    return res.status(200).json({
      sucesso: true,
      recomendacoes
    });
  } catch (err) {
    logger.error('[recomendacoes] Erro ao gerar recomendações:', err.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar recomendações'
    });
  }
};

/**
 * POST /api/cliente/{id}/contato
 * Cliente envia mensagem "Fale Conosco"
 * Salva em sheet SUPORTE e envia para Felipe via WhatsApp
 */
export const enviarMensagemContato = async (req, res) => {
  try {
    const { id } = req.params;
    const { mensagem } = req.body;
    const clienteAuth = req.cliente;

    if (id !== clienteAuth.id_cliente) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Você não tem permissão para enviar mensagens neste contexto'
      });
    }

    if (!mensagem || mensagem.trim().length === 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Mensagem não pode ser vazia'
      });
    }

    const cliente = await obterClientePorId(id);
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    // Salvar em sheet SUPORTE
    const mensagemId = await salvarMensagemSuporte({
      cliente_whatsapp: cliente.whatsapp,
      cliente_nome: cliente.nome,
      mensagem: mensagem.trim(),
      status: 'ABERTO'
    });

    logger.info(`[contato] Mensagem ${mensagemId} de ${cliente.nome}: "${mensagem.substring(0, 50)}..."`);

    // Enviar para Felipe via WhatsApp (número do Felipe do .env)
    const NUMERO_FELIPE = process.env.NUMERO_FELIPE;
    if (NUMERO_FELIPE) {
      try {
        const textoWhatsApp = `📨 *Novo contato de ${cliente.nome}*\n\n"${mensagem}"\n\nWhatsApp: ${cliente.whatsapp}\nResponda: responder ${mensagemId}`;
        // await enviarMensagem(NUMERO_FELIPE, textoWhatsApp);
        // Por agora, apenas logar (integração com bot respondente vem depois)
        logger.debug(`[contato] WhatsApp para Felipe enviado: ${mensagemId}`);
      } catch (whatsappErr) {
        logger.warn('[contato] Erro ao enviar para Felipe:', whatsappErr.message);
        // Não retornar erro — mensagem foi salva, WhatsApp é opcional
      }
    }

    return res.status(201).json({
      sucesso: true,
      mensagem_id: mensagemId,
      resposta: 'Sua mensagem foi enviada para Pluma! Responderemos em breve.'
    });
  } catch (err) {
    logger.error('[contato] Erro ao processar contato:', err.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar mensagem'
    });
  }
};

export default {
  autenticarCliente,
  obterPedidosCliente,
  obterPerfilCliente,
  obterRecomendacoesCliente,
  enviarMensagemContato
};
