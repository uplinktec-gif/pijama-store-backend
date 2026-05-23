// =========================================================
// Pluma Admin — admin.js
// =========================================================

const API = '/admin/api';
let paginaPedidos = 0;
let paginaClientes = 0;
const LIMITE = 50;

// ─────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('admin_token');
}

function setToken(token) {
  localStorage.setItem('admin_token', token);
}

function clearToken() {
  localStorage.removeItem('admin_token');
}

function isAuthenticated() {
  return !!getToken();
}

async function fazerLogin(usuario, senha) {
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Credenciais inválidas');
    }

    const data = await res.json();
    setToken(data.token);
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('menu-toggle').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
    showToast(`Bem-vindo, ${data.nome}!`, 'success');
    loadDashboard();
    return true;
  } catch (error) {
    showToast('Erro: ' + error.message, 'error');
    return false;
  }
}

function fazerLogout() {
  clearToken();
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('content').classList.add('hidden');
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('menu-toggle').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
  document.getElementById('login-usuario').value = '';
  document.getElementById('login-senha').value = '';
  showToast('Logout realizado', 'success');
}

// ─────────────────────────────────────────────
// CORE: apiFetch, navegação, toast, debounce
// ─────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API}${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  // Se token expirou (401), fazer logout
  if (res.status === 401) {
    clearToken();
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('content').classList.add('hidden');
    showToast('Sessão expirada. Faça login novamente.', 'error');
    throw new Error('Sessão expirada');
  }

  if (res.status === 403) {
    showToast('Acesso negado (IP não autorizado)', 'error');
    throw new Error('Acesso negado');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }

  return res.json();
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.remove('hidden');

  const link = document.querySelector(`.nav-link[data-section="${name}"]`);
  if (link) link.classList.add('active');

  // Carregar dados da seção
  const loaders = {
    dashboard: loadDashboard,
    pedidos: carregarPedidos,
    estoque: carregarEstoque,
    clientes: carregarClientes,
    leads: carregarLeads,
    suporte: carregarSuporte
  };
  if (loaders[name]) loaders[name]();

  // Fechar sidebar no mobile
  document.getElementById('sidebar').classList.remove('open');
}

function showToast(msg, tipo = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function debounce(fn, ms = 350) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

const debounceCarregarPedidos = debounce(carregarPedidos);
const debounceCarregarClientes = debounce(carregarClientes);

function formatarMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function badgePagamento(status) {
  const map = {
    'PAGO': 'badge-verde',
    'PEDIDO': 'badge-amarelo',
    'CANCELADO': 'badge-vermelho'
  };
  const labels = { 'PAGO': '✅ Pago', 'PEDIDO': '⏳ Aguard.', 'CANCELADO': '❌ Cancel.' };
  return `<span class="badge ${map[status] || 'badge-cinza'}">${labels[status] || status}</span>`;
}

function badgeEntrega(status) {
  const map = {
    'ENTREGUE': 'badge-verde',
    'RETIRADA_NA_LOJA': 'badge-azul',
    'EM_TRANSITO': 'badge-laranja',
    'PENDENTE': 'badge-amarelo'
  };
  const labels = {
    'ENTREGUE': '✅ Entregue',
    'RETIRADA_NA_LOJA': '🏪 Retirada',
    'EM_TRANSITO': '🚚 Em trânsito',
    'PENDENTE': '📦 Pendente'
  };
  return `<span class="badge ${map[status] || 'badge-cinza'}">${labels[status] || status}</span>`;
}

function badgeStatusLead(status) {
  const map = { novo: 'badge-azul', visitante: 'badge-cinza', cliente: 'badge-rosa', vip: 'badge-amarelo' };
  const icons = { novo: '🆕', visitante: '👁️', cliente: '🛍️', vip: '⭐' };
  return `<span class="badge ${map[status] || 'badge-cinza'}">${icons[status] || ''} ${status}</span>`;
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

async function loadDashboard() {
  document.getElementById('dashboard-cards').innerHTML =
    Array(4).fill('<div class="card skeleton"></div>').join('');

  try {
    const data = await apiFetch('/dashboard/stats');
    renderDashboardCards(data);
    renderBarChart(data.grafico_7dias || []);
    renderUltimosPedidos(data.ultimos_pedidos || []);

    document.getElementById('last-update').textContent =
      'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
  } catch (e) {
    showToast('Erro ao carregar dashboard: ' + e.message, 'error');
  }
}

function renderDashboardCards(data) {
  const cards = [
    { titulo: '💰 Vendas Hoje', valor: formatarMoeda(data.vendas?.hoje?.total), sub: `${data.vendas?.hoje?.pedidos || 0} pedidos`, cor: 'card-rosa' },
    { titulo: '📅 Vendas no Mês', valor: formatarMoeda(data.vendas?.mes?.total), sub: `${data.vendas?.mes?.pedidos || 0} pedidos`, cor: 'card-verde' },
    { titulo: '📦 Pedidos Pendentes', valor: data.pedidos_pendentes || 0, sub: 'aguardando entrega', cor: data.pedidos_pendentes > 0 ? 'card-laranja' : '' },
    { titulo: '⚠️ Estoque Crítico', valor: data.estoque_critico || 0, sub: `${data.estoque_zerado || 0} zerados`, cor: data.estoque_critico > 0 ? 'card-vermelho' : '' },
  ];

  document.getElementById('dashboard-cards').innerHTML = cards.map(c => `
    <div class="card ${c.cor || ''}">
      <div class="card-title">${c.titulo}</div>
      <div class="card-value">${c.valor}</div>
      <div class="card-sub">${c.sub}</div>
    </div>
  `).join('');
}

function renderBarChart(dados) {
  const container = document.getElementById('bar-chart');
  if (!dados || dados.length === 0) {
    container.innerHTML = '<div class="empty-state">Sem dados</div>';
    return;
  }

  const maxVal = Math.max(...dados.map(d => d.total), 1);

  container.innerHTML = dados.map(d => {
    const pct = Math.max((d.total / maxVal) * 90, d.total > 0 ? 4 : 1);
    return `
      <div class="bar-item">
        <div class="bar" style="height:${pct}%" data-tooltip="${formatarMoeda(d.total)}"></div>
        <div class="bar-label">${d.data.split(',')[0]}</div>
      </div>`;
  }).join('');
}

function renderUltimosPedidos(pedidos) {
  const el = document.getElementById('ultimos-pedidos');
  if (!pedidos.length) {
    el.innerHTML = '<div class="empty-state">Nenhum pedido ainda</div>';
    return;
  }
  el.innerHTML = pedidos.map(p => `
    <div class="mini-pedido">
      <span class="num">#${p.numero_pedido}</span>
      <span class="nome">${p.cliente_nome || '—'}</span>
      <span class="valor">${formatarMoeda(p.valor_total)}</span>
      ${badgePagamento(p.status_pagamento)}
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────

async function carregarPedidos(resetPage = true) {
  if (resetPage) paginaPedidos = 0;

  const busca = document.getElementById('pedido-busca')?.value || '';
  const statusPgto = document.getElementById('pedido-status-pgto')?.value || '';
  const statusEntrega = document.getElementById('pedido-status-entrega')?.value || '';

  const params = new URLSearchParams({
    limite: LIMITE,
    offset: paginaPedidos * LIMITE,
    ...(busca && { busca }),
    ...(statusPgto && { status_pagamento: statusPgto }),
    ...(statusEntrega && { status_entrega: statusEntrega })
  });

  const tbody = document.getElementById('pedidos-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/pedidos?${params}`);
    renderTabelaPedidos(data.pedidos || []);
    renderPaginacao('pedidos-paginacao', paginaPedidos, data.total, LIMITE,
      (p) => { paginaPedidos = p; carregarPedidos(false); });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro: ${e.message}</td></tr>`;
  }
}

function renderTabelaPedidos(pedidos) {
  const tbody = document.getElementById('pedidos-tbody');

  if (!pedidos.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum pedido encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = pedidos.map(p => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    const resumoItens = itens.length
      ? itens.map(i => `${i.quantidade || 1}x ${i.modelo} ${i.tamanho}`).join(', ')
      : p.descricao_pedido || '—';

    return `
      <tr>
        <td><strong>#${p.numero_pedido}</strong></td>
        <td>${formatarData(p.data_pedido)}</td>
        <td>${p.cliente_nome || '—'}</td>
        <td title="${p.descricao_pedido || ''}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${resumoItens}</td>
        <td><strong>${formatarMoeda(p.valor_total)}</strong></td>
        <td>${badgePagamento(p.status_pagamento)}</td>
        <td>${badgeEntrega(p.status_entrega)}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${p.status_pagamento !== 'PAGO' ? `
              <select onchange="marcarPago(${p.numero_pedido}, this.value)" style="padding:3px 6px;border:1px solid #ddd;border-radius:6px;font-size:0.75rem">
                <option value="">💳 Pagar</option>
                <option value="PIX">PIX</option>
                <option value="CARTÃO">Cartão</option>
                <option value="DINHEIRO">Dinheiro</option>
              </select>
            ` : ''}
            ${p.status_entrega === 'PENDENTE' || p.status_entrega === 'EM_TRANSITO' ? `
              <button class="btn btn-sm btn-success" onclick="marcarEntregue(${p.numero_pedido})">✅ Entregue</button>
            ` : ''}
            <button class="btn btn-sm btn-ghost" onclick="abrirModalPedido(${p.numero_pedido})">👁️</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function marcarPago(numero, forma) {
  if (!forma) return;
  try {
    await apiFetch(`/pedidos/${numero}/pagamento`, { method: 'PATCH', body: { status: 'PAGO', forma } });
    showToast(`Pedido #${numero} marcado como pago (${forma})!`);
    carregarPedidos(false);
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

async function marcarEntregue(numero) {
  if (!confirm(`Marcar pedido #${numero} como entregue?`)) return;
  try {
    await apiFetch(`/pedidos/${numero}/entrega`, { method: 'PATCH', body: { status: 'ENTREGUE' } });
    showToast(`Pedido #${numero} entregue!`);
    carregarPedidos(false);
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

async function abrirModalPedido(numero) {
  document.getElementById('modal-pedido-titulo').textContent = `Pedido #${numero}`;
  document.getElementById('modal-pedido-body').innerHTML = '<div class="loading">Carregando...</div>';
  document.getElementById('modal-pedido').classList.remove('hidden');

  try {
    const p = await apiFetch(`/pedidos/${numero}`);
    const itens = Array.isArray(p.itens) ? p.itens : [];

    document.getElementById('modal-pedido-body').innerHTML = `
      <div class="modal-body">
        <div class="detail-row"><span class="detail-label">Cliente</span><span class="detail-value">${p.cliente_nome || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">WhatsApp</span><span class="detail-value">${p.cliente_whatsapp || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Data Pedido</span><span class="detail-value">${formatarDataHora(p.data_pedido)}</span></div>
        <div class="detail-row"><span class="detail-label">Pagamento</span><span class="detail-value">${badgePagamento(p.status_pagamento)} ${p.forma_pagamento || ''}</span></div>
        <div class="detail-row"><span class="detail-label">Entrega</span><span class="detail-value">${badgeEntrega(p.status_entrega)}</span></div>
        <div class="detail-row"><span class="detail-label">Endereço</span><span class="detail-value">${p.endereco_entrega || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Data Pagamento</span><span class="detail-value">${formatarDataHora(p.data_pagamento)}</span></div>
        <div class="detail-row"><span class="detail-label">Data Entrega</span><span class="detail-value">${formatarDataHora(p.data_entrega)}</span></div>
        <div class="detail-row"><span class="detail-label">Total</span><span class="detail-value"><strong>${formatarMoeda(p.valor_total)}</strong></span></div>

        <hr style="margin:16px 0;border:none;border-top:1px solid #eee">
        <div class="card-title">Itens do Pedido</div>
        ${itens.length ? `
          <table style="width:100%;font-size:0.88rem;margin-top:8px">
            <thead><tr style="color:#666"><th style="text-align:left">Modelo</th><th>Tam</th><th>Cor</th><th>Qtd</th></tr></thead>
            <tbody>
              ${itens.map(i => `<tr>
                <td>${i.modelo || '—'}</td>
                <td style="text-align:center">${i.tamanho || '—'}</td>
                <td>${i.cor || '—'}</td>
                <td style="text-align:center">${i.quantidade || 1}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state" style="padding:12px">${p.descricao_pedido || 'Sem detalhes de itens'}</div>`}

        ${p.observacoes ? `<div style="margin-top:12px;font-size:0.85rem;color:#666">📝 ${p.observacoes}</div>` : ''}
      </div>`;
  } catch (e) {
    document.getElementById('modal-pedido-body').innerHTML = `<div class="empty-state">Erro: ${e.message}</div>`;
  }
}

function fecharModalPedido() {
  document.getElementById('modal-pedido').classList.add('hidden');
}

// ─────────────────────────────────────────────
// ESTOQUE
// ─────────────────────────────────────────────

async function carregarEstoque() {
  const modelo = document.getElementById('estoque-modelo-filter')?.value || '';
  const critico = document.getElementById('estoque-critico-only')?.checked ? 'true' : '';

  const params = new URLSearchParams({ status: 'ATIVO', ...(modelo && { modelo }), ...(critico && { critico }) });

  const tbody = document.getElementById('estoque-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading">Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/estoque?${params}`);
    renderTabelaEstoque(data.items || []);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Erro: ${e.message}</td></tr>`;
  }
}

function renderTabelaEstoque(items) {
  const tbody = document.getElementById('estoque-tbody');

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum item no estoque</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const disp = (parseInt(item.quantidade_total) || 0) - (parseInt(item.quantidade_reservada) || 0);
    const dispClass = disp === 0 ? 'qtd-zero' : disp <= 3 ? 'qtd-warn' : 'qtd-ok';

    return `
      <tr>
        <td><strong>${item.modelo}</strong></td>
        <td>${item.tamanho}</td>
        <td>${item.cor}</td>
        <td><span class="${dispClass}">${disp}</span></td>
        <td style="color:#888">${item.quantidade_reservada || 0}</td>
        <td>${item.quantidade_total || 0}</td>
        <td>${formatarMoeda(item.preco_unitario)}</td>
        <td><span class="badge ${item.status === 'ATIVO' ? 'badge-verde' : 'badge-cinza'}">${item.status}</span></td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="number" class="qtd-input" id="qtd-${item.sku}" value="${item.quantidade_total || 0}" min="0" style="width:70px">
            <button class="btn btn-sm btn-primary" onclick="salvarQuantidade('${item.sku}')">💾</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function salvarQuantidade(sku) {
  const input = document.getElementById(`qtd-${sku}`);
  const qtd = parseInt(input?.value);

  if (isNaN(qtd) || qtd < 0) {
    showToast('Quantidade inválida', 'error');
    return;
  }

  try {
    await apiFetch(`/estoque/${sku}/quantidade`, { method: 'PATCH', body: { quantidade_total: qtd } });
    showToast(`Estoque de ${sku} atualizado para ${qtd}!`);
    carregarEstoque();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────────

async function carregarClientes(resetPage = true) {
  if (resetPage) paginaClientes = 0;

  const busca = document.getElementById('cliente-busca')?.value || '';
  const params = new URLSearchParams({
    limite: LIMITE,
    offset: paginaClientes * LIMITE,
    ...(busca && { busca })
  });

  const tbody = document.getElementById('clientes-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/clientes?${params}`);
    renderTabelaClientes(data.clientes || []);
    renderPaginacao('clientes-paginacao', paginaClientes, data.total, LIMITE,
      (p) => { paginaClientes = p; carregarClientes(false); });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Erro: ${e.message}</td></tr>`;
  }
}

function renderTabelaClientes(clientes) {
  const tbody = document.getElementById('clientes-tbody');

  if (!clientes.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum cliente encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = clientes.map(c => `
    <tr>
      <td><strong>${c.nome}</strong></td>
      <td>${formatarWhatsApp(c.whatsapp)}</td>
      <td><strong>${formatarMoeda(c.total_gasto)}</strong></td>
      <td>${c.quantidade_pedidos || 0}</td>
      <td>${formatarData(c.data_ultimo_pedido)}</td>
      <td>${parseFloat(c.total_gasto) >= 500 ? '<span class="badge badge-amarelo">⭐ VIP</span>' : '—'}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="abrirModalCliente('${c.id_cliente}', '${c.nome.replace(/'/g, "\\'")}')">📋 Pedidos</button>
      </td>
    </tr>
  `).join('');
}

function formatarWhatsApp(num) {
  if (!num) return '—';
  const n = num.replace(/\D/g, '');
  if (n.length >= 12) return `(${n.slice(2,4)}) ${n.slice(4,9)}-${n.slice(9)}`;
  return num;
}

async function abrirModalCliente(id, nome) {
  document.getElementById('modal-cliente-titulo').textContent = `📋 Pedidos de ${nome}`;
  document.getElementById('modal-cliente-body').innerHTML = '<div class="loading">Carregando...</div>';
  document.getElementById('modal-cliente').classList.remove('hidden');

  try {
    const data = await apiFetch(`/clientes/${id}`);
    const pedidos = data.pedidos || [];

    document.getElementById('modal-cliente-body').innerHTML = `
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:0.88rem">
          <div><span style="color:#888">WhatsApp: </span>${formatarWhatsApp(data.whatsapp)}</div>
          <div><span style="color:#888">Email: </span>${data.email || '—'}</div>
          <div><span style="color:#888">Total Gasto: </span><strong>${formatarMoeda(data.total_gasto)}</strong></div>
          <div><span style="color:#888">Pedidos: </span>${data.quantidade_pedidos || 0}</div>
          <div><span style="color:#888">Modelo Favorito: </span>${data.modelo_favorito || '—'}</div>
          <div><span style="color:#888">Membro desde: </span>${formatarData(data.data_primeiro_pedido)}</div>
        </div>
        <div class="card-title" style="margin-bottom:10px">Histórico de Pedidos (${pedidos.length})</div>
        ${pedidos.length ? `
          <table style="width:100%;font-size:0.85rem">
            <thead><tr style="color:#888"><th>#</th><th>Data</th><th>Total</th><th>Pagamento</th><th>Entrega</th></tr></thead>
            <tbody>
              ${pedidos.map(p => `<tr>
                <td><strong>#${p.numero_pedido}</strong></td>
                <td>${formatarData(p.data_pedido)}</td>
                <td>${formatarMoeda(p.valor_total)}</td>
                <td>${badgePagamento(p.status_pagamento)}</td>
                <td>${badgeEntrega(p.status_entrega)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state">Nenhum pedido ainda</div>'}
      </div>`;
  } catch (e) {
    document.getElementById('modal-cliente-body').innerHTML = `<div class="empty-state">Erro: ${e.message}</div>`;
  }
}

function fecharModalCliente() {
  document.getElementById('modal-cliente').classList.add('hidden');
}

// ─────────────────────────────────────────────
// LEADS
// ─────────────────────────────────────────────

async function carregarLeads() {
  const status = document.getElementById('leads-status-filter')?.value || '';
  const params = new URLSearchParams({ limite: 100, ...(status && { status }) });

  const tbody = document.getElementById('leads-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/leads?${params}`);
    renderTabelaLeads(data.leads || []);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Erro: ${e.message}</td></tr>`;
  }
}

function renderTabelaLeads(leads) {
  const tbody = document.getElementById('leads-tbody');

  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum lead encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = leads.map(l => `
    <tr>
      <td><strong>${l.nome}</strong></td>
      <td>${formatarWhatsApp(l.celular)}</td>
      <td>${badgeStatusLead(l.status)}</td>
      <td>${formatarMoeda(l.total_gasto)}</td>
      <td>${formatarData(l.ultima_interacao)}</td>
      <td><span class="badge badge-cinza">${l.fonte || '—'}</span></td>
      <td>
        <select onchange="atualizarStatusLead(${l.id}, this.value)" style="padding:3px 6px;border:1px solid #ddd;border-radius:6px;font-size:0.75rem">
          <option value="">Mudar status</option>
          <option value="novo">Novo</option>
          <option value="visitante">Visitante</option>
          <option value="cliente">Cliente</option>
          <option value="vip">VIP</option>
        </select>
      </td>
    </tr>
  `).join('');
}

async function atualizarStatusLead(id, status) {
  if (!status) return;
  try {
    await apiFetch(`/leads/${id}/status`, { method: 'PATCH', body: { status } });
    showToast(`Lead atualizado para ${status}!`);
    carregarLeads();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────
// SUPORTE
// ─────────────────────────────────────────────

async function carregarSuporte() {
  const status = document.getElementById('suporte-status-filter')?.value || 'ABERTO';
  const lista = document.getElementById('suporte-lista');
  lista.innerHTML = '<div class="loading">Carregando...</div>';

  try {
    const data = await apiFetch(`/suporte?status=${status}`);
    renderSuporte(data.tickets || []);
  } catch (e) {
    lista.innerHTML = `<div class="empty-state">Erro: ${e.message}</div>`;
  }
}

function renderSuporte(tickets) {
  const lista = document.getElementById('suporte-lista');

  if (!tickets.length) {
    lista.innerHTML = '<div class="empty-state">Nenhuma mensagem de suporte</div>';
    return;
  }

  lista.innerHTML = tickets.map(t => `
    <div class="suporte-card">
      <div class="suporte-header">
        <span>👤 ${t.cliente_nome || '—'} | 📱 ${formatarWhatsApp(t.cliente_whatsapp)}</span>
        <span>${formatarDataHora(t.data_criacao)}</span>
      </div>
      <div class="mensagem">💬 ${t.mensagem}</div>
      ${t.status === 'RESPONDIDO' ? `
        <div style="padding:8px 12px;background:#f0fff4;border-radius:6px;font-size:0.85rem;color:#27ae60;margin-bottom:8px">
          ✅ Respondido em ${formatarDataHora(t.data_resposta)}: ${t.resposta}
        </div>
      ` : `
        <textarea id="resp-${t.id}" placeholder="Digite a resposta..." rows="2"></textarea>
        <button class="btn btn-primary btn-sm" onclick="enviarResposta(${t.id})">📤 Responder</button>
      `}
    </div>
  `).join('');
}

async function enviarResposta(id) {
  const textarea = document.getElementById(`resp-${id}`);
  const resposta = textarea?.value?.trim();

  if (!resposta) {
    showToast('Digite uma resposta', 'warning');
    return;
  }

  try {
    await apiFetch(`/suporte/${id}/responder`, { method: 'PATCH', body: { resposta } });
    showToast('Resposta enviada!');
    carregarSuporte();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────
// PAGINAÇÃO
// ─────────────────────────────────────────────

function renderPaginacao(containerId, paginaAtual, total, limite, onChangePage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(total / limite);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const inicio = paginaAtual * limite + 1;
  const fim = Math.min((paginaAtual + 1) * limite, total);

  container.innerHTML = `
    <button onclick="(${onChangePage.toString()})(${paginaAtual - 1})" ${paginaAtual === 0 ? 'disabled' : ''}>← Anterior</button>
    <span>Mostrando ${inicio}–${fim} de ${total}</span>
    <button onclick="(${onChangePage.toString()})(${paginaAtual + 1})" ${paginaAtual >= totalPages - 1 ? 'disabled' : ''}>Próximo →</button>
  `;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Navegação
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });

  // Hamburger mobile
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Fechar modal ao clicar fora
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const usuario = document.getElementById('login-usuario').value;
      const senha = document.getElementById('login-senha').value;
      await fazerLogin(usuario, senha);
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', fazerLogout);
  }

  // Verificar autenticação na carga
  if (isAuthenticated()) {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('menu-toggle').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
    loadDashboard();
  } else {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('content').classList.add('hidden');
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('menu-toggle').classList.add('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
  }

  // Auto-refresh do dashboard a cada 60s
  setInterval(() => {
    if (!isAuthenticated()) return;
    const dashboardAtivo = !document.getElementById('section-dashboard').classList.contains('hidden');
    if (dashboardAtivo) loadDashboard();
  }, 60000);
});
