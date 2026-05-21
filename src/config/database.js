import initSqlJs from 'sql.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;
let SQL = null;
let dbFilePath = null;

// Debounce para evitar I/O excessivo
let saveTimer = null;

function _saveNow() {
  if (!db || !dbFilePath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
    logger.debug(`✓ Database salvo em: ${dbFilePath}`);
  } catch (error) {
    logger.error('Erro ao salvar database:', error.message);
  }
}

/**
 * Inicializa o banco de dados SQLite com schema
 */
export async function initializeDatabase() {
  try {
    dbFilePath = join(__dirname, '../../data/pijama-store.db');

    // Inicializar SQL.js
    SQL = await initSqlJs();

    // Carregar ou criar database
    if (fs.existsSync(dbFilePath)) {
      const buffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(buffer);
      logger.info(`✓ SQLite carregado do arquivo: ${dbFilePath}`);
    } else {
      // Criar diretório se não existir
      const dataDir = dirname(dbFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new SQL.Database();
      logger.info(`✓ Nova instância SQLite criada: ${dbFilePath}`);
    }

    // Criar tabelas e índices
    createTables();

    // Salvar no arquivo (force save na inicialização)
    saveDatabase(true);

    logger.info(`✓ Database inicializado com sucesso`);

    return db;
  } catch (error) {
    logger.error('Erro ao inicializar database:', error.message);
    throw error;
  }
}

/**
 * Retorna instância do banco de dados
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database não inicializado. Chame initializeDatabase() primeiro.');
  }
  return db;
}

/**
 * Salva o database no arquivo (com debounce por padrão)
 * @param {boolean} force - Se true, salva imediatamente sem debounce
 */
export function saveDatabase(force = false) {
  if (!db || !dbFilePath) return;
  if (force) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    _saveNow();
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(_saveNow, 2000);
}

/**
 * Fecha conexão com o banco
 */
export function closeDatabase() {
  if (db) {
    saveDatabase(true); // Garantir save final
    db.close();
    db = null;
    logger.info('✓ Database conexão fechada');
  }
}

/**
 * Executa uma query SQL de leitura (SELECT)
 * @returns {Array} - Array de objetos
 */
export function query(sql, params = []) {
  if (!db) throw new Error('Database não inicializado');

  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return results; // Sem saveDatabase() — SELECT não precisa salvar
  } catch (error) {
    logger.error(`[DB] Erro em query: ${sql.substring(0, 80)}...`, error.message);
    throw error;
  }
}

/**
 * Executa uma query que retorna uma linha (SELECT ... LIMIT 1)
 * @returns {Object|null}
 */
export function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Executa uma operação de escrita (INSERT, UPDATE, DELETE)
 * @returns {{ success: boolean, id: number|null, changes: number }}
 */
export function run(sql, params = []) {
  if (!db) throw new Error('Database não inicializado');

  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();

    // Capturar last_insert_rowid e changes
    const meta = queryOne('SELECT last_insert_rowid() as id, changes() as changes');
    const id = meta?.id ?? null;
    const changes = meta?.changes ?? 0;

    saveDatabase(); // Debounced save após escrita

    return { success: true, id, changes };
  } catch (error) {
    logger.error(`[DB] Erro em run: ${sql.substring(0, 80)}`, error.message);
    throw error;
  }
}

/**
 * Executa um conjunto de operações em transação atômica
 * @param {Function} fn - Função síncrona com chamadas a run()
 * @returns O retorno da função fn
 */
export function transaction(fn) {
  if (!db) throw new Error('Database não inicializado');

  try {
    db.run('BEGIN');
    const result = fn();
    db.run('COMMIT');
    saveDatabase(); // Debounced save após transação
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch (_) { /* ignorar erro de rollback */ }
    logger.error('[DB] Erro em transação, rollback executado:', error.message);
    throw error;
  }
}

/**
 * Cria todas as tabelas do schema
 */
function createTables() {
  try {
    // 1. ESTOQUE
    db.run(`
      CREATE TABLE IF NOT EXISTS estoque (
        sku TEXT PRIMARY KEY,
        modelo TEXT NOT NULL,
        tamanho TEXT NOT NULL,
        cor TEXT NOT NULL,
        preco_unitario REAL NOT NULL DEFAULT 0,
        quantidade_total INTEGER NOT NULL DEFAULT 0,
        quantidade_reservada INTEGER NOT NULL DEFAULT 0,
        quantidade_disponivel INTEGER DEFAULT 0,
        data_atualizacao TEXT,
        observacoes TEXT,
        status TEXT DEFAULT 'ATIVO',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. PEDIDOS_E_VENDAS
    db.run(`
      CREATE TABLE IF NOT EXISTS pedidos (
        numero_pedido INTEGER PRIMARY KEY AUTOINCREMENT,
        data_pedido TEXT NOT NULL,
        cliente_nome TEXT,
        cliente_whatsapp TEXT,
        descricao_pedido TEXT,
        quantidade_total INTEGER DEFAULT 0,
        valor_total REAL DEFAULT 0,
        tipo_entrega TEXT,
        endereco_entrega TEXT,
        status_pagamento TEXT DEFAULT 'PEDIDO',
        forma_pagamento TEXT,
        status_entrega TEXT DEFAULT 'PENDENTE',
        itens_json TEXT DEFAULT '[]',
        data_pagamento TEXT,
        data_entrega TEXT,
        observacoes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. CLIENTES
    db.run(`
      CREATE TABLE IF NOT EXISTS clientes (
        id_cliente TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        whatsapp TEXT UNIQUE,
        cpf TEXT UNIQUE,
        email TEXT,
        endereco TEXT,
        bairro TEXT,
        cidade TEXT,
        telefone_alternativo TEXT,
        data_primeiro_pedido TEXT,
        total_gasto REAL DEFAULT 0,
        quantidade_pedidos INTEGER DEFAULT 0,
        modelo_favorito TEXT,
        data_ultimo_pedido TEXT,
        observacoes TEXT,
        google_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. LEADS
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_criacao TEXT NOT NULL,
        nome TEXT NOT NULL,
        celular TEXT UNIQUE NOT NULL,
        email TEXT,
        fonte TEXT,
        primeira_interacao TEXT,
        ultima_interacao TEXT,
        status TEXT DEFAULT 'novo',
        total_gasto REAL DEFAULT 0,
        numero_pedidos INTEGER DEFAULT 0,
        observacoes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. CONVERSAS
    db.run(`
      CREATE TABLE IF NOT EXISTS conversas (
        whatsapp TEXT PRIMARY KEY UNIQUE,
        contexto_json TEXT DEFAULT '{}',
        ultimo_mensagem_timestamp TEXT,
        status TEXT DEFAULT 'ativa',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. FOTOS (suporta múltiplos IDs por modelo/cor)
    db.run(`
      CREATE TABLE IF NOT EXISTS fotos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modelo TEXT NOT NULL,
        cor TEXT NOT NULL,
        photo_ids_json TEXT NOT NULL DEFAULT '[]',
        eh_capa INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(modelo, cor)
      )
    `);

    // 7. SUPORTE
    db.run(`
      CREATE TABLE IF NOT EXISTS suporte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_criacao TEXT NOT NULL,
        cliente_whatsapp TEXT,
        cliente_nome TEXT,
        mensagem TEXT NOT NULL,
        status TEXT DEFAULT 'ABERTO',
        resposta TEXT,
        data_resposta TEXT,
        observacoes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para performance
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_pedidos_whatsapp ON pedidos(cliente_whatsapp)',
      'CREATE INDEX IF NOT EXISTS idx_pedidos_status_pagamento ON pedidos(status_pagamento)',
      'CREATE INDEX IF NOT EXISTS idx_pedidos_status_entrega ON pedidos(status_entrega)',
      'CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(data_pedido)',
      'CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp)',
      'CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf)',
      'CREATE INDEX IF NOT EXISTS idx_clientes_google ON clientes(google_id)',
      'CREATE INDEX IF NOT EXISTS idx_leads_celular ON leads(celular)',
      'CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)',
      'CREATE INDEX IF NOT EXISTS idx_conversas_whatsapp ON conversas(whatsapp)',
      'CREATE INDEX IF NOT EXISTS idx_estoque_modelo ON estoque(modelo)',
      'CREATE INDEX IF NOT EXISTS idx_estoque_status ON estoque(status)',
    ];

    for (const idx of indices) {
      db.run(idx);
    }

    logger.info('✓ Todas as tabelas e índices criados/verificados');
  } catch (error) {
    logger.error('Erro ao criar tabelas:', error.message);
    throw error;
  }
}
