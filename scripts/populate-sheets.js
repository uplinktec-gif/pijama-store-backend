import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const credentialsPath = './service-account.json';
const spreadsheetId = '1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U';

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const authClient = await auth.getClient();
const sheets = google.sheets({ version: 'v4', auth: authClient });

// Catálogo
const modelos = ['ZARA', 'MIA', 'LIA', 'NÚBIA', 'LÍVIA', 'BEATRIZ', 'ANNE'];
const tamanhos = ['P', 'M', 'G', 'GG'];
const cores = ['azul marinho', 'preto', 'bordô', 'cinza', 'marrom'];
const precos = {
  'ZARA': 129.90,
  'MIA': 89.90,
  'LIA': 129.90,
  'NÚBIA': 169.90,
  'LÍVIA': 129.90,
  'BEATRIZ': 89.90,
  'ANNE': 159.90
};

console.log('🔄 Populando sheets...\n');

// ========== POPULATE ESTOQUE ==========
console.log('📦 Populando ESTOQUE sheet...');
const estoqueRows = [];
let produtoId = 1;

for (const modelo of modelos) {
  for (const tamanho of tamanhos) {
    for (const cor of cores) {
      estoqueRows.push([
        `PROD_${produtoId.toString().padStart(3, '0')}`,  // ID_PRODUTO
        modelo,                      // MODELO
        tamanho,                      // TAMANHO
        cor,                          // COR
        precos[modelo],              // PRECO_UNITARIO
        50,                          // QUANTIDADE_TOTAL (quantidade inicial)
        0,                           // QUANTIDADE_RESERVADA
        50,                          // QUANTIDADE_DISPONIVEL
        new Date().toISOString(),    // DATA_ATUALIZACAO
        '',                          // OBSERVACOES
        'ativo'                      // STATUS
      ]);
      produtoId++;
    }
  }
}

console.log(`  Inserindo ${estoqueRows.length} produtos...`);
await sheets.spreadsheets.values.append({
  spreadsheetId,
  range: 'ESTOQUE!A2',
  valueInputOption: 'USER_ENTERED',
  requestBody: {
    values: estoqueRows
  }
});
console.log(`  ✓ ${estoqueRows.length} produtos inseridos\n`);

// ========== POPULATE CONVERSAS (BASE TEMPLATE) ==========
console.log('💬 Populando CONVERSAS sheet com template...');
const conversasRows = [
  [
    '5595988123456',         // WHATSAPP
    'novo',                  // STATUS
    '{}',                    // CONTEXTO_JSON (vazio)
    new Date().toISOString(),// DATA_INICIO
    new Date().toISOString() // ULTIMA_ATUALIZACAO
  ]
];

await sheets.spreadsheets.values.append({
  spreadsheetId,
  range: 'CONVERSAS!A2',
  valueInputOption: 'USER_ENTERED',
  requestBody: {
    values: conversasRows
  }
});
console.log('  ✓ Template de conversa criado\n');

console.log('✅ Sheets populados com sucesso!');
console.log(`📊 Resumo:`);
console.log(`  - ESTOQUE: ${estoqueRows.length} produtos`);
console.log(`  - CONVERSAS: Template criado`);
console.log(`  - PEDIDOS_E_VENDAS: Pronto para receber pedidos`);
console.log(`  - CLIENTES: Pronto para receber clientes`);
