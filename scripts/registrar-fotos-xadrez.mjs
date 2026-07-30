// Cadastra as fotos da coleção Xadrez no banco indicado por DB_PATH.
// Produção:
//   DB_PATH=/opt/pijama-store/data/pijama-store.db node scripts/registrar-fotos-xadrez.mjs

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DB_PATH || resolve(rootDir, 'data/pijama-store.db');

const FOTOS = {
  LUIZA: {
    xadrez: [
      '1UpB35PULo4MM_TTiv-IfMeM5UvGuVwse', // IMG_0117.jpg — capa
      '1awXfxNHCldW9MQeR2yjCe4PaVKXJ0SGT', // IMG_0119.jpg
      '1hNykAz4FIZl0aklwXpsRLwDSwNZiJ4MU', // IMG_0121.jpg
    ],
  },
  MATHEUS: {
    xadrez: [
      '1qXibeZsze2k2Bqh-BkidO7vPgpnN6PGp', // IMG_0107.jpg — capa
      '1Iuac3RZm0PWoKx5lUzVz0mM3A4u8bCnZ', // IMG_0104.jpg
      '1l3elsuX3vIQ7El55Cwbd7UPZ9yEFaSN0', // IMG_0109.jpg
    ],
  },
  INFANTIL: {
    xadrez: [
      '1MZngbsVRa0vG8xBiCfUQFSQVExuVBCpw', // IMG_0150.jpg — capa
      '1UJ5F5ilj3RJK5k3kcsCDTPCAQ3sMKNX1', // IMG_0151.jpg
      '1Cxn4v7b5b9f1dnoxPlTp8zsyHdzCMq6C', // IMG_0152.jpg
    ],
  },
};

const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');

const remover = db.prepare(
  'DELETE FROM fotos WHERE UPPER(modelo) = ? AND LOWER(cor) = ?',
);
const inserir = db.prepare(`
  INSERT INTO fotos (modelo, cor, photo_ids_json, eh_capa)
  VALUES (?, ?, ?, 1)
`);

const aplicar = db.transaction(() => {
  for (const [modelo, cores] of Object.entries(FOTOS)) {
    for (const [cor, ids] of Object.entries(cores)) {
      remover.run(modelo, cor);
      inserir.run(modelo, cor, JSON.stringify(ids));
      console.log(`${modelo} ${cor}: ${ids.length} fotos`);
    }
  }
});

try {
  aplicar();
  console.log(`Fotos cadastradas em ${dbPath}`);
} finally {
  db.close();
}
