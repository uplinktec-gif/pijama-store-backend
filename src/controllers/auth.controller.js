import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, query, run } from '../config/database.js';
import { validarCPF, normalizarCelular } from '../middleware/authMiddleware.js';
import { logger } from '../utils/logger.js';

/**
 * LOGIN COM CELULAR + CPF (novo sistema)
 * POST /auth/cliente/login
 * Body: { celular: string, cpf: string }
 */
export async function loginCelularCpf(req, res) {
  try {
    const { celular, cpf } = req.body;

    if (!celular || !cpf) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Celular e CPF são obrigatórios'
      });
    }

    // Validar CPF
    if (!validarCPF(cpf)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido'
      });
    }

    // Normalizar celular
    const celularNormalizado = normalizarCelular(celular);
    const cpfNormalizado = cpf.replace(/\D/g, '');

    // Buscar cliente
    const cliente = queryOne(
      'SELECT * FROM clientes WHERE REPLACE(REPLACE(whatsapp, " ", ""), "-", "") = ? AND REPLACE(REPLACE(cpf, ".", ""), "-", "") = ?',
      [celularNormalizado, cpfNormalizado]
    );

    if (!cliente) {
      logger.warn(`[LOGIN] Cliente não encontrado: ${celularNormalizado}`);
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Celular ou CPF não encontrados'
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
      {
        id_cliente: cliente.id_cliente,
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`[LOGIN] ✓ Cliente autenticado: ${cliente.nome} (${celularNormalizado})`);

    return res.json({
      sucesso: true,
      token,
      cliente: {
        id_cliente: cliente.id_cliente,
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email
      }
    });
  } catch (error) {
    logger.error(`[LOGIN] Erro: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
}

/**
 * LOGIN COM CPF (legado)
 * POST /auth/cliente/cpf
 * Body: { cpf: string }
 */
export async function loginComCPF(req, res) {
  try {
    const { cpf } = req.body;

    if (!cpf) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF é obrigatório'
      });
    }

    // Validar CPF
    if (!validarCPF(cpf)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido'
      });
    }

    const cpfNormalizado = cpf.replace(/\D/g, '');

    // Buscar cliente
    const cliente = queryOne(
      'SELECT * FROM clientes WHERE REPLACE(REPLACE(cpf, ".", ""), "-", "") = ?',
      [cpfNormalizado]
    );

    if (!cliente) {
      logger.warn(`[LOGIN CPF] Cliente não encontrado: ${cpf}`);
      return res.status(401).json({
        sucesso: false,
        mensagem: 'CPF não encontrado'
      });
    }

    // Retornar token temporário para confirmar identidade
    const tempToken = jwt.sign(
      { id_cliente: cliente.id_cliente, modo: 'confirmar' },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '5m' }
    );

    return res.json({
      sucesso: true,
      tempToken,
      mensagem: 'Confirme os últimos 2 dígitos do CPF',
      ultimosDoisDigitos: cliente.cpf.slice(-2)
    });
  } catch (error) {
    logger.error(`[LOGIN CPF] Erro: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
}

/**
 * CONFIRMAR IDENTIDADE (últimos 2 dígitos do CPF)
 * POST /auth/cliente/confirmar-identidade
 * Body: { tempToken: string, ultimosDoisDigitos: string }
 */
export async function confirmarIdentidade(req, res) {
  try {
    const { tempToken, ultimosDoisDigitos } = req.body;

    if (!tempToken || !ultimosDoisDigitos) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Token temporário e últimos 2 dígitos são obrigatórios'
      });
    }

    // Validar token temporário
    let decoded;
    try {
      decoded = jwt.verify(
        tempToken,
        process.env.JWT_SECRET || 'pluma-jwt-secret-2025'
      );
    } catch (error) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token expirado ou inválido'
      });
    }

    // Buscar cliente
    const cliente = queryOne(
      'SELECT * FROM clientes WHERE id_cliente = ?',
      [decoded.id_cliente]
    );

    if (!cliente) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    // Validar últimos 2 dígitos
    const cpfDigitos = cliente.cpf.replace(/\D/g, '');
    const ultimosDoisDigitosCliente = cpfDigitos.slice(-2);

    if (ultimosDoisDigitos !== ultimosDoisDigitosCliente) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Identidade não confirmada'
      });
    }

    // Gerar token final
    const token = jwt.sign(
      {
        id_cliente: cliente.id_cliente,
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`[CONFIRMAR] ✓ Identidade confirmada: ${cliente.nome}`);

    return res.json({
      sucesso: true,
      token,
      cliente: {
        id_cliente: cliente.id_cliente,
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email
      }
    });
  } catch (error) {
    logger.error(`[CONFIRMAR] Erro: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
}

/**
 * REGISTRAR NOVO CLIENTE
 * POST /auth/cliente/registrar
 * Body: { nome, celular, cpf, email }
 */
export async function registrarCliente(req, res) {
  try {
    const { nome, celular, cpf, email } = req.body;

    // Validações
    if (!nome || !celular || !cpf) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, celular e CPF são obrigatórios'
      });
    }

    if (!validarCPF(cpf)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido'
      });
    }

    const celularNormalizado = normalizarCelular(celular);
    const cpfNormalizado = cpf.replace(/\D/g, '');
    const idCliente = uuidv4();

    // Verificar se celular já existe
    const clienteExistente = queryOne(
      'SELECT id_cliente FROM clientes WHERE REPLACE(REPLACE(whatsapp, " ", ""), "-", "") = ?',
      [celularNormalizado]
    );

    if (clienteExistente) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'Celular já cadastrado'
      });
    }

    // Inserir novo cliente
    const agora = new Date().toISOString();
    const result = run(
      `INSERT INTO clientes (id_cliente, nome, whatsapp, cpf, email, data_primeiro_pedido, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idCliente, nome, celularNormalizado, cpfNormalizado, email || null, agora, agora, agora]
    );

    if (!result.success) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro ao registrar cliente'
      });
    }

    // Gerar token
    const token = jwt.sign(
      {
        id_cliente: idCliente,
        nome: nome,
        whatsapp: celularNormalizado,
        email: email || null
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`[REGISTRAR] ✓ Novo cliente criado: ${nome} (${celularNormalizado})`);

    return res.status(201).json({
      sucesso: true,
      token,
      cliente: {
        id_cliente: idCliente,
        nome: nome,
        whatsapp: celularNormalizado,
        email: email || null
      }
    });
  } catch (error) {
    logger.error(`[REGISTRAR] Erro: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
}

/**
 * VALIDAR TOKEN
 * POST /auth/validar-token
 * Headers: Authorization: Bearer <token>
 */
export function validarToken(req, res) {
  try {
    // req.clienteId e req.clienteInfo já foram setados pelo middleware
    const cliente = queryOne(
      'SELECT * FROM clientes WHERE id_cliente = ?',
      [req.clienteId]
    );

    if (!cliente) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    return res.json({
      sucesso: true,
      cliente: {
        id_cliente: cliente.id_cliente,
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email
      }
    });
  } catch (error) {
    logger.error(`[VALIDAR] Erro: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
}

/**
 * LOGOUT
 * POST /auth/logout
 * Body: { token: string } (opcional)
 */
export function logout(req, res) {
  try {
    // Simplesmente retorna sucesso
    // O token será invalidado no cliente (localStorage)
    return res.json({
      sucesso: true,
      mensagem: 'Logout realizado com sucesso'
    });
  } catch (error) {
    logger.error(`[LOGOUT] Erro: ${error.message}`);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao fazer logout'
    });
  }
}

/**
 * GOOGLE OAUTH - Callback
 * GET /auth/google/callback
 */
export function googleCallback(req, res) {
  try {
    // req.user foi setado pelo passport
    const usuario = req.user;

    if (!usuario) {
      return res.redirect('/?auth=failed');
    }

    // Buscar ou criar cliente com google_id
    let cliente = queryOne(
      'SELECT * FROM clientes WHERE google_id = ?',
      [usuario.id]
    );

    if (!cliente) {
      // Criar novo cliente
      const idCliente = uuidv4();
      const agora = new Date().toISOString();

      run(
        `INSERT INTO clientes (id_cliente, nome, email, google_id, data_primeiro_pedido, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idCliente, usuario.displayName || usuario.emails?.[0]?.value || 'Google User', usuario.emails?.[0]?.value || null, usuario.id, agora, agora, agora]
      );

      cliente = queryOne(
        'SELECT * FROM clientes WHERE id_cliente = ?',
        [idCliente]
      );
    }

    // Gerar token
    const token = jwt.sign(
      {
        id_cliente: cliente.id_cliente,
        nome: cliente.nome,
        email: cliente.email,
        google_id: cliente.google_id
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`[GOOGLE] ✓ Cliente autenticado via Google: ${cliente.nome}`);

    // Redirecionar para portal com token
    res.redirect(`/?token=${token}&auth=success`);
  } catch (error) {
    logger.error(`[GOOGLE] Erro: ${error.message}`);
    res.redirect('/?auth=error');
  }
}
