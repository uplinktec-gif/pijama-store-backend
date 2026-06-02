import { query, queryOne, run } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { cancelarPedido, entregarPedido } from '../services/business/pedidos.js';
import { listarPreferencias, atualizarPreferencias } from '../services/notificacoes/preferencias.js';

// Estados de entrega que disparam baixa definitiva no inventário
const ESTADOS_SAIDA_ADMIN = ['ENTREGUE', 'ENVIADO', 'RETIRADA_NA_LOJA'];
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { baixarEstoque, listarLogEstoque, MOTIVOS_BAIXA } from '../services/sqlite/estoque.js';

const JWT_SECRET = () => process.env.JWT_SECRET || 'pluma-jwt-secret-2025';

/**
 * POST /admin/api/auth/login
 * Autentica com username/email + senha → retorna JWT
 */
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ sucesso: false, mensagem: 'Usuário e senha obrigatórios' });
    }

    // Buscar por username ou email
    const usuario = queryOne(
      `SELECT * FROM admin_usuarios WHERE (username = ? OR email = ?) AND ativo = 1`,
      [email, email]
    );

    if (!usuario) {
      logger.warn(`[admin login] Usuário não encontrado: ${email}`);
      return res.status(401).json({ sucesso: false, mensagem: 'Usuário ou senha incorretos' });
    }

    const senhaOk = await bcrypt.compare(password, usuario.senha_hash);
    if (!senhaOk) {
      logger.warn(`[admin login] Senha incorreta para: ${email}`);
      return res.status(401).json({ sucesso: false, mensagem: 'Usuário ou senha incorretos' });
    }

    const token = jwt.sign(
      { id: usuario.id, username: usuario.username, role: 'admin' },
      JWT_SECRET(),
      { expiresIn: '12h' }
    );

    logger.info(`[admin login] ✓ Login: ${usuario.username}`);
    return res.json({ sucesso: true, token, username: usuario.username });
  } catch (err) {
    logger.error('[admin login] Erro:', err.message);
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno' });
  }
}

export async function getDashboardStats(req, res) {
  try {
    // ── Datas no fuso de Boa Vista (UTC-4) ────────────────────────────────
    // strftime com '-4 hours' converte data_pedido (UTC) para hora local BV
    const agoraLocal   = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const hojeStr      = agoraLocal.toISOString().split('T')[0];           // "2026-05-27"
    const semanaStr    = new Date(agoraLocal.getTime() - 7 * 24 * 3600000).toISOString().split('T')[0]; // 7 dias atrás
    const mesStr       = hojeStr.substring(0, 8) + '01';                   // "2026-05-01"

    const FMT = "strftime('%Y-%m-%d', data_pedido, '-4 hours')";

    // Vendas hoje (PAGO, data local)
    const vHoje = query(
      `SELECT COALESCE(SUM(valor_total),0) as total, COUNT(*) as qtd
         FROM pedidos WHERE status_pagamento = 'PAGO' AND ${FMT} = ?`,
      [hojeStr]
    );

    // Vendas semana (últimos 7 dias corridos)
    const vSemana = query(
      `SELECT COALESCE(SUM(valor_total),0) as total
         FROM pedidos WHERE status_pagamento = 'PAGO' AND ${FMT} >= ?`,
      [semanaStr]
    );

    // Vendas mês (mês corrente)
    const vMes = query(
      `SELECT COALESCE(SUM(valor_total),0) as total
         FROM pedidos WHERE status_pagamento = 'PAGO' AND ${FMT} >= ?`,
      [mesStr]
    );

    // Pedidos pendentes (não entregues ainda)
    const pendentes = query(
      `SELECT COUNT(*) as total FROM pedidos
         WHERE status_entrega NOT IN ('ENTREGUE','RETIRADA_NA_LOJA')`
    );

    // Estoque crítico (≤ 3 unidades disponíveis)
    const critico = query(
      `SELECT COUNT(*) as total FROM estoque
         WHERE (quantidade_total - quantidade_reservada) <= 3 AND UPPER(status) = 'ATIVO'`
    );

    // Leads novos hoje
    let leadsNovos = [{ total: 0 }];
    try {
      leadsNovos = query(
        `SELECT COUNT(*) as total FROM leads WHERE status = 'novo'`
      );
    } catch (_) {}

    // Estoque total
    const totalEstoque = query(
      `SELECT COUNT(*) as itens,
              COALESCE(SUM(quantidade_total - quantidade_reservada),0) as pecas
         FROM estoque WHERE UPPER(status) = 'ATIVO'`
    );

    // Gráfico: vendas dos últimos 7 dias agrupadas por data local
    let grafico = [];
    try {
      grafico = query(
        `SELECT ${FMT} as data, COALESCE(SUM(valor_total),0) as total
           FROM pedidos
           WHERE status_pagamento = 'PAGO' AND ${FMT} >= ?
           GROUP BY ${FMT}
           ORDER BY data ASC`,
        [semanaStr]
      );
    } catch (_) {}

    res.json({
      success: true,
      stats: {
        // Campos alinhados com o que o frontend espera
        vendas_hoje:        Number(vHoje[0]?.total)    || 0,
        vendas_semana:      Number(vSemana[0]?.total)  || 0,
        vendas_mes:         Number(vMes[0]?.total)     || 0,
        pedidos_dia:        Number(vHoje[0]?.qtd)      || 0,
        pedidos_pendentes:  Number(pendentes[0]?.total) || 0,
        estoque_critico:    Number(critico[0]?.total)  || 0,
        leads_novos:        Number(leadsNovos[0]?.total) || 0,
        total_skus:         Number(totalEstoque[0]?.itens) || 0,
        total_pecas:        Number(totalEstoque[0]?.pecas) || 0,
        grafico_7dias:      grafico,
        timestamp:          new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('Erro em getDashboardStats:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listEstoque(req, res) {
  try {
    const { modelo, status, critico } = req.query;

    // Modo crítico: cruza Master Grid (modelo×cor)×(P,M,G,GG) com SKUs reais
    // e revela "furos de grade" — tamanhos zerados/inexistentes.
    if (critico === 'true') {
      return listEstoqueCritico(req, res, { modelo });
    }

    let sql = 'SELECT * FROM estoque WHERE 1=1';
    const params = [];
    if (modelo) { sql += ' AND modelo = ?'; params.push(modelo); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY modelo, tamanho, cor';
    const estoque = query(sql, params);
    res.json({ success: true, estoque, total: estoque.length });
  } catch (err) {
    logger.error('Erro em listEstoque:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Modo crítico: gera o Master Grid (todas as combinações modelo+cor existentes
 * cruzadas com a grade P/M/G/GG) e retorna apenas as linhas com disponível ≤ 3.
 *
 * Inclui:
 *  - SKUs reais com (quantidade_total - quantidade_reservada) ≤ 3
 *  - SKUs VIRTUAIS — tamanhos da grade que não têm SKU físico para aquela
 *    combinação modelo+cor (furo de grade, disponível = 0)
 *
 * Ordenação: zerados primeiro (prioridade máxima de reposição).
 */
function listEstoqueCritico(req, res, { modelo }) {
  const tamanhosGrade = env.catalogoTamanhos && env.catalogoTamanhos.length > 0
    ? env.catalogoTamanhos
    : ['P', 'M', 'G', 'GG'];
  const precosCat = env.modeloPrecos || {};
  const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  // 1. Buscar TODAS as combinações (modelo, cor) ativas no banco
  let sqlCombs = `SELECT DISTINCT modelo, cor FROM estoque WHERE UPPER(status) = 'ATIVO'`;
  const paramsC = [];
  if (modelo) { sqlCombs += ' AND modelo = ?'; paramsC.push(modelo); }
  const combinacoes = query(sqlCombs, paramsC);

  // 2. Buscar TODOS os SKUs ativos para lookup rápido
  let sqlReal = `SELECT * FROM estoque WHERE UPPER(status) = 'ATIVO'`;
  const paramsR = [];
  if (modelo) { sqlReal += ' AND modelo = ?'; paramsR.push(modelo); }
  const skusReais = query(sqlReal, paramsR);

  const skuIndex = new Map();
  for (const s of skusReais) {
    const k = `${s.modelo}|${s.tamanho}|${s.cor}`.toUpperCase();
    skuIndex.set(k, s);
  }

  // 3. Master Grid: gera (modelo × cor × tamanho) e cruza com a realidade
  const matriz = [];
  for (const { modelo: m, cor: c } of combinacoes) {
    for (const t of tamanhosGrade) {
      const key = `${m}|${t}|${c}`.toUpperCase();
      const real = skuIndex.get(key);
      if (real) {
        const disponivel = Number(real.quantidade_total || 0) - Number(real.quantidade_reservada || 0);
        if (disponivel <= 3) {
          matriz.push({
            ...real,
            quantidade_disponivel: disponivel,
            virtual: false
          });
        }
      } else {
        // FURO DE GRADE: tamanho que falta para a combinação modelo+cor
        const precoModelo = Number(precosCat[m.toUpperCase()])
                         || Number(precosCat[semAcento(m)])
                         || 0;
        const sku = `${m}_${t}_${c}`.toUpperCase().replace(/\s+/g, '_');
        matriz.push({
          sku,
          modelo: m,
          tamanho: t,
          cor: c,
          preco_unitario: precoModelo,
          quantidade_total: 0,
          quantidade_reservada: 0,
          quantidade_disponivel: 0,
          status: 'ATIVO',
          virtual: true   // ← flag para o frontend identificar furo de grade
        });
      }
    }
  }

  // 4. Ordenar: zerados primeiro (mais críticos), depois por modelo/cor/tamanho
  const ordemTam = { P: 0, M: 1, G: 2, GG: 3 };
  matriz.sort((a, b) => {
    if (a.quantidade_disponivel !== b.quantidade_disponivel) {
      return a.quantidade_disponivel - b.quantidade_disponivel;
    }
    if (a.modelo !== b.modelo) return a.modelo.localeCompare(b.modelo);
    if (a.cor !== b.cor) return a.cor.localeCompare(b.cor);
    return (ordemTam[a.tamanho] ?? 9) - (ordemTam[b.tamanho] ?? 9);
  });

  const furos = matriz.filter(m => m.virtual).length;
  logger.info(`[admin] Crítico: ${matriz.length} item(ns) — ${furos} furo(s) de grade`);
  res.json({ success: true, estoque: matriz, total: matriz.length, furos_de_grade: furos });
}

/**
 * GET /admin/api/catalog
 * Retorna o catálogo central de modelos e preços oficiais
 * Fonte única da verdade para o painel admin (Novo Item)
 */
export async function getCatalog(req, res) {
  try {
    const precos = env.modeloPrecos || {};
    const catalog = Object.entries(precos).map(([modelo, preco]) => ({
      modelo,
      preco_unitario: Number(preco) || 0
    }));
    res.json({
      success: true,
      catalog,
      tamanhos: env.catalogoTamanhos || [],
      cores: env.catalogoCores || []
    });
  } catch (err) {
    logger.error('Erro em getCatalog:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/api/estoque
 * Cria um item de estoque — preço é HERDADO do catálogo central, nunca enviado pelo cliente.
 */
export async function createEstoque(req, res) {
  try {
    const { modelo, tamanho, cor, quantidade_total } = req.body;

    if (!modelo || !tamanho || !cor || quantidade_total == null) {
      return res.status(400).json({ error: 'modelo, tamanho, cor e quantidade_total são obrigatórios' });
    }

    // Preço SEMPRE vem do catálogo central — body.preco_unitario é ignorado
    const modeloKey = modelo.toUpperCase();
    const precoOficial = Number(env.modeloPrecos?.[modeloKey]);
    if (!precoOficial || precoOficial <= 0) {
      return res.status(400).json({
        error: `Modelo "${modelo}" não está no catálogo central. Adicione em MODEL_PRICES antes.`
      });
    }

    const sku = `${modelo}_${tamanho}_${cor}`.toUpperCase().replace(/\s+/g, '_');

    // Se já existir, retornar conflito ao invés de duplicar
    const existente = queryOne('SELECT sku FROM estoque WHERE sku = ?', [sku]);
    if (existente) {
      return res.status(409).json({ error: `SKU ${sku} já cadastrado` });
    }

    const result = run(
      `INSERT INTO estoque
         (sku, modelo, tamanho, cor, preco_unitario, quantidade_total, quantidade_reservada,
          status, data_atualizacao)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'ATIVO', datetime('now'))`,
      [sku, modelo, tamanho, cor, precoOficial, Number(quantidade_total)]
    );
    logger.info(`[admin] Novo SKU ${sku} criado — preço herdado do catálogo: R$ ${precoOficial}`);
    res.json({ success: true, sku, preco_unitario: precoOficial, id: result.id });
  } catch (err) {
    logger.error('Erro em createEstoque:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/api/catalog/sync-precos
 * Atualiza em batch todos os SKUs com os preços oficiais do catálogo central.
 * Usado uma vez para corrigir SKUs antigos com preço errado (ex: 79.90 padrão).
 */
export async function syncPrecosCatalogo(req, res) {
  try {
    const precos = env.modeloPrecos || {};
    const modelos = Object.keys(precos);
    if (modelos.length === 0) {
      return res.status(400).json({ error: 'Catálogo vazio em MODEL_PRICES' });
    }

    // SQLite UPPER() não converte acentos → normalizar em JS.
    const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    const modelosDB = query('SELECT DISTINCT modelo FROM estoque').map(r => r.modelo);

    let atualizados = 0;
    const detalhes = [];
    for (const modelo of modelos) {
      const preco = Number(precos[modelo]);
      if (!preco || preco <= 0) continue;

      const catalogoNorm = semAcento(modelo);
      const variantes = modelosDB.filter(m => semAcento(m) === catalogoNorm);
      let skusAfetados = 0;
      for (const modeloExato of variantes) {
        const result = run(
          `UPDATE estoque SET preco_unitario = ?, data_atualizacao = datetime('now')
           WHERE modelo = ? AND preco_unitario != ?`,
          [preco, modeloExato, preco]
        );
        skusAfetados += Number(result.changes) || 0;
      }
      atualizados += skusAfetados;
      detalhes.push({ modelo, preco, skus_atualizados: skusAfetados, variantes });
    }

    logger.info(`[admin] Sync de preços: ${atualizados} SKU(s) atualizado(s)`);
    res.json({ success: true, atualizados, detalhes });
  } catch (err) {
    logger.error('Erro em syncPrecosCatalogo:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEstoqueQuantidade(req, res) {
  try {
    const { sku } = req.params;
    const { quantidade_total } = req.body;
    run('UPDATE estoque SET quantidade_total = ?, data_atualizacao = datetime("now") WHERE sku = ?', [quantidade_total, sku]);
    res.json({ success: true, sku, quantidade_total });
  } catch (err) {
    logger.error('Erro em updateEstoqueQuantidade:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEstoquePreco(req, res) {
  try {
    const { sku } = req.params;
    const { preco_unitario } = req.body;
    run('UPDATE estoque SET preco_unitario = ?, data_atualizacao = datetime("now") WHERE sku = ?', [preco_unitario, sku]);
    res.json({ success: true, sku, preco_unitario });
  } catch (err) {
    logger.error('Erro em updateEstoquePreco:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/api/estoque/:sku/baixa
 * Baixa manual de estoque com motivo OBRIGATÓRIO + registro no log de auditoria.
 * Body: { quantidade, motivo, observacao? }
 */
export async function baixaEstoque(req, res) {
  try {
    const { sku } = req.params;
    const { quantidade, motivo, observacao } = req.body;

    if (quantidade == null || !motivo) {
      return res.status(400).json({ error: 'quantidade e motivo são obrigatórios' });
    }
    if (!MOTIVOS_BAIXA.includes(motivo)) {
      return res.status(400).json({ error: 'Motivo inválido. Use um dos motivos permitidos.' });
    }

    const usuario = req.adminUser?.username || 'admin';
    const resultado = await baixarEstoque(sku, quantidade, motivo, observacao, usuario);

    if (!resultado.success) {
      return res.status(400).json({ error: resultado.error });
    }
    res.json({ success: true, ...resultado });
  } catch (err) {
    logger.error('Erro em baixaEstoque:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/api/estoque/baixas
 * Relatório de Baixas — histórico do log_estoque (filtros opcionais por query).
 * Também devolve a lista de motivos válidos (fonte única da verdade p/ o front).
 */
export async function listBaixas(req, res) {
  try {
    const { motivo, sku, data_inicio, data_fim, limite } = req.query;
    const baixas = listarLogEstoque({ motivo, sku, data_inicio, data_fim, limite });
    res.json({ success: true, baixas, total: baixas.length, motivos: MOTIVOS_BAIXA });
  } catch (err) {
    logger.error('Erro em listBaixas:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listPedidos(req, res) {
  try {
    const { status_pagamento, status_entrega, busca, limite = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM pedidos WHERE 1=1';
    const params = [];
    if (status_pagamento) { sql += ' AND status_pagamento = ?'; params.push(status_pagamento); }
    if (status_entrega) { sql += ' AND status_entrega = ?'; params.push(status_entrega); }
    if (busca) { sql += ' AND (cliente_nome LIKE ? OR cliente_whatsapp LIKE ?)'; params.push(`%${busca}%`, `%${busca}%`); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));
    const pedidos = query(sql, params);
    res.json({ success: true, pedidos, total: pedidos.length });
  } catch (err) {
    logger.error('Erro em listPedidos:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getPedidoDetail(req, res) {
  try {
    const { numero } = req.params;
    const pedido = query('SELECT * FROM pedidos WHERE numero_pedido = ?', [numero]);
    if (!pedido || pedido.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
    const p = pedido[0];
    try { p.itens = JSON.parse(p.itens_json || '[]'); } catch { p.itens = []; }
    res.json({ success: true, pedido: p });
  } catch (err) {
    logger.error('Erro em getPedidoDetail:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updatePagamento(req, res) {
  try {
    const { numero } = req.params;
    const { status, forma_pagamento } = req.body;
    // GATILHO DE ESTORNO: cancelamento devolve o estoque automaticamente
    if ((status || '').toUpperCase() === 'CANCELADO') {
      const r = await cancelarPedido(parseInt(numero), { usuario: req.adminUser?.username || 'admin' });
      if (!r.success) return res.status(400).json({ error: r.error });
      return res.json({ success: true, numero: parseInt(numero), status: 'CANCELADO', estornado: r.estornado });
    }
    run('UPDATE pedidos SET status_pagamento = ?, forma_pagamento = ?, data_pagamento = datetime("now") WHERE numero_pedido = ?', [status, forma_pagamento, numero]);
    res.json({ success: true, numero, status, forma_pagamento });
  } catch (err) {
    logger.error('Erro em updatePagamento:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEntrega(req, res) {
  try {
    const { numero } = req.params;
    const { status } = req.body;
    // GATILHO DE SAÍDA: entrega/envio/retirada dá baixa definitiva no inventário
    if (ESTADOS_SAIDA_ADMIN.includes((status || '').toUpperCase())) {
      const r = await entregarPedido(parseInt(numero), status.toUpperCase());
      if (!r.success) return res.status(400).json({ error: r.error });
      return res.json({ success: true, numero: parseInt(numero), status, baixado: r.baixado });
    }
    run('UPDATE pedidos SET status_entrega = ?, data_entrega = datetime("now") WHERE numero_pedido = ?', [status, numero]);
    res.json({ success: true, numero, status });
  } catch (err) {
    logger.error('Erro em updateEntrega:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateEndereco(req, res) {
  try {
    const { numero } = req.params;
    const { endereco } = req.body;
    run('UPDATE pedidos SET endereco_entrega = ? WHERE numero_pedido = ?', [endereco, numero]);
    res.json({ success: true, numero, endereco });
  } catch (err) {
    logger.error('Erro em updateEndereco:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function deletePedido(req, res) {
  try {
    const { numero } = req.params;
    const pedido = queryOne('SELECT numero_pedido FROM pedidos WHERE numero_pedido = ?', [numero]);
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    run('DELETE FROM pedidos WHERE numero_pedido = ?', [numero]);
    logger.info(`[admin] Pedido #${numero} excluído`);
    res.json({ success: true, mensagem: `Pedido #${numero} excluído com sucesso` });
  } catch (err) {
    logger.error('Erro em deletePedido:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateStatusPedido(req, res) {
  try {
    const { numero } = req.params;
    const { status_pagamento, status_entrega } = req.body;
    if (!status_pagamento && !status_entrega) {
      return res.status(400).json({ error: 'Informe status_pagamento ou status_entrega' });
    }
    // GATILHO DE ESTORNO: qualquer campo marcado como CANCELADO devolve o estoque
    if ((status_pagamento || '').toUpperCase() === 'CANCELADO' || (status_entrega || '').toUpperCase() === 'CANCELADO') {
      const r = await cancelarPedido(parseInt(numero), { usuario: req.adminUser?.username || 'admin' });
      if (!r.success) return res.status(400).json({ error: r.error });
      logger.info(`[admin] Pedido #${numero} CANCELADO com estorno (${r.estornado?.length || 0} item(ns))`);
      return res.json({ success: true, numero: parseInt(numero), status: 'CANCELADO', estornado: r.estornado });
    }
    if (status_pagamento) {
      run('UPDATE pedidos SET status_pagamento = ?, updated_at = datetime("now") WHERE numero_pedido = ?', [status_pagamento, numero]);
    }
    if (status_entrega) {
      // GATILHO DE SAÍDA: baixa definitiva quando entregue/enviado/retirado
      if (ESTADOS_SAIDA_ADMIN.includes(status_entrega.toUpperCase())) {
        const r = await entregarPedido(parseInt(numero), status_entrega.toUpperCase());
        if (!r.success) return res.status(400).json({ error: r.error });
        logger.info(`[admin] Pedido #${numero} ${status_entrega} — baixa definitiva (${r.baixado?.length || 0} item(ns))`);
      } else {
        run('UPDATE pedidos SET status_entrega = ?, updated_at = datetime("now") WHERE numero_pedido = ?', [status_entrega, numero]);
      }
    }
    logger.info(`[admin] Pedido #${numero} status atualizado`);
    res.json({ success: true, numero: parseInt(numero), status_pagamento, status_entrega });
  } catch (err) {
    logger.error('Erro em updateStatusPedido:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** GET /admin/api/notificacoes/preferencias */
export async function getPreferenciasNotificacao(req, res) {
  try {
    res.json({ success: true, ...listarPreferencias() });
  } catch (err) {
    logger.error('Erro em getPreferenciasNotificacao:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** PATCH /admin/api/notificacoes/preferencias/:whatsapp  body: {vendas,logistica,estoque,financeiro} */
export async function setPreferenciaNotificacao(req, res) {
  try {
    const { whatsapp } = req.params;
    const r = atualizarPreferencias(whatsapp, req.body || {});
    if (!r.success) return res.status(400).json({ error: r.error });
    res.json(r);
  } catch (err) {
    logger.error('Erro em setPreferenciaNotificacao:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listClientes(req, res) {
  try {
    const { busca, limite = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];
    if (busca) { sql += ' AND (nome LIKE ? OR whatsapp LIKE ?)'; params.push(`%${busca}%`, `%${busca}%`); }
    sql += ' ORDER BY total_gasto DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));
    const clientes = query(sql, params);
    res.json({ success: true, clientes, total: clientes.length });
  } catch (err) {
    logger.error('Erro em listClientes:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getClienteDetail(req, res) {
  try {
    const { id } = req.params;
    const cliente = query('SELECT * FROM clientes WHERE id_cliente = ?', [id]);
    if (!cliente || cliente.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json({ success: true, cliente: cliente[0] });
  } catch (err) {
    logger.error('Erro em getClienteDetail:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getClientePedidos(req, res) {
  try {
    const { id } = req.params;
    const pedidos = query('SELECT * FROM pedidos WHERE id_cliente = ? ORDER BY data_pedido DESC', [id]);
    res.json({ success: true, pedidos, total: pedidos.length });
  } catch (err) {
    logger.error('Erro em getClientePedidos:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function listLeads(req, res) {
  try {
    const { status, limite = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), parseInt(offset));
    const leads = query(sql, params);
    res.json({ success: true, leads, total: leads.length });
  } catch (err) {
    logger.error('Erro em listLeads:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function updateLeadStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    run('UPDATE leads SET status = ? WHERE id_lead = ?', [status, id]);
    res.json({ success: true, id, status });
  } catch (err) {
    logger.error('Erro em updateLeadStatus:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export default { getDashboardStats, getCatalog, syncPrecosCatalogo, listEstoque, createEstoque, updateEstoqueQuantidade, updateEstoquePreco, listPedidos, getPedidoDetail, updatePagamento, updateEntrega, updateEndereco, listClientes, getClienteDetail, getClientePedidos, listLeads, updateLeadStatus };
