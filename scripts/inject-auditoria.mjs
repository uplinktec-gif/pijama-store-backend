/**
 * inject-auditoria.mjs — Injeção em lote da contagem física (auditoria).
 * Usa a função oficial ajustarInventario (override absoluto + Δ no log_estoque).
 * Mapeia por chave NORMALIZADA (sem acento) contra os SKUs reais do banco,
 * para casar "Nubia"/"Núbia", "Lívia (Camisola)"/"Lívia", "Bordô"/"Bordo".
 * SKUs existentes ausentes da lista → zerados (total = 0).
 */
import { initializeDatabase, query } from '../src/config/database.js';
import { ajustarInventario } from '../src/services/sqlite/estoque.js';

// [modelo, cor, tamanho, quantidade] — verdade da prateleira (115 peças)
const CONTAGEM = [
  ['Zara','Cinza','P',1],['Zara','Cinza','M',6],['Zara','Cinza','G',1],['Zara','Cinza','GG',1],
  ['Zara','Preto','G',1],['Zara','Preto','GG',3],['Zara','Azul','M',2],['Zara','Azul','G',1],['Zara','Azul','GG',2],
  ['Nubia','Bordô','P',1],['Nubia','Bordô','M',3],['Nubia','Azul','P',1],['Nubia','Azul','M',2],['Nubia','Azul Jeans','G',3],
  ['Anne','Preto','P',3],['Anne','Preto','M',4],['Anne','Preto','G',3],['Anne','Preto','GG',2],
  ['Anne','Bordô','P',5],['Anne','Bordô','M',3],['Anne','Bordô','G',4],['Anne','Bordô','GG',4],
  ['Anne','Azul','P',2],['Anne','Azul','M',4],['Anne','Azul','G',4],['Anne','Azul','GG',3],
  ['Lia','Preto','M',2],['Lia','Azul','M',2],
  ['Lívia (Camisola)','Chocolate','P',3],
  ['Luna','Preto','M',3],['Luna','Preto','G',3],['Luna','Bordô','G',3],['Luna','Bordô','GG',1],
  ['Luna','Cinza','P',6],['Luna','Cinza','M',3],['Luna','Cinza','G',2],['Luna','Cinza','GG',4],
  ['Luna','Chocolate','G',2],['Luna','Chocolate','GG',7],['Luna','Azul','GG',4],
  ['Mia','Preto','P',1],
];

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const chave = (m, t, c) => `${norm(m)}|${norm(t)}|${norm(c)}`;

const DRY = process.argv.includes('--dry');

async function main() {
  initializeDatabase();
  if (DRY) console.log('*** DRY-RUN: nenhuma escrita será feita ***');

  // mapa contagem por chave normalizada
  const fisicoPorChave = new Map();
  let somaCSV = 0;
  for (const [m, c, t, q] of CONTAGEM) { fisicoPorChave.set(chave(m, t, c), q); somaCSV += q; }
  console.log(`CSV: ${CONTAGEM.length} linhas, ${somaCSV} pecas.`);

  const skus = query("SELECT sku, modelo, tamanho, cor, quantidade_total, quantidade_reservada FROM estoque WHERE status='ATIVO'");
  const usadas = new Set();
  const resultados = [];

  for (const r of skus) {
    const k = chave(r.modelo, r.tamanho, r.cor);
    const temNaLista = fisicoPorChave.has(k);
    const fisico = temNaLista ? fisicoPorChave.get(k) : 0;
    if (temNaLista) usadas.add(k);

    const res = DRY
      ? { success: true, delta: fisico - r.quantidade_total, alertaReserva: fisico < r.quantidade_reservada }
      : await ajustarInventario(r.sku, fisico, 'Auditoria-Felipe&Jully',
          temNaLista ? '' : 'Zerado por ausencia na contagem fisica');
    if (!res.success) { resultados.push({ sku: r.sku, erro: res.error }); continue; }
    resultados.push({
      sku: r.sku, modelo: r.modelo, tamanho: r.tamanho, cor: r.cor,
      antes: r.quantidade_total, depois: fisico, delta: res.delta,
      zeradoForaDaLista: !temNaLista, alertaReserva: res.alertaReserva, reservada: r.quantidade_reservada
    });
  }

  // CSV rows que não casaram com nenhum SKU do banco
  const semSKU = [];
  for (const [m, c, t, q] of CONTAGEM) {
    if (!usadas.has(chave(m, t, c))) semSKU.push({ modelo: m, cor: c, tamanho: t, qtd: q });
  }

  console.log('===RESULTADO_JSON===');
  console.log(JSON.stringify({ resultados, semSKU, somaCSV }));
}

main().then(() => process.exit(0)).catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
