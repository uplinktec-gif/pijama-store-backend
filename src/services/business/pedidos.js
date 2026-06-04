import { logger } from '../../utils/logger.js';
import * as pedidosSheets from '../sqlite/pedidos.js';
import * as estoqueService from '../sqlite/estoque.js';
import * as clientesService from '../sqlite/clientes.js';
import * as leadsService from '../sqlite/leads.js';
import * as interpreterService from '../nlp/interpreter.js';
import * as validatorService from '../nlp/validator.js';
import { enviarMensagem } from '../whatsapp/sender.js';
import { run } from '../../config/database.js';
import { obterInfoUsuario } from '../../config/users.js';

/**
 * Cancela um pedido com ESTORNO automático de estoque.
 * - Libera a reserva de cada item (devolve ao disponível)
 * - Grava no log_estoque o motivo "Estorno automático por Cancelamento de Pedido"
 * - Marca o pedido como CANCELADO (pagamento e entrega)
 * Idempotente: se já estiver CANCELADO, não estorna de novo.
 *
 * Usado pelo painel admin e pelo bot (fonte única do cancelamento).
 * @returns {Promise<{success:boolean, numero?:number, estornado?:Array, mensagem_usuario?:string, error?:string}>}
 */
export async function cancelarPedido(numeroPedido, { usuario = 'admin' } = {}) {
  try {
    const pedido = await pedidosSheets.findPorNumeroPedido(numeroPedido);
    if (!pedido) {
      return { success: false, error: `Pedido #${numeroPedido} não encontrado`, mensagem_usuario: `Não encontrei o pedido #${numeroPedido}.` };
    }
    if (pedido.status_pagamento === 'CANCELADO') {
      return { success: true, numero: numeroPedido, estornado: [], jaCancelado: true, mensagem_usuario: `Pedido #${numeroPedido} já estava cancelado.` };
    }

    // Itens do pedido
    let itens = [];
    try { itens = JSON.parse(pedido.itens_json || '[]'); } catch (_) { itens = []; }

    const estornado = [];
    const now = new Date().toISOString();
    for (const it of itens) {
      const modelo = it.modelo, tamanho = it.tamanho, cor = it.cor;
      const qtd = Number(it.quantidade) || 1;
      if (!modelo || !tamanho || !cor) continue;

      // 1) Devolve a reserva ao disponível
      await estoqueService.liberarEstoque(modelo, tamanho, cor, qtd);

      // 2) Rastreabilidade no log_estoque
      try {
        const sku = estoqueService.generateSKU(modelo, tamanho, cor);
        run(
          `INSERT INTO log_estoque (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [now, sku, modelo, tamanho, cor, qtd, 'Estorno automático por Cancelamento de Pedido', `Pedido #${numeroPedido} cancelado`, usuario]
        );
      } catch (e) {
        logger.warn('[cancelarPedido] Falha ao gravar log_estoque (estorno feito):', e.message);
      }
      estornado.push({ modelo, tamanho, cor, quantidade: qtd });
    }

    // 3) Marca o pedido como CANCELADO (pagamento e entrega)
    run(
      `UPDATE pedidos SET status_pagamento = 'CANCELADO', status_entrega = 'CANCELADO', updated_at = ? WHERE numero_pedido = ?`,
      [now, numeroPedido]
    );

    logger.info(`[cancelarPedido] #${numeroPedido} cancelado — ${estornado.length} item(ns) estornado(s) ao estoque`);
    const resumo = estornado.map(e => `${e.quantidade}x ${e.modelo} ${e.tamanho} ${e.cor}`).join(', ');
    return {
      success: true,
      numero: numeroPedido,
      estornado,
      mensagem_usuario: `✅ Pedido *#${numeroPedido}* cancelado.${resumo ? `\n↩️ Estoque devolvido: ${resumo}` : ''}`
    };
  } catch (error) {
    logger.error('[cancelarPedido] Erro:', error.message);
    return { success: false, error: error.message, mensagem_usuario: 'Erro ao cancelar o pedido. Tente novamente.' };
  }
}

// Estados de entrega que significam "a peça saiu do prédio" → baixa definitiva
const ESTADOS_SAIDA = ['ENTREGUE', 'ENVIADO', 'RETIRADA_NA_LOJA'];

/**
 * Dá baixa DEFINITIVA no estoque quando o pedido é entregue/enviado/retirado.
 * Subtrai a quantidade de AMBAS as colunas: quantidade_total E quantidade_reservada
 * (a peça reservada deixa de existir fisicamente). disp = total - reservada não muda.
 * Grava no log_estoque. Idempotente: só baixa se ainda não estava num estado de saída.
 *
 * @returns {Promise<{success:boolean, numero?:number, baixado?:Array, jaSaiu?:boolean, error?:string}>}
 */
export async function entregarPedido(numeroPedido, novoStatus = 'ENTREGUE') {
  try {
    const pedido = await pedidosSheets.findPorNumeroPedido(numeroPedido);
    if (!pedido) return { success: false, error: `Pedido #${numeroPedido} não encontrado` };

    // Idempotência: se já está num estado de saída, não baixa de novo
    if (ESTADOS_SAIDA.includes((pedido.status_entrega || '').toUpperCase())) {
      return { success: true, numero: numeroPedido, baixado: [], jaSaiu: true };
    }
    if ((pedido.status_pagamento || '').toUpperCase() === 'CANCELADO') {
      return { success: false, error: 'Pedido cancelado não pode ser entregue' };
    }

    let itens = [];
    try { itens = JSON.parse(pedido.itens_json || '[]'); } catch (_) { itens = []; }

    const baixado = [];
    const now = new Date().toISOString();
    for (const it of itens) {
      const { modelo, tamanho, cor } = it;
      const qtd = Number(it.quantidade) || 1;
      if (!modelo || !tamanho || !cor) continue;

      const sku = estoqueService.generateSKU(modelo, tamanho, cor);
      // Baixa definitiva: sai do total E libera a reserva (a peça foi embora)
      run(
        `UPDATE estoque
            SET quantidade_total     = MAX(0, quantidade_total - ?),
                quantidade_reservada = MAX(0, quantidade_reservada - ?),
                updated_at = ?
          WHERE sku = ?`,
        [qtd, qtd, now, sku]
      );
      try {
        run(
          `INSERT INTO log_estoque (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [now, sku, modelo, tamanho, cor, qtd, 'Baixa definitiva por Entrega', `Pedido #${numeroPedido} ${novoStatus}`, 'sistema']
        );
      } catch (e) {
        logger.warn('[entregarPedido] Falha ao gravar log (baixa feita):', e.message);
      }
      baixado.push({ modelo, tamanho, cor, quantidade: qtd });
    }

    run(
      `UPDATE pedidos SET status_entrega = ?, data_entrega = ?, updated_at = ? WHERE numero_pedido = ?`,
      [novoStatus, now, now, numeroPedido]
    );

    logger.info(`[entregarPedido] #${numeroPedido} ${novoStatus} — ${baixado.length} item(ns) baixado(s) do inventário`);
    return { success: true, numero: numeroPedido, baixado };
  } catch (error) {
    logger.error('[entregarPedido] Erro:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fluxo completo: interpretar → validar → criar pedido
 */
async function processarMensagemPedido(mensagem, clienteWhatsApp) {
  try {
    logger.info(`[PASSO 0] Iniciando processamento de pedido`);
    logger.info(`[PASSO 0] WhatsApp: ${clienteWhatsApp}, Mensagem: "${mensagem}"`);

    // PASSO 1: Interpretar mensagem com Claude
    logger.info(`[PASSO 1] Interpretando mensagem com Claude`);
    const interpretacao = await interpreterService.interpretarPedido(mensagem, clienteWhatsApp);

    logger.debug(`[PASSO 1] Resultado de interpretação:`, JSON.stringify(interpretacao).substring(0, 200));

    if (!interpretacao.success) {
      logger.warn(`[PASSO 1] Interpretação falhou: ${interpretacao.error}`);
      return {
        success: false,
        mensagem_usuario: `❌ Não consegui entender bem: ${interpretacao.error}`,
        faltando: interpretacao.faltando,
        duvidas: interpretacao.duvidas
      };
    }

    const pedidoInterpretado = interpretacao.pedido;
    logger.info(`[PASSO 1] Sucesso! Pedido interpretado:`, {
      cliente_nome: pedidoInterpretado.cliente_nome,
      cliente_whatsapp: pedidoInterpretado.cliente_whatsapp,
      itens_count: pedidoInterpretado.itens?.length || 0
    });

    // PASSO 2: Validar dados
    const validacao = await validatorService.validarPedidoCompleto(pedidoInterpretado);

    if (!validacao.valid) {
      logger.warn('Validação falhou:', validacao);

      if (validacao.faltando.length > 0) {
        // Determinar qual pergunta fazer e salvar pedido parcial no contexto
        let pergunta = '';
        if (validacao.faltando.includes('cliente_nome')) {
          pergunta = `Para quem é o pedido? 😊`;
        } else if (validacao.faltando.includes('itens')) {
          pergunta = `Qual produto você quer?\nExemplo: _"1 zara m preto"_`;
        } else {
          const labels = { tipo_entrega: 'entrega ou retirada', endereco_entrega: 'endereço de entrega' };
          const campos = validacao.faltando.map(c => labels[c] || c);
          pergunta = `Faltou: ${campos.join(' e ')}. Pode completar?`;
        }

        return {
          success: false,
          mensagem_usuario: pergunta,
          faltando: validacao.faltando,
          pedido_parcial: pedidoInterpretado  // salvo para completar depois
        };
      }

      if (validacao.erros.length > 0) {
        // Verificar se é erro de item incompleto (tamanho/cor null)
        const itemIncompleto = validacao.erros.find(e =>
          e.includes('tamanho') || e.includes('cor') || e.includes('modelo')
        );
        if (itemIncompleto) {
          let pergunta = 'Faltou alguma informação do produto 😊\n';
          if (itemIncompleto.includes('tamanho')) pergunta += 'Qual *tamanho*? (P, M, G ou GG)';
          else if (itemIncompleto.includes('cor')) pergunta += 'Qual *cor*? (azul marinho, preto, bordô, cinza ou marrom)';
          else if (itemIncompleto.includes('modelo')) {
            const modelos = estoqueService.listarModelosDisponiveis().join(', ');
            pergunta += `Qual *modelo*? (${modelos})`;
          }
          return {
            success: false,
            mensagem_usuario: pergunta,
            pedido_parcial: pedidoInterpretado
          };
        }

        // Estoque insuficiente
        const semEstoque = validacao.erros
          .filter(e => e.includes('Estoque insuficiente'))
          .map(e => e.replace('Estoque insuficiente: ', '').trim());
        if (semEstoque.length > 0) {
          return {
            success: false,
            mensagem_usuario: `Opa! 😕 Não temos *${semEstoque.join(' e ')}* em estoque.\n\nQuer substituir por outro tamanho ou cor?`
          };
        }

        return {
          success: false,
          mensagem_usuario: `Problema no pedido:\n${validacao.erros.join('\n')}\n\nPode corrigir?`
        };
      }
    }

    // PASSO 3: Calcular preço total
    const valorTotal = validatorService.calcularPrecoTotal(
      pedidoInterpretado.itens,
      pedidoInterpretado.valor_customizado
    );

    // PASSO 4: Buscar ou criar cliente
    let cliente = await clientesService.findByWhatsApp(pedidoInterpretado.cliente_whatsapp);

    if (!cliente) {
      const criarClienteResult = await clientesService.criarCliente({
        nome: pedidoInterpretado.cliente_nome,
        whatsapp: pedidoInterpretado.cliente_whatsapp,
        cidade: pedidoInterpretado.cidade || 'Boa Vista',
        endereco: pedidoInterpretado.endereco_entrega
      });

      if (!criarClienteResult.success) {
        logger.error('Erro ao criar cliente:', criarClienteResult.error);
        return {
          success: false,
          mensagem_usuario: 'Erro ao registrar cliente. Tente novamente.'
        };
      }

      cliente = await clientesService.findByWhatsApp(pedidoInterpretado.cliente_whatsapp);

      // Criar entrada em LEADS para novo cliente
      const leadResult = await leadsService.criarLead(
        pedidoInterpretado.cliente_nome,
        pedidoInterpretado.cliente_whatsapp,
        '',  // email não disponível via WhatsApp
        'site_compra'  // fonte: primeira compra via WhatsApp
      );

      if (!leadResult.success) {
        logger.warn(`[LEADS] Aviso ao criar lead para ${pedidoInterpretado.cliente_nome}: ${leadResult.error}`);
      }
    }

    // PASSO 5: Reservar estoque para cada item
    const reservasErros = [];

    for (const item of pedidoInterpretado.itens) {
      const reservaResult = await estoqueService.reservarEstoque(
        item.modelo,
        item.tamanho,
        item.cor,
        item.quantidade
      );

      if (!reservaResult.success) {
        reservasErros.push(`${item.modelo} ${item.tamanho} ${item.cor}: ${reservaResult.error}`);
      }
    }

    if (reservasErros.length > 0) {
      logger.error('Erros ao reservar estoque:', reservasErros);
      return {
        success: false,
        mensagem_usuario: `❌ Problema com estoque:\n${reservasErros.join('\n')}`
      };
    }

    // PASSO 6: Criar pedido no Sheets
    logger.info(`[PASSO 6] Preparando dados para criar pedido no Sheets`);

    const pedidoData = {
      cliente_nome: pedidoInterpretado.cliente_nome,
      cliente_whatsapp: pedidoInterpretado.cliente_whatsapp,
      descricao_pedido: formatarDescricaoPedido(pedidoInterpretado.itens),
      quantidade_total: pedidoInterpretado.itens.reduce((sum, item) => sum + item.quantidade, 0),
      valor_total: valorTotal,
      tipo_entrega: pedidoInterpretado.tipo_entrega,
      endereco_entrega: pedidoInterpretado.endereco_entrega || '',
      forma_pagamento: pedidoInterpretado.forma_pagamento || 'PENDENTE',
      itens_json: JSON.stringify(pedidoInterpretado.itens),
      observacoes: pedidoInterpretado.observacoes || '',
      // Rastreabilidade: quem registrou a venda (quem digitou no bot)
      criado_por: obterInfoUsuario(clienteWhatsApp)?.nome || 'Cliente'
    };

    logger.debug(`[PASSO 6] Dados do pedido:`, {
      cliente_nome: pedidoData.cliente_nome,
      cliente_whatsapp: pedidoData.cliente_whatsapp,
      quantidade_total: pedidoData.quantidade_total,
      valor_total: pedidoData.valor_total
    });

    logger.info(`[PASSO 6] Chamando pedidosSheets.criarPedido()`);
    const criarPedidoResult = await pedidosSheets.criarPedido(pedidoData);

    logger.info(`[PASSO 6] Resultado de criarPedido:`, {
      success: criarPedidoResult.success,
      numeroPedido: criarPedidoResult.numeroPedido,
      error: criarPedidoResult.error
    });

    if (!criarPedidoResult.success) {
      logger.error(`[PASSO 6] Erro ao criar pedido: ${criarPedidoResult.error}`);
      // Liberar reservas já que o pedido não foi criado
      for (const item of pedidoInterpretado.itens) {
        await estoqueService.liberarEstoque(item.modelo, item.tamanho, item.cor, item.quantidade);
      }
      return {
        success: false,
        mensagem_usuario: 'Erro ao criar pedido. Tente novamente.'
      };
    }

    const numeroPedido = criarPedidoResult.numeroPedido;

    // PASSO 7: Atualizar estatísticas do cliente (não bloqueia o fluxo se falhar)
    try {
      if (cliente?.id_cliente) {
        const primeiroModelo = pedidoInterpretado.itens[0]?.modelo;
        await clientesService.atualizarEstatisticas(cliente.id_cliente, valorTotal, primeiroModelo);
      }
    } catch (e) {
      logger.warn('[PASSO 7] Erro ao atualizar estatísticas do cliente (ignorado):', e.message);
    }

    // PASSO 7.5: Verificar se algum item ficou com estoque crítico
    verificarEstoqueCriticoAposVenda(pedidoInterpretado.itens).catch(e =>
      logger.warn('[estoque-critico] Erro ao verificar:', e.message)
    );

    // PASSO 8: Gerar resposta humanizada
    const respostaSuccess = await interpreterService.gerarRespostaSucesso(
      numeroPedido,
      pedidoInterpretado,
      valorTotal
    );

    let mensagemFinal = '';
    if (respostaSuccess.success) {
      mensagemFinal = respostaSuccess.resposta;
    } else {
      mensagemFinal = `✓ Pedido #${numeroPedido} criado com sucesso!\n${formatarResumo(pedidoInterpretado, valorTotal, numeroPedido)}`;
    }

    logger.info(`✓ Pedido #${numeroPedido} processado com sucesso`);

    // Se é ENTREGA sem endereço, adiciona pergunta na mensagem
    const precisaEndereco = pedidoInterpretado.tipo_entrega === 'ENTREGA'
      && !pedidoInterpretado.endereco_entrega;
    if (precisaEndereco) {
      mensagemFinal += `\n\n📍 Qual o *endereço de entrega* para ${pedidoInterpretado.cliente_nome}?`;
    }

    return {
      success: true,
      numero_pedido: numeroPedido,
      cliente: cliente?.nome || pedidoInterpretado.cliente_nome,
      valor_total: valorTotal,
      mensagem_usuario: mensagemFinal,
      aguardando_endereco: precisaEndereco ? numeroPedido : null
    };
  } catch (error) {
    logger.error('Erro ao processar pedido:', error.message);
    return {
      success: false,
      mensagem_usuario: 'Erro inesperado ao processar pedido. Entre em contato.'
    };
  }
}

/**
 * Processa atualização de status (pagamento ou entrega)
 */
async function processarStatusUpdate(mensagem, clienteWhatsApp) {
  try {
    logger.info(`[Status update] WhatsApp: ${clienteWhatsApp}, Mensagem: "${mensagem}"`);

    // Interpretar tipo de atualização
    const interpretacao = await interpreterService.interpretarStatusUpdate(mensagem, clienteWhatsApp);

    if (!interpretacao.success) {
      return {
        success: false,
        mensagem_usuario: `❌ Não consegui entender: ${interpretacao.error}`
      };
    }

    if (!interpretacao.numero_pedido) {
      return {
        success: false,
        mensagem_usuario: '❌ Qual é o número do pedido?'
      };
    }

    // Buscar pedido
    const pedido = await pedidosSheets.findPorNumeroPedido(interpretacao.numero_pedido);
    if (!pedido) {
      return {
        success: false,
        mensagem_usuario: `❌ Pedido #${interpretacao.numero_pedido} não encontrado`
      };
    }

    let resultado = { success: false };
    let mensagem_usuario = '';

    // TIPO 1: Pagamento
    if (interpretacao.tipo === 'pagamento') {
      const updateResult = await pedidosSheets.atualizarStatusPagamento(
        interpretacao.numero_pedido,
        'PAGO',
        interpretacao.forma_pagamento
      );

      if (updateResult.success) {
        resultado.success = true;
        mensagem_usuario = `✓ Pagamento confirmado! Pedido #${interpretacao.numero_pedido} aguardando entrega.`;

        // Atualizar lead: total gasto e status
        try {
          const leadUpdate = await leadsService.atualizarTotalGastoLead(
            pedido.cliente_whatsapp,
            pedido.valor_total,
            interpretacao.numero_pedido
          );

          if (leadUpdate.success && leadUpdate.isVip) {
            mensagem_usuario += '\n\n🎉 *Cliente VIP!* Você atingiu R$ 500+ em compras!';
            logger.info(`[LEADS] Cliente ${pedido.cliente_whatsapp} promovido a VIP`);

            // Notificar Felipe sobre novo VIP
            enviarNotificacaoNovoVIP(pedido, interpretacao.numero_pedido).catch(e =>
              logger.warn('[notif-vip] Erro ao notificar:', e.message)
            );
          } else if (leadUpdate.success && !leadUpdate.isVip && pedido.valor_total > 0) {
            // Notificar Felipe sobre novo cliente que pagou
            enviarNotificacaoNovoClientePagou(pedido, interpretacao.numero_pedido).catch(e =>
              logger.warn('[notif-cliente] Erro ao notificar:', e.message)
            );
          }
        } catch (e) {
          logger.warn(`[LEADS] Erro ao atualizar total gasto do lead: ${e.message}`);
        }
      } else {
        mensagem_usuario = `❌ Erro ao confirmar pagamento: ${updateResult.error}`;
      }
    }
    // TIPO 2: Entrega
    else if (interpretacao.tipo === 'entrega') {
      // Estados de SAÍDA (entregue/enviado/retirada) DEVEM passar pelo motor
      // entregarPedido — que dá baixa definitiva E libera a reserva. Usar a
      // função crua aqui deixava reserva órfã (causa-raiz dos furos de estoque).
      const novoStatusEntrega = (interpretacao.novo_status_entrega || '').toUpperCase();
      const updateResult = ESTADOS_SAIDA.includes(novoStatusEntrega)
        ? await entregarPedido(interpretacao.numero_pedido, novoStatusEntrega)
        : await pedidosSheets.atualizarStatusEntrega(
            interpretacao.numero_pedido,
            interpretacao.novo_status_entrega
          );

      if (updateResult.success) {
        resultado.success = true;
        mensagem_usuario = `✓ Status atualizado! Pedido #${interpretacao.numero_pedido} - ${interpretacao.novo_status_entrega}`;
      } else {
        mensagem_usuario = `❌ Erro ao atualizar entrega: ${updateResult.error}`;
      }
    }
    // TIPO 3: Consulta
    else if (interpretacao.tipo === 'consulta') {
      resultado.success = true;
      mensagem_usuario = formatarStatusPedido(pedido);
    }

    return {
      success: resultado.success,
      numero_pedido: interpretacao.numero_pedido,
      mensagem_usuario
    };
  } catch (error) {
    logger.error('Erro ao processar atualização de status:', error.message);
    return {
      success: false,
      mensagem_usuario: 'Erro ao processar atualização. Tente novamente.'
    };
  }
}

/**
 * Lista entregas pendentes (para relatório)
 */
async function listarEntregasPendentes() {
  try {
    const entregasPendentes = await pedidosSheets.listarEntregasPendentes();
    return {
      success: true,
      entregas: entregasPendentes,
      total: entregasPendentes.length
    };
  } catch (error) {
    logger.error('Erro ao listar entregas pendentes:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verifica se algum item ficou com estoque crítico após a venda e envia alerta
 */
async function verificarEstoqueCriticoAposVenda(itens) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) {
    logger.warn('[estoque-critico] NUMERO_FELIPE não configurado, pulando verificação');
    return;
  }

  for (const item of itens) {
    try {
      const estoqueItem = await estoqueService.findByModeloTamanhoCor(item.modelo, item.tamanho, item.cor);
      if (!estoqueItem) continue;

      const disponivel = estoqueItem.quantidade_disponivel;

      if (disponivel === 0) {
        const alerta = `🚨 *SEM ESTOQUE!*\n\n${item.modelo} ${item.tamanho} ${item.cor}: sem unidades restantes.\n\nHora de repor!`;
        await enviarMensagem(numeroFelipe, alerta);
        logger.warn(`[estoque-critico] Sem estoque: ${item.modelo} ${item.tamanho} ${item.cor}`);
      } else if (disponivel <= 2) {
        const alerta = `⚠️ *Estoque crítico!*\n\n${item.modelo} ${item.tamanho} ${item.cor}: apenas ${disponivel} unidade(s) restante(s).\n\nHora de repor!`;
        await enviarMensagem(numeroFelipe, alerta);
        logger.warn(`[estoque-critico] Crítico: ${item.modelo} ${item.tamanho} ${item.cor} = ${disponivel} unidades`);
      }
    } catch (error) {
      logger.warn(`[estoque-critico] Erro ao verificar item ${item.modelo}:`, error.message);
    }
  }
}

/**
 * Formata descrição do pedido para salvar no Sheets
 */
function formatarDescricaoPedido(itens) {
  return itens
    .map(item => `${item.quantidade}x ${item.modelo} ${item.tamanho} ${item.cor}`)
    .join(', ');
}

/**
 * Formata resumo do pedido para resposta
 */
function formatarResumo(pedido, valorTotal, numeroPedido) {
  const itens = pedido.itens.map(item => `• ${item.quantidade}x ${item.modelo} ${item.tamanho} ${item.cor}`).join('\n');

  return `
Pedido: #${numeroPedido}
Cliente: ${pedido.cliente_nome}

Itens:
${itens}

Total: R$ ${valorTotal.toFixed(2)}
Entrega: ${pedido.tipo_entrega}
  `.trim();
}

/**
 * Formata status de um pedido para consulta
 */
function formatarStatusPedido(pedido) {
  return `
📋 Pedido #${pedido.numero_pedido}
Cliente: ${pedido.cliente_nome}
Data: ${new Date(pedido.data_pedido).toLocaleDateString('pt-BR')}

💰 Pagamento: ${pedido.status_pagamento}
${pedido.data_pagamento ? `   Pago em: ${new Date(pedido.data_pagamento).toLocaleDateString('pt-BR')}` : ''}

🚚 Entrega: ${pedido.status_entrega}
   Tipo: ${pedido.tipo_entrega}
${pedido.endereco_entrega ? `   Local: ${pedido.endereco_entrega}` : ''}
${pedido.data_entrega ? `   Entregue em: ${new Date(pedido.data_entrega).toLocaleDateString('pt-BR')}` : ''}

Valor: R$ ${pedido.valor_total.toFixed(2)}
  `.trim();
}

/**
 * Envia notificação para Felipe quando novo cliente faz primeira compra
 */
async function enviarNotificacaoNovoClientePagou(pedido, numeroPedido) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) return;

  const mensagem = `
🎉 *NOVO CLIENTE PAGOU!*

👤 ${pedido.cliente_nome}
📱 ${pedido.cliente_whatsapp}

📋 Pedido: #${numeroPedido}
🛍️ Descrição: ${pedido.descricao_pedido || 'N/A'}
💰 Valor: R$ ${(pedido.valor_total || 0).toFixed(2)}
💳 Forma: ${pedido.forma_pagamento || 'N/A'}

🚚 Tipo: ${pedido.tipo_entrega || 'N/A'}
`.trim();

  try {
    await enviarMensagem(numeroFelipe, mensagem);
    logger.info(`[notif-cliente] Notificação enviada para Felipe: ${numeroPedido}`);
  } catch (error) {
    logger.error('[notif-cliente] Erro ao enviar notificação:', error.message);
  }
}

/**
 * Envia notificação para Felipe quando cliente é promovido a VIP
 */
async function enviarNotificacaoNovoVIP(pedido, numeroPedido) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) return;

  const mensagem = `
⭐ *NOVO CLIENTE VIP!*

👤 ${pedido.cliente_nome}
📱 ${pedido.cliente_whatsapp}

🎯 Alcançou R$ 500+ em compras!

📋 Pedido: #${numeroPedido}
🛍️ Descrição: ${pedido.descricao_pedido || 'N/A'}
💰 Valor: R$ ${(pedido.valor_total || 0).toFixed(2)}
💳 Forma: ${pedido.forma_pagamento || 'N/A'}

💡 Sugestão: Ofereça frete grátis ou desconto exclusivo!
`.trim();

  try {
    await enviarMensagem(numeroFelipe, mensagem);
    logger.info(`[notif-vip] Notificação enviada para Felipe: ${numeroPedido}`);
  } catch (error) {
    logger.error('[notif-vip] Erro ao enviar notificação:', error.message);
  }
}

export {
  processarMensagemPedido,
  processarStatusUpdate,
  listarEntregasPendentes,
  formatarDescricaoPedido,
  formatarResumo,
  formatarStatusPedido
};
