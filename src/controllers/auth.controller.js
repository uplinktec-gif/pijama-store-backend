import jwt from 'jsonwebtoken';
import * as clientesService from '../services/sqlite/clientes.js';
import * as leadsService from '../services/sqlite/leads.js';
import { validarCPF, normalizarCelular } from '../middleware/authMiddleware.js';
import { logger } from '../utils/logger.js';
import { enviarMensagem } from '../services/whatsapp/sender.js';
import { query } from '../config/database.js';

/**
 * Envia notificação para Felipe quando novo cliente se cadastra
 */
async function enviarNotificacaoNovoCliente(nome, whatsapp, email) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) return;

  const mensagem = `
📝 *NOVO CLIENTE CADASTRADO NO SITE!*

👤 ${nome}
📱 ${whatsapp}
📧 ${email || 'N/A'}

Link para contato: https://wa.me/${whatsapp.replace(/\D/g, '')}
`.trim();

  try {
    await enviarMensagem(numeroFelipe, mensagem);
    logger.info(`[notif-cadastro] Notificação enviada para Felipe: ${nome}`);
  } catch (error) {
    logger.error('[notif-cadastro] Erro ao enviar notificação:', error.message);
  }
}

/**
 * LOGIN COM CELULAR + CPF (novo sistema)
 * POST /auth/cliente/login
 * Body: { celular: "95987654321", cpf: "12345678901" }
 */
export async function loginCelularCpf(req, res) {
  try {
    const { celular, cpf } = req.body;

    // Validar celular
    const celularNorm = (celular || '').replace(/\D/g, '');
    if (!celularNorm || celularNorm.length < 10) {
      return res.status(400).json({ sucesso: false, mensagem: 'Celular inválido. Use DDD + número (ex: 95987654321)' });
    }

    // Validar CPF
    const cpfNorm = (cpf || '').replace(/\D/g, '');
    if (!cpfNorm || cpfNorm.length !== 11) {
      return res.status(400).json({ sucesso: false, mensagem: 'CPF inválido. Use 11 dígitos.' });
    }

    // Buscar cliente pelo celular — tenta várias variações do número
    // Ex: "95987654321" pode estar como "95987654321" ou "5595987654321"
    const variantes = [
      celularNorm,
      '55' + celularNorm,
      celularNorm.startsWith('55') ? celularNorm.slice(2) : null
    ].filter(Boolean);

    let cliente = null;
    for (const variante of variantes) {
      const rows = query('SELECT * FROM clientes WHERE whatsapp = ?', [variante]);
      if (rows.length > 0) { cliente = rows[0]; break; }
    }

    if (!cliente) {
      return res.status(404).json({ sucesso: false, mensagem: 'Celular não encontrado. Verifique o número ou crie uma conta.' });
    }

    // Validar CPF
    const cpfCadastrado = (cliente.cpf || '').replace(/\D/g, '');
    if (!cpfCadastrado) {
      return res.status(401).json({ sucesso: false, mensagem: 'Conta sem CPF cadastrado. Acesse pelo Gmail ou fale conosco.' });
    }

    if (cpfCadastrado !== cpfNorm) {
      logger.warn(`[login] CPF incorreto para celular ${celularNorm.slice(-4)}`);
      return res.status(401).json({ sucesso: false, mensagem: 'CPF incorreto.' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { id_cliente: cliente.id_cliente, nome_cliente: cliente.nome, whatsapp: cliente.whatsapp, email: cliente.email },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`[login] Cliente autenticado via celular: ${cliente.nome}`);

    return res.status(200).json({
      sucesso: true,
      token,
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      whatsapp: cliente.whatsapp,
      email: cliente.email
    });

  } catch (error) {
    logger.error('[login] Erro:', error.message);
    return res.status(500).json({ sucesso: false, mensagem: 'Erro no servidor' });
  }
}

/**
 * LOGIN COM CPF (legado - mantido para compatibilidade)
 * POST /auth/cliente/cpf
 * Body: { cpf: "12345678900" }
 */
export async function loginComCPF(req, res) {
  try {
    const { cpf } = req.body;

    if (!cpf || !validarCPF(cpf)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido'
      });
    }

    // Buscar cliente por CPF
    const cliente = await clientesService.findByCPF(cpf.replace(/\D/g, ''));
    
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado. Deseja se cadastrar?'
      });
    }

    // Retornar dados para confirmação de identidade
    const ultimos2 = cpf.slice(-2);
    return res.status(200).json({
      sucesso: true,
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      ja_tem_telefone: !!cliente.whatsapp,
      precisa_confirmar_identidade: true,
      ultimos_2_cpf: ultimos2
    });

  } catch (error) {
    logger.error('Erro ao fazer login com CPF:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro no servidor'
    });
  }
}

/**
 * CONFIRMAR IDENTIDADE
 * POST /auth/cliente/confirmar-identidade
 * Body: { cpf: "12345678900", ultimos_2_digitos: "00" }
 */
export async function confirmarIdentidade(req, res) {
  try {
    const { cpf, ultimos_2_digitos } = req.body;

    if (!cpf || !validarCPF(cpf)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido'
      });
    }

    // Validar últimos 2 dígitos
    if (cpf.slice(-2) !== ultimos_2_digitos) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Identidade não confirmada. Dígitos incorretos.'
      });
    }

    // Buscar cliente
    const cliente = await clientesService.findByCPF(cpf.replace(/\D/g, ''));
    
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    // Gerar JWT token
    const token = jwt.sign(
      {
        id_cliente: cliente.id_cliente,
        nome_cliente: cliente.nome,
        whatsapp: cliente.whatsapp,
        email: cliente.email
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`Cliente autenticado: ${cliente.nome} (${cpf})`);

    return res.status(200).json({
      sucesso: true,
      token,
      id_cliente: cliente.id_cliente,
      nome: cliente.nome,
      whatsapp: cliente.whatsapp,
      email: cliente.email
    });

  } catch (error) {
    logger.error('Erro ao confirmar identidade:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro no servidor'
    });
  }
}

/**
 * REGISTRAR NOVO CLIENTE
 * POST /auth/cliente/registrar
 * Body: { cpf, nome, celular, email }
 */
export async function registrarCliente(req, res) {
  try {
    const { cpf, nome, celular, email } = req.body;

    // Validações
    if (!cpf || !validarCPF(cpf)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'CPF inválido'
      });
    }

    if (!nome || nome.length < 3) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome deve ter pelo menos 3 caracteres'
      });
    }

    if (!celular || (celular.replace(/\D/g, '').length < 10 || celular.replace(/\D/g, '').length > 11)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Celular inválido'
      });
    }

    // Verificar se CPF já existe
    const cpfNumero = cpf.replace(/\D/g, '');
    const clienteExistente = await clientesService.findByCPF(cpfNumero);
    
    if (clienteExistente) {
      return res.status(409).json({
        sucesso: false,
        mensagem: 'CPF já cadastrado no sistema'
      });
    }

    // Normalizar celular
    const whatsappNumero = normalizarCelular(celular);

    // Criar cliente
    const resultado = await clientesService.criarCliente({
      cpf: cpfNumero,
      nome,
      whatsapp: whatsappNumero,
      email: email || ''
    });

    if (!resultado.success) {
      return res.status(500).json({
        sucesso: false,
        mensagem: resultado.error || 'Erro ao criar cliente'
      });
    }

    // Criar entrada em LEADS
    const leadResultado = await leadsService.criarLead(
      nome,
      whatsappNumero,
      email || '',
      'site_cadastro'
    );

    if (!leadResultado.success) {
      logger.warn(`[AUTH] Aviso ao criar lead para ${nome}: ${leadResultado.error}`);
      // Não falhar o registro se o lead não for criado, apenas avisar
    } else {
      // Notificar Felipe sobre novo cadastro no site
      enviarNotificacaoNovoCliente(nome, whatsappNumero, email).catch(e =>
        logger.warn('[notif-cadastro] Erro ao notificar:', e.message)
      );
    }

    // Gerar JWT token
    const token = jwt.sign(
      {
        id_cliente: resultado.idCliente,
        nome_cliente: nome,
        whatsapp: whatsappNumero,
        email: email || ''
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    logger.info(`Novo cliente registrado: ${nome} (${cpfNumero})`);

    return res.status(201).json({
      sucesso: true,
      token,
      id_cliente: resultado.idCliente,
      nome,
      whatsapp: whatsappNumero,
      email: email || ''
    });

  } catch (error) {
    logger.error('Erro ao registrar cliente:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro no servidor'
    });
  }
}

/**
 * VALIDAR TOKEN
 * POST /auth/validar-token
 * Headers: Authorization: Bearer TOKEN
 */
export async function validarToken(req, res) {
  try {
    // Se chegou aqui, o middleware já validou o token
    const cliente = await clientesService.findById(req.clienteId);
    
    if (!cliente) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Cliente não encontrado'
      });
    }

    return res.status(200).json({
      sucesso: true,
      id_cliente: cliente.id_cliente,
      nome_cliente: cliente.nome,
      whatsapp: cliente.whatsapp,
      email: cliente.email
    });

  } catch (error) {
    logger.error('Erro ao validar token:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro no servidor'
    });
  }
}

/**
 * LOGOUT
 * POST /auth/logout
 */
export async function logout(req, res) {
  try {
    // Token é gerenciado no frontend (sessionStorage)
    // Servidor apenas confirma logout
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Logout realizado com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao fazer logout:', error.message);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro no servidor'
    });
  }
}

/**
 * GOOGLE OAUTH CALLBACK
 * GET /auth/google/callback
 */
export async function googleCallback(req, res) {
  try {
    const { id, displayName, emails } = req.user;
    const email = emails?.[0]?.value || '';

    // Buscar ou criar cliente
    let cliente = await clientesService.findByGoogleId(id);
    
    if (!cliente) {
      // Criar novo cliente
      const resultado = await clientesService.criarCliente({
        nome: displayName,
        email,
        google_id: id,
        fonte_registro: 'google_oauth'
      });

      if (!resultado.success) {
        return res.redirect('/?auth=failed&error=create');
      }

      cliente = {
        id_cliente: resultado.idCliente,
        nome: displayName,
        email,
        google_id: id
      };

      // Nota: Para Google OAuth, o celular será capturado no checkout
      // Por enquanto, não criamos lead sem celular (campo obrigatório)
      logger.info(`[AUTH] Novo cliente Google OAuth criado (sem celular): ${displayName} (${email})`);
    } else {
      logger.info(`[AUTH] Cliente existente Google OAuth: ${cliente.nome}`);
    }

    // Gerar JWT token
    const token = jwt.sign(
      {
        id_cliente: cliente.id_cliente,
        nome_cliente: cliente.nome,
        email: cliente.email
      },
      process.env.JWT_SECRET || 'pluma-jwt-secret-2025',
      { expiresIn: '7d' }
    );

    // Redirecionar para home com token
    res.redirect(`/?auth=success&token=${token}&name=${encodeURIComponent(cliente.nome)}`);

  } catch (error) {
    logger.error('Erro no callback Google:', error.message);
    res.redirect('/?auth=failed&error=callback');
  }
}
