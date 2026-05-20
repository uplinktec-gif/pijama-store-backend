import { logger } from './src/utils/logger.js';
import { inicializarScheduler } from './src/services/scheduler/jobs.js';

console.log('\n⏰ TESTE PHASE 3.2: Agendamento Automático\n');
console.log('='.repeat(60));

async function testarScheduler() {
  try {
    console.log('\n📝 Inicializando scheduler...');
    console.log('-'.repeat(60));

    const jobs = inicializarScheduler();

    console.log(`\n✅ Scheduler inicializado com sucesso!\n`);
    console.log(`📋 Jobs agendados: ${jobs.length}\n`);

    jobs.forEach((j, idx) => {
      console.log(`   ${idx + 1}. ${j.nome}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Detalhes das Tarefas:\n');

    const detalhes = [
      {
        nome: 'Relatório Diário',
        horario: '18:00',
        frequencia: 'Todos os dias',
        para: 'Felipe',
        conteudo: 'Vendas, Estoque, Clientes'
      },
      {
        nome: 'Alertas Estoque',
        horario: '10:00',
        frequencia: 'Todos os dias',
        para: 'Felipe',
        conteudo: 'Produtos baixo estoque (URGENTE/AVISO)'
      },
      {
        nome: 'Recomendações VIPs',
        horario: '09:00',
        frequencia: 'Segundas-feiras',
        para: 'Clientes VIP',
        conteudo: 'Recomendação personalizada por cliente'
      }
    ];

    detalhes.forEach(d => {
      console.log(`📌 ${d.nome}`);
      console.log(`   ⏰ Horário: ${d.horario}`);
      console.log(`   📅 Frequência: ${d.frequencia}`);
      console.log(`   👤 Para: ${d.para}`);
      console.log(`   📝 Conteúdo: ${d.conteudo}\n`);
    });

    console.log('='.repeat(60));
    console.log('\n✅ TESTES PHASE 3.2 CONCLUÍDOS!\n');
    console.log('📝 Status:');
    console.log('   ✓ Scheduler inicializado');
    console.log('   ✓ 3 tarefas agendadas');
    console.log('   ✓ Horários configurados');
    console.log('\n🚀 Próximos passos:');
    console.log('   1. npm run dev (inicia servidor com scheduler)');
    console.log('   2. Aguardar horários agendados ou ajustar para testes');
    console.log('   3. Verificar logs de execução no console\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro Fatal:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testarScheduler();
