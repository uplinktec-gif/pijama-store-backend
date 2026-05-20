import { logger } from '../utils/logger.js';
import * as clientesService from '../services/sheets/clientes.js';
import { gerarTokenSessao, validarTokenSessao } from '../utils/sessionTokens.js';
import Joi from 'joi';

/**
 * Validadores
 */
const schemaLoginCPF = Joi.object({
  cpf: Joi.string().required().regex(/^\d{11}$/).messages({
    'string.pattern.base': 'CPF deve conter 11 dígitos'
  })
});

const schemaConfirmarIdentidade = Joi.object({
  cpf: Joi.string().required().regex(/^\d{11}$/),
  ultimos_2_digitos: Joi.string().required().length(2)
});

const schemaCadastro = Joi.object({
  cpf: Joi.string().required().regex(/^\d{11}$/),
  nome: Joi.string().required().min(3),
  celular: Joi.string().required().regex(/^\d{10,11}$/),
  email: Joi.string().optional().email()
});

/**
 * POST /auth/cliente/cpf
 * Login ou cadastro por CPF - primeira etapa
 */
export async function loginComCPF(req, res) {
  try {
    const { error, value } = schemaLoginCPF.validate(req.body);
    if (error) {
      return res.status(400).json({
        sucesso: false,
        mensagem: error.details[0].message
      });
    }

    const { cpf } = value;
    logger.info(`[Auth] Login CPF: ${cpf}`);

    // Buscar cliente por CPF
    const cliente = await clientesService.buscarClientePorCPF(cpf);

    if (!cliente) {
      // Cliente não encontrado - sugerir cadastro
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado',
        acao: 'cadastro',
        cpf
      });
    }

    // Cliente encontrado - pedir confirmação de identidade
    const ultimosDois = cpf.slice(-2);

    return res.status(200).json({
      sucesso: true,
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      telefone: cliente.whatsapp,
      acao: 'confirmar_identidade',
      mensagem: `Confirme os 2 últimos dígitos do seu CPF (${ultimosDois}) para continuar`,
      ultimos_2_digitos: ultimosDois
    });
  } catch (error) {
    logger.error('[Auth] Erro ao fazer login com CPF:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao processar solicitação'
    });
  }
}

/**
 * POST /auth/cliente/confirmar-identidade
 * Confirma identidade do cliente (últimos 2 dígitos do CPF)
 */
export async function confirmarIdentidade(req, res) {
  try {
    const { error, value } = schemaConfirmarIdentidade.validate(req.body);
    if (error) {
      return res.status(400).json({
        sucesso: false,
        mensagem: error.details[0].message
      });
    }

    const { cpf, ultimos_2_digitos } = value;
    logger.info(`[Auth] Confirmando identidade: ${cpf}`);

    // Validar últimos 2 dígitos
    const digitosEsperados = cpf.slice(-2);
    if (ultimos_2_digitos !== digitosEsperados) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Identidade não confirmada. Tente novamente.'
      });
    }

    // Buscar cliente
    const cliente = await clientesService.buscarClientePorCPF(cpf);
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    // Gerar token de sessão
    const token = gerarTokenSessao(cliente.id_cliente, cliente.nome);

    logger.info(`✓ [Auth] Cliente logado: ${cliente.nome}`);

    return res.status(200).json({
      sucesso: true,
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      token,
      ja_tem_telefone: !!cliente.whatsapp,
      precisa_atualizar: !cliente.email
    });
  } catch (error) {
    logger.error('[Auth] Erro ao confirmar identidade:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao processar solicitação'
    });
  }
}

/**
 * POST /auth/cliente/registrar
 * Cadastro novo por CPF
 */
export async function registrarComCPF(req, res) {
  try {
    const { error, value } = schemaCadastro.validate(req.body);
    if (error) {
      return res.status(400).json({
        sucesso: false,
        mensagem: error.details[0].message
      });
    }

    const { cpf, nome, celular, email } = value;
    logger.info(`[Auth] Cadastro novo: ${nome} (CPF: ${cpf})`);

    // Verificar se CPF já existe
    const clienteExistente = await clientesService.buscarClientePorCPF(cpf);
    if (clienteExistente) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'CPF já cadastrado no sistema'
      });
    }

    // Normalizar celular (remover caracteres especiais)
    const celularNormalizado = celular.replace(/\D/g, '');

    // Criar novo cliente
    const resultado = await clientesService.criarCliente({
      nome,
      whatsapp: celularNormalizado,
      email: email || cpf, // Usar CPF como fallback
      observacoes: `CPF: ${cpf} | Cadastro via website`
    });

    if (!resultado.success) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro ao criar conta'
      });
    }

    // Buscar cliente criado
    const cliente = await clientesService.findById(resultado.idCliente);

    // Gerar token
    const token = gerarTokenSessao(cliente.id_cliente, cliente.nome);

    logger.info(`✓ [Auth] Cliente cadastrado: ${nome} (CPF: ${cpf})`);

    return res.status(201).json({
      sucesso: true,
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      token,
      mensagem: 'Cadastro realizado com sucesso!'
    });
  } catch (error) {
    logger.error('[Auth] Erro ao registrar:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar conta'
    });
  }
}

/**
 * GET /auth/google
 * Inicia processo de login com Google
 */
export function iniciarGoogleAuth(req, res) {
  // Será manipulado pelo middleware passport
  logger.info('[Auth] Iniciando Google OAuth');
}

/**
 * GET /auth/google/callback
 * Callback do Google OAuth
 */
export async function googleAuthCallback(req, res) {
  try {
    // Passport já autenticou e preencheu req.user
    if (!req.user) {
      logger.warn('[Auth] Callback Google: usuário não autenticado');
      return res.redirect('/?auth=falhou');
    }

    // Gerar token de sessão
    const token = gerarTokenSessao(req.user.id_cliente, req.user.nome);

    logger.info(`✓ [Auth] Google OAuth bem-sucedido: ${req.user.nome}`);

    // Redirecionar para home com token
    // O frontend pegará o token da sessionStorage (será armazenado pelo cliente)
    return res.redirect(`/?auth=sucesso&token=${token}`);
  } catch (error) {
    logger.error('[Auth] Erro no callback Google:', error.message);
    return res.redirect('/?auth=erro');
  }
}

/**
 * POST /auth/logout
 * Limpar sessão
 */
export async function logout(req, res) {
  try {
    logger.info('[Auth] Logout solicitado');

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Sessão encerrada'
    });
  } catch (error) {
    logger.error('[Auth] Erro ao fazer logout:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao encerrar sessão'
    });
  }
}

/**
 * POST /auth/validar-token
 * Validar se token é válido
 */
export async function validarToken(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        valido: false,
        mensagem: 'Token não fornecido'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = validarTokenSessao(token);

    return res.status(200).json({
      valido: true,
      id_cliente: decoded.id_cliente,
      nome_cliente: decoded.nome_cliente
    });
  } catch (error) {
    logger.debug('[Auth] Token inválido:', error.message);
    return res.status(401).json({
      valido: false,
      mensagem: 'Token inválido ou expirado'
    });
  }
}
