import schedule from 'node-schedule';
import { logger } from '../../utils/logger.js';
import * as senderService from '../whatsapp/sender.js';
import { gerarRelatorioDiario, analisarEstoque, analisarVendas } from '../business/analytics.js';
import * as estoqueSheets from '../sqlite/estoque.js';
import { listarInadimplentes } from '../sqlite/pedidos.js';
import { gerarRecomendacaoCliente } from '../business/recomendacoes.js';
import * as clientesSheets from '../sqlite/clientes.js';
import { realizarBackup } from '../backup/backupSQLite.js';
import { obterRoleUsuario, temPermissao } from '../../config/users.js';

// Números de telefone autorizados (Felipe e Júlly)
const NUMERO_FELIPE = process.env.NUMERO_FELIPE || '+5595988123456';
const NUMERO_JULLY = process.env.NUMERO_JULLY || '+5595987654321';

// Set para rastrear jobs já agendados (evitar duplicação)
const jobsAgendados = new Set();

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
      // FIX Sprint 0: readAllEstoque/mapItem retornam campos em minúsculas
      // (quantidade_disponivel, status, modelo...). Os nomes em MAIÚSCULAS
      // nunca casavam → o alerta de zerados estava morto. Corrigido.
      const todosItens = await estoqueSheets.readAllEstoque();
      const itensZerados = todosItens.filter(i => i.quantidade_disponivel === 0 && (i.status || '').toLowerCase() === 'ativo');

      if (itensZerados.length > 0) {
        let mensagemZerados = `🚨 *SEM ESTOQUE!*\n\nOs seguintes itens estão zerados:\n\n`;
        itensZerados.slice(0, 10).forEach(i => {
          mensagemZerados += `❌ *${i.modelo}*\n   Tamanho: ${i.tamanho}\n   Cor: ${i.cor}\n\n`;
        });
        await senderService.enviarMensagem(NUMERO_FELIPE, mensagemZerados);
      }

      // Separar por tipo de alerta
      const alertasUrgentes = estoque.alertas.filter(a => a.tipo === 'URGENTE');
      const avisos = estoque.alertas.filter(a => a.tipo === 'AVISO');

      let mensagem = `⚠️ *ALERTAS DE ESTOQUE*\n\n`;

      if (alertasUrgentes.length > 0) {
        mensagem += `🔴 *URGENTE (encomendar HOJE):*\n`;
        alertasUrgentes.slice(0, 5).forEach(a => {
          mensagem += `   📦 *${a.produto}*\n`;
          mensagem += `       ${a.disponivel} un • ${a.diasRestantes} dias restantes\n`;
        });
        mensagem += `\n`;
      }

      if (avisos.length > 0) {
        mensagem += `🟡 *AVISO (encomendar essa semana):*\n`;
        avisos.slice(0, 5).forEach(a => {
          mensagem += `   📦 *${a.produto}*\n`;
          mensagem += `       ${a.disponivel} un • ${a.diasRestantes} dias restantes\n`;
        });
      }

      await senderService.enviarMensagem(NUMERO_FELIPE, mensagem);
      logger.info('✓ Alertas de estoque enviados para Felipe');
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
        const nomeArquivo = resultado.filename?.split(/[\\/]/).pop() || resultado.filename || '—';
        logger.info(`✅ Backup agendado concluído: ${nomeArquivo}`);

        // Notificar Felipe sobre o backup
        await senderService.enviarMensagem(
          NUMERO_FELIPE,
          `💾 Backup automático realizado com sucesso!\n\n` +
          `📁 Arquivo: ${nomeArquivo}\n` +
          `📊 Tamanho: ${resultado.size} KB\n` +
          `⏰ Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' })}`
        );
      } else {
        logger.error('❌ Erro no backup agendado:', resultado.error || resultado.erro);
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
 * Aging em linguagem natural a partir da data do pedido (ISO).
 */
function agingTexto(dataISO) {
  if (!dataISO) return 'data ?';
  const dias = Math.floor((Date.now() - new Date(dataISO).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

/**
 * Monta a mensagem de cobrança (lista nominal de inadimplentes com aging).
 * Pura — não envia nada. Usada pelo job e pelo teste manual.
 */
async function gerarMensagemCobranca() {
  const lista = await listarInadimplentes();
  if (!lista.length) {
    return '✅ *Cobrança 21h* — Nenhum pedido em aberto. Tudo pago! 🎉';
  }
  const linhas = [`🔔 *COBRANÇA — ${lista.length} pedido(s) em aberto*\n`];
  for (const p of lista) {
    let itens = p.descricao_pedido || '';
    try {
      const j = JSON.parse(p.itens_json || '[]');
      if (j.length) itens = j.map(i => `${i.quantidade}x ${i.modelo} ${i.tamanho} ${i.cor}`).join(', ');
    } catch (_) {}
    const num = String(p.numero_pedido).padStart(3, '0');
    const valor = Number(p.valor_total || 0).toFixed(2);
    linhas.push(`• *${p.cliente_nome || 'Cliente'}* — #${num} — ${itens} — R$ ${valor} — _${agingTexto(p.data_pedido)}_`);
  }
  linhas.push('\n_Cruze com o extrato PJ para a cobrança ativa._');
  return linhas.join('\n');
}

/**
 * Envia a cobrança para os fundadores (Felipe e Júlly).
 */
async function enviarCobrancaDiaria() {
  try {
    const msg = await gerarMensagemCobranca();
    await senderService.enviarMensagem(NUMERO_FELIPE, msg);
    await senderService.enviarMensagem(NUMERO_JULLY, msg);
    logger.info('✓ Cobrança diária (21h) enviada para Felipe e Júlly');
  } catch (error) {
    logger.error('Erro ao enviar cobrança diária:', error.message);
  }
}

/**
 * Agenda a cobrança de inadimplentes às 21h de Boa Vista (01:00 UTC).
 */
function agendarCobrancaDiaria() {
  return schedule.scheduleJob('0 1 * * *' /* 21h Boa Vista */, enviarCobrancaDiaria);
}

/**
 * Inicializa todos os jobs agendados (com proteção contra duplicação)
 */
function inicializarScheduler() {
  try {
    logger.info('⏰ Inicializando scheduler de tarefas automáticas');

    // Se jobs já foram agendados, não agendar novamente
    if (jobsAgendados.size > 0) {
      logger.warn('⚠️ Scheduler já foi inicializado. Ignorando chamada duplicada.');
      return [];
    }

    const jobs = [];

    // Agendar relatório diário às 18h
    if (!jobsAgendados.has('relatorio-diario')) {
      jobs.push({
        nome: 'Relatório Diário (18h)',
        job: agendarRelatoraioDiario()
      });
      jobsAgendados.add('relatorio-diario');
    }

    // Agendar alertas de estoque às 10h
    if (!jobsAgendados.has('alertas-estoque')) {
      jobs.push({
        nome: 'Alertas de Estoque (10h)',
        job: agendarAlertasEstoque()
      });
      jobsAgendados.add('alertas-estoque');
    }

    // Agendar recomendações para VIPs às seg 9h
    if (!jobsAgendados.has('recomendacoes-vips')) {
      jobs.push({
        nome: 'Recomendações VIPs (Seg 09h)',
        job: agendarRecomendacoesVIPs()
      });
      jobsAgendados.add('recomendacoes-vips');
    }

    // Agendar backup automático às 02h
    if (!jobsAgendados.has('backup-automatico')) {
      jobs.push({
        nome: 'Backup Automático (02h)',
        job: agendarBackupAutomatico()
      });
      jobsAgendados.add('backup-automatico');
    }

    // Agendar resumo para Júlly às 20h
    if (!jobsAgendados.has('resumo-jully')) {
      jobs.push({
        nome: 'Resumo para Júlly (20h)',
        job: agendarResumoJully()
      });
      jobsAgendados.add('resumo-jully');
    }

    // Agendar relatório semanal todo domingo às 20h
    if (!jobsAgendados.has('relatorio-semanal')) {
      jobs.push({
        nome: 'Relatório Semanal (Dom 20h)',
        job: agendarRelatorioSemanal()
      });
      jobsAgendados.add('relatorio-semanal');
    }

    // Agendar cobrança de inadimplentes às 21h
    if (!jobsAgendados.has('cobranca-diaria')) {
      jobs.push({
        nome: 'Cobrança Inadimplentes (21h)',
        job: agendarCobrancaDiaria()
      });
      jobsAgendados.add('cobranca-diaria');
    }

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
    jobsAgendados.clear();
    logger.info('✓ Todos os jobs agendados foram cancelados');
  } catch (error) {
    logger.error('Erro ao cancelar jobs:', error.message);
  }
}

export { inicializarScheduler, cancelarTodosJobs, gerarMensagemCobranca, enviarCobrancaDiaria };
