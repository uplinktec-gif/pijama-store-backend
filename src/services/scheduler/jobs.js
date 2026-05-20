import schedule from 'node-schedule';
import { logger } from '../../utils/logger.js';
import * as senderService from '../whatsapp/sender.js';
import { gerarRelatorioDiario, analisarEstoque, analisarVendas } from '../business/analytics.js';
import * as estoqueSheets from '../sheets/estoque.js';
import { gerarRecomendacaoCliente } from '../business/recomendacoes.js';
import * as clientesSheets from '../sheets/clientes.js';
import { realizarBackup } from '../backup/backupSheets.js';
import { obterRoleUsuario, temPermissao } from '../../config/users.js';

// Números de telefone autorizados (Felipe e Júlly)
const NUMERO_FELIPE = process.env.NUMERO_FELIPE || '+5595988123456';
const NUMERO_JULLY = process.env.NUMERO_JULLY || '+5595987654321';

/**
 * Agenda relatório diário às 18h para Felipe
 */
function agendarRelatoraioDiario() {
  const job = schedule.scheduleJob('0 22 * * *' /* 18h Boa Vista */, async () => {
    try {
      logger.info('🕕 Iniciando relatório diário agendado');

      const relatorio = await gerarRelatorioDiario();

      // Formatar relatório para WhatsApp
      let mensagem = `📊 RELATÓRIO DO DIA - ${relatorio.data} às ${relatorio.hora}\n\n`;

      mensagem += `💰 VENDAS:\n`;
      mensagem += `   Total: R$ ${relatorio.vendas.totalVendido.toLocaleString('pt-BR')}\n`;
      mensagem += `   Pedidos: ${relatorio.vendas.quantidadePedidos}\n`;
      mensagem += `   Ticket: R$ ${relatorio.vendas.ticketMedio.toLocaleString('pt-BR')}\n\n`;

      if (relatorio.vendas.maisVendidos?.length > 0) {
        mensagem += `🔥 MAIS VENDIDOS:\n`;
        relatorio.vendas.maisVendidos.forEach(p => {
          mensagem += `   • ${p.modelo}: ${p.quantidade} un\n`;
        });
        mensagem += `\n`;
      }

      // Alertas de estoque
      if (relatorio.estoque?.alertas?.length > 0) {
        mensagem += `⚠️ ALERTAS DE ESTOQUE:\n`;
        relatorio.estoque.alertas.slice(0, 3).forEach(a => {
          mensagem += `   [${a.tipo}] ${a.produto}: ${a.diasRestantes} dias\n`;
        });
        mensagem += `\n`;
      }

      // VIPs
      if (relatorio.clientes?.vips?.length > 0) {
        mensagem += `👑 TOP CLIENTES:\n`;
        relatorio.clientes.vips.slice(0, 3).forEach(v => {
          mensagem += `   • ${v.nome}: R$ ${v.totalGasto.toLocaleString('pt-BR')}\n`;
        });
      }

      await senderService.enviarMensagem(NUMERO_FELIPE, mensagem);
      logger.info('✓ Relatório diário enviado para Felipe');
    } catch (error) {
      logger.error('Erro ao enviar relatório diário:', error.message);
    }
  });

  return job;
}

/**
 * Agenda alertas de estoque baixo às 10h
 */
function agendarAlertasEstoque() {
  const job = schedule.scheduleJob('0 14 * * *' /* 10h Boa Vista */, async () => {
    try {
      logger.info('🚨 Iniciando verificação de estoque baixo');

      const estoque = await analisarEstoque();

      if (estoque.alertas?.length === 0) {
        logger.info('✓ Nenhum alerta de estoque');
        return;
      }

      // Verificar itens zerados diretamente do estoque
      const todosItens = await estoqueSheets.readAllEstoque();
      const itensZerados = todosItens.filter(i => i.quantidade_disponivel === 0 && (i.status || '').toLowerCase() === 'ativo');

      if (itensZerados.length > 0) {
        let mensagemZerados = `🚨 *SEM ESTOQUE!*\n\nOs seguintes itens estão zerados:\n`;
        itensZerados.slice(0, 10).forEach(i => {
          mensagemZerados += `• ${i.modelo} ${i.tamanho} ${i.cor}\n`;
        });
        await senderService.enviarMensagem(NUMERO_FELIPE, mensagemZerados);
      }

      // Separar por tipo de alerta
      const alertasUrgentes = estoque.alertas.filter(a => a.tipo === 'URGENTE');
      const avisos = estoque.alertas.filter(a => a.tipo === 'AVISO');

      let mensagem = `⚠️ ALERTAS DE ESTOQUE\n\n`;

      if (alertasUrgentes.length > 0) {
        mensagem += `🔴 URGENTE (encomendar HOJE):\n`;
        alertasUrgentes.slice(0, 5).forEach(a => {
          mensagem += `   • ${a.produto}: ${a.disponivel} un (${a.diasRestantes} dias)\n`;
        });
        mensagem += `\n`;
      }

      if (avisos.length > 0) {
        mensagem += `🟡 AVISO (encomendar essa semana):\n`;
        avisos.slice(0, 5).forEach(a => {
          mensagem += `   • ${a.produto}: ${a.disponivel} un (${a.diasRestantes} dias)\n`;
        });
      }

      await senderService.enviarMensagem(NUMERO_FELIPE, mensagem);
      logger.info('✓ Alerta de estoque enviado para Felipe');
    } catch (error) {
      logger.error('Erro ao enviar alerta de estoque:', error.message);
    }
  });

  return job;
}

/**
 * Agenda recomendações para VIPs às segundas-feiras às 9h
 */
function agendarRecomendacoesVIPs() {
  const job = schedule.scheduleJob('0 13 * * 1' /* 09h Boa Vista seg */, async () => {
    try {
      logger.info('👑 Iniciando recomendações para VIPs');

      // Buscar clientes (para identificar VIPs)
      const todosClientes = await clientesSheets.readAllClientes();

      // Selecionar VIPs (maiores gastos)
      const vips = todosClientes
        .filter(c => c.total_gasto && parseFloat(c.total_gasto) > 0)
        .sort((a, b) => parseFloat(b.total_gasto) - parseFloat(a.total_gasto))
        .slice(0, 5);

      logger.info(`Enviando recomendações para ${vips.length} VIPs`);

      // Enviar recomendação personalizada para cada VIP
      for (const vip of vips) {
        try {
          const recomendacao = await gerarRecomendacaoCliente(vip.whatsapp);

          if (recomendacao.success) {
            await senderService.enviarMensagem(vip.whatsapp, recomendacao.mensagem);
            logger.info(`✓ Recomendação enviada para ${vip.nome}`);
          }
        } catch (error) {
          logger.error(`Erro ao enviar recomendação para ${vip.nome}:`, error.message);
        }
      }

      // Notificar Felipe que as recomendações foram enviadas
      await senderService.enviarMensagem(
        NUMERO_FELIPE,
        `👑 Recomendações de segunda-feira enviadas para ${vips.length} VIPs!`
      );
    } catch (error) {
      logger.error('Erro ao agendar recomendações de VIPs:', error.message);
    }
  });

  return job;
}

/**
 * Agenda backup automático das planilhas às 02:00
 */
function agendarBackupAutomatico() {
  const job = schedule.scheduleJob('0 6 * * *'  /* 02h Boa Vista */, async () => {
    try {
      logger.info('💾 Iniciando backup automático agendado');

      const resultado = await realizarBackup();

      if (resultado.success) {
        logger.info(`✅ Backup agendado concluído: ${resultado.arquivo}`);

        // Notificar Felipe sobre o backup
        await senderService.enviarMensagem(
          NUMERO_FELIPE,
          `💾 Backup automático realizado com sucesso!\n\n` +
          `📁 Arquivo: ${resultado.arquivo}\n` +
          `📊 Tamanho: ${resultado.tamanho_kb} KB\n` +
          `⏰ Data: ${new Date(resultado.data_backup).toLocaleString('pt-BR')}`
        );
      } else {
        logger.error('❌ Erro no backup agendado:', resultado.erro);
      }
    } catch (error) {
      logger.error('Erro ao executar backup automático:', error.message);
    }
  });

  return job;
}

/**
 * Agenda resumo diário para Júlly às 20:00 (2h depois de Felipe)
 */
function agendarResumoJully() {
  const job = schedule.scheduleJob('0 0 * * *'  /* 20h Boa Vista */, async () => {
    try {
      logger.info('👥 Iniciando resumo diário para Júlly');

      const relatorio = await gerarRelatorioDiario();
      const estoque = await analisarEstoque();

      // Formatar resumo sem recomendações (Júlly não tem acesso)
      let mensagem = `📊 RESUMO DO DIA (Júlly) - ${relatorio.data} às ${relatorio.hora}\n\n`;

      mensagem += `💰 VENDAS:\n`;
      mensagem += `   Total: R$ ${relatorio.vendas.totalVendido.toLocaleString('pt-BR')}\n`;
      mensagem += `   Pedidos: ${relatorio.vendas.quantidadePedidos}\n`;
      mensagem += `   Ticket: R$ ${relatorio.vendas.ticketMedio.toLocaleString('pt-BR')}\n\n`;

      if (relatorio.vendas.maisVendidos?.length > 0) {
        mensagem += `🔥 MAIS VENDIDOS:\n`;
        relatorio.vendas.maisVendidos.forEach(p => {
          mensagem += `   • ${p.modelo}: ${p.quantidade} un\n`;
        });
        mensagem += `\n`;
      }

      // Alertas de estoque
      if (estoque.alertas?.length > 0) {
        const alertasUrgentes = estoque.alertas.filter(a => a.tipo === 'URGENTE');

        if (alertasUrgentes.length > 0) {
          mensagem += `🔴 PRODUTOS URGENTES (encomendar HOJE):\n`;
          alertasUrgentes.slice(0, 3).forEach(a => {
            mensagem += `   • ${a.produto}: ${a.disponivel} un (${a.diasRestantes} dias)\n`;
          });
        }
      }

      await senderService.enviarMensagem(NUMERO_JULLY, mensagem);
      logger.info('✓ Resumo diário enviado para Júlly');
    } catch (error) {
      logger.error('Erro ao enviar resumo para Júlly:', error.message);
    }
  });

  return job;
}

/**
 * Agenda relatório semanal toda domingo às 20h para Felipe
 */
function agendarRelatorioSemanal() {
  const job = schedule.scheduleJob('0 0 * * 1'  /* Dom 20h Boa Vista */, async () => {
    try {
      logger.info('📊 Iniciando relatório semanal agendado (domingo)');

      const vendas = await analisarVendas(7);

      const hoje = new Date();
      const dataFormatada = hoje.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      // Capitalize first letter
      const dataCapitalizada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);

      let mensagem = `📊 *RESUMO DA SEMANA — Pluma Pijamas*\n\n`;
      mensagem += `💰 Faturamento: R$ ${vendas.totalVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      mensagem += `🛍️ Pedidos: ${vendas.quantidadePedidos}\n`;

      // Calcular total de peças vendidas
      const totalPecas = vendas.maisVendidos.reduce((sum, p) => sum + p.quantidade, 0);
      mensagem += `📦 Peças vendidas: ${totalPecas}\n`;
      mensagem += `🎯 Ticket médio: R$ ${vendas.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

      if (vendas.maisVendidos?.length > 0) {
        mensagem += `\n🔥 Mais vendidos:\n`;
        vendas.maisVendidos.forEach(p => {
          mensagem += `• ${p.modelo}: ${p.quantidade} peças\n`;
        });
      }

      mensagem += `\n_${dataCapitalizada}_`;

      await senderService.enviarMensagem(NUMERO_FELIPE, mensagem);
      logger.info('✓ Relatório semanal enviado para Felipe');
    } catch (error) {
      logger.error('Erro ao enviar relatório semanal:', error.message);
    }
  });

  return job;
}

/**
 * Inicializa todos os jobs agendados
 */
function inicializarScheduler() {
  try {
    logger.info('⏰ Inicializando scheduler de tarefas automáticas');

    const jobs = [];

    // Agendar relatório diário às 18h
    jobs.push({
      nome: 'Relatório Diário (18h)',
      job: agendarRelatoraioDiario()
    });

    // Agendar alertas de estoque às 10h
    jobs.push({
      nome: 'Alertas de Estoque (10h)',
      job: agendarAlertasEstoque()
    });

    // Agendar recomendações para VIPs às seg 9h
    jobs.push({
      nome: 'Recomendações VIPs (Seg 09h)',
      job: agendarRecomendacoesVIPs()
    });

    // Agendar backup automático às 02h
    jobs.push({
      nome: 'Backup Automático (02h)',
      job: agendarBackupAutomatico()
    });

    // Agendar resumo para Júlly às 20h
    jobs.push({
      nome: 'Resumo para Júlly (20h)',
      job: agendarResumoJully()
    });

    // Agendar relatório semanal todo domingo às 20h
    jobs.push({
      nome: 'Relatório Semanal (Dom 20h)',
      job: agendarRelatorioSemanal()
    });

    logger.info(`✓ ${jobs.length} tarefas agendadas:`);
    jobs.forEach(j => logger.info(`   • ${j.nome}`));

    return jobs;
  } catch (error) {
    logger.error('Erro ao inicializar scheduler:', error.message);
    return [];
  }
}

/**
 * Cancela todos os jobs agendados
 */
function cancelarTodosJobs() {
  try {
    schedule.gracefulShutdown();
    logger.info('✓ Todos os jobs agendados foram cancelados');
  } catch (error) {
    logger.error('Erro ao cancelar jobs:', error.message);
  }
}

export { inicializarScheduler, cancelarTodosJobs };
