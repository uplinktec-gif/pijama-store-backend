#!/usr/bin/env node
/**
 * scripts/sync-fotos-luna-preto.mjs
 *
 * Atualiza a tabela `fotos` do SQLite com os novos paths locais das
 * imagens otimizadas da variante LUNA preto. Idempotente — pode rodar várias vezes.
 *
 * - Foto 1 (capa.webp) é a primeira do array (= capa da variante preta).
 * - Caminhos são relativos à raiz pública da loja (servida em `/`).
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..');
config({ path: resolve(rootDir, '.env') });

const dbPath = process.env.DB_PATH || resolve(rootDir, 'data/pijama-store.db');
if (!existsSync(dbPath)) {
  console.error(`❌ Banco não encontrado: ${dbPath}`);
  process.exit(1);
}

const MODELO = 'LUNA';
const COR    = 'preto';
const PATHS  = [
  '/img/luna-preto/capa.webp',     // Foto 1 — capa
  '/img/luna-preto/galeria.webp',  // Foto 2 — galeria
  '/img/luna-preto/detalhe.webp'   // Foto 3 — detalhe
];

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Verifica se já existe linha para LUNA+preto
const existente = db.prepare(
  `SELECT id, photo_ids_json, eh_capa FROM fotos
   WHERE UPPER(modelo) = UPPER(?) AND LOWER(cor) = LOWER(?)`
).get(MODELO, COR);

const photoIdsJson = JSON.stringify(PATHS);

if (existente) {
  db.prepare(
    `UPDATE fotos SET photo_ids_json = ? WHERE id = ?`
  ).run(photoIdsJson, existente.id);
  console.log(`✓ LUNA preto atualizado (id=${existente.id})`);
} else {
  db.prepare(
    `INSERT INTO fotos (modelo, cor, photo_ids_json, eh_capa)
     VALUES (?, ?, ?, 0)`
  ).run(MODELO, COR, photoIdsJson);
  console.log(`✓ LUNA preto inserido`);
}

// Resumo
const row = db.prepare(
  `SELECT modelo, cor, photo_ids_json, eh_capa FROM fotos
    WHERE UPPER(modelo) = UPPER(?) AND LOWER(cor) = LOWER(?)`
).get(MODELO, COR);

console.log(`📷 ${row.modelo} ${row.cor} → ${JSON.parse(row.photo_ids_json).length} foto(s)`);
for (const p of JSON.parse(row.photo_ids_json)) console.log(`   ${p}`);

db.close();
