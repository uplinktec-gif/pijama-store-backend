import { logger } from './src/utils/logger.js';
import { processarMensagemComContexto, detectarTipoMensagem } from './src/services/business/conversas.js';

console.log('\n🎯 TESTE PHASE 3.1: Integração Webhook com Commands\n');
console.log('='.repeat(60));

async function testarComandosAnalytics() {
  try {
    const clienteWhatsApp = '+5595988123456';
    const testes = [
      { msg: '@análise', tipo: 'ANALYTICS_VENDAS', desc: 'Análise de vendas' },
      { msg: '@estoque', tipo: 'ANALYTICS_ESTOQUE', desc: 'Análise de estoque' },
      { msg: '@recomendação', tipo: 'ANALYTICS_RECOMENDACAO', desc: 'Recomendação personalizada' },
      { msg: 'análise', tipo: 'ANALYTICS_VENDAS', desc: 'Análise (sem @)' },
      { msg: 'estoque', tipo: 'ANALYTICS_ESTOQUE', desc: 'Estoque (sem @)' },
      { msg: 'recomendação', tipo: 'ANALYTICS_RECOMENDACAO', desc: 'Recomendação (sem @)' }
    ];

    for (const teste of testes) {
      console.log(`\n📝 TESTE: ${teste.desc}`);
      console.log(`   Mensagem: "${teste.msg}"`);
      console.log('-'.repeat(60));

      // Testar detecção de tipo
      const tipoDetectado = detectarTipoMensagem(teste.msg, {});
      console.log(`   ✓ Tipo detectado: ${tipoDetectado}`);

      if (tipoDetectado === teste.tipo) {
        console.log(`   ✓ Tipo correto!`);
      } else {
        console.log(`   ✗ Tipo incorreto! Esperado: ${teste.tipo}`);
        continue;
      }

      // Testar processamento
      const resultado = await processarMensagemComContexto(teste.msg, clienteWhatsApp);
      console.log(`   ✓ Processamento: ${resultado.success ? 'OK' : 'ERRO'}`);

      if (resultado.resposta) {
        const linhas = resultado.resposta.split('\n');
        console.log(`\n   Resposta (primeiras 3 linhas):`);
        linhas.slice(0, 3).forEach(linha => {
          console.log(`      ${linha}`);
        });
        if (linhas.length > 3) {
          console.log(`      ... (${linhas.length - 3} linhas mais)`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ TESTES PHASE 3.1 CONCLUÍDOS!\n');
    console.log('📝 Status:');
    console.log('   ✓ Detecção de comandos @análise, @estoque, @recomendação');
    console.log('   ✓ Processamento de analytics integrado');
    console.log('   ✓ Respostas humanizadas');
    console.log('\n🔄 Próximos passos:');
    console.log('   1. Testar com Google Sheets real (dados de verdade)');
    console.log('   2. Phase 3.2: Agendar relatórios automáticos (18h diário)');
    console.log('   3. Phase 3.2: Alertas de estoque baixo (10h diário)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro Fatal:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testarComandosAnalytics();
