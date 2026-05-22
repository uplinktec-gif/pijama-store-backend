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

console.log('\n📸 Corrigindo fotos ZARA (mantendo apenas 1 por cor):');
let atualizados = 0;

for (const foto of fotos) {
  let ids = [];
  try {
    const parsed = JSON.parse(foto.photo_ids_json || '[]');
    // Bug de migração: IDs podem vir como ["id1,id2,id3"] (string única com vírgulas)
    // ou como ["id1","id2","id3"] (array correto)
    if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string' && parsed[0].includes(',')) {
      // Formato antigo: um único string com IDs separados por vírgula
      ids = parsed[0].split(',').map(id => id.trim()).filter(Boolean);
    } else {
      ids = parsed.filter(Boolean);
    }
  } catch { ids = []; }

  console.log(`  ${foto.cor}: ${ids.length} foto(s) — mantendo apenas: ${ids[0]}`);

  // Sempre salvar com apenas o 1º ID no formato correto (array de strings)
  const novoJson = JSON.stringify([ids[0]]);
  run('UPDATE fotos SET photo_ids_json = ?, updated_at = ? WHERE id = ?',
      [novoJson, new Date().toISOString(), foto.id]);
  atualizados++;
}

saveDatabase(true);
console.log(`\n✅ Concluído! ${atualizados} cor(es) atualizada(s).\n`);
process.exit(0);
