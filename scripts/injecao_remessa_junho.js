// ============================================================================
// scripts/injecao_remessa_junho.js
// Injeção da remessa de JUNHO/2026 (207 peças) no estoque SQLite.
//
//   • SOMA (+qtd) se o SKU já existe; INSERT se for novo.
//   • DRY-RUN por padrão (não grava nada). Use a flag --run para aplicar.
//   • Idempotente: se a remessa já foi aplicada (marcador em log_estoque), aborta.
//   • Tudo numa transação ACID. Cada item é logado em log_estoque (entrada).
//
// Uso:
//   node scripts/injecao_remessa_junho.js          # dry-run (mostra o plano)
//   node scripts/injecao_remessa_junho.js --run    # aplica de verdade
// ============================================================================
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/pijama-store.db');
const MARCADOR = 'Remessa junho/2026';
const RUN = process.argv.includes('--run');

// generateSKU — IDÊNTICO a src/services/sqlite/estoque.js (garante casar SKUs existentes)
function generateSKU(modelo, tamanho, cor) {
  const corSanitized = (cor || '')
    .replace(/[\s-]+marinho/ig, '')
    .replace(/[\s-]+escuro/ig, '')
    .replace(/[\s-]+claro/ig, '')
    .replace(/\s+com\s+\w+/ig, '')
    .trim();
  const corNorm = corSanitized.toUpperCase().replace(/\s+/g, '_');
  return `${(modelo || '').toUpperCase()}_${(tamanho || '').toUpperCase()}_${corNorm}`;
}

// Preço por modelo (R$). Usado só em SKUs NOVOS. SKUs existentes NÃO têm preço alterado.
const PRECOS = {
  'Luna': 129.90, 'Lia': 139.90, 'Lívia': 129.90,   // antigos — mantêm valor
  'Bia': 129.90, 'Luiza': 159.90, 'Matheus': 159.90, // novos adultos
  'Lizzie': 109.90, 'Infantil': 109.90               // novos infantis
};

// Remessa: { modelo (forma de exibição), cor, t: { TAMANHO: quantidade } }
// "Marrom" => Chocolate (cor existente).  "Menta" => Verde mint.
// "Xadrez Infantil" => modelo "Infantil", cor "Xadrez".
const REMESSA = [
  { modelo: 'Luna', cor: 'Bordô',     t: { P: 6, M: 9,  G: 2 } },
  { modelo: 'Luna', cor: 'Azul',      t: { P: 6, M: 10, G: 5 } },
  { modelo: 'Luna', cor: 'Preto',     t: { P: 5, M: 7 } },

  { modelo: 'Lia',  cor: 'Azul Jeans', t: { P: 2, M: 4 } },
  { modelo: 'Lia',  cor: 'Chocolate',  t: { P: 2, M: 4 } },          // "Marrom"
  { modelo: 'Lia',  cor: 'Bordô',      t: { P: 7, M: 4,  G: 2 } },
  { modelo: 'Lia',  cor: 'Azul',       t: { P: 2, M: 4,  G: 1 } },
  { modelo: 'Lia',  cor: 'Verde mint', t: { P: 2, M: 4 } },          // "Menta"
  { modelo: 'Lia',  cor: 'Preto',      t: { P: 2, M: 12, G: 2 } },

  { modelo: 'Lívia', cor: 'Preto',     t: { P: 1, M: 4,  G: 2 } },

  { modelo: 'Bia',  cor: 'Pink',       t: { P: 2, M: 9,  G: 2 } },
  { modelo: 'Bia',  cor: 'Preto',      t: { P: 2, M: 5,  G: 3 } },
  { modelo: 'Bia',  cor: 'Colors',     t: { P: 2, M: 5,  G: 2 } },

  { modelo: 'Luiza',   cor: 'Xadrez',  t: { P: 3, M: 3,  G: 3 } },

  { modelo: 'Matheus', cor: 'Xadrez',  t: { M: 2, G: 2,  GG: 2 } },

  { modelo: 'Lizzie', cor: 'Preto',    t: { '04': 4, '06': 4, '08': 6, '10': 2 } },
  { modelo: 'Lizzie', cor: 'Pink',     t: { '04': 4, '06': 4, '08': 6, '10': 2 } },
  { modelo: 'Lizzie', cor: 'Colors',   t: { '06': 6, '08': 4, '10': 1 } },

  { modelo: 'Infantil', cor: 'Xadrez', t: { '06': 2, '08': 2, '10': 2 } },
];

// Expande para itens individuais
const itens = [];
for (const linha of REMESSA) {
  for (const [tamanho, qtd] of Object.entries(linha.t)) {
    itens.push({ modelo: linha.modelo, tamanho, cor: linha.cor, qtd });
  }
}
const totalPecas = itens.reduce((s, i) => s + i.qtd, 0);

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 5000'); // espera o lock se o bot estiver escrevendo

const sel = db.prepare('SELECT quantidade_total, quantidade_reservada FROM estoque WHERE sku = ?');

// 1) Decisões (somente leitura) — SOMA vs NOVO
const decisoes = itens.map(it => {
  const sku = generateSKU(it.modelo, it.tamanho, it.cor);
  const ex = sel.get(sku);
  const preco = PRECOS[it.modelo];
  if (preco == null) { console.error(`❌ Sem preço definido para o modelo "${it.modelo}". Abortando.`); process.exit(1); }
  return { ...it, sku, modo: ex ? 'SOMA' : 'NOVO', atual: ex ? ex.quantidade_total : 0, preco };
});

// 2) Relatório
console.log(`\n📦 Remessa "${MARCADOR}" — ${itens.length} SKUs, ${totalPecas} peças\n`);
for (const d of decisoes) {
  const det = d.modo === 'SOMA'
    ? `+${d.qtd}  (tinha ${d.atual} → ${d.atual + d.qtd})`
    : `= ${d.qtd}  · R$ ${d.preco.toFixed(2)} (SKU novo)`;
  console.log(`  ${d.modo}  ${d.sku.padEnd(30)} ${det}`);
}
const nSoma = decisoes.filter(d => d.modo === 'SOMA').length;
const nNovo = decisoes.filter(d => d.modo === 'NOVO').length;
console.log(`\nResumo: ${nSoma} SKU(s) a SOMAR · ${nNovo} SKU(s) NOVO(s) · ${totalPecas} peças.`);

// 3) Dry-run: para por aqui
if (!RUN) {
  console.log(`\n🔍 DRY-RUN — nada foi gravado. Para aplicar de verdade:  node scripts/injecao_remessa_junho.js --run\n`);
  db.close();
  process.exit(0);
}

// 4) Guarda anti-duplicação
const jaInjetada = db.prepare('SELECT COUNT(*) AS n FROM log_estoque WHERE observacao = ?').get(MARCADOR).n;
if (jaInjetada > 0) {
  console.error(`\n❌ Remessa "${MARCADOR}" já consta em log_estoque (${jaInjetada} registro(s)). Abortando para NÃO duplicar.\n`);
  db.close();
  process.exit(1);
}

// 5) Aplicação atômica
const now = new Date().toISOString();
const upd = db.prepare(`UPDATE estoque
     SET quantidade_total = quantidade_total + ?,
         quantidade_disponivel = quantidade_total + ? - quantidade_reservada,
         data_atualizacao = ?, updated_at = CURRENT_TIMESTAMP
   WHERE sku = ?`);
const ins = db.prepare(`INSERT INTO estoque
     (sku, modelo, tamanho, cor, preco_unitario, quantidade_total, quantidade_reservada,
      quantidade_disponivel, data_atualizacao, observacoes, status)
   VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'ATIVO')`);
const log = db.prepare(`INSERT INTO log_estoque
     (data_hora, sku, modelo, tamanho, cor, quantidade, motivo, observacao, usuario)
   VALUES (?, ?, ?, ?, ?, ?, 'Entrada de Mercadoria', ?, 'script-injecao')`);

const aplicar = db.transaction(() => {
  for (const d of decisoes) {
    if (d.modo === 'SOMA') upd.run(d.qtd, d.qtd, now, d.sku);
    else ins.run(d.sku, d.modelo, d.tamanho, d.cor, d.preco, d.qtd, d.qtd, now, MARCADOR);
    log.run(now, d.sku, d.modelo, d.tamanho, d.cor, d.qtd, MARCADOR);
  }
});
aplicar();

console.log(`\n✅ Aplicado: ${nSoma} somado(s), ${nNovo} inserido(s), ${totalPecas} peças.`);
console.log(`   Marcador "${MARCADOR}" gravado em log_estoque (rodar de novo será bloqueado).\n`);
db.close();
