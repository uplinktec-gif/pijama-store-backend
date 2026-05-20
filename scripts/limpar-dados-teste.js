/**
 * Script de limpeza completa:
 * 1. Zera PEDIDOS_E_VENDAS (mantém só o cabeçalho)
 * 2. Zera CLIENTES (mantém só o cabeçalho)
 * 3. Zera CONVERSAS (mantém só o cabeçalho)
 * 4. Reaplica estoque real
 */

import { initializeSheets, getSheetsClient, getSpreadsheetId } from '../src/config/sheets.js';

// ============================================================
// ESTOQUE REAL (imagem enviada por Felipe)
// ============================================================
const ESTOQUE_REAL = {
  'ZARA|AZUL MARINHO':   { P: 0, M: 6, G: 1, GG: 0 },
  'ZARA|BORDÔ':          { P: 0, M: 0, G: 2, GG: 0 },
  'ZARA|PRETO':          { P: 0, M: 9, G: 0, GG: 0 },
  'ZARA|CINZA':          { P: 0, M: 7, G: 0, GG: 0 },
  'BEATRIZ|PRETO':       { P: 0, M: 0, G: 1, GG: 0 },
  'MIA|AZUL MARINHO':    { P: 0, M: 3, G: 0, GG: 0 },
  'MIA|BORDÔ':           { P: 0, M: 0, G: 0, GG: 0 },
  'MIA|PRETO':           { P: 2, M: 3, G: 0, GG: 0 },
  'LIA|AZUL MARINHO':    { P: 3, M: 3, G: 0, GG: 0 },
  'LIA|BORDÔ':           { P: 1, M: 0, G: 1, GG: 0 },
  'LIA|PRETO':           { P: 0, M: 2, G: 0, GG: 0 },
  'ANNE|AZUL MARINHO':   { P: 2, M: 3, G: 0, GG: 0 },
  'ANNE|BORDÔ':          { P: 0, M: 2, G: 0, GG: 0 },
  'ANNE|PRETO':          { P: 0, M: 2, G: 0, GG: 0 },
  'LÍVIA|PRETO':         { P: 3, M: 0, G: 0, GG: 0 },
  'NÚBIA|AZUL MARINHO':  { P: 2, M: 4, G: 0, GG: 0 },
  'NÚBIA|BORDÔ':         { P: 2, M: 3, G: 0, GG: 0 },
};

const TAMANHOS = ['P', 'M', 'G', 'GG'];
const norm = s => (s || '').toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function limparSheet(sheets, spreadsheetId, sheetName, headerRow) {
  console.log(`\n🗑️  Limpando ${sheetName}...`);

  // Busca tudo
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`
  });
  const rows = response.data.values || [];

  if (rows.length <= 1) {
    console.log(`   Já está vazio.`);
    return;
  }

  // Apaga tudo a partir da linha 2
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A2:Z`
  });

  console.log(`   ✅ ${rows.length - 1} linha(s) removida(s)`);
}

async function atualizarEstoque(sheets, spreadsheetId) {
  console.log('\n📦 Atualizando estoque...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'ESTOQUE!A:K'
  });

  const rows = response.data.values || [];
  const header = rows[0];

  const colModelo   = header.findIndex(h => norm(h) === 'MODELO');
  const colTamanho  = header.findIndex(h => norm(h) === 'TAMANHO');
  const colCor      = header.findIndex(h => norm(h) === 'COR');
  const colQtdTotal = header.findIndex(h => norm(h) === 'QUANTIDADE_TOTAL');
  const colQtdRes   = header.findIndex(h => norm(h) === 'QUANTIDADE_RESERVADA');
  const colQtdDisp  = header.findIndex(h => norm(h).startsWith('QUANTIDADE_DISP'));

  const updates = [];
  let atualizados = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const modelo  = (row[colModelo]  || '').toUpperCase().trim();
    const tamanho = (row[colTamanho] || '').toUpperCase().trim();
    const cor     = (row[colCor]     || '').toUpperCase().trim();

    const chave = `${modelo}|${cor}`;
    const estoqueItem = ESTOQUE_REAL[chave];
    const qtd = (estoqueItem && TAMANHOS.includes(tamanho)) ? (estoqueItem[tamanho] || 0) : 0;
    const rowNum = i + 1;

    const colLetraTotal = String.fromCharCode(65 + colQtdTotal);
    const colLetraRes   = String.fromCharCode(65 + colQtdRes);
    const colLetraDisp  = String.fromCharCode(65 + colQtdDisp);

    updates.push({ range: `ESTOQUE!${colLetraTotal}${rowNum}`, values: [[qtd]] });
    updates.push({ range: `ESTOQUE!${colLetraRes}${rowNum}`,   values: [[0]] }); // zera reservas
    updates.push({ range: `ESTOQUE!${colLetraDisp}${rowNum}`,  values: [[qtd]] });

    if (qtd > 0) {
      console.log(`   ✅ ${modelo} ${tamanho} ${cor}: ${qtd}`);
      atualizados++;
    }
  }

  // Envia em lotes
  const LOTE = 500;
  for (let i = 0; i < updates.length; i += LOTE) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: updates.slice(i, i + LOTE) }
    });
  }

  console.log(`   ✅ ${atualizados} SKUs com estoque | Total: 67 peças`);
}

async function main() {
  console.log('🧹 LIMPEZA COMPLETA DOS DADOS DE TESTE\n');

  await initializeSheets();
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  await limparSheet(sheets, spreadsheetId, 'PEDIDOS_E_VENDAS');
  await limparSheet(sheets, spreadsheetId, 'CLIENTES');
  await limparSheet(sheets, spreadsheetId, 'CONVERSAS');
  await atualizarEstoque(sheets, spreadsheetId);

  console.log('\n🎉 Pronto! Dados limpos e estoque real aplicado.');
  console.log('   PEDIDOS_E_VENDAS: zerado');
  console.log('   CLIENTES: zerado');
  console.log('   CONVERSAS: zerado');
  console.log('   ESTOQUE: 67 peças reais');
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
