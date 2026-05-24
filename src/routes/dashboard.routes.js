import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { listarTodosPendentes } from '../services/sqlite/pedidos.js';
import { readAllEstoque } from '../services/sqlite/estoque.js';

const router = Router();

const DASHBOARD_KEY = 'pluma2025';

router.get('/', async (req, res) => {
  if (req.query.key !== DASHBOARD_KEY) {
    return res.status(401).send(`<!DOCTYPE html>
<html><head><title>Acesso negado</title>
<style>body{background:#0d0d0d;color:#ff4444;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}h1{font-size:2rem;}</style>
</head><body><h1>401 — Acesso negado</h1></body></html>`);
  }

  try {
    const [todosPendentes, estoqueCompleto] = await Promise.all([
      listarTodosPendentes(),
      readAllEstoque()
    ]);

    const hoje = new Date().toISOString().slice(0, 10);

    // Pedidos criados hoje
    const pedidosHoje = todosPendentes.filter(p =>
      p.data_pedido && p.data_pedido.startsWith(hoje)
    );

    // Resumo de estoque por modelo (apenas itens com quantidade > 0)
    const resumoEstoque = {};
    estoqueCompleto
      .filter(i => i.quantidade_disponivel > 0)
      .forEach(i => {
        const chave = i.modelo;
        if (!resumoEstoque[chave]) {
          resumoEstoque[chave] = { modelo: chave, total: 0, variantes: [] };
        }
        resumoEstoque[chave].total += i.quantidade_disponivel;
        resumoEstoque[chave].variantes.push({
          sku: i.sku,
          tamanho: i.tamanho,
          cor: i.cor,
          disponivel: i.quantidade_disponivel
        });
      });

    const estoqueOrdenado = Object.values(resumoEstoque).sort((a, b) => a.modelo.localeCompare(b.modelo));

    const dataHoraAtual = new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pluma Pijamas — Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d;
      color: #e0e0e0;
      font-family: 'Courier New', Courier, monospace;
      min-height: 100vh;
      padding: 24px;
    }
    header {
      border-bottom: 1px solid #333;
      padding-bottom: 16px;
      margin-bottom: 32px;
    }
    header h1 {
      font-size: 1.6rem;
      color: #f0c040;
      letter-spacing: 2px;
    }
    header p {
      color: #666;
      font-size: 0.85rem;
      margin-top: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }
    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 20px;
    }
    .card h2 {
      font-size: 0.9rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .stat {
      font-size: 2.4rem;
      font-weight: bold;
      color: #f0c040;
    }
    .stat-label {
      font-size: 0.8rem;
      color: #555;
      margin-top: 4px;
    }
    section {
      margin-bottom: 40px;
    }
    section > h2 {
      font-size: 1rem;
      color: #aaa;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      border-left: 3px solid #f0c040;
      padding-left: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    th {
      text-align: left;
      background: #1a1a1a;
      color: #888;
      padding: 8px 12px;
      border-bottom: 1px solid #2a2a2a;
      font-weight: normal;
      letter-spacing: 0.5px;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid #1e1e1e;
      vertical-align: top;
    }
    tr:hover td { background: #161616; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
    }
    .badge-pago { background: #1a3a1a; color: #4caf50; }
    .badge-pendente { background: #3a2a10; color: #ff9800; }
    .badge-pedido { background: #1a2a3a; color: #64b5f6; }
    .badge-low { background: #3a1a1a; color: #f44336; }
    .empty { color: #444; font-style: italic; padding: 16px 0; }
    details { margin-top: 4px; }
    summary { cursor: pointer; color: #666; font-size: 0.8rem; }
    summary:hover { color: #aaa; }
    .variant-list { padding: 6px 0 0 12px; }
    .variant-item { font-size: 0.78rem; color: #777; line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <h1>🛍️ PLUMA PIJAMAS</h1>
    <p>Atualizado em ${dataHoraAtual}</p>
  </header>

  <div class="grid">
    <div class="card">
      <h2>Pedidos Hoje</h2>
      <div class="stat">${pedidosHoje.length}</div>
      <div class="stat-label">criados em ${hoje}</div>
    </div>
    <div class="card">
      <h2>Pendentes (total)</h2>
      <div class="stat">${todosPendentes.length}</div>
      <div class="stat-label">não entregues / não retirados</div>
    </div>
    <div class="card">
      <h2>Modelos em Estoque</h2>
      <div class="stat">${estoqueOrdenado.length}</div>
      <div class="stat-label">modelos com disponibilidade &gt; 0</div>
    </div>
  </div>

  <section>
    <h2>Pedidos de Hoje</h2>
    ${pedidosHoje.length === 0
      ? `<p class="empty">Nenhum pedido criado hoje.</p>`
      : `<table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cliente</th>
          <th>Descrição</th>
          <th>Valor</th>
          <th>Pagamento</th>
          <th>Entrega</th>
        </tr>
      </thead>
      <tbody>
        ${pedidosHoje.map(p => `
        <tr>
          <td>#${p.numero_pedido}</td>
          <td>${escapeHtml(p.cliente_nome || '—')}</td>
          <td>${escapeHtml(p.descricao_pedido || '—')}</td>
          <td>R$ ${(p.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          <td><span class="badge ${badgeClassPagamento(p.status_pagamento)}">${p.status_pagamento || 'PEDIDO'}</span></td>
          <td>${escapeHtml(p.tipo_entrega || '—')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`}
  </section>

  <section>
    <h2>Todos os Pendentes</h2>
    ${todosPendentes.length === 0
      ? `<p class="empty">Nenhum pedido pendente.</p>`
      : `<table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cliente</th>
          <th>Descrição</th>
          <th>Valor</th>
          <th>Pagamento</th>
          <th>Entrega</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${todosPendentes.map(p => `
        <tr>
          <td>#${p.numero_pedido}</td>
          <td>${escapeHtml(p.cliente_nome || '—')}</td>
          <td>${escapeHtml(p.descricao_pedido || '—')}</td>
          <td>R$ ${(p.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          <td><span class="badge ${badgeClassPagamento(p.status_pagamento)}">${p.status_pagamento || 'PEDIDO'}</span></td>
          <td>${escapeHtml(p.tipo_entrega || '—')}</td>
          <td>${formatarData(p.data_pedido)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`}
  </section>

  <section>
    <h2>Estoque por Modelo</h2>
    ${estoqueOrdenado.length === 0
      ? `<p class="empty">Nenhum item em estoque.</p>`
      : `<table>
      <thead>
        <tr>
          <th>Modelo</th>
          <th>Total disponível</th>
          <th>Variantes</th>
        </tr>
      </thead>
      <tbody>
        ${estoqueOrdenado.map(e => `
        <tr>
          <td><strong>${escapeHtml(e.modelo)}</strong></td>
          <td>${e.total} un${e.total <= 5 ? ` <span class="badge badge-low">baixo</span>` : ''}</td>
          <td>
            <details>
              <summary>${e.variantes.length} variante(s)</summary>
              <div class="variant-list">
                ${e.variantes.map(v => `<div class="variant-item">• ${escapeHtml(v.tamanho)} / ${escapeHtml(v.cor)}: ${v.disponivel} un</div>`).join('')}
              </div>
            </details>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`}
  </section>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('[dashboard] Erro ao gerar dashboard:', error.message);
    res.status(500).send(`<!DOCTYPE html>
<html><head><title>Erro</title>
<style>body{background:#0d0d0d;color:#ff4444;font-family:monospace;padding:40px;}</style>
</head><body><h1>500 — Erro ao carregar dashboard</h1><pre>${escapeHtml(error.message)}</pre></body></html>`);
  }
});

function badgeClassPagamento(status) {
  if (!status || status === 'PEDIDO') return 'badge-pedido';
  if (status === 'PAGO') return 'badge-pago';
  return 'badge-pendente';
}

function formatarData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
