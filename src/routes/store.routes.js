import express from 'express';
import { readAllEstoque } from '../services/sheets/estoque.js';
import { criarPedido } from '../services/sheets/pedidos.js';
import { findByWhatsApp, criarCliente } from '../services/sheets/clientes.js';
import { lerFotos, inicializarAbaFotos, atualizarCapa } from '../services/sheets/fotos.js';
import { logger } from '../utils/logger.js';
import { enviarMensagem } from '../services/whatsapp/sender.js';
import { env } from '../config/env.js';

// Dados iniciais das fotos (migrados do HTML hardcoded)
const FOTOS_INICIAIS = {
  LIA: {
    'bordô':          ['1rUX0EiZJrxw737wEad4GJxbbkErFtzgE','14brIUGzzGkh5OUT6uK5TPdXOAUFXGbI2','1lMFKetR2nUEtHPOvFD9cUYotmY1TrRMo','1TWH_0f3OBFOcCTK7kYwz9BC4vYoKW5Rn','1elQItb1d5Oq-ryrSjSsWi-QGTXe1k9Cm'],
    'azul marinho':   ['12hRW3UWj23tFehxaFMeB1NS4ncwhVEXu','1qxSyTEbamjJMHuMlNN4e9a7RcxCEk43X','1tQHOGNLtp9NEdnXpRtmsyPfH-aKiMLHg','1q3w8qFfl4wP9NxqrROZSC53L_Agc57iC','1vWGMFfYplfD7vzWKEeIF1EAEWkMiSG9q'],
    'preto':          ['1lrcPJbHQA60x4MHjh2e_QCH0f3N78gyJ','1FzXzTHqIRFlt0cU5DaxzGyhtTAI-Dv1t','1ipkxyocAVdBKfBgi5pZqP16DuzUXBJ_Z','1BSt18-PNP6esptRlHcmDXTx-ml464ObO','1fdrZx7TwWqKI2aJeyQKA1c6JYp_LX6Jm'],
  },
  MIA: {
    'bordô':           ['1U9wQxGB35teVrOE0th7w7khzNU4tPIoe','1-L7zAmCp7ppqnaK4xSymj9FaStXzRUvx','1U_P7xC8rW-MBsBBUGEedcVXlPh2ghYNz','1XAhUwiS6DqRfqijPfrI5J1OsM6tTJqr9','1iSG0RrtRn8Wy-U3KgKYoRk5IjKVhhnMa'],
    'cinza':           ['1A-Sc35U_rVZR0V-Wb-aHydPjsAKr1rCu','190A9EQYqAW3rCPesKbq7uBJz3AEGNg5i','1JStgmDkCapfgvRZJ6CTczX2GYv-k58vQ','1JxqJI18oWaHMTJeL6yA4QgNKzbN4L2qt','1KLkHy9bVMJuY-zeVwtC4RH7BaOJyDh14'],
  },
  NUBIA: {
    'bordô':          ['1hT6ClFOOMBMWmK_2CDKRMQ5ZA_I--W3n','1BhkOWgSqjtqS18tcceOCNowQ52tK8MKP','1LI5SeE4RCJI8pLFhUUh0ql21qWacUn4Y','1BSry7sGAajWWE2YZnnwGFf-gCqzBdqCY','1s-NGB6lcnLmrnhlgBPHR7hOyi7MJcpe-'],
    'azul marinho':   ['1mBILi4m2yxPl1b3FP8XMignePIyQMHP4','1lWOAqGKSmydxm465xEcFQfI5JgbI6SjU','1MdXfwFlCOghUgjjp05FxxuTZiSu971RJ','1N9O0B1vHF6H0yc0kExxAo7NQAuOA2Fpk','1ww_EPNJtUsyTe9P8nwuSa0VeZC3R82Dk'],
    'preto':          ['1a1yoHWzFV6LLVaJqqCAK8MO9Sabz4Pjt','1_IfxEb6LEpKn5jGmDGBsu5r4vDL0OPK3','1UT0jt-V33rHrdilVh1qrdQ8ztv4'],
  },
  ANNE: {
    'bordô':       ['15kLVXqk0hwPZ8PlgShaYMw1-J0t4iLxq','14zCInKIJI_FQEhASKxJFRkAe86sSKevM','1U1a2J1z7L9Y0xZHkSOZ5f94WQU9PDKT-','1cFjk-D3sOWTatCwOT5fEuEa-JBSIG_Qy','1sFDpsAQzFzIu_AkOSCFlHdlzJ2kABXE5','1tXuQ_ZcJAqBtADNfbiuiukuT_XyK03bF'],
    'azul marinho':['17Kbq_4AorrwJDAZmvuMp8udecRfYfiZQ','10a1dnItPax4e1dB6y_Pc8BtAgdnWc8b9','17yEwf-ID9I0aXF7ONDiQPjhPGNDNc5k4','1B-ddPIIf6CjrYatXo2fbsXx6-ci8jAUt','1BLzylhpI5XmT9tpAHMSkLemxvbyxn783'],
    'preto':       ['1I48V85IXIXrQUW-tCU2-7Ej-i0nXNqEu','1DS-e05y7_791qHZa6e6PTKyqoJGMyeGy','1dDDXedhygNIK-L6ISPBGt9q8wL0dRfoM','1hfhcYHqAg5oUyLjcKa_uHw4dHcsToIum','1liW2tph5CKNa6JYEp9HdYP1wu7yjy-CK'],
    'cinza':       ['1KfFa2A-9wPJTNktlthW8lCzmulZacTuv','1Gs8srzvXLAO1GLqjALgz53RQpVqZ_x_I','1Ol7e5wKp4j07bsNYCrw6xFQSu2-Xg7dL','1P--zKdZHMsVMcqrECanSxiPGXzv2QTNL'],
    'verde':       ['1eBk3NsLankr0SR_aKYCdrECiGqoCtjqV','1HVApygvlZ_bjV3kb19TBxNBteZcbK6cV','1nZ-JzGXk_U_McSLzniAWRaFSu4pFpESn'],
  },
  LIVIA: {
    'preto':       ['12gAMGLGKe2dp4t2vO_-QvHpQ-5SsWWp4','1-ln398zyZ-ZlGuo5H1AqllN2uo_APdrf','19B4wiEuCwg1T5HqhoZZ0YvaF5jl14LPx','1MPeN8OkXG1pgIPHOgTfP8eSkrYntOQp7','1YJSBFvttahEda0dYBAPR9wNRRLYCWHdd'],
    'cinza':       ['18YGt-fkjNIR9eY382VLBB_74EJHmUXny','13BU1c86lCZ20gNVjVMN0MxHjGo__flzm','1Ehnt5qSW8M9lqatYCds5fp05t1DNylTe','1MtUzblqNVdkzlv_U4LVffEg8qEC_3Ney','1NsDh0DAzfDU9ZHUYlCBi6M7q1dBm1xuH'],
    'azul marinho':['1Cqf975hXR-_NGYrTh8myL06rJpBEAhq4','188luiOgO3Hpup27Njg6evYFm6GQllr79','1QS8J07X5bg38E8AFEIz-i4mdTIWFgLYs','1aN2tDKxln5fvTAYDRusqUxWpkk8vYiQ6','1ho4A-T2dTYxk3CE7btyestI9b8knpemy'],
  },
  ZARA: {
    'preto':    ['1tAxDrg_ZqwjD_K4UiFRV2ZlpApnkMS3g','1UeDhFiENVIJqF9Rqs7912FdWmyepcihE','18vm-3EeM_WzBnbMM3XygGqcdNa0mJFW0'],
    'bordô':    ['1Ja5a-cqV4lIO687jQSC4CXNStd6kTr4R','112jluSkAegNYXZ9CUMw-JAx_VkPaib5C','1-t5iTBMJUlbWx8sLfOyuqRbquIylE7xP','11dyOM8aT5hbH1PPR8KEBlXR9AE7RhBIU','160TCvSfhAX5GSQRyuQFHFHDNR-9K7EUu','18GJ225pBuwjqqAd-_97JJR1NFpam5TlO'],
    'azul marinho':['17YRiqEgiy2jse0wlK7B55d1DI0mo7t0S','11x8iA8T3r0KPLNVdV4xwpCVQHycvslbE','1Dx-w08Dzo1PH4nrXwVxK1Ul0fFBe18BN','1alfgxtGnLbirUYMcu450KQs2FL2Fhi8g'],
    'cinza':    ['11r5QhIxFGwh7hfc5mJu_XXDqL6NagKo2','10_tFkOEOkW-Fbi9WKMkiOgM8ykxoOAGe','12ys9xdqH3f9l9rzzkK5V_d-sv8kH5jsC','14PRToysJc-LuSvEVZAObOxObDra8Y6_a','14sQ2fMuSFJT2xD9OHUKC9_8DxogaM5Bc'],
  },
  BEATRIZ: {
    'preto':         ['18skw_rNsL7pME73gnNdfo6fhlyXsx34F','16Ag1KaO1GN4aCPahsmfejIeBGEYDme8Z','1Av8NXv-Tt7MPrcB0yMppZfjlFA4i5XdS','1IAXTP4A-2E9WJ8PEpkL3JeZYqr-yLNbd','1-_8sp5_pIMaGOg69Rvry5uHozLliYSMV'],
    'azul marinho':  ['14tkFNhsty4q1pTLDLqZwubWpVHjdgq7t','127FtSItX3hpJPszqEVcvbW3Jl4D17sbo','17bzIU6QJXy_j6iHEhaxL86vfYQdnQu95','18340wnSQnAvZYXXoDfdjDnfLUn_fTTy-','1VfA10CYZxz-ZcOpsUBKDj_luotTpaK5S'],
    'cinza':         ['14-XKcGWnGq9_ZAXvZFK7SdmMu9FZejg9','10UN2mE44ItJF020fYtDhQKjK3KkQFnaZ','1CTvlOeYk82sPYy2vh7pw_vXxvYumVUe2','1GbKT5HYjnA0xg9ISXenTafkiZK-eU7eu','1gikycrCHZUIYn-nc7YP-zIkZbNnuHBIF'],
    'bordô':         [], // ← COLE OS IDs AQUI
  },
};

const router = express.Router();

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
 */
router.post('/checkout', async (req, res) => {
  try {
    const { cliente, itens, frete = 0 } = req.body;

    if (!cliente?.nome || !itens?.length) {
      return res.status(400).json({ ok: false, error: 'Dados incompletos' });
    }

    // Calcular total (subtotal + frete do motoboy se entrega)
    const subtotal = itens.reduce((s, i) => s + (i.preco * i.quantidade), 0);
    const valorFrete = cliente.tipo_entrega === 'ENTREGA' ? Number(frete) || 0 : 0;
    const valorTotal = subtotal + valorFrete;
    const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);

    // Montar descrição
    const descricao = itens.map(i => `${i.quantidade}x ${i.modelo} ${i.tamanho} ${i.cor}`).join(', ');
    const obs = valorFrete > 0 ? `Pedido pelo site | Frete motoboy: R$ ${valorFrete.toFixed(2)}` : 'Pedido pelo site';

    // Criar pedido no Sheets
    const pedidoData = {
      cliente_nome: cliente.nome,
      cliente_whatsapp: cliente.whatsapp || '',
      descricao_pedido: descricao,
      quantidade_total: quantidadeTotal,
      valor_total: valorTotal,
      tipo_entrega: cliente.tipo_entrega || 'ENTREGA',
      endereco_entrega: cliente.endereco || '',
      forma_pagamento: 'PIX',
      itens_json: JSON.stringify(itens.map(i => ({
        modelo: i.modelo,
        tamanho: i.tamanho,
        cor: i.cor,
        quantidade: i.quantidade,
        preco: i.preco
      }))),
      observacoes: obs
    };

    const resultado = await criarPedido(pedidoData);
    if (!resultado.success) {
      return res.status(500).json({ ok: false, error: resultado.error });
    }

    // Criar cliente se não existir
    if (cliente.whatsapp) {
      const clienteExistente = await findByWhatsApp(cliente.whatsapp).catch(() => null);
      if (!clienteExistente) {
        await criarCliente({
          nome: cliente.nome,
          whatsapp: cliente.whatsapp,
          endereco: cliente.endereco || '',
          cidade: 'Boa Vista'
        }).catch(() => {});
      }
    }

    // 🎉 ENVIAR NOTIFICAÇÃO WHATSAPP PARA FELIPE E JÚLLY
    try {
      const numeroPedidoFormatado = String(resultado.numeroPedido).padStart(3, '0');
      const itensFormatados = itens
        .map(i => `• ${i.quantidade}x ${i.modelo} ${i.tamanho} ${i.cor}`)
        .join('\n');

      const mensagemNotificacao = `🎉 NOVO PEDIDO! #${numeroPedidoFormatado}

👤 Cliente: ${cliente.nome}
📱 WhatsApp: ${cliente.whatsapp || 'N/A'}
📦 Itens:
${itensFormatados}

💰 Total: R$ ${valorTotal.toFixed(2)}
🚚 Tipo: ${cliente.tipo_entrega === 'ENTREGA' ? `ENTREGA (Frete: R$ ${valorFrete.toFixed(2)})` : 'RETIRADA'}
📍 Endereço: ${cliente.endereco || 'Retirada na loja'}

⏳ Aguardando pagamento via PIX...`;

      // Enviar para Felipe
      await enviarMensagem(env.numeroFelipe, mensagemNotificacao);

      // Enviar para Júlly
      await enviarMensagem(env.numeroJully, mensagemNotificacao);

      logger.info(`✓ Notificação de novo pedido #${numeroPedidoFormatado} enviada para Felipe e Júlly`);
    } catch (erroWhatsApp) {
      logger.error('Erro ao enviar notificação WhatsApp:', erroWhatsApp.message);
      // NÃO bloquear o checkout se a notificação falhar
    }

    // Retornar dados do PIX
    const chavePix = process.env.CHAVE_PIX || '5595991228494';
    const nomeLoja = 'PLUMA PIJAMAS';
    const cidade = 'BOA VISTA';

    res.json({
      ok: true,
      numeroPedido: resultado.numeroPedido,
      valorTotal: parseFloat(valorTotal.toFixed(2)),
      pix: {
        chave: chavePix,
        nome: nomeLoja,
        cidade,
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

/**
 * POST /api/store/fotos/inicializar
 * Cria a aba FOTOS no Sheets e popula com os dados iniciais (rodar uma vez)
 */
router.post('/fotos/inicializar', async (req, res) => {
  try {
    const ok = await inicializarAbaFotos(FOTOS_INICIAIS);
    res.json({ ok, mensagem: ok ? 'Aba FOTOS criada e populada!' : 'Erro ao criar aba' });
  } catch (error) {
    logger.error('Inicializar fotos error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
