import { query, queryOne, run, obterHistoricoEstoque, registrarAlteracaoEstoque } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { generateSKU } from '../services/sqlite/estoque.js';
import { notificarConsumidores } from '../services/webhooks/estoque.webhooks.js';
import { gerarToken } from '../middleware/jwtAuth.js';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// AUTH (login — rota pública, sem IP whitelist)
// ---------------------------------------------------------------------------

/**
 * Login com autenticação JWT
 * POST /admin/api/auth/login
 * Body: { username, password }
 */
export async function adminLogin(req, res) {
  try {
    console.log('[NEW-CODE-v2-3bc24c7]:', req.body);
    const { username, password, usuario, senha } = req.body;

    // Aceitar ambos os formatos para compatibilidade
    const user = username || usuario;
    const pass = password || senha;

    if (!user || !pass) {
      return res.status(400).json({
        success: false,
        error: 'Username/usuario e password/senha são obrigatórios'
      });
    }

    // Buscar usuário no banco de dados
    const usuarioRecord = queryOne(
      'SELECT id, username, email, senha_hash, ativo FROM admin_usuarios WHERE username = ?',
      [user]
    );

    if (!usuarioRecord) {
      logger.warn(`[admin-login] Usuário não encontrado: ${user}`);
      return res.status(401).json({
        success: false,
        error: 'Credenciais inválidas'
      });
    }

    // Verificar se está ativo
    if (!usuarioRecord.ativo) {
      logger.warn(`[admin-login] Usuário inativo: ${user}`);
      return res.status(403).json({
        success: false,
        error: 'Usuário desativado'
      });
    }

    // Comparar senha com bcrypt
    const senhaValida = await bcrypt.compare(pass, usuarioRecord.senha_hash);
    if (!senhaValida) {
      logger.warn(`[admin-login] Senha incorreta: ${user}`);
      return res.status(401).json({
        success: false,
        error: 'Credenciais inválidas'
      });
    }

    // Gerar token JWT
    const token = gerarToken({
      id: usuarioRecord.id,
      username: usuarioRecord.username,
      email: usuarioRecord.email
    });

    logger.info(`[admin-login] ✓ Login bem-sucedido: ${user}`);

    // Retornar token no formato esperado (compatível com ambas as interfaces)
    return res.json({
      success: true,
      token,
      usuario: {
        id: usuarioRecord.id,
        username: usuarioRecord.username,
        email: usuarioRecord.email
      },
      // Compatibilidade com formato antigo
      nome: usuarioRecord.username,
      role: 'admin'
    });
  } catch (error) {
    logger.error('[admin-login] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar login'
    });
  }
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------

export async function getDashboardStats(req, res) {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString();

    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const semanaISO = inicioSemana.toISOString();

    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
    const ontemISO = new Date(Date.now() - 86400000).toISOString();

    // Vendas por período
    const vendasHoje = queryOne(
      "SELECT COALESCE(SUM(valor_total), 0) as total, COUNT(*) as qtd FROM pedidos WHERE status_pagamento = 'PAGO' AND data_pagamento >= ?",
      [hojeISO]
    );
    const vendasSemana = queryOne(
      "SELECT COALESCE(SUM(valor_total), 0) as total, COUNT(*) as qtd FROM pedidos WHERE status_pagamento = 'PAGO' AND data_pagamento >= ?",
      [semanaISO]
    );
    const vendasMes = queryOne(
      "SELECT COALESCE(SUM(valor_total), 0) as total, COUNT(*) as qtd FROM pedidos WHERE status_pagamento = 'PAGO' AND data_pagamento >= ?",
      [inicioMes]
    );

    // Pedidos pendentes
    const pedidosPendentes = queryOne(
      "SELECT COUNT(*) as qtd FROM pedidos WHERE status_entrega NOT IN ('ENTREGUE', 'RETIRADA_NA_LOJA')"
    );

    // Estoque crítico (disponível <= 3)
    const estoqueCritico = queryOne(
      "SELECT COUNT(*) as qtd FROM estoque WHERE (quantidade_total - quantidade_reservada) <= 3 AND UPPER(status) = 'ATIVO'"
    );
    const estoqueZerado = queryOne(
      "SELECT COUNT(*) as qtd FROM estoque WHERE (quantidade_total - quantidade_reservada) <= 0 AND UPPER(status) = 'ATIVO'"
    );

    // Leads novos (últimas 24h)
    const leadsNovos = queryOne(
      "SELECT COUNT(*) as qtd FROM leads WHERE data_criacao >= ?",
      [ontemISO]
    );

    // Gráfico: últimos 7 dias
    const grafico = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date();
      dia.setDate(dia.getDate() - i);
      dia.setHours(0, 0, 0, 0);
      const diaFim = new Date(dia);
      diaFim.setHours(23, 59, 59, 999);

      const vendaDia = queryOne(
        "SELECT COALESCE(SUM(valor_total), 0) as total FROM pedidos WHERE status_pagamento = 'PAGO' AND data_pagamento >= ? AND data_pagamento <= ?",
        [dia.toISOString(), diaFim.toISOString()]
      );

      grafico.push({
        data: dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        dataISO: dia.toISOString().slice(0, 10),
        total: parseFloat(vendaDia?.total || 0)
      });
    }

    // Últimos 5 pedidos
    const ultimosPedidos = query(
      "SELECT numero_pedido, cliente_nome, valor_total, status_pagamento, status_entrega, data_pedido FROM pedidos ORDER BY numero_pedido DESC LIMIT 5"
    );

    res.json({
      vendas: {
        hoje: { total: parseFloat(vendasHoje?.total || 0), pedidos: parseInt(vendasHoje?.qtd || 0) },
        semana: { total: parseFloat(vendasSemana?.total || 0), pedidos: parseInt(vendasSemana?.qtd || 0) },
        mes: { total: parseFloat(vendasMes?.total || 0), pedidos: parseInt(vendasMes?.qtd || 0) }
      },
      pedidos_pendentes: parseInt(pedidosPendentes?.qtd || 0),
      estoque_critico: parseInt(estoqueCritico?.qtd || 0),
      estoque_zerado: parseInt(estoqueZerado?.qtd || 0),
      leads_novos: parseInt(leadsNovos?.qtd || 0),
      grafico_7dias: grafico,
      ultimos_pedidos: ultimosPedidos
    });
  } catch (error) {
    logger.error('[admin] getDashboardStats:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// ESTOQUE
// ---------------------------------------------------------------------------

export async function getEstoque(req, res) {
  try {
    const { modelo, status = 'ATIVO', critico } = req.query;

    let sql = 'SELECT * FROM estoque WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND UPPER(status) = ?'; params.push(status.toUpperCase()); }
    if (modelo) { sql += ' AND UPPER(modelo) = ?'; params.push(modelo.toUpperCase()); }
    if (critico === 'true') { sql += ' AND (quantidade_total - quantidade_reservada) <= 3'; }

    sql += ' ORDER BY modelo, tamanho, cor';

    const items = query(sql, params).map(row => ({
      ...row,
      quantidade_disponivel: (parseInt(row.quantidade_total) || 0) - (parseInt(row.quantidade_reservada) || 0)
    }));

    res.json({ items, total: items.length });
  } catch (error) {
    logger.error('[admin] getEstoque:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updateEstoqueQuantidade(req, res) {
  try {
    const { sku } = req.params;
    const { quantidade_total } = req.body;

    if (quantidade_total === undefined || isNaN(parseInt(quantidade_total))) {
      return res.status(400).json({ error: 'quantidade_total é obrigatório e deve ser número' });
    }

    const now = new Date().toISOString();
    const novaQtd = parseInt(quantidade_total);

    // Verificar que não é menor que a reservada (normalizar SKU para maiúsculas)
    const skuNormalizado = sku.toUpperCase();
    const item = queryOne('SELECT * FROM estoque WHERE UPPER(sku) = ?', [skuNormalizado]);
    if (!item) return res.status(404).json({ error: 'SKU não encontrado' });

    if (novaQtd < parseInt(item.quantidade_reservada || 0)) {
      return res.status(400).json({ error: `Não pode ser menor que a quantidade reservada (${item.quantidade_reservada})` });
    }

    // Registrar mudança para auditoria
    const mudancas = {
      quantidade_total: { de: item.quantidade_total, para: novaQtd }
    };
    const versionamento = registrarAlteracaoEstoque(item.sku, 'UPDATE', mudancas, req.user?.id || 'admin');

    // Atualizar estoque
    run(
      'UPDATE estoque SET quantidade_total = ?, quantidade_disponivel = ? - quantidade_reservada, data_atualizacao = ?, updated_at = ? WHERE UPPER(sku) = ?',
      [novaQtd, novaQtd, now, now, skuNormalizado]
    );

    // Notificar consumidores via webhooks
    if (versionamento.success) {
      await notificarConsumidores(item.sku, versionamento.versao, {
        operacao: 'UPDATE',
        mudancas,
        usuario_id: req.user?.id || 'admin'
      }).catch(err => logger.error('[webhooks] Erro ao notificar:', err.message));
    }

    res.json({ success: true, sku: item.sku, quantidade_total: novaQtd, versao: versionamento.versao });
  } catch (error) {
    logger.error('[admin] updateEstoqueQuantidade:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updateEstoquePreco(req, res) {
  try {
    const { sku } = req.params;
    const { preco_unitario } = req.body;

    if (!preco_unitario || isNaN(parseFloat(preco_unitario))) {
      return res.status(400).json({ error: 'preco_unitario é obrigatório' });
    }

    const now = new Date().toISOString();
    const skuNormalizado = sku.toUpperCase();
    const novoPreco = parseFloat(preco_unitario);

    // Buscar item atual para registrar mudança
    const item = queryOne('SELECT * FROM estoque WHERE UPPER(sku) = ?', [skuNormalizado]);
    if (!item) return res.status(404).json({ error: 'SKU não encontrado' });

    // Registrar mudança para auditoria
    const mudancas = {
      preco_unitario: { de: item.preco_unitario, para: novoPreco }
    };
    const versionamento = registrarAlteracaoEstoque(item.sku, 'UPDATE', mudancas, req.user?.id || 'admin');

    // Atualizar estoque
    run('UPDATE estoque SET preco_unitario = ?, updated_at = ? WHERE UPPER(sku) = ?',
      [novoPreco, now, skuNormalizado]);

    // Notificar consumidores via webhooks
    if (versionamento.success) {
      await notificarConsumidores(item.sku, versionamento.versao, {
        operacao: 'UPDATE',
        mudancas,
        usuario_id: req.user?.id || 'admin'
      }).catch(err => logger.error('[webhooks] Erro ao notificar:', err.message));
    }

    res.json({ success: true, versao: versionamento.versao });
  } catch (error) {
    logger.error('[admin] updateEstoquePreco:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function createEstoqueItem(req, res) {
  try {
    const { modelo, tamanho, cor, preco_unitario, quantidade_total } = req.body;

    if (!modelo || !tamanho || !cor) {
      return res.status(400).json({ error: 'modelo, tamanho e cor são obrigatórios' });
    }

    const sku = generateSKU(modelo, tamanho, cor);
    const existente = queryOne('SELECT sku FROM estoque WHERE sku = ?', [sku]);
    if (existente) {
      return res.status(409).json({ error: `SKU já existe: ${sku}` });
    }

    const now = new Date().toISOString();
    const qtd = parseInt(quantidade_total) || 0;
    const preco = parseFloat(preco_unitario) || 0;

    // Registrar novo item (INSERT)
    const mudancas = {
      modelo: { de: null, para: modelo.toUpperCase() },
      tamanho: { de: null, para: tamanho.toUpperCase() },
      cor: { de: null, para: cor.toLowerCase() },
      preco_unitario: { de: null, para: preco },
      quantidade_total: { de: null, para: qtd }
    };
    const versionamento = registrarAlteracaoEstoque(sku, 'INSERT', mudancas, req.user?.id || 'admin');

    // Inserir estoque
    run(
      `INSERT INTO estoque (sku, modelo, tamanho, cor, preco_unitario, quantidade_total, quantidade_reservada, quantidade_disponivel, data_atualizacao, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'ATIVO')`,
      [sku, modelo.toUpperCase(), tamanho.toUpperCase(), cor.toLowerCase(), preco, qtd, qtd, now]
    );

    // Notificar consumidores via webhooks
    if (versionamento.success) {
      await notificarConsumidores(sku, versionamento.versao, {
        operacao: 'INSERT',
        mudancas,
        usuario_id: req.user?.id || 'admin'
      }).catch(err => logger.error('[webhooks] Erro ao notificar:', err.message));
    }

    res.status(201).json({ success: true, sku, versao: versionamento.versao });
  } catch (error) {
    logger.error('[admin] createEstoqueItem:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Retorna o histórico de alterações de estoque (audit log)
 * GET /admin/api/estoque/historico?desde_versao=X&limite=100
 */
export async function getEstoqueHistorico(req, res) {
  try {
    const { desde_versao, limite = 100 } = req.query;

    const desdeVersao = desde_versao ? parseInt(desde_versao) : null;
    const limiteNum = Math.min(parseInt(limite) || 100, 500); // Máximo 500

    const resultado = obterHistoricoEstoque(desdeVersao, limiteNum);

    res.json(resultado);
  } catch (error) {
    logger.error('[admin] getEstoqueHistorico:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// PEDIDOS
// ---------------------------------------------------------------------------

export async function getPedidos(req, res) {
  try {
    const { limite = 50, offset = 0, status_pagamento, status_entrega, busca } = req.query;

    let sql = 'SELECT * FROM pedidos WHERE 1=1';
    const params = [];

    if (status_pagamento) { sql += ' AND status_pagamento = ?'; params.push(status_pagamento); }
    if (status_entrega) { sql += ' AND status_entrega = ?'; params.push(status_entrega); }
    if (busca) { sql += ' AND LOWER(cliente_nome) LIKE ?'; params.push(`%${busca.toLowerCase()}%`); }

    // Contar total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = queryOne(countSql, params);
    const total = parseInt(countResult?.total || 0);

    sql += ' ORDER BY numero_pedido DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));

    const pedidos = query(sql, params).map(p => ({
      ...p,
      itens: (() => { try { return JSON.parse(p.itens_json || '[]'); } catch (_) { return []; } })()
    }));

    res.json({ pedidos, total, limite: parseInt(limite), offset: parseInt(offset) });
  } catch (error) {
    logger.error('[admin] getPedidos:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function getPedidoDetalhe(req, res) {
  try {
    const { numero } = req.params;
    const pedido = queryOne('SELECT * FROM pedidos WHERE numero_pedido = ?', [numero]);

    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

    pedido.itens = (() => { try { return JSON.parse(pedido.itens_json || '[]'); } catch (_) { return []; } })();

    res.json(pedido);
  } catch (error) {
    logger.error('[admin] getPedidoDetalhe:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updatePedidoPagamento(req, res) {
  try {
    const { numero } = req.params;
    const { status, forma } = req.body;

    if (!status) return res.status(400).json({ error: 'status é obrigatório' });

    const now = new Date().toISOString();

    run(
      `UPDATE pedidos
       SET status_pagamento = ?,
           data_pagamento = CASE WHEN ? = 'PAGO' THEN ? ELSE data_pagamento END,
           forma_pagamento = COALESCE(?, forma_pagamento),
           updated_at = ?
       WHERE numero_pedido = ?`,
      [status, status, now, forma || null, now, numero]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('[admin] updatePedidoPagamento:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updatePedidoEntrega(req, res) {
  try {
    const { numero } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'status é obrigatório' });

    const now = new Date().toISOString();

    run(
      `UPDATE pedidos
       SET status_entrega = ?,
           data_entrega = CASE WHEN ? IN ('ENTREGUE', 'RETIRADA_NA_LOJA') THEN ? ELSE data_entrega END,
           updated_at = ?
       WHERE numero_pedido = ?`,
      [status, status, now, now, numero]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('[admin] updatePedidoEntrega:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updatePedidoEndereco(req, res) {
  try {
    const { numero } = req.params;
    const { endereco } = req.body;

    if (!endereco) return res.status(400).json({ error: 'endereco é obrigatório' });

    const now = new Date().toISOString();
    run('UPDATE pedidos SET endereco_entrega = ?, updated_at = ? WHERE numero_pedido = ?',
      [endereco, now, numero]);

    res.json({ success: true });
  } catch (error) {
    logger.error('[admin] updatePedidoEndereco:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------

export async function getClientes(req, res) {
  try {
    const { busca, limite = 50, offset = 0 } = req.query;

    let sql = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];

    if (busca) {
      sql += ' AND (LOWER(nome) LIKE ? OR LOWER(whatsapp) LIKE ?)';
      params.push(`%${busca.toLowerCase()}%`, `%${busca.toLowerCase()}%`);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = parseInt(queryOne(countSql, params)?.total || 0);

    sql += ' ORDER BY total_gasto DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));

    const clientes = query(sql, params);
    res.json({ clientes, total });
  } catch (error) {
    logger.error('[admin] getClientes:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function getClienteDetalhe(req, res) {
  try {
    const { id } = req.params;
    const cliente = queryOne('SELECT * FROM clientes WHERE id_cliente = ?', [id]);

    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    // Buscar pedidos do cliente
    const pedidos = query(
      'SELECT * FROM pedidos WHERE cliente_whatsapp = ? ORDER BY numero_pedido DESC',
      [cliente.whatsapp]
    ).map(p => ({
      ...p,
      itens: (() => { try { return JSON.parse(p.itens_json || '[]'); } catch (_) { return []; } })()
    }));

    res.json({ ...cliente, pedidos });
  } catch (error) {
    logger.error('[admin] getClienteDetalhe:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function getClientePedidos(req, res) {
  try {
    const { id } = req.params;
    const cliente = queryOne('SELECT whatsapp FROM clientes WHERE id_cliente = ?', [id]);

    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

    const pedidos = query(
      'SELECT * FROM pedidos WHERE cliente_whatsapp = ? ORDER BY numero_pedido DESC',
      [cliente.whatsapp]
    );

    res.json({ pedidos });
  } catch (error) {
    logger.error('[admin] getClientePedidos:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updateCliente(req, res) {
  try {
    const { id } = req.params;
    const campos = [];
    const params = [];
    const now = new Date().toISOString();

    const editaveis = ['nome', 'email', 'endereco', 'bairro', 'cidade', 'telefone_alternativo', 'observacoes'];
    for (const campo of editaveis) {
      if (req.body[campo] !== undefined) {
        campos.push(`${campo} = ?`);
        params.push(req.body[campo]);
      }
    }

    if (campos.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    campos.push('updated_at = ?');
    params.push(now, id);

    run(`UPDATE clientes SET ${campos.join(', ')} WHERE id_cliente = ?`, params);
    res.json({ success: true });
  } catch (error) {
    logger.error('[admin] updateCliente:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// LEADS
// ---------------------------------------------------------------------------

export async function getLeads(req, res) {
  try {
    const { status, limite = 50, offset = 0 } = req.query;

    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND status = ?'; params.push(status); }

    const total = parseInt(queryOne(sql.replace('SELECT *', 'SELECT COUNT(*) as total'), params)?.total || 0);

    sql += ' ORDER BY data_criacao DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));

    res.json({ leads: query(sql, params), total });
  } catch (error) {
    logger.error('[admin] getLeads:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function updateLeadStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'status é obrigatório' });

    const now = new Date().toISOString();
    run('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('[admin] updateLeadStatus:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// SUPORTE
// ---------------------------------------------------------------------------

export async function getSuporte(req, res) {
  try {
    const { status = 'ABERTO' } = req.query;

    const tickets = query(
      'SELECT * FROM suporte WHERE status = ? ORDER BY data_criacao DESC',
      [status]
    );

    res.json({ tickets, total: tickets.length });
  } catch (error) {
    logger.error('[admin] getSuporte:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function responderSuporte(req, res) {
  try {
    const { id } = req.params;
    const { resposta } = req.body;

    if (!resposta) return res.status(400).json({ error: 'resposta é obrigatória' });

    const now = new Date().toISOString();
    run(
      "UPDATE suporte SET resposta = ?, data_resposta = ?, status = 'RESPONDIDO', updated_at = ? WHERE id = ?",
      [resposta, now, now, id]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('[admin] responderSuporte:', error.message);
    res.status(500).json({ error: error.message });
  }
}
