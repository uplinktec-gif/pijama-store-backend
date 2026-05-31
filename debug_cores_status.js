import { initializeDatabase, query, queryOne, closeDatabase } from './src/config/database.js';

async function debugCores() {
  try {
    console.log('🔍 DEBUG CORES - Investigando por que as cores desapareceram\n');

    await initializeDatabase();

    // 1. Total de registros
    const total = queryOne('SELECT COUNT(*) as total FROM estoque');
    console.log(`📊 Total de registros em estoque: ${total?.total || 0}`);

    // 2. Contagem por status
    const porStatus = query('SELECT status, COUNT(*) as count FROM estoque GROUP BY status');
    console.log('\n📌 Registros por Status:');
    porStatus.forEach(row => {
      console.log(`   "${row.status}" ou NULL: ${row.count}`);
    });

    // 3. Contagem de cores com status ATIVO
    const cores = query('SELECT DISTINCT cor FROM estoque WHERE UPPER(status) = \'ATIVO\' ORDER BY cor');
    console.log(`\n🎨 Cores com status=ATIVO: ${cores.length}`);
    cores.forEach(row => {
      console.log(`   - ${row.cor}`);
    });

    // 4. Amostra de dados
    const amostras = query('SELECT sku, modelo, tamanho, cor, status, quantidade_total FROM estoque LIMIT 10');
    console.log(`\n📝 Amostra de 10 itens:`);
    amostras.forEach((row, i) => {
      console.log(`${i+1}. ${row.modelo} | ${row.tamanho} | ${row.cor} | Status: "${row.status}" | Qtd: ${row.quantidade_total}`);
    });

    // 5. Contagem de TODAS as cores (sem filtro de status)
    const todasCores = query('SELECT DISTINCT cor FROM estoque ORDER BY cor');
    console.log(`\n🎨 TODAS as cores no banco (sem filtro): ${todasCores.length}`);
    todasCores.forEach(row => {
      console.log(`   - ${row.cor}`);
    });

    closeDatabase();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

debugCores();
