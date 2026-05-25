import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = path.join(__dirname, '../data/pijama-store.db');

async function validar() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  console.log('🔍 VALIDAÇÃO DE INTEGRIDADE\n');

  // 1. Verificar SKUs
  const skus = db.exec('SELECT sku, quantidade_total FROM estoque ORDER BY sku');
  console.log('📝 SKUs cadastrados:');
  let totalChecksum = 0;
  skus[0].values.forEach((row, i) => {
    const [sku, qtd] = row;
    console.log(`   ${String(i + 1).padStart(2)}. ${sku.padEnd(25)} → ${String(qtd).padStart(2)} un.`);
    totalChecksum += qtd;
  });

  // 2. Verificar quantidades zeradas
  const zerados = db.exec('SELECT COUNT(*) FROM estoque WHERE quantidade_total = 0');
  const qtdZerados = zerados[0].values[0][0];
  console.log(`\n⚠️  Itens com quantidade = 0: ${qtdZerados}`);

  // 3. Verificar erros de consistência
  const erros = db.exec(`
    SELECT sku, quantidade_total, quantidade_reservada, status
    FROM estoque
    WHERE quantidade_disponivel != (quantidade_total - quantidade_reservada)
       OR quantidade_reservada != 0
       OR UPPER(status) != 'ATIVO'
  `);

  if (erros[0] && erros[0].values.length > 0) {
    console.log(`\n❌ ERROS ENCONTRADOS:`);
    erros[0].values.forEach(row => {
      const [sku, qtd_total, qtd_res, status] = row;
      console.log(`   ${sku}: qtd=${qtd_total}, res=${qtd_res}, status=${status}`);
    });
  } else {
    console.log(`\n✅ Nenhum erro de consistência encontrado`);
  }

  // 4. Checksum final
  const hash = db.exec('SELECT COUNT(*) as qtd, SUM(quantidade_total) as total FROM estoque');
  const [qtd, total] = hash[0].values[0];

  console.log(`\n📊 RESULTADO FINAL:`);
  console.log(`   ├─ Itens: ${qtd}`);
  console.log(`   ├─ Total de unidades: ${total}`);
  console.log(`   ├─ Checksum: ${totalChecksum}`);
  console.log(`   └─ Status: ${total === 52 ? '✅ CORRETO' : '❌ ERRO'}`);

  // 5. Listar por modelo
  const modelos = db.exec(`
    SELECT modelo, COUNT(*) as linhas, SUM(quantidade_total) as total
    FROM estoque
    GROUP BY modelo
    ORDER BY modelo
  `);

  console.log(`\n📋 Por modelo:`);
  modelos[0].values.forEach(row => {
    const [modelo, linhas, total] = row;
    console.log(`   ${modelo.padEnd(10)} → ${String(linhas).padStart(2)} linhas, ${String(total).padStart(2)} un.`);
  });

  db.close();
}

validar();
