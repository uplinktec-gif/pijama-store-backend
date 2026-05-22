/**
 * Script: fix-fotos-zara.mjs
 * Mantém apenas a primeira foto por cor no modelo ZARA
 * Uso: node scripts/fix-fotos-zara.mjs
 */
import { initializeDatabase, query, run, saveDatabase } from '../src/config/database.js';
import dotenv from 'dotenv';
dotenv.config();

await initializeDatabase();

const fotos = query('SELECT id, modelo, cor, photo_ids_json FROM fotos WHERE UPPER(modelo) = "ZARA"');

if (fotos.length === 0) {
  console.log('Nenhuma foto do ZARA encontrada.');
  process.exit(0);
}

console.log('\n📸 Fotos ZARA atuais:');
let atualizados = 0;

for (const foto of fotos) {
  let ids = [];
  try { ids = JSON.parse(foto.photo_ids_json || '[]'); } catch { ids = []; }

  console.log(`  ${foto.cor}: ${ids.length} foto(s)`);

  if (ids.length > 1) {
    const novoJson = JSON.stringify([ids[0]]);
    run('UPDATE fotos SET photo_ids_json = ?, updated_at = ? WHERE id = ?',
        [novoJson, new Date().toISOString(), foto.id]);
    console.log(`    ✅ Reduzido para 1 foto (mantida: ${ids[0]})`);
    atualizados++;
  } else {
    console.log(`    — Já tem ${ids.length} foto, sem alteração`);
  }
}

saveDatabase(true);
console.log(`\n✅ Concluído! ${atualizados} cor(es) atualizada(s).\n`);
process.exit(0);
