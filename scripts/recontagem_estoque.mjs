// ============================================================================
// scripts/recontagem_estoque.mjs
// Recontagem física (2026-07): SUBSTITUI o estoque dos modelos contados pelos
// números contados. A contagem vira a verdade absoluta.
//
//   • Só mexe nos 6 modelos abaixo. Bia/Luiza/Matheus/Lizzie/Infantil NÃO são tocados.
//   • Remove os SKUs desses 6 modelos que NÃO estão na contagem (ficaram 0/esgotados).
//   • Zera as reservas desses modelos (recontagem física manda).
//   • "Marrom" = Chocolate (cor do sistema). "Verde Mint" = "Verde mint".
//
//   DRY-RUN por padrão (só mostra o diff). Use --run para aplicar.
//   Antes do --run, faça backup do .db (o comando de execução faz isso).
// ============================================================================
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN = process.argv.includes('--run');

// generateSKU — idêntico a src/services/sqlite/estoque.js
function generateSKU(modelo, tamanho, cor) {
  const corSanitized = (cor || '')
    .replace(/[\s-]+marinho/ig, '').replace(/[\s-]+escuro/ig, '')
    .replace(/[\s-]+claro/ig, '').replace(/\s+com\s+\w+/ig, '').trim();
  const corNorm = corSanitized.toUpperCase().replace(/\s+/g, '_');
  return `${(modelo || '').toUpperCase()}_${(tamanho || '').toUpperCase()}_${corNorm}`;
}

// Contagem: modelo -> { price, cores: { cor: {P,M,G,GG} } }  (só qtd > 0 vira SKU)
const RECONTAGEM = {
  'Anne':  { price: 159.90, cores: {
    'Bordô': { P: 2, G: 2, GG: 3 },
    'Azul':  { M: 2, G: 2, GG: 3 },
    'Preto': { GG: 2 },
  }},
  'Luna':  { price: 129.90, cores: {
    'Chocolate': { G: 1, GG: 5 },   // "Marrom"
    'Cinza':     { P: 8, GG: 1 },
    'Preto':     { P: 2, M: 6, G: 1 },
    'Azul':      { P: 5, M: 9, G: 3, GG: 2 },
    'Bordô':     { P: 2, M: 1, G: 1 },
  }},
  'Lia':   { price: 139.90, cores: {
    'Azul':       { P: 2, M: 3, G: 2 },
    'Azul Jeans': { P: 2, M: 4 },
    'Preto':      { P: 5, M: 9, G: 2 },
    'Verde mint': { P: 1, M: 3 },
    'Chocolate':  { P: 2, M: 2 },   // "Marrom"
    'Bordô':      { P: 5, M: 3 },
  }},
  'Zara':  { price: 139.90, cores: {
    'Preto': { GG: 3 },
    'Azul':  { GG: 2 },
    'Cinza': { M: 4, GG: 1 },
  }},
  'Núbia': { price: 169.90, cores: {
    'Azul Jeans': { G: 1 },
  }},
  'Lívia': { price: 129.90, cores: {
    'Chocolate': { P: 1 },          // "Marrom"
    'Preto':     { P: 1, M: 5, G: 1 },
  }},
};

// Achatar em SKUs
const novos = [];
for (const [modelo, info] of Object.entries(RECONTAGEM)) {
  for (const [cor, sizes] of Object.entries(info.cores)) {
    for (const [tam, qtd] of Object.entries(sizes)) {
      if (qtd > 0) novos.push({ modelo, tamanho: tam, cor, qtd, preco: info.price, sku: generateSKU(modelo, tam, cor) });
    }
  }
}
const modelosAlvo = Object.keys(RECONTAGEM); // nomes exatos (com acento) — SQLite UPPER não folda acento
const totalContado = novos.reduce((s, n) => s + n.qtd, 0);

const db = new Database(join(__dirname, '../data/pijama-store.db'), RUN ? {} : { readonly: true });
db.pragma('busy_timeout = 5000');

// Estoque atual dos modelos-alvo
const ph = modelosAlvo.map(() => '?').join(',');
const atuais = db.prepare(
  `SELECT sku, modelo, tamanho, cor, quantidade_total t, quantidade_reservada r
     FROM estoque WHERE modelo IN (${ph})`
).all(...modelosAlvo);
const atualPorSku = new Map(atuais.map(a => [a.sku, a]));
const novoSkus = new Set(novos.map(n => n.sku));

// ---- Relatório (diff) ----
console.log(`\n📋 RECONTAGEM — substitui ${Object.keys(RECONTAGEM).length} modelos (${novos.length} SKUs, ${totalContado} peças)\n`);
for (const modelo of Object.keys(RECONTAGEM)) {
  const antesRows = atuais.filter(a => a.modelo === modelo);
  const antes = antesRows.reduce((s, a) => s + a.t, 0);
  const depoisRows = novos.filter(n => n.modelo === modelo);
  const depois = depoisRows.reduce((s, n) => s + n.qtd, 0);
  console.log(`== ${modelo}: ${antes} → ${depois} peças (${antes === depois ? 'sem mudança no total' : (depois > antes ? '+' : '') + (depois - antes)}) ==`);
  for (const n of depoisRows) {
    const at = atualPorSku.get(n.sku);
    const de = at ? at.t : 0;
    const marca = de === n.qtd ? '   ' : (n.qtd > de ? ' ↑ ' : ' ↓ ');
    console.log(`  ${marca}${(n.cor + ' ' + n.tamanho).padEnd(20)} ${String(de).padStart(3)} → ${String(n.qtd).padStart(3)}`);
  }
  const removidos = antesRows.filter(a => !novoSkus.has(a.sku));
  for (const rm of removidos) {
    console.log(`   ✗ ${(rm.cor + ' ' + rm.tamanho).padEnd(20)} ${String(rm.t).padStart(3)} → REMOVIDO${rm.r ? ` (tinha ${rm.r} reservado)` : ''}`);
  }
}
console.log(`\nModelos NÃO tocados (mantidos): Bia, Luiza, Matheus, Lizzie, Infantil, Mia (e outros fora da lista).`);
console.log(`Resumo: ${atuais.length} SKU(s) atuais desses modelos → ${novos.length} SKU(s) após recontagem.`);

if (!RUN) {
  console.log(`\n🔍 DRY-RUN — nada foi gravado. Para aplicar:  node scripts/recontagem_estoque.mjs --run\n`);
  db.close();
  process.exit(0);
}

// ---- Aplicar (transação) ----
// SEM DELETE: estoque_versao tem FK -> estoque.sku (NO ACTION). Estratégia:
//   • SKU contado: UPDATE (ou INSERT se novo), status ATIVO, reserva 0.
//   • SKU do modelo fora da contagem: quantidade 0 + status INATIVO (some do site/bot,
//     que filtram por ATIVO, e preserva histórico/FK).
const now = new Date().toISOString();
const upd = db.prepare(
  `UPDATE estoque SET quantidade_total=?, quantidade_reservada=0, quantidade_disponivel=?,
       preco_unitario=?, status='ATIVO', observacoes='Recontagem 2026-07',
       data_atualizacao=?, updated_at=CURRENT_TIMESTAMP
   WHERE sku=?`
);
const ins = db.prepare(
  `INSERT INTO estoque (sku, modelo, tamanho, cor, preco_unitario, quantidade_total,
       quantidade_reservada, quantidade_disponivel, data_atualizacao, observacoes, status)
   VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'Recontagem 2026-07', 'ATIVO')`
);
const zera = db.prepare(
  `UPDATE estoque SET quantidade_total=0, quantidade_reservada=0, quantidade_disponivel=0,
       status='INATIVO', observacoes='Zerado na recontagem 2026-07',
       data_atualizacao=?, updated_at=CURRENT_TIMESTAMP
   WHERE sku=?`
);
const aplicar = db.transaction(() => {
  for (const n of novos) {
    const r = upd.run(n.qtd, n.qtd, n.preco, now, n.sku);
    if (r.changes === 0) ins.run(n.sku, n.modelo, n.tamanho, n.cor, n.preco, n.qtd, n.qtd, now);
  }
  for (const a of atuais) if (!novoSkus.has(a.sku)) zera.run(now, a.sku);
});
aplicar();

const totalAgora = db.prepare(`SELECT COALESCE(SUM(quantidade_total),0) s FROM estoque`).get().s;
console.log(`\n✅ Aplicado: ${novos.length} SKU(s) dos 6 modelos recontados (${totalContado} peças).`);
console.log(`   Total geral do estoque agora: ${totalAgora} peças.\n`);
db.close();
