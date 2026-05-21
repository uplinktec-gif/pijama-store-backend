import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export function generateClienteId() {
  return uuidv4();
}

/**
 * Normaliza CPF para apenas dígitos
 */
function normalizarCPF(cpf) {
  return (cpf || '').replace(/\D/g, '');
}

/**
 * Lista todos os clientes ordenados por total gasto
 */
export async function readAllClientes() {
  try {
    return query('SELECT * FROM clientes ORDER BY total_gasto DESC').map(mapCliente);
  } catch (error) {
    logger.error('[sqlite:clientes] readAllClientes:', error.message);
    return [];
  }
}

/**
 * Busca cliente por WhatsApp
 */
export async function findByWhatsApp(whatsapp) {
  try {
    const row = queryOne('SELECT * FROM clientes WHERE whatsapp = ?', [whatsapp]);
    return row ? mapCliente(row) : null;
  } catch (error) {
    logger.error('[sqlite:clientes] findByWhatsApp:', error.message);
    return null;
  }
}

/**
 * Busca cliente por ID
 */
export async function findById(idCliente) {
  try {
    const row = queryOne('SELECT * FROM clientes WHERE id_cliente = ?', [idCliente]);
    return row ? mapCliente(row) : null;
  } catch (error) {
    logger.error('[sqlite:clientes] findById:', error.message);
    return null;
  }
}

// Alias para compatibilidade
export const obterClientePorId = findById;

/**
 * Busca cliente por CPF (normalizado)
 */
export async function findByCPF(cpf) {
  try {
    const cpfNorm = normalizarCPF(cpf);
    if (!cpfNorm) return null;

    const row = queryOne(
      `SELECT * FROM clientes
       WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?`,
      [cpfNorm]
    );
    return row ? mapCliente(row) : null;
  } catch (error) {
    logger.error('[sqlite:clientes] findByCPF:', error.message);
    return null;
  }
}

// Alias para compatibilidade
export const buscarClientePorCPF = findByCPF;

/**
 * Busca cliente por Google ID
 */
export async function findByGoogleId(googleId) {
  try {
    const row = queryOne('SELECT * FROM clientes WHERE google_id = ?', [googleId]);
    return row ? mapCliente(row) : null;
  } catch (error) {
    logger.error('[sqlite:clientes] findByGoogleId:', error.message);
    return null;
  }
}

/**
 * Cria um novo cliente
 */
export async function criarCliente(clienteData) {
  try {
    const idCliente = clienteData.id_cliente || generateClienteId();
    const now = new Date().toISOString();

    // Normalizar CPF se fornecido
    const cpfNormalizado = clienteData.cpf ? normalizarCPF(clienteData.cpf) : null;

    logger.debug(`[sqlite:clientes] criarCliente - dados recebidos:`, {
      idCliente,
      nome: clienteData.nome,
      whatsapp: clienteData.whatsapp,
      cpf_original: clienteData.cpf,
      cpf_normalizado: cpfNormalizado,
      email: clienteData.email
    });

    run(
      `INSERT INTO clientes
       (id_cliente, nome, whatsapp, cpf, email, endereco, bairro, cidade,
        telefone_alternativo, data_primeiro_pedido, total_gasto, quantidade_pedidos,
        modelo_favorito, data_ultimo_pedido, observacoes, google_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idCliente,
        clienteData.nome || '',
        clienteData.whatsapp || null,
        cpfNormalizado,
        clienteData.email || null,
        clienteData.endereco || '',
        clienteData.bairro || '',
        clienteData.cidade || '',
        clienteData.telefone_alternativo || '',
        clienteData.data_primeiro_pedido || now,
        parseFloat(clienteData.total_gasto) || 0,
        parseInt(clienteData.quantidade_pedidos) || 0,
        clienteData.modelo_favorito || '',
        clienteData.data_ultimo_pedido || '',
        clienteData.observacoes || '',
        clienteData.google_id || null
      ]
    );

    // Força uma verificação imediata para debug
    const novoCliente = queryOne('SELECT cpf FROM clientes WHERE id_cliente = ?', [idCliente]);
    logger.info(`[sqlite:clientes] Cliente criado: ${idCliente}, CPF salvo: ${novoCliente?.cpf || 'NULL'}`);

    return { success: true, idCliente };
  } catch (error) {
    // Verificar se é erro de constraint UNIQUE
    if (error.message && error.message.includes('UNIQUE constraint')) {
      if (error.message.includes('whatsapp')) {
        return { success: false, error: 'WhatsApp já cadastrado' };
      }
      if (error.message.includes('cpf')) {
        return { success: false, error: 'CPF já cadastrado' };
      }
      return { success: false, error: 'Cliente já existe' };
    }
    logger.error('[sqlite:clientes] criarCliente:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza dados de um cliente (apenas campos fornecidos)
 */
export async function atualizarCliente(idCliente, clienteData) {
  try {
    const campos = [];
    const params = [];
    const now = new Date().toISOString();

    const mapeamento = {
      nome: 'nome',
      email: 'email',
      endereco: 'endereco',
      bairro: 'bairro',
      cidade: 'cidade',
      telefone_alternativo: 'telefone_alternativo',
      observacoes: 'observacoes',
      google_id: 'google_id',
      cpf: 'cpf'
    };

    for (const [chave, coluna] of Object.entries(mapeamento)) {
      if (clienteData[chave] !== undefined) {
        campos.push(`${coluna} = ?`);
        // Normalizar CPF se for esse campo
        params.push(chave === 'cpf' ? normalizarCPF(clienteData[chave]) : clienteData[chave]);
      }
    }

    if (campos.length === 0) return { success: true };

    campos.push('updated_at = ?');
    params.push(now);
    params.push(idCliente);

    run(`UPDATE clientes SET ${campos.join(', ')} WHERE id_cliente = ?`, params);

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:clientes] atualizarCliente:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza estatísticas após uma compra
 */
export async function atualizarEstatisticas(idCliente, valorPedido, modeloFavorito) {
  try {
    const now = new Date().toISOString();

    run(
      `UPDATE clientes
       SET total_gasto = total_gasto + ?,
           quantidade_pedidos = quantidade_pedidos + 1,
           modelo_favorito = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE modelo_favorito END,
           data_ultimo_pedido = ?,
           updated_at = ?
       WHERE id_cliente = ?`,
      [
        parseFloat(valorPedido) || 0,
        modeloFavorito, modeloFavorito, modeloFavorito,
        now, now,
        idCliente
      ]
    );

    return { success: true };
  } catch (error) {
    logger.error('[sqlite:clientes] atualizarEstatisticas:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lista clientes VIP (total_gasto >= 500)
 */
export async function listarVIPs() {
  try {
    return query('SELECT * FROM clientes WHERE total_gasto >= 500 ORDER BY total_gasto DESC').map(mapCliente);
  } catch (error) {
    logger.error('[sqlite:clientes] listarVIPs:', error.message);
    return [];
  }
}

/**
 * Lista clientes inativos
 */
export async function listarInativos(diasLimite = 30) {
  try {
    const dataCorte = new Date(Date.now() - diasLimite * 86400000).toISOString();
    return query(
      'SELECT * FROM clientes WHERE data_ultimo_pedido < ? AND data_ultimo_pedido != \'\' ORDER BY data_ultimo_pedido',
      [dataCorte]
    ).map(mapCliente);
  } catch (error) {
    logger.error('[sqlite:clientes] listarInativos:', error.message);
    return [];
  }
}

/**
 * Mapeia uma linha do banco para o objeto padronizado
 */
function mapCliente(row) {
  return {
    id_cliente: row.id_cliente,
    nome: row.nome || '',
    whatsapp: row.whatsapp || '',
    cpf: row.cpf || '',
    email: row.email || '',
    endereco: row.endereco || '',
    bairro: row.bairro || '',
    cidade: row.cidade || '',
    telefone_alternativo: row.telefone_alternativo || '',
    data_primeiro_pedido: row.data_primeiro_pedido || '',
    total_gasto: parseFloat(row.total_gasto) || 0,
    quantidade_pedidos: parseInt(row.quantidade_pedidos) || 0,
    modelo_favorito: row.modelo_favorito || '',
    data_ultimo_pedido: row.data_ultimo_pedido || '',
    observacoes: row.observacoes || '',
    google_id: row.google_id || null
  };
}
