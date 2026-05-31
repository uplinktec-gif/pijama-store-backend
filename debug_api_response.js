import { initializeDatabase, closeDatabase } from './src/config/database.js';
import { readAllEstoque } from './src/services/sqlite/estoque.js';
import { logger } from './src/utils/logger.js';

async function debugAPI() {
  try {
    console.log('🔍 DEBUG API RESPONSE\n');

    await initializeDatabase();

    // Chamar a função que a API usa
    const estoque = await readAllEstoque();
    console.log(`📊 Retorno de readAllEstoque: ${estoque.length} itens\n`);

    // Agrupar por modelo (como faz a API)
    const byModel = {};
    for (const item of estoque) {
      if (!item.modelo || (item.status || '').toLowerCase() !== 'ativo') {
        console.log(`FILTRADO: ${item.modelo} ${item.tamanho} ${item.cor} | Status: "${item.status}"`);
        continue;
      }

      const modelo = item.modelo.toUpperCase();
      if (!byModel[modelo]) byModel[modelo] = {};

      const key = `${item.tamanho}|${item.cor}`;
      byModel[modelo][key] = {
        tamanho: item.tamanho,
        cor: item.cor,
        disponivel: item.quantidade_disponivel,
        preco: item.preco_unitario
      };
    }

    console.log('\n✅ Resposta da API (byModel):');
    console.log(JSON.stringify(byModel, null, 2));

    closeDatabase();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

debugAPI();
