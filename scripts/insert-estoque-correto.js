import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Script de inserção dos 52 itens de estoque recontados
 * Executa do diretório do projeto onde sql.js está instalado
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = path.join(__dirname, '../data/pijama-store.db');

// Dados corretos fornecidos
const items = [
  {"modelo": "Anne", "cor": "Azul", "tamanho": "M", "estoque": 3},
  {"modelo": "Anne", "cor": "Azul", "tamanho": "P", "estoque": 0},
  {"modelo": "Anne", "cor": "Bordô", "tamanho": "G", "estoque": 0},
  {"modelo": "Anne", "cor": "Bordô", "tamanho": "M", "estoque": 2},
  {"modelo": "Anne", "cor": "Preto", "tamanho": "M", "estoque": 2},
  {"modelo": "Lia", "cor": "Azul", "tamanho": "M", "estoque": 2},
  {"modelo": "Lia", "cor": "Azul", "tamanho": "P", "estoque": 3},
  {"modelo": "Lia", "cor": "Bordô", "tamanho": "G", "estoque": 0},
  {"modelo": "Lia", "cor": "Bordô", "tamanho": "P", "estoque": 0},
  {"modelo": "Lia", "cor": "Preto", "tamanho": "M", "estoque": 2},
  {"modelo": "Lívia", "cor": "Preto", "tamanho": "P", "estoque": 3},
  {"modelo": "Mia", "cor": "Azul", "tamanho": "M", "estoque": 3},
  {"modelo": "Mia", "cor": "Preto", "tamanho": "M", "estoque": 3},
  {"modelo": "Mia", "cor": "Preto", "tamanho": "P", "estoque": 2},
  {"modelo": "Núbia", "cor": "Azul", "tamanho": "G", "estoque": 0},
  {"modelo": "Núbia", "cor": "Azul", "tamanho": "M", "estoque": 3},
  {"modelo": "Núbia", "cor": "Azul", "tamanho": "P", "estoque": 3},
  {"modelo": "Núbia", "cor": "Bordô", "tamanho": "G", "estoque": 0},
  {"modelo": "Núbia", "cor": "Bordô", "tamanho": "M", "estoque": 3},
  {"modelo": "Núbia", "cor": "Bordô", "tamanho": "P", "estoque": 2},
  {"modelo": "Zara", "cor": "Azul", "tamanho": "G", "estoque": 1},
  {"modelo": "Zara", "cor": "Azul", "tamanho": "M", "estoque": 5},
  {"modelo": "Zara", "cor": "Bordô", "tamanho": "G", "estoque": 0},
  {"modelo": "Zara", "cor": "Cinza", "tamanho": "M", "estoque": 7},
  {"modelo": "Zara", "cor": "Preto", "tamanho": "G", "estoque": 0},
  {"modelo": "Zara", "cor": "Preto", "tamanho": "M", "estoque": 3}
];

// Helper para gerar SKU
function gerarSKU(modelo, tamanho, cor) {
  const corNormalizada = cor.toUpperCase().replace(/\s+/g, '_');
  return `${modelo.toUpperCase()}_${tamanho.toUpperCase()}_${corNormalizada}`;
}

async function executar() {
  try {
    // Carregar SQL.js
    const SQL = await initSqlJs();

    // Carregar banco existente
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    console.log('🗑️  Limpando estoque antigo...');
    db.run('DELETE FROM estoque');

    console.log(`\n📝 Inserindo ${items.length} itens de estoque...`);

    const agora = new Date().toISOString();
    let totalUnidades = 0;

    items.forEach((item, index) => {
      const sku = gerarSKU(item.modelo, item.tamanho, item.cor);

      db.run(
        `INSERT INTO estoque (sku, modelo, tamanho, cor, preco_unitario, quantidade_total, quantidade_reservada, status, data_atualizacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sku, item.modelo, item.tamanho, item.cor, 79.90, item.estoque, 0, 'ATIVO', agora]
      );

      totalUnidades += item.estoque;
      console.log(`  ${String(index + 1).padStart(2, ' ')}. ${sku.padEnd(30)} → ${String(item.estoque).padStart(2)} un.`);
    });

    // Salvar banco
    console.log(`\n💾 Salvando banco de dados...`);
    const data = db.export();
    const buffer2 = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer2);

    // Validação
    console.log(`\n✅ RESULTADO FINAL:`);
    console.log(`   ├─ Itens inseridos: ${items.length}`);
    console.log(`   ├─ Total de unidades: ${totalUnidades}`);
    console.log(`   └─ Arquivo: ${dbPath}`);

    // Verificar banco
    const result = db.exec('SELECT COUNT(*) as qtd, SUM(quantidade_total) as total FROM estoque WHERE status = "ATIVO"');
    if (result[0]) {
      const [qtd, total] = result[0].values[0];
      console.log(`\n🔍 Verificação no banco:`);
      console.log(`   ├─ Linhas cadastradas: ${qtd}`);
      console.log(`   └─ Total de unidades: ${total}`);

      if (total === 52) {
        console.log(`\n🎉 ✓ SUCESSO! Banco está correto com 52 unidades!`);
      } else {
        console.log(`\n⚠️  ATENÇÃO: Total é ${total}, esperado 52!`);
      }
    }

    // Resumo por modelo
    console.log(`\n📊 Resumo por modelo:`);
    const modelos = db.exec(`
      SELECT modelo, COUNT(*) as linhas, SUM(quantidade_total) as total
      FROM estoque
      WHERE status = 'ATIVO'
      GROUP BY modelo
      ORDER BY modelo
    `);

    if (modelos[0]) {
      const resumoModelos = {};
      modelos[0].values.forEach(row => {
        const [modelo, linhas, total] = row;
        resumoModelos[modelo] = total;
        console.log(`   ${modelo.padEnd(10)} → ${String(linhas).padStart(2)} linhas, ${String(total).padStart(2)} unidades`);
      });
    }

    db.close();
    console.log('\n✓ Banco fechado com segurança.');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

executar();
