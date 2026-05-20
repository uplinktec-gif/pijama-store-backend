import { processarMensagemComContexto, detectarTipoMensagem } from './src/services/business/conversas.js';
import { logger } from './src/utils/logger.js';

console.log('\n📝 TESTE PHASE 2: Conversas Multi-Turno\n');
console.log('=' .repeat(60));

async function testarCenario(nome, mensagens) {
  console.log(`\n🎬 CENÁRIO: ${nome}`);
  console.log('-'.repeat(60));

  const clienteWhatsApp = '+5595988123456';

  for (let i = 0; i < mensagens.length; i++) {
    const msg = mensagens[i];
    const tipo = detectarTipoMensagem(msg, {});

    console.log(`\n📱 Turno ${i + 1} (Cliente):`);
    console.log(`   Mensagem: "${msg}"`);
    console.log(`   Tipo detectado: ${tipo}`);

    try {
      const resultado = await processarMensagemComContexto(msg, clienteWhatsApp);

      console.log(`\n💬 Resposta do Sistema:`);

      if (resultado && resultado.resposta) {
        console.log(`   ${resultado.resposta.split('\n').join('\n   ')}`);
      } else if (resultado && resultado.mensagem_usuario) {
        console.log(`   ${resultado.mensagem_usuario}`);
      } else {
        console.log(`   [Sem resposta]`);
      }

      console.log(`   Status: ${resultado && resultado.success ? '✅ Sucesso' : '❌ Erro'}`);

      if (resultado && resultado.erro) {
        console.log(`   Erro: ${resultado.erro}`);
      }
    } catch (error) {
      console.log(`   ❌ ERRO: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
}

async function executarTestes() {
  try {
    // Teste 1: Novo Pedido Completo
    await testarCenario('Novo Pedido + Entrega + Pagamento PIX', [
      '2 zara g bordô 150 pra joão',
      'entrega',
      'rua das flores 123, apto 45',
      'paguei no pix'
    ]);

    // Teste 2: Novo Pedido Retirada
    await testarCenario('Novo Pedido + Retirada na Loja', [
      '1 mia p preto pra maria',
      'retirada',
      'sábado 14h',
      'dinheiro'
    ]);

    // Teste 3: Consultando Pedido
    await testarCenario('Consultar Status de Pedido', [
      'qual é o meu pedido?',
      '#1'
    ]);

    // Teste 4: Cancelamento
    await testarCenario('Cancelar Pedido', [
      'quero fazer um novo pedido',
      '3 beatriz m cinza',
      'cancelar'
    ]);

    console.log('\n\n✅ TESTES CONCLUÍDOS!\n');
    console.log('📊 Próximo passo: Verificar CONVERSAS sheet em Google Sheets');
    console.log('   Deve ter entradas com STATUS=ATIVA ou FINALIZADA\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro Fatal:', error.message);
    process.exit(1);
  }
}

executarTestes();
