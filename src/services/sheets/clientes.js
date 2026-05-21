import { getSheetsClient, getSpreadsheetId } from '../../config/sheets.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const CLIENTES_SHEET = 'CLIENTES';
const HEADER_ROW = 1;

/**
 * Gera ID Ãºnico para cliente
 */
function generateClienteId() {
  return uuidv4();
}

/**
 * LÃª todos os clientes
 */
async function readAllClientes() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return [];

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Apenas cabeÃ§alho ou vazio

    const clientes = [];
    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0) continue;

      clientes.push({
        id_cliente: row[0],
        nome: row[1],
        whatsapp: row[2],
        email: row[3] || '',
        endereco: row[4] || '',
        bairro: row[5] || '',
        cidade: row[6] || '',
        telefone_alternativo: row[7] || '',
        data_primeiro_pedido: row[8],
        total_gasto: parseFloat(row[9]) || 0,
        quantidade_pedidos: parseInt(row[10]) || 0,
        modelo_favorito: row[11] || '',
        data_ultimo_pedido: row[12],
        observacoes: row[13] || '',
        cpf: row[14] || '',
        google_id: row[15] || ''
      });
    }

    return clientes;
  } catch (error) {
    logger.error('Erro ao ler clientes:', error.message);
    return [];
  }
}

/**
 * Busca cliente por WhatsApp
 */
async function findByWhatsApp(whatsapp) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`
    });

    const rows = response.data.values || [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (row[2] === whatsapp) {
        return {
          rowIndex: i + 1,
          id_cliente: row[0],
          nome: row[1],
          whatsapp: row[2],
          email: row[3] || '',
          endereco: row[4] || '',
          bairro: row[5] || '',
          cidade: row[6] || '',
          telefone_alternativo: row[7] || '',
          data_primeiro_pedido: row[8],
          total_gasto: parseFloat(row[9]) || 0,
          quantidade_pedidos: parseInt(row[10]) || 0,
          modelo_favorito: row[11] || '',
          data_ultimo_pedido: row[12],
          observacoes: row[13] || '',
          cpf: row[14] || '',
          google_id: row[15] || ''
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao buscar cliente por WhatsApp:', error.message);
    return null;
  }
}

/**
 * Busca cliente por ID
 */
async function findById(idCliente) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`
    });

    const rows = response.data.values || [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === idCliente) {
        return {
          rowIndex: i + 1,
          id_cliente: row[0],
          nome: row[1],
          whatsapp: row[2],
          email: row[3] || '',
          endereco: row[4] || '',
          bairro: row[5] || '',
          cidade: row[6] || '',
          telefone_alternativo: row[7] || '',
          data_primeiro_pedido: row[8],
          total_gasto: parseFloat(row[9]) || 0,
          quantidade_pedidos: parseInt(row[10]) || 0,
          modelo_favorito: row[11] || '',
          data_ultimo_pedido: row[12],
          observacoes: row[13] || '',
          cpf: row[14] || '',
          google_id: row[15] || ''
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao buscar cliente por ID:', error.message);
    return null;
  }
}

/**
 * Cria novo cliente
 */
async function criarCliente(clienteData) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return { success: false, error: 'Google Sheets nÃ£o estÃ¡ inicializado' };

    const spreadsheetId = getSpreadsheetId();
    const idCliente = generateClienteId();
    const now = new Date().toISOString();

    const row = [
      idCliente,
      clienteData.nome || '',
      clienteData.whatsapp || '',
      clienteData.email || '',
      clienteData.endereco || '',
      clienteData.bairro || '',
      clienteData.cidade || '',
      clienteData.telefone_alternativo || '',
      now, // DATA_PRIMEIRO_PEDIDO
      0, // TOTAL_GASTO
      1, // QUANTIDADE_PEDIDOS
      clienteData.modelo_favorito || '',
      now, // DATA_ULTIMO_PEDIDO
      clienteData.observacoes || '',
      clienteData.cpf || '', // CPF (coluna O)
      clienteData.google_id || '' // GOOGLE_ID (coluna P)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });

    logger.info(`✓ Cliente criado: ${clienteData.nome} (${clienteData.whatsapp || clienteData.cpf})`);
    return { success: true, idCliente };
  } catch (error) {
    logger.error('Erro ao criar cliente:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza dados do cliente
 */
async function atualizarCliente(idCliente, clienteData) {
  try {
    const cliente = await findById(idCliente);
    if (!cliente) {
      return { success: false, error: `Cliente #${idCliente} nÃ£o encontrado` };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // Atualizar nome se fornecido
    if (clienteData.nome) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!B${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.nome]]
        }
      });
    }

    // Atualizar email se fornecido
    if (clienteData.email) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!D${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.email]]
        }
      });
    }

    // Atualizar endereÃ§o se fornecido
    if (clienteData.endereco) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!E${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.endereco]]
        }
      });
    }

    // Atualizar bairro se fornecido
    if (clienteData.bairro) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!F${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.bairro]]
        }
      });
    }

    // Atualizar cidade se fornecido
    if (clienteData.cidade) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!G${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.cidade]]
        }
      });
    }

    // Atualizar telefone alternativo se fornecido
    if (clienteData.telefone_alternativo) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!H${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.telefone_alternativo]]
        }
      });
    }

    // Atualizar observaÃ§Ãµes se fornecido
    if (clienteData.observacoes) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!N${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clienteData.observacoes]]
        }
      });
    }

    logger.info(`âœ“ Cliente ${cliente.nome} atualizado`);
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar cliente:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza total gasto e quantidade de pedidos (chamado ao criar pedido)
 */
async function atualizarEstatisticas(idCliente, valorPedido, modeloFavorito) {
  try {
    const cliente = await findById(idCliente);
    if (!cliente) {
      return { success: false, error: `Cliente #${idCliente} nÃ£o encontrado` };
    }

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const now = new Date().toISOString();

    // Atualiza TOTAL_GASTO (coluna J = 10)
    const novoTotal = cliente.total_gasto + valorPedido;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!J${cliente.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novoTotal]]
      }
    });

    // Atualiza QUANTIDADE_PEDIDOS (coluna K = 11)
    const novaQuantidade = cliente.quantidade_pedidos + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!K${cliente.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[novaQuantidade]]
      }
    });

    // Atualiza MODELO_FAVORITO (coluna L = 12)
    if (modeloFavorito) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CLIENTES_SHEET}!L${cliente.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[modeloFavorito]]
        }
      });
    }

    // Atualiza DATA_ULTIMO_PEDIDO (coluna M = 13)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!M${cliente.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[now]]
      }
    });

    logger.info(`âœ“ EstatÃ­sticas de ${cliente.nome} atualizadas`);
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar estatÃ­sticas:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Retorna clientes VIP (total gasto > 500)
 */
async function listarVIPs() {
  try {
    const clientes = await readAllClientes();
    return clientes.filter(c => c.total_gasto >= 500);
  } catch (error) {
    logger.error('Erro ao listar VIPs:', error.message);
    return [];
  }
}

/**
 * Retorna clientes com Ãºltima compra > 30 dias (inativos)
 */
async function listarInativos(diasLimite = 30) {
  try {
    const clientes = await readAllClientes();
    const agora = new Date();

    return clientes.filter(c => {
      if (!c.data_ultimo_pedido) return false;
      const ultimaPedido = new Date(c.data_ultimo_pedido);
      const dias = Math.floor((agora - ultimaPedido) / (1000 * 60 * 60 * 24));
      return dias > diasLimite;
    });
  } catch (error) {
    logger.error('Erro ao listar inativos:', error.message);
    return [];
  }
}

/**
 * Buscar cliente por CPF
 * Nota: Atualmente procura no email (campo D) que pode conter CPF
 * TODO: Adicionar coluna de CPF Ã  aba CLIENTES para busca mais eficiente
 */
async function buscarClientePorCPF(cpf) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`
    });

    const rows = response.data.values || [];

    // Procurar por CPF no email ou em outros campos
    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      // Verificar se CPF estÃ¡ no email (campo D)
      if (row[3] && row[3].replace(/\D/g, '') === cpf) {
        return {
          rowIndex: i + 1,
          id_cliente: row[0],
          nome: row[1],
          whatsapp: row[2],
          email: row[3] || '',
          endereco: row[4] || '',
          bairro: row[5] || '',
          cidade: row[6] || '',
          telefone_alternativo: row[7] || '',
          data_primeiro_pedido: row[8],
          total_gasto: parseFloat(row[9]) || 0,
          quantidade_pedidos: parseInt(row[10]) || 0,
          modelo_favorito: row[11] || '',
          data_ultimo_pedido: row[12],
          observacoes: row[13] || '',
          cpf: cpf
        };
      }
    }

    return null;
  } catch (err) {
    logger.error('Erro ao buscar cliente por CPF:', err.message);
    return null;
  }
}

/**
 * Alias para findById - obter cliente por ID
 * Usado pelo controller do portal
 */
async function obterClientePorId(idCliente) {
  return await findById(idCliente);
}


/**
 * Busca cliente por CPF
 */
async function findByCPF(cpf) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`
    });

    const rows = response.data.values || [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      // Coluna O (index 14) contém o CPF
      if (row[14] && row[14].replace(/\D/g, '') === cpf) {
        return {
          rowIndex: i + 1,
          id_cliente: row[0],
          nome: row[1],
          whatsapp: row[2],
          email: row[3] || '',
          endereco: row[4] || '',
          bairro: row[5] || '',
          cidade: row[6] || '',
          telefone_alternativo: row[7] || '',
          data_primeiro_pedido: row[8],
          total_gasto: parseFloat(row[9]) || 0,
          quantidade_pedidos: parseInt(row[10]) || 0,
          modelo_favorito: row[11] || '',
          data_ultimo_pedido: row[12],
          observacoes: row[13] || '',
          cpf: row[14] || '',
          google_id: row[15] || ''
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao buscar cliente por CPF:', error.message);
    return null;
  }
}

/**
 * Busca cliente por Google ID
 */
async function findByGoogleId(googleId) {
  try {
    const sheets = getSheetsClient();
    if (!sheets) return null;

    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CLIENTES_SHEET}!A:P`
    });

    const rows = response.data.values || [];

    for (let i = HEADER_ROW; i < rows.length; i++) {
      const row = rows[i];
      // Coluna P (index 15) contém o google_id
      if (row[15] === googleId) {
        return {
          rowIndex: i + 1,
          id_cliente: row[0],
          nome: row[1],
          whatsapp: row[2],
          email: row[3] || '',
          endereco: row[4] || '',
          bairro: row[5] || '',
          cidade: row[6] || '',
          telefone_alternativo: row[7] || '',
          data_primeiro_pedido: row[8],
          total_gasto: parseFloat(row[9]) || 0,
          quantidade_pedidos: parseInt(row[10]) || 0,
          modelo_favorito: row[11] || '',
          data_ultimo_pedido: row[12],
          observacoes: row[13] || '',
          cpf: row[14] || '',
          google_id: row[15] || ''
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao buscar cliente por Google ID:', error.message);
    return null;
  }
}

export {
  generateClienteId,
  readAllClientes,
  findByWhatsApp,
  findById,
  findByCPF,
  findByGoogleId,
  criarCliente,
  atualizarCliente,
  atualizarEstatisticas,
  listarVIPs,
  listarInativos,
  buscarClientePorCPF,
  obterClientePorId
};


