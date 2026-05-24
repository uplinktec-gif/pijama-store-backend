/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║         PLUMA PIJAMAS — PAINEL ADMINISTRATIVO v2.0             ║
 * ║  Reescrito do zero com integração VPS, Bot e Upload de Fotos   ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

// ═════════════════════════════════════════════════════════════════
// CONFIG E CONSTANTES
// ═════════════════════════════════════════════════════════════════

const API_BASE = '/admin/api';
const VPS_URL = 'http://177.7.47.211:3000';
const STORAGE_TOKEN = 'pluma_admin_token';
const STORAGE_USER = 'pluma_admin_user';

let currentUser = null;
let paginaAtual = 0;
const ITENS_POR_PAGINA = 50;

// ═════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO E LIFECYCLE
// ═════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  verificarSessao();
});

window.addEventListener('beforeunload', () => {
  salvarSessao();
});

function verificarSessao() {
  const token = localStorage.getItem(STORAGE_TOKEN);
  const user = localStorage.getItem(STORAGE_USER);

  if (token && user) {
    currentUser = JSON.parse(user);
    mostraConteudo();
    loadDashboard();
  } else {
    mostraLogin();
  }
}

function salvarSessao() {
  if (currentUser) {
    localStorage.setItem(STORAGE_USER, JSON.stringify(currentUser));
  }
}

// ═════════════════════════════════════════════════════════════════
// ELEMENTOS E UI
// ═════════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Form de login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Botão logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Menu hambúrguer
  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', toggleSidebar);
  }

  // Links de navegação
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      navegarPara(section);
    });
  });

  // Fechar modais ao clicar fora
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        fecharModal(modal.id);
      }
    });
  });
}

function mostraLogin() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('content').classList.add('hidden');
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('menu-toggle').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
}

function mostraConteudo() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('content').classList.remove('hidden');
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('menu-toggle').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');

  // Atualizar nome do usuário
  const userDisplay = document.getElementById('user-display');
  if (userDisplay && currentUser) {
    userDisplay.textContent = `👤 ${currentUser.nome}`;
  }
}

function navegarPara(section) {
  // Esconder todas as seções
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

  // Remover active dos links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Mostrar seção e ativar link
  const sectionEl = document.getElementById(`section-${section}`);
  if (sectionEl) sectionEl.classList.remove('hidden');

  const linkEl = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (linkEl) linkEl.classList.add('active');

  // Fechar sidebar no mobile
  document.getElementById('sidebar').classList.remove('open');

  // Carregar dados
  carregarDadosSecao(section);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ═════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ═════════════════════════════════════════════════════════════════

async function handleLogin(e) {
  e.preventDefault();

  const usuario = document.getElementById('login-usuario').value.trim();
  const senha = document.getElementById('login-senha').value;

  if (!usuario || !senha) {
    showToast('Preencha todos os campos', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(data.error || 'Falha na autenticação');
    }

    const data = await res.json();

    // Salvar token e dados do usuário
    localStorage.setItem(STORAGE_TOKEN, data.token);
    currentUser = {
      id: data.id,
      nome: data.nome,
      usuario: data.usuario
    };
    localStorage.setItem(STORAGE_USER, JSON.stringify(currentUser));

    // Limpar form
    document.getElementById('login-form').reset();

    showToast(`Bem-vindo, ${currentUser.nome}! 👋`, 'success');
    mostraConteudo();
    loadDashboard();
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
    console.error('Login error:', error);
  }
}

function handleLogout() {
  if (!confirm('Tem certeza que deseja fazer logout?')) return;

  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_USER);
  currentUser = null;

  showToast('Logout realizado com sucesso', 'success');
  mostraLogin();
}

// ═════════════════════════════════════════════════════════════════
// API FETCH WRAPPER
// ═════════════════════════════════════════════════════════════════

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(STORAGE_TOKEN);

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    // Sessão expirada
    if (res.status === 401) {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USER);
      currentUser = null;
      mostraLogin();
      showToast('Sessão expirada. Faça login novamente.', 'error');
      throw new Error('Sessão expirada');
    }

    if (res.status === 403) {
      showToast('Acesso negado', 'error');
      throw new Error('Acesso negado');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(data.error || `Erro ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ═════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═════════════════════════════════════════════════════════════════

function showToast(msg, tipo = 'success') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
  document.body.appendChild(container);
  return container;
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor || 0);
}

function formatarData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return iso;
  }
}

function formatarWhatsApp(num) {
  if (!num) return '—';
  const n = num.replace(/\D/g, '');
  if (n.length >= 12) {
    return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  }
  return num;
}

function abrirModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('visible');
  }
}

function fecharModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('visible');
  }
}

// ═════════════════════════════════════════════════════════════════
// CARREGAMENTO DE DADOS
// ═════════════════════════════════════════════════════════════════

async function carregarDadosSecao(section) {
  const loaders = {
    dashboard: loadDashboard,
    pedidos: loadPedidos,
    estoque: loadEstoque,
    clientes: loadClientes,
    leads: loadLeads,
    suporte: loadSuporte,
    fotos: loadFotos
  };

  if (loaders[section]) {
    try {
      await loaders[section]();
    } catch (error) {
      console.error(`Erro ao carregar ${section}:`, error);
      showToast(`Erro ao carregar dados de ${section}`, 'error');
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════

async function loadDashboard() {
  try {
    const data = await apiFetch('/dashboard/stats');
    renderDashboard(data);

    document.getElementById('last-update').textContent =
      `⏱️ Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (error) {
    console.error('Dashboard error:', error);
  }
}

function renderDashboard(data) {
  const container = document.getElementById('dashboard-cards');
  if (!container) return;

  const cards = [
    {
      titulo: '💰 Vendas Hoje',
      valor: formatarMoeda(data.vendas?.hoje?.total || 0),
      sub: `${data.vendas?.hoje?.pedidos || 0} pedidos`,
      class: 'card-rose'
    },
    {
      titulo: '📅 Vendas no Mês',
      valor: formatarMoeda(data.vendas?.mes?.total || 0),
      sub: `${data.vendas?.mes?.pedidos || 0} pedidos`,
      class: 'card-green'
    },
    {
      titulo: '📦 Pendentes',
      valor: data.pedidos_pendentes || 0,
      sub: 'aguardando entrega',
      class: data.pedidos_pendentes > 0 ? 'card-orange' : ''
    },
    {
      titulo: '⚠️ Crítico',
      valor: data.estoque_critico || 0,
      sub: `${data.estoque_zerado || 0} zerados`,
      class: data.estoque_critico > 0 ? 'card-red' : ''
    }
  ];

  container.innerHTML = cards.map(card => `
    <div class="card ${card.class}">
      <div class="card-title">${card.titulo}</div>
      <div class="card-value">${card.valor}</div>
      <div class="card-sub">${card.sub}</div>
    </div>
  `).join('');
}

// ═════════════════════════════════════════════════════════════════
// ESTOQUE
// ═════════════════════════════════════════════════════════════════

async function loadEstoque() {
  const modelo = document.getElementById('estoque-modelo-filter')?.value || '';
  const critico = document.getElementById('estoque-critico-filter')?.checked ? 'true' : '';

  const params = new URLSearchParams({
    status: 'ATIVO',
    ...(modelo && { modelo }),
    ...(critico && { critico })
  });

  const tbody = document.getElementById('estoque-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" class="text-center">⏳ Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/admin/api/estoque?${params}`);

    // CRÍTICO: A resposta vem em data.items (não array direto)
    const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);

    console.log('✅ Estoque carregado:', items.length, 'itens');

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">📭 Nenhum item no estoque</td></tr>';
      return;
    }

    renderTabelaEstoque(items);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center error">❌ ${error.message}</td></tr>`;
  }
}

function renderTabelaEstoque(items) {
  const tbody = document.getElementById('estoque-tbody');
  if (!tbody) return;

  tbody.innerHTML = items.map(item => {
    const disponivel = (item.quantidade_total || 0) - (item.quantidade_reservada || 0);
    const statusClass = disponivel === 0 ? 'qtd-zero' : disponivel <= 3 ? 'qtd-low' : 'qtd-ok';

    return `
      <tr>
        <td><strong>${item.modelo}</strong></td>
        <td>${item.tamanho}</td>
        <td>${item.cor}</td>
        <td><span class="${statusClass}">${disponivel}</span></td>
        <td style="color: #888">${item.quantidade_reservada || 0}</td>
        <td>${item.quantidade_total || 0}</td>
        <td>${formatarMoeda(item.preco_unitario)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="abrirEditarEstoque('${item.sku}')">✏️</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function abrirEditarEstoque(sku) {
  try {
    // Encontrar item na tabela
    const items = await apiFetch('/admin/api/estoque');
    const itemsArray = Array.isArray(items.items) ? items.items : items;
    const item = itemsArray.find(i => i.sku === sku);

    if (!item) {
      showToast('Item não encontrado', 'error');
      return;
    }

    const novaQtd = prompt(`Atualizar quantidade de ${sku}:\n\nQuantidade total:`, item.quantidade_total);

    if (novaQtd !== null) {
      const qtd = parseInt(novaQtd);
      if (isNaN(qtd) || qtd < 0) {
        showToast('Quantidade inválida', 'error');
        return;
      }

      await apiFetch(`/estoque/${sku}/quantidade`, {
        method: 'PATCH',
        body: { quantidade_total: qtd }
      });

      showToast(`✅ ${sku} atualizado para ${qtd} unidades!`, 'success');
      loadEstoque();
    }
  } catch (error) {
    showToast(`❌ ${error.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════
// PEDIDOS
// ═════════════════════════════════════════════════════════════════

async function loadPedidos() {
  const busca = document.getElementById('pedidos-busca')?.value || '';

  const params = new URLSearchParams({
    limite: ITENS_POR_PAGINA,
    offset: paginaAtual * ITENS_POR_PAGINA,
    ...(busca && { busca })
  });

  const tbody = document.getElementById('pedidos-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="text-center">⏳ Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/pedidos?${params}`);
    const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];

    if (pedidos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">📭 Nenhum pedido encontrado</td></tr>';
      return;
    }

    renderTabelaPedidos(pedidos);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center error">❌ ${error.message}</td></tr>`;
  }
}

function renderTabelaPedidos(pedidos) {
  const tbody = document.getElementById('pedidos-tbody');
  if (!tbody) return;

  tbody.innerHTML = pedidos.map(p => `
    <tr>
      <td><strong>#${p.numero_pedido}</strong></td>
      <td>${formatarData(p.data_pedido)}</td>
      <td>${p.cliente_nome || '—'}</td>
      <td>${p.descricao_pedido || '—'}</td>
      <td>${formatarMoeda(p.valor_total)}</td>
      <td>${badgePagamento(p.status_pagamento)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="abrirPedido(${p.numero_pedido})">👁️</button>
      </td>
    </tr>
  `).join('');
}

async function abrirPedido(numero) {
  try {
    const p = await apiFetch(`/pedidos/${numero}`);

    const modal = document.getElementById('modal-pedido');
    const titulo = document.getElementById('modal-pedido-titulo');
    const body = document.getElementById('modal-pedido-body');

    titulo.textContent = `📋 Pedido #${numero}`;
    body.innerHTML = `
      <div class="modal-body">
        <div class="detail-grid">
          <div><span class="label">Cliente</span><span>${p.cliente_nome || '—'}</span></div>
          <div><span class="label">Data</span><span>${formatarDataHora(p.data_pedido)}</span></div>
          <div><span class="label">Total</span><span><strong>${formatarMoeda(p.valor_total)}</strong></span></div>
          <div><span class="label">Pagamento</span><span>${badgePagamento(p.status_pagamento)}</span></div>
          <div><span class="label">Entrega</span><span>${badgeEntrega(p.status_entrega)}</span></div>
          <div><span class="label">Endereço</span><span>${p.endereco_entrega || '—'}</span></div>
        </div>
      </div>
    `;

    abrirModal('modal-pedido');
  } catch (error) {
    showToast(`❌ ${error.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════
// CLIENTES
// ═════════════════════════════════════════════════════════════════

async function loadClientes() {
  const busca = document.getElementById('clientes-busca')?.value || '';

  const params = new URLSearchParams({
    limite: ITENS_POR_PAGINA,
    offset: paginaAtual * ITENS_POR_PAGINA,
    ...(busca && { busca })
  });

  const tbody = document.getElementById('clientes-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="text-center">⏳ Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/clientes?${params}`);
    const clientes = Array.isArray(data.clientes) ? data.clientes : [];

    if (clientes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">👥 Nenhum cliente encontrado</td></tr>';
      return;
    }

    renderTabelaClientes(clientes);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center error">❌ ${error.message}</td></tr>`;
  }
}

function renderTabelaClientes(clientes) {
  const tbody = document.getElementById('clientes-tbody');
  if (!tbody) return;

  tbody.innerHTML = clientes.map(c => {
    const isVip = parseFloat(c.total_gasto || 0) >= 500;

    return `
      <tr>
        <td><strong>${c.nome}</strong></td>
        <td>${formatarWhatsApp(c.whatsapp)}</td>
        <td><strong>${formatarMoeda(c.total_gasto)}</strong></td>
        <td>${c.quantidade_pedidos || 0}</td>
        <td>${formatarData(c.data_ultimo_pedido)}</td>
        <td>${isVip ? '<span class="badge badge-gold">⭐ VIP</span>' : '—'}</td>
      </tr>
    `;
  }).join('');
}

// ═════════════════════════════════════════════════════════════════
// LEADS
// ═════════════════════════════════════════════════════════════════

async function loadLeads() {
  const status = document.getElementById('leads-status-filter')?.value || '';

  const params = new URLSearchParams({
    limite: 100,
    ...(status && { status })
  });

  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="text-center">⏳ Carregando...</td></tr>';

  try {
    const data = await apiFetch(`/leads?${params}`);
    const leads = Array.isArray(data.leads) ? data.leads : [];

    if (leads.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">🎯 Nenhum lead encontrado</td></tr>';
      return;
    }

    renderTabelaLeads(leads);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center error">❌ ${error.message}</td></tr>`;
  }
}

function renderTabelaLeads(leads) {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;

  tbody.innerHTML = leads.map(l => `
    <tr>
      <td><strong>${l.nome}</strong></td>
      <td>${formatarWhatsApp(l.celular)}</td>
      <td>${badgeStatusLead(l.status)}</td>
      <td>${formatarMoeda(l.total_gasto)}</td>
      <td>${formatarData(l.ultima_interacao)}</td>
      <td>${l.fonte || '—'}</td>
    </tr>
  `).join('');
}

// ═════════════════════════════════════════════════════════════════
// SUPORTE
// ═════════════════════════════════════════════════════════════════

async function loadSuporte() {
  const tbody = document.getElementById('suporte-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="text-center">⏳ Carregando...</td></tr>';

  try {
    const data = await apiFetch('/suporte');
    const tickets = Array.isArray(data) ? data : [];

    if (tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">💬 Nenhum ticket aberto</td></tr>';
      return;
    }

    renderTabelaSuporte(tickets);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center error">❌ ${error.message}</td></tr>`;
  }
}

function renderTabelaSuporte(tickets) {
  const tbody = document.getElementById('suporte-tbody');
  if (!tbody) return;

  tbody.innerHTML = tickets.map(t => `
    <tr>
      <td><strong>#${t.id}</strong></td>
      <td>${t.titulo}</td>
      <td>${badgeStatusSuporte(t.status)}</td>
      <td>${formatarData(t.data_criacao)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="abrirTicket(${t.id})">👁️</button>
      </td>
    </tr>
  `).join('');
}

async function abrirTicket(id) {
  try {
    const t = await apiFetch(`/suporte/${id}`);

    const modal = document.getElementById('modal-suporte');
    const titulo = document.getElementById('modal-suporte-titulo');
    const body = document.getElementById('modal-suporte-body');

    titulo.textContent = `💬 Ticket #${id}`;
    body.innerHTML = `
      <div class="modal-body">
        <div class="detail-grid">
          <div><span class="label">Título</span><span>${t.titulo}</span></div>
          <div><span class="label">Mensagem</span><span>${t.mensagem}</span></div>
          <div><span class="label">Status</span><span>${badgeStatusSuporte(t.status)}</span></div>
          <div><span class="label">Data</span><span>${formatarDataHora(t.data_criacao)}</span></div>
        </div>
        ${t.resposta ? `<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
          <strong>📝 Resposta:</strong>
          <div style="margin-top: 10px; color: #666;">${t.resposta}</div>
        </div>` : ''}
      </div>
    `;

    abrirModal('modal-suporte');
  } catch (error) {
    showToast(`❌ ${error.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════
// FOTOS (UPLOAD)
// ═════════════════════════════════════════════════════════════════

async function loadFotos() {
  try {
    const data = await apiFetch('/fotos');
    renderFotos(data);
  } catch (error) {
    console.error('Fotos error:', error);
    showToast(`❌ ${error.message}`, 'error');
  }
}

function renderFotos(data) {
  const container = document.getElementById('fotos-grid');
  if (!container) return;

  const fotos = data.fotos || {};
  const modelos = Object.keys(fotos).sort();

  if (modelos.length === 0) {
    container.innerHTML = '<div class="empty-state">📸 Nenhuma foto cadastrada</div>';
    return;
  }

  container.innerHTML = modelos.map(modelo => `
    <div class="foto-card">
      <div class="foto-titulo">${modelo}</div>
      <div class="foto-cores">
        ${Object.keys(fotos[modelo] || {}).map(cor => `
          <div class="cor-badge">${cor}</div>
        `).join('')}
      </div>
      <button class="btn btn-sm btn-primary" onclick="abrirUploadFoto('${modelo}')">📸 Upload</button>
    </div>
  `).join('');
}

async function abrirUploadFoto(modelo) {
  const arquivo = prompt(`Fazer upload de foto para ${modelo}:\n\nDigite a URL da imagem ou deixe em branco para cancelar:`);

  if (!arquivo) return;

  try {
    await apiFetch(`/fotos/${modelo}`, {
      method: 'POST',
      body: { url: arquivo }
    });

    showToast(`✅ Foto de ${modelo} enviada!`, 'success');
    loadFotos();
  } catch (error) {
    showToast(`❌ ${error.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════
// BADGES DE STATUS
// ═════════════════════════════════════════════════════════════════

function badgePagamento(status) {
  const map = {
    'PAGO': { icon: '✅', class: 'badge-green', label: 'Pago' },
    'PEDIDO': { icon: '⏳', class: 'badge-yellow', label: 'Aguardando' },
    'CANCELADO': { icon: '❌', class: 'badge-red', label: 'Cancelado' }
  };
  const config = map[status] || { icon: '—', class: 'badge-gray', label: status };
  return `<span class="badge ${config.class}">${config.icon} ${config.label}</span>`;
}

function badgeEntrega(status) {
  const map = {
    'ENTREGUE': { icon: '✅', class: 'badge-green', label: 'Entregue' },
    'RETIRADA_NA_LOJA': { icon: '🏪', class: 'badge-blue', label: 'Retirada' },
    'EM_TRANSITO': { icon: '🚚', class: 'badge-orange', label: 'Em trânsito' },
    'PENDENTE': { icon: '📦', class: 'badge-yellow', label: 'Pendente' }
  };
  const config = map[status] || { icon: '—', class: 'badge-gray', label: status };
  return `<span class="badge ${config.class}">${config.icon} ${config.label}</span>`;
}

function badgeStatusLead(status) {
  const map = {
    'novo': { icon: '🆕', class: 'badge-blue' },
    'visitante': { icon: '👁️', class: 'badge-gray' },
    'cliente': { icon: '🛍️', class: 'badge-green' },
    'vip': { icon: '⭐', class: 'badge-gold' }
  };
  const config = map[status] || { icon: '—', class: 'badge-gray' };
  return `<span class="badge ${config.class}">${config.icon} ${status}</span>`;
}

function badgeStatusSuporte(status) {
  const map = {
    'ABERTO': { icon: '📩', class: 'badge-orange' },
    'EM_ATENDIMENTO': { icon: '👨‍💼', class: 'badge-blue' },
    'RESPONDIDO': { icon: '✅', class: 'badge-green' },
    'FECHADO': { icon: '🔒', class: 'badge-gray' }
  };
  const config = map[status] || { icon: '—', class: 'badge-gray' };
  return `<span class="badge ${config.class}">${config.icon} ${status}</span>`;
}
