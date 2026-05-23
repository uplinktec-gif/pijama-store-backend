import { initializeDatabase, query, closeDatabase } from './src/config/database.js';

async function debugEstoque() {
  try {
    console.log('🔍 Iniciando DEBUG ESTOQUE...\n');

    await initializeDatabase();

    // PASSO 1: Contar registros
    const count = query('SELECT COUNT(*) as total FROM estoque');
    console.log('📊 Total de registros em estoque:', count[0]?.total || 0);

    if ((count[0]?.total || 0) === 0) {
      console.log('⚠️  HIPÓTESE #1 CONFIRMADA: Banco está vazio!');
      console.log('\nPróximos passos:');
      console.log('1. Verificar se migration foi executada: node scripts/migrate-sheets-to-sqlite.js');
      console.log('2. Verificar Google Sheets API credentials');
      closeDatabase();
      process.exit(1);
    }

    // PASSO 2: Listar algumas amostras
    const samples = query('SELECT sku, modelo, tamanho, cor, quantidade_total, quantidade_reservada FROM estoque LIMIT 5');
    console.log('\n📋 Primeiras 5 linhas:');
    samples.forEach((row, i) => {
      console.log(`${i+1}. ${row.sku} | ${row.modelo} | ${row.tamanho} | ${row.cor} | Total: ${row.quantidade_total} | Reservado: ${row.quantidade_reservada}`);
    });

    // PASSO 3: Verificar quantidade disponível
    const disponivel = query('SELECT SUM(quantidade_total - quantidade_reservada) as total_disponivel FROM estoque');
    console.log('\n💰 Total disponível no estoque:', disponivel[0]?.total_disponivel || 0);

    console.log('\n✅ BANCO NÃO ESTÁ VAZIO - Problema está na camada acima (API/Frontend)');
    closeDatabase();

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

debugEstoque();
