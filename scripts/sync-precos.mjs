#!/usr/bin/env node
/**
 * scripts/sync-precos.mjs
 *
 * Sincroniza os preços de todos os SKUs no estoque com o catálogo central
 * definido em .env → MODEL_PRICES.
 *
 * Uso: node scripts/sync-precos.mjs
 *
 * Conecta direto no SQLite (mesmo path que o servidor usa), bypassa HTTP.
 * Pode rodar tanto local (data/pijama-store.db) quanto na VPS
 * (/opt/pijama-store/data/pijama-store.db) — o DB_PATH é lido do .env.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const rootDir    = resolve(__dirname, '..');

// Carrega .env do projeto
config({ path: resolve(rootDir, '.env') });

const dbPath = process.env.DB_PATH || resolve(rootDir, 'data/pijama-store.db');
if (!existsSync(dbPath)) {
  console.error(`❌ Banco não encontrado em: ${dbPath}`);
  process.exit(1);
}

let precos;
try {
  precos = JSON.parse(process.env.MODEL_PRICES || '{}');
} catch (e) {
  console.error('❌ MODEL_PRICES no .env não é JSON válido:', e.message);
  process.exit(1);
}

const modelos = Object.keys(precos);
if (modelos.length === 0) {
  console.error('❌ Catálogo MODEL_PRICES está vazio');
  process.exit(1);
}

console.log(`📂 Banco: ${dbPath}`);
console.log(`📋 Catálogo: ${modelos.length} modelo(s)\n`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// SQLite UPPER() não converte caracteres acentuados (UPPER('í') = 'í').
// Solução: normalizar em JavaScript (remove diacríticos + uppercase), comparar
// e fazer UPDATE com o nome EXATO encontrado no banco.
const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

// Lê todos os modelos distintos no estoque (case real do banco)
const modelosDB = db.prepare('SELECT DISTINCT modelo FROM estoque').all().map(r => r.modelo);

const stmt = db.prepare(
  `UPDATE estoque
      SET preco_unitario = @preco, data_atualizacao = datetime('now')
    WHERE modelo = @modeloExato AND preco_unitario != @preco`
);

let totalAfetados = 0;
const detalhes = [];

for (const modelo of modelos) {
  const preco = Number(precos[modelo]);
  if (!preco || preco <= 0) {
    console.log(`⚠️  ${modelo}: preço inválido (${precos[modelo]}), pulando`);
    continue;
  }
  // Acha TODAS as variantes do modelo no banco (ex: "Lívia", "LÍVIA", "lívia")
  const catalogoNorm = semAcento(modelo);
  const variantes = modelosDB.filter(m => semAcento(m) === catalogoNorm);
  if (variantes.length === 0) {
    console.log(`  ${modelo.padEnd(10)} → R$ ${preco.toFixed(2).padStart(7)}  |  sem SKUs no banco`);
    continue;
  }
  let changes = 0;
  for (const modeloExato of variantes) {
    const result = stmt.run({ modeloExato, preco });
    changes += result.changes;
  }
  totalAfetados += changes;
  detalhes.push({ modelo, preco, skus: changes, variantes });
  const variantesStr = variantes.length > 1 ? ` [${variantes.join(', ')}]` : '';
  console.log(`  ${modelo.padEnd(10)} → R$ ${preco.toFixed(2).padStart(7)}  |  ${changes} SKU(s) atualizado(s)${variantesStr}`);
}

console.log(`\n✅ Total: ${totalAfetados} SKU(s) sincronizado(s) com o catálogo central`);

// Mostra alguns SKUs para conferência
const amostras = db.prepare(
  `SELECT sku, modelo, preco_unitario FROM estoque
    WHERE UPPER(status) = 'ATIVO' ORDER BY modelo, tamanho LIMIT 5`
).all();
console.log('\n📊 Amostra do estoque atual:');
for (const a of amostras) {
  console.log(`   ${a.sku.padEnd(25)}  R$ ${Number(a.preco_unitario).toFixed(2)}`);
}

db.close();
