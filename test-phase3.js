import { logger } from './src/utils/logger.js';
import {
  analisarVendas,
  analisarEstoque,
  analisarClientes,
  gerarRelatorioDiario
} from './src/services/business/analytics.js';
import {
  gerarRecomendacaoCliente,
  gerarRecomendacaoEstoque
} from './src/services/business/recomendacoes.js';

console.log('\n📊 TESTE PHASE 3: Analytics e Recomendações\n');
console.log('=' .repeat(60));

async function executarTestes() {
  try {
    // Teste 1: Análise de Vendas
    console.log('\n🎯 TESTE 1: Análise de Vendas (últimos 7 dias)');
    console.log('-'.repeat(60));
    const vendas = await analisarVendas(7);
    console.log('\n📈 Resultados:');
    console.log(`   Total vendido: R$ ${vendas.totalVendido.toLocaleString('pt-BR')}`);
    console.log(`   Quantidade de pedidos: ${vendas.quantidadePedidos}`);
    console.log(`   Ticket médio: R$ ${vendas.ticketMedio.toLocaleString('pt-BR')}`);
    console.log('\n   🔥 Mais vendidos:');
    vendas.maisVendidos.forEach(p => {
      console.log(`      • ${p.modelo}: ${p.quantidade} unidades (R$ ${p.valor.toLocaleString('pt-BR')})`);
    });

    // Teste 2: Análise de Estoque
    console.log('\n\n🎯 TESTE 2: Análise de Estoque');
    console.log('-'.repeat(60));
    const estoque = await analisarEstoque();
    console.log(`\n   Total de produtos: ${estoque.totalProdutos}`);

    if (estoque.statusEstoque.length > 0) {
      console.log('\n   📦 Top 5 produtos (dias até esgotar):');
      estoque.statusEstoque.slice(0, 5).forEach(p => {
        console.log(`      • ${p.modelo} ${p.cor} ${p.tamanho}: ${p.disponivel} un (${p.diasRestantes} dias)`);
      });
    }

    if (estoque.alertas.length > 0) {
      console.log('\n   ⚠️ Alertas:');
      estoque.alertas.slice(0, 5).forEach(a => {
        console.log(`      • [${a.tipo}] ${a.produto}: ${a.disponivel} un (${a.diasRestantes} dias)`);
      });
    }

    // Teste 3: Análise de Clientes
    console.log('\n\n🎯 TESTE 3: Análise de Clientes');
    console.log('-'.repeat(60));
    const clientes = await analisarClientes();
    console.log(`\n   Total de clientes: ${clientes.totalClientes}`);

    if (clientes.vips.length > 0) {
      console.log('\n   👑 VIPs (maiores gastos):');
      clientes.vips.forEach(v => {
        console.log(`      • ${v.nome}: R$ ${v.totalGasto.toLocaleString('pt-BR')} (${v.quantidadePedidos} pedidos)`);
      });
    }

    if (clientes.inativos.length > 0) {
      console.log('\n   😴 Clientes inativos (>30 dias):');
      clientes.inativos.slice(0, 3).forEach(i => {
        console.log(`      • ${i.nome}: ${i.diasSemCompra} dias sem comprar`);
      });
    }

    // Teste 4: Recomendação de Estoque
    console.log('\n\n🎯 TESTE 4: Recomendação de Estoque');
    console.log('-'.repeat(60));
    const recomEstoque = await gerarRecomendacaoEstoque();
    if (recomEstoque.success) {
      console.log('\n' + recomEstoque.mensagem);
    } else {
      console.log('\n❌ Erro:', recomEstoque.erro);
    }

    // Teste 5: Recomendação para Cliente (se existir)
    console.log('\n\n🎯 TESTE 5: Recomendação Personalizada para Cliente');
    console.log('-'.repeat(60));

    // Testar com número exemplo (vai retornar "não encontrado" se não existir)
    const recomCliente = await gerarRecomendacaoCliente('+5595988123456');
    console.log('\n' + recomCliente.mensagem);

    // Teste 6: Relatório Diário Completo
    console.log('\n\n🎯 TESTE 6: Relatório Diário Completo');
    console.log('-'.repeat(60));
    const relatorio = await gerarRelatorioDiario();
    console.log(`\n📅 Data: ${relatorio.data} às ${relatorio.hora}`);
    console.log(`\n💰 VENDAS DO DIA:`);
    console.log(`   Total: R$ ${relatorio.vendas.totalVendido.toLocaleString('pt-BR')}`);
    console.log(`   Pedidos: ${relatorio.vendas.quantidadePedidos}`);
    console.log(`   Ticket: R$ ${relatorio.vendas.ticketMedio.toLocaleString('pt-BR')}`);

    console.log('\n\n' + '='.repeat(60));
    console.log('✅ TESTES PHASE 3 CONCLUÍDOS!\n');
    console.log('📝 Próximos passos:');
    console.log('   1. Testar com dados reais em Google Sheets');
    console.log('   2. Agendar relatório diário para 18h');
    console.log('   3. Integrar recomendações no webhook\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro Fatal:', error.message);
    console.error(error);
    process.exit(1);
  }
}

executarTestes();
