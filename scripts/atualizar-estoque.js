/**
 * Script para atualizar o estoque real no Google Sheets
 * Estoque fornecido pelo Felipe em 18/05/2026
 */

import { initializeSheets, getSheetsClient, getSpreadsheetId } from '../src/config/sheets.js';

await initializeSheets();

// ============================================================
// ESTOQUE REAL (do print enviado pelo Felipe)
// Formato: 'MODELO|COR': { P, M, G, GG }
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

async function atualizarEstoque() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  console.log('🔄 Lendo estoque atual do Google Sheets...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'ESTOQUE!A:K'
  });

  const rows = response.data.values || [];
  const header = rows[0];

  // Identificar colunas (normaliza para comparação)
  const norm = s => (s || '').toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const colModelo    = header.findIndex(h => norm(h) === 'MODELO');
  const colTamanho   = header.findIndex(h => norm(h) === 'TAMANHO');
  const colCor       = header.findIndex(h => norm(h) === 'COR');
  const colQtdTotal  = header.findIndex(h => norm(h) === 'QUANTIDADE_TOTAL');
  const colQtdDisp   = header.findIndex(h => norm(h).startsWith('QUANTIDADE_DISP'));

  console.log(`Colunas: Modelo=${colModelo} Tamanho=${colTamanho} Cor=${colCor} Total=${colQtdTotal} Disp=${colQtdDisp}`);

  console.log(`📊 ${rows.length - 1} SKUs encontrados no sheet`);

  const updates = [];
  let atualizados = 0;
  let zerados = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const modelo = (row[colModelo] || '').toUpperCase().trim();
    const tamanho = (row[colTamanho] || '').toUpperCase().trim();
    const cor = (row[colCor] || '').toUpperCase().trim();

    const chave = `${modelo}|${cor}`;
    const estoqueItem = ESTOQUE_REAL[chave];

    let qtd = 0;
    if (estoqueItem && TAMANHOS.includes(tamanho)) {
      qtd = estoqueItem[tamanho] || 0;
    }

    const rowNum = i + 1; // +1 porque começa na linha 2 (1 é header)

    // Atualiza QUANTIDADE_TOTAL
    const colLetraTotal = String.fromCharCode(65 + colQtdTotal); // coluna letra
    updates.push({
      range: `ESTOQUE!${colLetraTotal}${rowNum}`,
      values: [[qtd]]
    });

    // Atualiza QUANTIDADE_DISPONIVEL (= total - reservado, assumindo reservado = 0)
    const colLetraDisp = String.fromCharCode(65 + colQtdDisp);
    updates.push({
      range: `ESTOQUE!${colLetraDisp}${rowNum}`,
      values: [[qtd]]
    });

    if (qtd > 0) {
      atualizados++;
      console.log(`  ✅ ${modelo} ${tamanho} ${cor}: ${qtd} unidades`);
    } else {
      zerados++;
    }
  }

  console.log(`\n📤 Enviando ${updates.length} atualizações para o Google Sheets...`);

  // Enviar em lotes de 500
  const LOTE = 500;
  for (let i = 0; i < updates.length; i += LOTE) {
    const lote = updates.slice(i, i + LOTE);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: lote
      }
    });
    console.log(`  Lote ${Math.floor(i/LOTE)+1}/${Math.ceil(updates.length/LOTE)} enviado`);
  }

  console.log(`\n✅ Estoque atualizado com sucesso!`);
  console.log(`   ${atualizados} SKUs com estoque`);
  console.log(`   ${zerados} SKUs zerados`);
  console.log(`   Total: 67 peças`);
}

atualizarEstoque().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
