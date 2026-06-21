// ============================================================================
// scripts/registrar-fotos-remessa.mjs
// Cadastra/atualiza as fotos (IDs do Google Drive) dos modelos na tabela `fotos`.
// Idempotente por (modelo, cor): apaga as fotos daquela cor e reinsere.
// A 1ª cor com capa=true vira a capa do card.
//
// Conforme novas fotos chegam, basta adicionar ao mapa FOTOS e rodar de novo:
//   node scripts/registrar-fotos-remessa.mjs
// ============================================================================
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '../data/pijama-store.db'));
db.pragma('busy_timeout = 5000');

// modelo (MAIÚSCULO) → cor (minúsculo, igual ao estoque) → { capa, ids:[Drive IDs] }
const FOTOS = {
  LIZZIE: {
    pink: {
      capa: true,
      ids: [
        '1EvxNdUMIF5qeIGFAdULrZf-uGc4NeTyO',
        '1nUjvrYJ_ZBzZEqakN0azFwLZuUtgrwZ0',
        '14VfsxnS7306diDf_g-qyhGOFh84sH0MH',
      ],
    },
  },
  BIA: {
    pink: {
      capa: true,
      ids: [
        '1QyFoLhRQGytdOUMdU4rqmQEtP3J2aDFy',
        '1vV6gqYxPGSUJCJ0HIXQiPHG5ERU3dxN4',
        '1Qo0uwxMQcfuEuxItu8nHvpcaadtP0ORz',
        '1XDbIcvmKpF1kxbzOgRRvhz5Tm36JNSN5',
      ],
    },
  },
};

const del = db.prepare('DELETE FROM fotos WHERE UPPER(modelo) = ? AND LOWER(cor) = ?');
const ins = db.prepare('INSERT INTO fotos (modelo, cor, photo_ids_json, eh_capa) VALUES (?, ?, ?, ?)');

let n = 0;
const aplicar = db.transaction(() => {
  for (const [modelo, cores] of Object.entries(FOTOS)) {
    for (const [cor, dados] of Object.entries(cores)) {
      del.run(modelo, cor);
      ins.run(modelo, cor, JSON.stringify(dados.ids), dados.capa ? 1 : 0);
      console.log(`  ${modelo} ${cor}: ${dados.ids.length} foto(s)${dados.capa ? ' [CAPA]' : ''}`);
      n++;
    }
  }
});
aplicar();

console.log(`\n✅ ${n} cor(es) cadastrada(s) na tabela fotos.`);
db.close();
