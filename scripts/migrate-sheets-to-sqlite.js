import { config } from 'dotenv';
import { initializeSheets, getSheetsClient, getSpreadsheetId } from '../src/config/sheets.js';
import { initializeDatabase, getDatabase, closeDatabase, run, query } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldBackup = args.includes('--backup');

const SHEETS = {
  ESTOQUE: { name: 'ESTOQUE', range: 'A:K', expectedColumns: 11 },
  PEDIDOS: { name: 'PEDIDOS_E_VENDAS', range: 'A:O', expectedColumns: 15 },
  CLIENTES: { name: 'CLIENTES', range: 'A:N', expectedColumns: 14 },
  LEADS: { name: 'LEADS', range: 'A:J', expectedColumns: 10 },
  CONVERSAS: { name: 'CONVERSAS', range: 'A:F', expectedColumns: 6 },
  FOTOS: { name: 'FOTOS', range: 'A:C', expectedColumns: 3 },
  SUPORTE: { name: 'SUPORTE', range: 'A:G', expectedColumns: 7 }
};

let stats = {
  estoque: 0,
  pedidos: 0,
  clientes: 0,
  leads: 0,
  conversas: 0,
  fotos: 0,
  suporte: 0,
  errors: []
};

async function main() {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 MIGRAÇÃO GOOGLE SHEETS → SQLite`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Modo: ${isDryRun ? '🔍 DRY RUN (sem escrever)' : '✍️ MIGRAÇÃO REAL'}`);
    console.log(`Backup: ${shouldBackup ? '✓ Será criado' : '✗ Não será criado'}`);
    console.log(`${'='.repeat(60)}\n`);

    // Conectar ao Google Sheets
    logger.info('📊 Inicializando Google Sheets...');
    await initializeSheets();
    const sheets = getSheetsClient();
    if (!sheets) {
      throw new Error('Google Sheets não está inicializado. Verifique credenciais no .env');
    }

    const spreadsheetId = getSpreadsheetId();
    logger.info(`✓ Conectado à planilha: ${spreadsheetId}`);

    // Inicializar database
    logger.info('💾 Inicializando banco SQLite...');
    await initializeDatabase();
    logger.info('✓ Database inicializado');

    // Migrar cada sheet
    if (!isDryRun) {
      logger.info('🚀 Iniciando migração de dados...');
      await migrateEstoque(sheets, spreadsheetId);
      await migrateClientes(sheets, spreadsheetId);
      await migrateLeads(sheets, spreadsheetId);
      await migratePedidos(sheets, spreadsheetId);
      await migrateConversas(sheets, spreadsheetId);
      await migrateFotos(sheets, spreadsheetId);
      await migrarSuporte(sheets, spreadsheetId);
    } else {
      logger.info('🔍 Modo DRY RUN - apenas contando dados...');
      await countEstoque(sheets, spreadsheetId);
      await countClientes(sheets, spreadsheetId);
      await countLeads(sheets, spreadsheetId);
      await countPedidos(sheets, spreadsheetId);
      await countConversas(sheets, spreadsheetId);
      await countFotos(sheets, spreadsheetId);
      await countSuporte(sheets, spreadsheetId);
    }

    // Corrigir AUTOINCREMENT sequence para pedidos (crítico!)
    if (!isDryRun && stats.pedidos > 0) {
      logger.info('🔧 Corrigindo sequência AUTOINCREMENT de pedidos...');
      const db = getDatabase();
      const maxPedido = query('SELECT MAX(numero_pedido) as max FROM pedidos')[0];
      if (maxPedido && maxPedido.max) {
        try {
          db.run(`INSERT INTO sqlite_sequence (name, seq) VALUES ('pedidos', ${maxPedido.max})`);
        } catch (_) {
          db.run(`UPDATE sqlite_sequence SET seq = ${maxPedido.max} WHERE name = 'pedidos'`);
        }
        logger.info(`✓ Sequência ajustada para continuar do pedido #${maxPedido.max}`);
      }
    }

    // Criar backup se solicitado
    if (shouldBackup && !isDryRun) {
      logger.info('💾 Criando backup SQL...');
      await createSQLBackup();
    }

    // Relatório final
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RELATÓRIO DE MIGRAÇÃO`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✓ Estoque:    ${stats.estoque} linhas`);
    console.log(`✓ Pedidos:    ${stats.pedidos} linhas`);
    console.log(`✓ Clientes:   ${stats.clientes} linhas`);
    console.log(`✓ Leads:      ${stats.leads} linhas`);
    console.log(`✓ Conversas:  ${stats.conversas} linhas`);
    console.log(`✓ Fotos:      ${stats.fotos} linhas`);
    console.log(`✓ Suporte:    ${stats.suporte} linhas`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`📈 TOTAL:     ${Object.values(stats).reduce((a, b) => typeof b === 'number' ? a + b : a, 0)} linhas`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️ ERROS ENCONTRADOS: ${stats.errors.length}`);
      stats.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }

    console.log(`${'='.repeat(60)}\n`);

    if (isDryRun) {
      console.log(`✅ Dry run completo. Nenhum dado foi alterado.`);
      console.log(`💡 Para migrar de verdade, execute: npm run migrate\n`);
    } else {
      console.log(`✅ Migração completa com sucesso!\n`);
    }

    closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('Erro fatal na migração:', error.message);
    console.error(`\n❌ ERRO: ${error.message}\n`);
    closeDatabase();
    process.exit(1);
  }
}

async function countEstoque(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.ESTOQUE.name}!A:A`
    });
    stats.estoque = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.ESTOQUE.name} não encontrada`);
    stats.estoque = 0;
  }
}

async function migrateEstoque(sheets, spreadsheetId) {
  logger.info('📦 Migrando ESTOQUE...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.ESTOQUE.name}!A:K`
  });

  const rows = response.data.values || [];
  const db = getDatabase();

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      const quantidade_disponivel = (parseInt(row[5]) || 0) - (parseInt(row[6]) || 0);

      run(
        `INSERT OR REPLACE INTO estoque
         (sku, modelo, tamanho, cor, preco_unitario, quantidade_total, quantidade_reservada,
          quantidade_disponivel, data_atualizacao, observacoes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row[0] || '',           // sku
          row[1] || '',           // modelo
          row[2] || '',           // tamanho
          row[3] || '',           // cor
          parseFloat(row[4]) || 0,
          parseInt(row[5]) || 0,
          parseInt(row[6]) || 0,
          quantidade_disponivel,
          row[8] || new Date().toISOString(),
          row[9] || '',
          row[10] || 'ATIVO'
        ]
      );
      count++;
    } catch (error) {
      stats.errors.push(`ESTOQUE linha ${i + 1}: ${error.message}`);
    }
  }

  stats.estoque = count;
  logger.info(`✓ ${count} itens de estoque migrados`);
}

async function countClientes(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.CLIENTES.name}!A:A`
    });
    stats.clientes = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.CLIENTES.name} não encontrada`);
    stats.clientes = 0;
  }
}

async function migrateClientes(sheets, spreadsheetId) {
  logger.info('👥 Migrando CLIENTES...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.CLIENTES.name}!A:N`
  });

  const rows = response.data.values || [];
  const { v4: uuidv4 } = await import('uuid');

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      const id_cliente = row[0] || uuidv4();

      // Usar null para campos únicos vazios (evitar conflito de constraint)
      const whatsapp = row[2] && row[2].trim() ? row[2].trim() : null;
      const cpf = row[3] && row[3].trim() ? row[3].replace(/\D/g, '') || null : null;

      run(
        `INSERT OR IGNORE INTO clientes
         (id_cliente, nome, whatsapp, cpf, email, endereco, bairro, cidade,
          telefone_alternativo, data_primeiro_pedido, total_gasto, quantidade_pedidos,
          modelo_favorito, data_ultimo_pedido, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_cliente,
          row[1] || '',
          whatsapp,
          cpf,
          row[4] || '',
          row[5] || '',
          row[6] || '',
          row[7] || '',
          row[8] || '',
          row[9] || '',
          parseFloat(row[10]) || 0,
          parseInt(row[11]) || 0,
          row[12] || '',
          row[13] || '',
          row[14] || ''
        ]
      );
      count++;
    } catch (error) {
      stats.errors.push(`CLIENTES linha ${i + 1}: ${error.message}`);
    }
  }

  stats.clientes = count;
  logger.info(`✓ ${count} clientes migrados`);
}

async function countLeads(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.LEADS.name}!A:A`
    });
    stats.leads = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.LEADS.name} não encontrada`);
    stats.leads = 0;
  }
}

async function migrateLeads(sheets, spreadsheetId) {
  logger.info('🎯 Migrando LEADS...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.LEADS.name}!A:J`
  });

  const rows = response.data.values || [];

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      run(
        `INSERT INTO leads
         (data_criacao, nome, celular, email, fonte, primeira_interacao,
          ultima_interacao, status, total_gasto, numero_pedidos, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row[0] || new Date().toISOString(),
          row[1] || '',
          row[2] || '',
          row[3] || '',
          row[4] || 'site',
          row[5] || '',
          row[6] || '',
          row[7] || 'novo',
          parseFloat(row[8]) || 0,
          parseInt(row[9]) || 0,
          row[10] || ''
        ]
      );
      count++;
    } catch (error) {
      stats.errors.push(`LEADS linha ${i + 1}: ${error.message}`);
    }
  }

  stats.leads = count;
  logger.info(`✓ ${count} leads migrados`);
}

async function countPedidos(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.PEDIDOS.name}!A:A`
    });
    stats.pedidos = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.PEDIDOS.name} não encontrada`);
    stats.pedidos = 0;
  }
}

async function migratePedidos(sheets, spreadsheetId) {
  logger.info('📋 Migrando PEDIDOS...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.PEDIDOS.name}!A:O`
  });

  const rows = response.data.values || [];

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      run(
        `INSERT OR REPLACE INTO pedidos
         (numero_pedido, data_pedido, cliente_nome, cliente_whatsapp, descricao_pedido,
          quantidade_total, valor_total, tipo_entrega, endereco_entrega, status_pagamento,
          forma_pagamento, status_entrega, itens_json, data_pagamento, data_entrega, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(row[0]) || 0,
          row[1] || '',
          row[2] || '',
          row[3] || '',
          row[4] || '',
          parseInt(row[5]) || 0,
          parseFloat(row[6]) || 0,
          row[7] || 'PENDENTE',
          row[8] || '',
          row[9] || 'PEDIDO',
          row[10] || 'PENDENTE',
          row[11] || 'PENDENTE',
          row[12] || '[]',
          row[13] || '',
          row[14] || '',
          row[15] || ''
        ]
      );
      count++;
    } catch (error) {
      stats.errors.push(`PEDIDOS linha ${i + 1}: ${error.message}`);
    }
  }

  stats.pedidos = count;
  logger.info(`✓ ${count} pedidos migrados`);
}

async function countConversas(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.CONVERSAS.name}!A:A`
    });
    stats.conversas = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.CONVERSAS.name} não encontrada`);
    stats.conversas = 0;
  }
}

async function migrateConversas(sheets, spreadsheetId) {
  logger.info('💬 Migrando CONVERSAS...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.CONVERSAS.name}!A:F`
  });

  const rows = response.data.values || [];

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      run(
        `INSERT OR REPLACE INTO conversas
         (whatsapp, contexto_json, ultimo_mensagem_timestamp, status)
         VALUES (?, ?, ?, ?)`,
        [
          row[0] || '',
          row[1] || '[]',
          row[2] || '',
          row[3] || 'ativa'
        ]
      );
      count++;
    } catch (error) {
      stats.errors.push(`CONVERSAS linha ${i + 1}: ${error.message}`);
    }
  }

  stats.conversas = count;
  logger.info(`✓ ${count} conversas migradas`);
}

async function countFotos(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.FOTOS.name}!A:A`
    });
    stats.fotos = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.FOTOS.name} não encontrada`);
    stats.fotos = 0;
  }
}

async function migrateFotos(sheets, spreadsheetId) {
  logger.info('🖼️ Migrando FOTOS...');
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.FOTOS.name}!A:C`
  });

  const rows = response.data.values || [];

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      const modelo = (row[0] || '').toUpperCase();
      const cor = (row[1] || '').toLowerCase();
      const photoId = row[2] || '';
      // Novo schema: photo_ids_json é um array JSON; eh_capa baseado em coluna separada
      const eh_capa = 0;

      run(
        `INSERT INTO fotos (modelo, cor, photo_ids_json, eh_capa)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(modelo, cor) DO UPDATE SET
           photo_ids_json = json_insert(photo_ids_json, '$[#]', excluded.photo_ids_json)`,
        [modelo, cor, JSON.stringify([photoId]), eh_capa]
      );
      count++;
    } catch (error) {
      stats.errors.push(`FOTOS linha ${i + 1}: ${error.message}`);
    }
  }

  stats.fotos = count;
  logger.info(`✓ ${count} fotos migradas`);
}

async function countSuporte(sheets, spreadsheetId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.SUPORTE.name}!A:A`
    });
    stats.suporte = (response.data.values || []).length - 1;
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.SUPORTE.name} não encontrada`);
    stats.suporte = 0;
  }
}

async function migrarSuporte(sheets, spreadsheetId) {
  logger.info('🆘 Migrando SUPORTE...');
  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEETS.SUPORTE.name}!A:G`
    });
  } catch (error) {
    logger.warn(`⚠️ Sheet ${SHEETS.SUPORTE.name} não encontrada — pulando`);
    stats.suporte = 0;
    return;
  }

  const rows = response.data.values || [];

  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    try {
      run(
        `INSERT INTO suporte
         (data_criacao, cliente_whatsapp, cliente_nome, mensagem, status, resposta, data_resposta, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row[0] || new Date().toISOString(),
          row[1] || '',
          row[2] || '',
          row[3] || '',
          row[4] || 'ABERTO',
          row[5] || '',
          row[6] || '',
          row[7] || ''
        ]
      );
      count++;
    } catch (error) {
      stats.errors.push(`SUPORTE linha ${i + 1}: ${error.message}`);
    }
  }

  stats.suporte = count;
  logger.info(`✓ ${count} tickets de suporte migrados`);
}

async function createSQLBackup() {
  try {
    const backupDir = join(__dirname, '../data/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupFile = join(backupDir, `backup-${timestamp}.sql`);

    const db = getDatabase();
    const backup = db.export();
    fs.writeFileSync(backupFile, Buffer.from(backup));

    logger.info(`✓ Backup criado: ${backupFile}`);
  } catch (error) {
    logger.error('Erro ao criar backup:', error.message);
  }
}

main();
