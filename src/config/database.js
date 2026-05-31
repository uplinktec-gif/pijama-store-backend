import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('better-sqlite3').Database} */
let db = null;

/**
 * Inicializa o banco de dados SQLite (escrita direta em disco)
 */
export function initializeDatabase() {
  try {
    const dbFilePath = join(__dirname, '../../data/pijama-store.db');

    // Garantir que o diretório existe
    const dataDir = dirname(dbFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Abrir (ou criar) o arquivo .db diretamente no disco
    db = new Database(dbFilePath, { verbose: null });

    // Habilitar WAL mode: melhor performance em leituras/escritas concorrentes
    db.pragma('journal_mode = WAL');
    // Espera até 5s antes de desistir numa colisão de escrita (bot + site simultâneos)
    // em vez de lançar SQLITE_BUSY imediatamente. Blindagem de concorrência.
    db.pragma('busy_timeout = 5000');
    // Garantir integridade referencial
    db.pragma('foreign_keys = ON');

    // Criar tabelas e índices
    createTables();

    // Migrações seguras — adicionam colunas apenas se não existirem
    runMigrations();

    logger.info(`✓ SQLite (better-sqlite3) inicializado: ${dbFilePath}`);
    return db;
  } catch (error) {
    logger.error('Erro ao inicializar database:', error.message);
    throw error;
  }
}

/**
 * Retorna a instância do banco
 */
export function getDatabase() {
  if (!db) throw new Error('Database não inicializado. Chame initializeDatabase() primeiro.');
  return db;
}

/**
 * Fecha a conexão com o banco
 * better-sqlite3 já persiste tudo no disco — este método apenas fecha o handle
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('✓ Database conexão fechada');
  }
}

/**
 * No-op mantido para compatibilidade com código legado que chamava saveDatabase()
 * better-sqlite3 persiste automaticamente — não há mais necessidade de flush manual
 */
export function saveDatabase(_force = false) {
  // Não faz nada — better-sqlite3 escreve direto no disco em cada operação
}

/**
 * Executa SELECT — retorna array de objetos
 */
export function query(sql, params = []) {
  if (!db) throw new Error('Database não inicializado');
  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (error) {
    logger.error(`[DB] query: ${sql.substring(0, 80)}`, error.message);
    throw error;
  }
}

/**
 * Executa SELECT e retorna a primeira linha (ou null)
 */
export function queryOne(sql, params = []) {
  if (!db) throw new Error('Database não inicializado');
  try {
    const stmt = db.prepare(sql);
    return stmt.get(...params) ?? null;
  } catch (error) {
    logger.error(`[DB] queryOne: ${sql.substring(0, 80)}`, error.message);
    throw error;
  }
}

/**
 * Executa INSERT / UPDATE / DELETE
 * Retorna { success, id, changes } — mesma assinatura do wrapper anterior
 */
export function run(sql, params = []) {
  if (!db) throw new Error('Database não inicializado');
  try {
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return {
      success: true,
      id: info.lastInsertRowid ?? null,
      changes: info.changes ?? 0
    };
  } catch (error) {
    logger.error(`[DB] run: ${sql.substring(0, 80)}`, error.message);
    throw error;
  }
}

/**
 * Executa um conjunto de operações em transação atômica (ACID)
 * Se qualquer operação falhar, faz ROLLBACK automático
 */
export function transaction(fn) {
  if (!db) throw new Error('Database não inicializado');
  // better-sqlite3 tem suporte nativo a transações síncronas
  const txn = db.transaction(fn);
  try {
    return txn();
  } catch (error) {
    logger.error('[DB] Erro em transação, rollback executado:', error.message);
    throw error;
  }
}

// ─── Audit Log / Versioning ──────────────────────────────────────────────────

/**
 * Registra alteração no audit log de estoque
 */
export function registrarAlteracaoEstoque(sku, operacao, mudancas, usuarioId = 'sistema') {
  if (!db) throw new Error('Database não inicializado');
  try {
    const maxRow = queryOne('SELECT MAX(versao) as max_versao FROM estoque_versao');
    const versao = (maxRow?.max_versao ?? 0) + 1;

    run(
      `INSERT INTO estoque_versao (versao, operacao, sku, mudancas_json, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [versao, operacao, sku, JSON.stringify(mudancas), usuarioId]
    );

    logger.debug(`[VERSIONING] Estoque v${versao}: ${operacao} ${sku}`);
    return { success: true, versao };
  } catch (error) {
    logger.error('[VERSIONING] Erro ao registrar alteração:', error.message);
    return { success: false, versao: null };
  }
}

/**
 * Retorna histórico de alterações de estoque desde uma versão
 */
export function obterHistoricoEstoque(desdeVersao = null, limite = 100) {
  if (!db) throw new Error('Database não inicializado');
  try {
    const maxRow = queryOne('SELECT MAX(versao) as versao_atual FROM estoque_versao');
    const versaoAtual = maxRow?.versao_atual ?? 0;

    const params = [];
    let sql = 'SELECT * FROM estoque_versao';
    if (desdeVersao !== null) {
      sql += ' WHERE versao >= ?';
      params.push(desdeVersao);
    }
    sql += ' ORDER BY versao DESC LIMIT ?';
    params.push(limite);

    const alteracoes = query(sql, params)
      .map(row => ({
        versao: row.versao,
        timestamp: row.timestamp,
        sku: row.sku,
        operacao: row.operacao,
        mudancas: row.mudancas_json ? JSON.parse(row.mudancas_json) : null,
        usuario_id: row.usuario_id
      }))
      .reverse();

    return { versao_atual: versaoAtual, alteracoes };
  } catch (error) {
    logger.error('[VERSIONING] Erro ao obter histórico:', error.message);
    return { versao_atual: 0, alteracoes: [] };
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function createTables() {
  db.exec(`
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
    );

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
    );

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
    );

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
    );

    CREATE TABLE IF NOT EXISTS conversas (
      whatsapp TEXT PRIMARY KEY UNIQUE,
      contexto_json TEXT DEFAULT '{}',
      ultimo_mensagem_timestamp TEXT,
      status TEXT DEFAULT 'ativa',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo TEXT NOT NULL,
      cor TEXT NOT NULL,
      photo_ids_json TEXT NOT NULL DEFAULT '[]',
      eh_capa INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(modelo, cor)
    );

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
    );

    CREATE TABLE IF NOT EXISTS admin_usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(100),
      senha_hash VARCHAR(255) NOT NULL,
      ativo BOOLEAN DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS estoque_versao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      versao INTEGER NOT NULL UNIQUE,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      operacao TEXT NOT NULL,
      sku TEXT,
      mudancas_json TEXT,
      usuario_id TEXT DEFAULT 'sistema',
      FOREIGN KEY(sku) REFERENCES estoque(sku)
    );

    CREATE TABLE IF NOT EXISTS webhooks_fila_morta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumidor TEXT,
      sku TEXT,
      versao INTEGER,
      tentativas INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      erro_mensagem TEXT
    );

    CREATE TABLE IF NOT EXISTS webhooks_consumidores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumidor TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      ultima_notificacao TEXT,
      ultima_falha TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS log_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
      sku TEXT NOT NULL,
      modelo TEXT,
      tamanho TEXT,
      cor TEXT,
      quantidade INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      observacao TEXT,
      usuario TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pedidos_whatsapp ON pedidos(cliente_whatsapp);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status_pagamento ON pedidos(status_pagamento);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status_entrega ON pedidos(status_entrega);
    CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(data_pedido);
    CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp);
    CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);
    CREATE INDEX IF NOT EXISTS idx_clientes_google ON clientes(google_id);
    CREATE INDEX IF NOT EXISTS idx_leads_celular ON leads(celular);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_conversas_whatsapp ON conversas(whatsapp);
    CREATE INDEX IF NOT EXISTS idx_estoque_modelo ON estoque(modelo);
    CREATE INDEX IF NOT EXISTS idx_estoque_status ON estoque(status);
    CREATE INDEX IF NOT EXISTS idx_admin_usuarios_username ON admin_usuarios(username);
    CREATE INDEX IF NOT EXISTS idx_estoque_versao_timestamp ON estoque_versao(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_estoque_versao_sku ON estoque_versao(sku);
    CREATE INDEX IF NOT EXISTS idx_webhooks_fila_morta_versao ON webhooks_fila_morta(versao);
    CREATE INDEX IF NOT EXISTS idx_webhooks_consumidores_ativo ON webhooks_consumidores(ativo);
    CREATE INDEX IF NOT EXISTS idx_webhooks_fila_morta_timestamp ON webhooks_fila_morta(timestamp);
    CREATE INDEX IF NOT EXISTS idx_log_estoque_data ON log_estoque(data_hora DESC);
    CREATE INDEX IF NOT EXISTS idx_log_estoque_sku ON log_estoque(sku);
    CREATE INDEX IF NOT EXISTS idx_log_estoque_motivo ON log_estoque(motivo);
  `);

  logger.info('✓ Todas as tabelas e índices criados/verificados');
}

/**
 * Migrações incrementais — adiciona colunas novas a tabelas existentes.
 * Cada ALTER TABLE é envolto em try/catch para ser idempotente:
 * se a coluna já existir, SQLite lança erro e simplesmente ignoramos.
 */
function runMigrations() {
  const safe = (sql) => { try { db.exec(sql); } catch (_) { /* coluna já existe */ } };

  // v1 — OTP via WhatsApp para login frictionless
  safe('ALTER TABLE clientes ADD COLUMN otp_atual TEXT');
  safe('ALTER TABLE clientes ADD COLUMN otp_expira_em TEXT');

  logger.debug('✓ Migrações executadas');
}
