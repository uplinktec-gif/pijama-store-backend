import pkg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pkg;

let pool = null;

/**
 * Inicializa o pool de conexões PostgreSQL
 */
async function initializePostgres() {
  const pgConfig = {
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT, 10) || 5432,
    database: process.env.PG_DATABASE || 'pijama_store'
  };

  try {
    pool = new Pool(pgConfig);

    // Testar conexão
    const client = await pool.connect();
    logger.info('✓ Conectado ao PostgreSQL');
    client.release();

    // Criar tabelas se não existirem
    await createTables();

    return pool;
  } catch (error) {
    logger.error('✗ Erro ao conectar ao PostgreSQL:', error.message);
    throw error;
  }
}

/**
 * Cria as tabelas necessárias do admin panel
 */
async function createTables() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Tabela de usuários admin
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_usuarios (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100),
        senha_hash VARCHAR(255) NOT NULL,
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de logs de auditoria
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES admin_usuarios(id) ON DELETE SET NULL,
        acao VARCHAR(50) NOT NULL,
        tabela VARCHAR(50),
        registro_id INTEGER,
        dados_antes JSONB,
        dados_depois JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de estoque
    await client.query(`
      CREATE TABLE IF NOT EXISTS estoque_produtos (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) UNIQUE NOT NULL,
        modelo VARCHAR(50) NOT NULL,
        tamanho VARCHAR(20) NOT NULL,
        cor VARCHAR(50) NOT NULL,
        preco_unitario DECIMAL(10, 2) NOT NULL,
        quantidade_total INTEGER DEFAULT 0,
        quantidade_reservada INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ATIVO',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(modelo, tamanho, cor)
      );
    `);

    // Tabela de histórico de estoque
    await client.query(`
      CREATE TABLE IF NOT EXISTS estoque_historico (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER REFERENCES estoque_produtos(id) ON DELETE CASCADE,
        tipo_movimento VARCHAR(20) NOT NULL,
        quantidade INTEGER NOT NULL,
        motivo VARCHAR(255),
        usuario_id INTEGER REFERENCES admin_usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de pedidos
    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        numero_pedido SERIAL UNIQUE,
        cliente_nome VARCHAR(150) NOT NULL,
        cliente_whatsapp VARCHAR(20),
        cliente_cpf VARCHAR(20),
        itens_json JSONB NOT NULL,
        valor_total DECIMAL(10, 2),
        forma_pagamento VARCHAR(20),
        status_pagamento VARCHAR(20) DEFAULT 'PENDENTE',
        status_entrega VARCHAR(20) DEFAULT 'PENDENTE',
        endereco_entrega TEXT,
        data_pagamento TIMESTAMP,
        data_entrega TIMESTAMP,
        observacoes TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de clientes/leads
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        whatsapp VARCHAR(20) UNIQUE,
        cpf VARCHAR(20) UNIQUE,
        nome VARCHAR(150),
        email VARCHAR(100),
        status VARCHAR(20) DEFAULT 'novo',
        total_gasto DECIMAL(10, 2) DEFAULT 0,
        quantidade_pedidos INTEGER DEFAULT 0,
        data_primeiro_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_ultimo_pedido TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de vendas (financeiro)
    await client.query(`
      CREATE TABLE IF NOT EXISTS financeiro_vendas (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
        data_venda DATE,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        valor_venda DECIMAL(10, 2) NOT NULL,
        forma_pagamento VARCHAR(20),
        status_pagamento VARCHAR(20) DEFAULT 'PENDENTE',
        observacoes TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de despesas
    await client.query(`
      CREATE TABLE IF NOT EXISTS financeiro_despesas (
        id SERIAL PRIMARY KEY,
        descricao VARCHAR(255) NOT NULL,
        categoria VARCHAR(50),
        valor DECIMAL(10, 2) NOT NULL,
        data_despesa DATE,
        forma_pagamento VARCHAR(20),
        status VARCHAR(20) DEFAULT 'PENDENTE',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de mídia/fotos
    await client.query(`
      CREATE TABLE IF NOT EXISTS midia_produtos (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER REFERENCES estoque_produtos(id) ON DELETE CASCADE,
        urls_fotos_json JSONB,
        url_capa VARCHAR(500),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de promoções/cupons
    await client.query(`
      CREATE TABLE IF NOT EXISTS promocoes_cupons (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE NOT NULL,
        descricao VARCHAR(255),
        tipo_desconto VARCHAR(20),
        valor_desconto DECIMAL(10, 2),
        percentual_desconto DECIMAL(5, 2),
        data_inicio DATE,
        data_fim DATE,
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de configurações do sistema
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        id SERIAL PRIMARY KEY,
        chave VARCHAR(100) UNIQUE NOT NULL,
        valor TEXT,
        tipo VARCHAR(20),
        descricao TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Criar índices
    await client.query('CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_whatsapp ON pedidos(cliente_whatsapp);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(criado_em);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_estoque_modelo ON estoque_produtos(modelo);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_financeiro_data ON financeiro_vendas(data_venda);');

    await client.query('COMMIT');
    logger.info('✓ Tabelas PostgreSQL inicializadas');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('✗ Erro ao criar tabelas:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa uma query e retorna resultados
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`⚠️ Query lenta (${duration}ms): ${text.substring(0, 100)}`);
    }
    return result.rows;
  } catch (error) {
    logger.error('Erro ao executar query:', error.message);
    throw error;
  }
}

/**
 * Executa uma query e retorna um único resultado
 */
async function queryOne(text, params = []) {
  const results = await query(text, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Executa um comando (INSERT, UPDATE, DELETE)
 */
async function run(text, params = []) {
  try {
    const result = await pool.query(text, params);
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows[0]?.id || null
    };
  } catch (error) {
    logger.error('Erro ao executar comando:', error.message);
    throw error;
  }
}

/**
 * Inicia uma transação
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Fecha o pool de conexões
 */
async function closePostgres() {
  if (pool) {
    await pool.end();
    logger.info('✓ Conexões PostgreSQL fechadas');
  }
}

export {
  initializePostgres,
  query,
  queryOne,
  run,
  getClient,
  closePostgres
};
