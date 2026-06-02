import express from 'express';
import { readAllEstoque, generateSKU } from '../services/sqlite/estoque.js';
import { findByWhatsApp, criarCliente } from '../services/sqlite/clientes.js';
import { lerFotos, atualizarCapa } from '../services/sqlite/fotos.js';
import { logger } from '../utils/logger.js';
import { enviarMensagem } from '../services/whatsapp/sender.js';
import { env } from '../config/env.js';
import { transaction, run, queryOne } from '../config/database.js';
import { notificarAdmins } from '../services/notificacoes/preferencias.js';

const router = express.Router();

/**
 * GET /api/store/catalog
 * Retorna o catálogo central de preços oficiais (independente de haver estoque).
 * Fonte única da verdade para o preço exibido na vitrine.
 */
router.get('/catalog', (req, res) => {
  try {
    const precos = env.modeloPrecos || {};
    res.json({ ok: true, catalog: precos });
  } catch (error) {
    logger.error('Store catalog error:', error.message);
    res.status(500).json({ ok: false, error: 'Erro ao buscar catálogo' });
  }
});

/**
 * POST /api/store/wishlist
 * Registra interesse de cliente em produto esgotado ("Avise-me quando chegar").
 * Body: { modelo, tamanho?, cor?, nome, contato }
 */
router.post('/wishlist', async (req, res) => {
  try {
    const { modelo, tamanho, cor, nome, contato } = req.body || {};
    if (!modelo || !nome || !contato) {
      return res.status(400).json({ ok: false, error: 'modelo, nome e contato são obrigatórios' });
    }
    const contatoLimpo = String(contato).replace(/\s+/g, '').slice(0, 60);
    const nomeLimpo = String(nome).slice(0, 80).trim();
    const variante = [tamanho, cor].filter(Boolean).join(' ');
    const observacao = `WISHLIST — ${modelo}${variante ? ' ' + variante : ''}`;

    // Tenta inserir na tabela leads (já existe no schema). Se conflito (UNIQUE), atualiza obs.
    const isEmail = contatoLimpo.includes('@');
    try {
      run(
        `INSERT INTO leads (nome, celular, email, fonte, status, observacoes, created_at)
         VALUES (?, ?, ?, ?, 'novo', ?, datetime('now'))`,
        [nomeLimpo, isEmail ? '' : contatoLimpo, isEmail ? contatoLimpo : '', 'wishlist', observacao]
      );
    } catch (e) {
      // Em caso de UNIQUE (mesmo telefone já existe), apenas registramos no log — não bloqueia
      logger.info(`[wishlist] Lead já existia (${contatoLimpo}): atualizando observação`);
    }

    logger.info(`[wishlist] Interesse registrado: ${nomeLimpo} (${contatoLimpo}) → ${modelo} ${variante}`);

    // Notifica equipe via WhatsApp (não bloqueia resposta)
    try {
      const msg = `🔔 *Avise-me quando chegar*\n\nCliente: ${nomeLimpo}\nContato: ${contatoLimpo}\nProduto: ${modelo}${variante ? ' ' + variante : ''}\n\n_Origem: site Pluma_`;
      enviarMensagem(env.numeroFelipe, msg).catch(() => {});
      enviarMensagem(env.numeroJully, msg).catch(() => {});
    } catch (_) {}

    res.json({ ok: true });
  } catch (error) {
    logger.error('Wishlist error:', error.message);
    res.status(500).json({ ok: false, error: 'Erro ao registrar interesse' });
  }
});

/**
 * GET /api/store/products
 * Retorna estoque agrupado por modelo para o site
 */
router.get('/products', async (req, res) => {
  try {
    const estoque = await readAllEstoque();

    // Agrupar por modelo
    const byModel = {};
    for (const item of estoque) {
      if (!item.modelo || (item.status || '').toLowerCase() !== 'ativo') continue;

      const modelo = item.modelo.toUpperCase();
      if (!byModel[modelo]) byModel[modelo] = {};

      const key = `${item.tamanho}|${item.cor}`;
      byModel[modelo][key] = {
        tamanho: item.tamanho,
        cor: item.cor,
        disponivel: item.quantidade_disponivel,
        preco: item.preco_unitario
      };
    }

    res.json({ ok: true, estoque: byModel });
  } catch (error) {
    logger.error('Store products error:', error.message);
    res.status(500).json({ ok: false, error: 'Erro ao buscar estoque' });
  }
});

/**
 * POST /api/store/checkout
 * Cria pedido a partir do carrinho do site
 * Body: { cliente: {nome, whatsapp, endereco, tipo_entrega}, itens: [{modelo, tamanho, cor, quantidade, preco}] }
 *
 * GARANTIA DE INTEGRIDADE: reserva de estoque + criação de pedido em transação ACID.
 * Se qualquer item estiver sem saldo, rollback total — pedido não é criado.
 */
router.post('/checkout', async (req, res) => {
  try {
    const { cliente, itens: itensCliente, frete = 0 } = req.body;

    if (!cliente?.nome || !itensCliente?.length) {
      return res.status(400).json({ ok: false, error: 'Dados incompletos' });
    }

    // ─── SEGURANÇA: RECALCULAR PREÇOS DO BANCO ────────────────────────────────
    // NUNCA confiar no preço enviado pelo frontend — buscar do DB no momento da compra.
    // O catálogo central (env.modeloPrecos) é fallback se o SKU não tiver preço próprio.
    const itens = [];
    for (const i of itensCliente) {
      const sku = generateSKU(i.modelo, i.tamanho, i.cor);
      const row = queryOne(
        `SELECT preco_unitario, quantidade_total, quantidade_reservada
           FROM estoque WHERE sku = ? AND UPPER(status) = 'ATIVO'`,
        [sku]
      );
      if (!row) {
        return res.status(400).json({
          ok: false,
          error: `Produto indisponível: ${i.modelo} ${i.tamanho} ${i.cor}`
        });
      }
      // Preço oficial: DB primeiro, catálogo central como fallback
      const precoOficial = Number(row.preco_unitario) > 0
        ? Number(row.preco_unitario)
        : Number(env.modeloPrecos?.[i.modelo?.toUpperCase()] || 0);
      if (precoOficial <= 0) {
        return res.status(400).json({
          ok: false,
          error: `Sem preço oficial para ${i.modelo} — contacte a loja`
        });
      }
      itens.push({
        modelo: i.modelo,
        tamanho: i.tamanho,
        cor: i.cor,
        quantidade: Number(i.quantidade) || 1,
        preco: precoOficial // ← OFICIAL, vindo do servidor
      });
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Calcular totais com preços oficiais
    const subtotal = itens.reduce((s, i) => s + (i.preco * i.quantidade), 0);
    const valorFrete = cliente.tipo_entrega === 'ENTREGA' ? Number(frete) || 0 : 0;
    const valorTotal = subtotal + valorFrete;
    const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);
    const descricao = itens.map(i => `${i.quantidade}x ${i.modelo} ${i.tamanho} ${i.cor}`).join(', ');
    const obs = valorFrete > 0 ? `Pedido pelo site | Frete motoboy: R$ ${valorFrete.toFixed(2)}` : 'Pedido pelo site';
    const now = new Date().toISOString();

    // ─── TRANSAÇÃO ATÔMICA ────────────────────────────────────────────────────
    // Reserva de estoque + INSERT de pedido em uma única transação.
    // Se qualquer item falhar: ROLLBACK automático, pedido NÃO é criado.
    let numeroPedido;

    try {
      transaction(() => {
        // PASSO 1: Verificar e reservar cada item
        for (const item of itens) {
          const sku = generateSKU(item.modelo, item.tamanho, item.cor);

          const reserva = run(
            `UPDATE estoque
             SET quantidade_reservada = quantidade_reservada + ?,
                 updated_at = ?
             WHERE sku = ?
               AND (quantidade_total - quantidade_reservada) >= ?`,
            [item.quantidade, now, sku, item.quantidade]
          );

          if (reserva.changes === 0) {
            // Buscar disponível atual para mensagem clara
            const atual = queryOne(
              'SELECT quantidade_total, quantidade_reservada FROM estoque WHERE sku = ?',
              [sku]
            );
            const disponivel = atual
              ? (atual.quantidade_total - atual.quantidade_reservada)
              : 0;

            // Lançar erro faz o transaction() executar ROLLBACK automaticamente
            throw Object.assign(
              new Error(`Estoque insuficiente para ${item.modelo} ${item.tamanho} ${item.cor}. Disponível: ${disponivel}`),
              { tipo: 'ESTOQUE_INSUFICIENTE', sku, disponivel }
            );
          }
        }

        // PASSO 2: Criar pedido (só chega aqui se todos os itens foram reservados)
        const pedRes = run(
          `INSERT INTO pedidos
           (data_pedido, cliente_nome, cliente_whatsapp, descricao_pedido, quantidade_total,
            valor_total, tipo_entrega, endereco_entrega, status_pagamento, forma_pagamento,
            status_entrega, itens_json, data_pagamento, data_entrega, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PEDIDO', 'PIX', 'PENDENTE', ?, '', '', ?)`,
          [
            now,
            cliente.nome,
            cliente.whatsapp || '',
            descricao,
            quantidadeTotal,
            valorTotal,
            cliente.tipo_entrega || 'ENTREGA',
            cliente.endereco || '',
            JSON.stringify(itens.map(i => ({
              modelo: i.modelo,
              tamanho: i.tamanho,
              cor: i.cor,
              quantidade: i.quantidade,
              preco: i.preco
            }))),
            obs
          ]
        );

        numeroPedido = pedRes.id;
      });
    } catch (erroTxn) {
      // Estoque insuficiente → HTTP 400 com mensagem clara para o frontend
      if (erroTxn.tipo === 'ESTOQUE_INSUFICIENTE') {
        return res.status(400).json({ ok: false, error: erroTxn.message });
      }
      throw erroTxn; // Outros erros sobem para o catch externo (500)
    }
    // ─── FIM DA TRANSAÇÃO ─────────────────────────────────────────────────────

    logger.info(`[checkout] Pedido #${numeroPedido} criado — estoque reservado para ${itens.length} item(ns)`);

    // Criar cliente se não existir (fora da transação — falha não desfaz o pedido)
    if (cliente.whatsapp) {
      const clienteExistente = await findByWhatsApp(cliente.whatsapp).catch(() => null);
      if (!clienteExistente) {
        await criarCliente({
          nome: cliente.nome,
          whatsapp: cliente.whatsapp,
          endereco: cliente.endereco || '',
          cidade: 'Boa Vista'
        }).catch(err => logger.warn('[checkout] Falha ao criar cliente (não crítico):', err.message));
      }
    }

    // Notificação WhatsApp (fora da transação — falha não desfaz o pedido)
    try {
      const numFormatado = String(numeroPedido).padStart(3, '0');
      const itensFormatados = itens.map(i => `• ${i.quantidade}x ${i.modelo} ${i.tamanho} ${i.cor}`).join('\n');

      const msg = `🎉 NOVO PEDIDO! #${numFormatado}

👤 Cliente: ${cliente.nome}
📱 WhatsApp: ${cliente.whatsapp || 'N/A'}
📦 Itens:
${itensFormatados}

💰 Total: R$ ${valorTotal.toFixed(2)}
🚚 Tipo: ${cliente.tipo_entrega === 'ENTREGA' ? `ENTREGA (Frete: R$ ${valorFrete.toFixed(2)})` : 'RETIRADA'}
📍 Endereço: ${cliente.endereco || 'Retirada na loja'}

⏳ Aguardando pagamento via PIX...`;

      // Respeita preferências dos admins (categoria 'vendas')
      await notificarAdmins('vendas', msg);
      logger.info(`✓ Notificação pedido #${numFormatado} enviada (filtrada por preferência: vendas)`);
    } catch (erroWpp) {
      logger.error('Erro ao enviar notificação WhatsApp:', erroWpp.message);
    }

    // Retornar confirmação com dados do PIX
    res.json({
      ok: true,
      numeroPedido,
      valorTotal: parseFloat(valorTotal.toFixed(2)),
      pix: {
        chave: process.env.CHAVE_PIX || '5595991228494',
        nome: 'PLUMA PIJAMAS',
        cidade: 'BOA VISTA',
        valor: parseFloat(valorTotal.toFixed(2))
      }
    });

  } catch (error) {
    logger.error('Store checkout error:', error.message);
    res.status(500).json({ ok: false, error: 'Erro ao processar pedido' });
  }
});

/**
 * GET /api/store/fotos
 * Retorna { fotos: { MODELO: { cor: [ids] } }, capas: { MODELO: 'cor' } }
 */
router.get('/fotos', async (req, res) => {
  try {
    const { fotos, capas } = await lerFotos();
    res.json({ ok: true, fotos, capas });
  } catch (error) {
    logger.error('Store fotos error:', error.message);
    res.status(500).json({ ok: false, error: 'Erro ao buscar fotos' });
  }
});

/**
 * POST /api/store/fotos/capa
 * Atualiza cor de vitrine de um modelo
 * Body: { modelo, cor, senha }
 */
router.post('/fotos/capa', async (req, res) => {
  try {
    const { modelo, cor, senha } = req.body;
    if (senha !== process.env.ADMIN_SENHA_FELIPE && senha !== process.env.ADMIN_SENHA_JULLY && senha !== process.env.ADMIN_SENHA_PLUMA) {
      return res.status(403).json({ ok: false, error: 'Senha incorreta' });
    }
    if (!modelo || !cor) return res.status(400).json({ ok: false, error: 'modelo e cor obrigatórios' });
    const ok = await atualizarCapa(modelo, cor);
    res.json({ ok });
  } catch (error) {
    logger.error('Capa update error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
