import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const CREDENTIALS_PATH = path.resolve(process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || './service-account.json');

// Catálogo
const MODELOS = ['ZARA', 'MIA', 'LIA', 'NÚBIA', 'LÍVIA', 'BEATRIZ', 'ANNE'];
const TAMANHOS = ['P', 'M', 'G', 'GG'];
const CORES = ['azul marinho', 'preto', 'bordô', 'cinza', 'marrom'];

const PRECOS = {
  ZARA: 129.90,
  MIA: 89.90,
  LIA: 129.90,
  NÚBIA: 169.90,
  LÍVIA: 129.90,
  BEATRIZ: 89.90,
  ANNE: 159.90
};

/**
 * Gera SKU
 */
function generateSKU(modelo, tamanho, cor) {
  return `${modelo}_${tamanho}_${cor.toUpperCase()}`;
}

/**
 * Gera dados iniciais de estoque
 */
function gerarEstoqueInicial() {
  const estoque = [];

  for (const modelo of MODELOS) {
    for (const tamanho of TAMANHOS) {
      for (const cor of CORES) {
        const sku = generateSKU(modelo, tamanho, cor);
        const preco = PRECOS[modelo];
        const quantidade = Math.floor(Math.random() * (50 - 10 + 1)) + 10; // 10-50 peças por SKU

        estoque.push([
          sku,
          modelo,
          tamanho,
          cor,
          preco,
          quantidade, // QUANTIDADE_TOTAL
          0, // QUANTIDADE_RESERVADA
          quantidade, // QUANTIDADE_DISPONÍVEL
          new Date().toISOString(), // DATA_ATUALIZAÇÃO
          '', // OBSERVAÇÕES
          'ativo' // STATUS
        ]);
      }
    }
  }

  return estoque;
}

/**
 * Inicializa cliente Google Sheets
 */
async function initializeSheetsClient() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error(`❌ Arquivo de credenciais não encontrado: ${CREDENTIALS_PATH}`);
      console.error('Baixe o arquivo service-account.json do Google Cloud e coloque na raiz do projeto.');
      process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
  } catch (error) {
    console.error('Erro ao inicializar Google Sheets:', error.message);
    process.exit(1);
  }
}

/**
 * Limpa a aba ESTOQUE (remove linhas existentes)
 */
async function limparEstoque(sheets) {
  try {
    console.log('🧹 Limpando aba ESTOQUE...');

    // Buscar todas as linhas
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ESTOQUE!A:K'
    });

    const rows = response.data.values || [];

    // Se há mais de 1 linha (cabeçalho + dados), deletar dados
    if (rows.length > 1) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `ESTOQUE!A2:K${rows.length}`
      });

      console.log(`✓ Limpadas ${rows.length - 1} linhas anteriores`);
    }
  } catch (error) {
    console.error('Erro ao limpar estoque:', error.message);
    throw error;
  }
}

/**
 * Popula estoque inicial
 */
async function popularEstoque(sheets) {
  try {
    console.log('📦 Gerando dados iniciais de estoque...');

    const estoque = gerarEstoqueInicial();
    console.log(`✓ Gerados ${estoque.length} SKUs (${MODELOS.length} modelos × ${TAMANHOS.length} tamanhos × ${CORES.length} cores)`);

    console.log('📤 Enviando para Google Sheets...');

    // Inserir cabeçalho se não existir
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ESTOQUE!A1'
    });

    if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
      const header = [
        'ID_PRODUTO',
        'MODELO',
        'TAMANHO',
        'COR',
        'PRECO_UNITARIO',
        'QUANTIDADE_TOTAL',
        'QUANTIDADE_RESERVADA',
        'QUANTIDADE_DISPONIVEL',
        'DATA_ATUALIZACAO',
        'OBSERVACOES',
        'STATUS'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'ESTOQUE!A1:K1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [header]
        }
      });

      console.log('✓ Cabeçalho inserido');
    }

    // Inserir dados em lotes (1000 linhas por lote)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < estoque.length; i += BATCH_SIZE) {
      const lote = estoque.slice(i, i + BATCH_SIZE);

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'ESTOQUE!A:K',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: lote
        }
      });

      console.log(`✓ Inseridas ${Math.min(BATCH_SIZE, estoque.length - i)} linhas (${i + BATCH_SIZE}/${estoque.length})`);
    }

    console.log('✅ Estoque popular com sucesso!');
    console.log(`\nResumo:`);
    console.log(`- Total de SKUs: ${estoque.length}`);
    console.log(`- Modelos: ${MODELOS.join(', ')}`);
    console.log(`- Tamanhos: ${TAMANHOS.join(', ')}`);
    console.log(`- Cores: ${CORES.join(', ')}`);
  } catch (error) {
    console.error('Erro ao popular estoque:', error.message);
    throw error;
  }
}

/**
 * Executa seed
 */
async function executarSeed() {
  try {
    if (!SPREADSHEET_ID) {
      console.error('❌ GOOGLE_SHEETS_ID não está configurado no .env');
      process.exit(1);
    }

    console.log('🚀 Iniciando seed de estoque...\n');

    const sheets = await initializeSheetsClient();
    await limparEstoque(sheets);
    await popularEstoque(sheets);

    console.log('\n✅ Seed concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro durante seed:', error.message);
    process.exit(1);
  }
}

// Executar
executarSeed();
