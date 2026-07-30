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
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || resolve(__dirname, '../data/pijama-store.db');
const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');

// modelo (MAIÚSCULO) → cor (minúsculo, igual ao estoque) → { capa, ids:[Drive IDs] }
const FOTOS = {
  LIZZIE: {
    preto: {
      capa: false,
      ids: [
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0510-688c9252c8bc3f3f5f17814612865666-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0516-6ddc99e825df8abeec17814612870385-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0517-5778faec7573157a6e17814612868386-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0520-2c9f34040f5c4fa0f217814612867816-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0538-3adafead719a49945217814612871983-1024-1024.webp',
      ],
    },
    pink: {
      capa: true,
      ids: [
        '1EvxNdUMIF5qeIGFAdULrZf-uGc4NeTyO',
        '1nUjvrYJ_ZBzZEqakN0azFwLZuUtgrwZ0',
        '14VfsxnS7306diDf_g-qyhGOFh84sH0MH',
      ],
    },
    colors: {
      capa: false,
      ids: [
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0587-62355970b2dd931d7c17813723368541-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0586-b51a8569b894ba30d917813723347886-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0580-dd7759140e24d8fdb017813723363770-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0569-f0e998e9398e71371017813723342628-1024-1024.webp',
      ],
    },
  },
  BIA: {
    preto: {
      capa: false,
      ids: [
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0518-39126a4d3a579ec76617814604246136-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0523-7aadd4592be98df7a717814604247150-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0520-5c0761f2f365bbc24217814604244178-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0517-f416003af8396f913e17814604246953-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0538-56b3f477cd25ab6e2317814604247386-1024-1024.webp',
      ],
    },
    pink: {
      capa: true,
      ids: [
        '1QyFoLhRQGytdOUMdU4rqmQEtP3J2aDFy',
        '1vV6gqYxPGSUJCJ0HIXQiPHG5ERU3dxN4',
        '1Qo0uwxMQcfuEuxItu8nHvpcaadtP0ORz',
        '1XDbIcvmKpF1kxbzOgRRvhz5Tm36JNSN5',
      ],
    },
    colors: {
      capa: false,
      ids: [
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0589-1c4378dd003d5463b517813771472442-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0595-336c6e72c84371c5d917813771477962-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0594-c34686a95a4c73e6ff17813771475197-1024-1024.webp',
        'https://dcdn-us.mitiendanube.com/stores/006/614/915/products/img_0569-74bf3bbb2a47395ab517813771475736-1024-1024.webp',
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

console.log(`\n✅ ${n} cor(es) cadastrada(s) em ${dbPath}.`);
db.close();
