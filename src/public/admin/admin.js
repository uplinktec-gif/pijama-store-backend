// ========================================
// ADMIN PANEL JAVASCRIPT
// ========================================

// API Configuration
const API_BASE = '/admin/api';
let adminToken = localStorage.getItem('adminToken');
let currentSection = 'dashboard';
let currentPedidoNumber = null;
let currentClienteId = null;
let currentSuporteId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  if (!adminToken) {
    window.location.href = '/admin/login.html';
    return;
  }

  setupEventListeners();
  await loadDashboard();
});

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      showSection(section);
    });
  });

  // Mobile toggle
  const mobileToggle = document.getElementById('mobileToggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('active');
    });
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Estoque search
  document.getElementById('estoqueSearch').addEventListener('input', debounce(() => loadEstoque(), 300));

  // Pedidos filters
  document.getElementById('pedidoStatusFilter').addEventListener('change', () => loadPedidos());
  document.getElementById('pedidoEntregaFilter').addEventListener('change', () => loadPedidos());
  document.getElementById('pedidoSearch').addEventListener('input', debounce(() => loadPedidos(), 300));

  // Clientes search
  document.getElementById('clienteSearch').addEventListener('input', debounce(() => loadClientes(), 300));

  // Leads filter
  document.getElementById('leadStatusFilter').addEventListener('change', () => loadLeads());

  // Suporte filter
  document.getElementById('suporteStatusFilter').addEventListener('change', () => loadSuporte());

  // Modals
  setupModals();
}

function setupModals() {
  // Pedido Modal
  const pedidoModal = document.getElementById('pedidoModal');
  const pedidoClose = pedidoModal.querySelector('.modal-close');
  const fecharPedidoBtn = document.getElementById('fecharPedidoModal');
  const marcarPagoBtn = document.getElementById('marcarPagoBtn');
  const marcarEntregueBtn = document.getElementById('marcarEntregueBtn');

  pedidoClose.addEventListener('click', () => pedidoModal.classList.remove('active'));
  fecharPedidoBtn.addEventListener('click', () => pedidoModal.classList.remove('active'));
  marcarPagoBtn.addEventListener('click', () => marcarPedidoPago());
  marcarEntregueBtn.addEventListener('click', () => marcarPedidoEntregue());

  // Cliente Modal
  const clienteModal = document.getElementById('clienteModal');
  const clienteClose = clienteModal.querySelector('.modal-close');
  const fecharClienteBtn = document.getElementById('fecharClienteModal');

  clienteClose.addEventListener('click', () => clienteModal.classList.remove('active'));
  fecharClienteBtn.addEventListener('click', () => clienteModal.classList.remove('active'));

  // Suporte Modal
  const suporteModal = document.getElementById('suporteModal');
  const suporteClose = suporteModal.querySelector('.modal-close');
  const fecharSuporteBtn = document.getElementById('fecharSuporteModal');
  const enviarRespostaBtn = document.getElementById('enviarRespostaBtn');

  suporteClose.addEventListener('click', () => suporteModal.classList.remove('active'));
  fecharSuporteBtn.addEventListener('click', () => suporteModal.classList.remove('active'));
  enviarRespostaBtn.addEventListener('click', () => enviarRespostaSuporte());

  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.remove('active');
    }
  });
}

// ========================================
// NAVIGATION
// ========================================

function showSection(section) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.section === section) {
      link.classList.add('active');
    }
  });

  // Show section
  const sectionElement = document.getElementById(`${section}-section`);
  if (sectionElement) {
    sectionElement.classList.add('active');
  }

  // Update title
  const titles = {
    dashboard: 'Dashboard',
    estoque: 'Estoque',
    pedidos: 'Pedidos',
    clientes: 'Clientes',
    leads: 'Leads',
    suporte: 'Suporte'
  };
  document.getElementById('sectionTitle').textContent = titles[section] || 'Dashboard';

  // Close mobile sidebar
  if (window.innerWidth <= 768) {
    document.querySelector('.sidebar').classList.remove('active');
  }

  // Load section data
  currentSection = section;
  switch(section) {
    case 'estoque': loadEstoque(); break;
    case 'pedidos': loadPedidos(); break;
    case 'clientes': loadClientes(); break;
    case 'leads': loadLeads(); break;
    case 'suporte': loadSuporte(); break;
  }
}

// ========================================
// API HELPER
// ========================================

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
    ...options.headers
  };

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      return null;
    }

    if (!response.ok) {
      let errorMsg = 'Operação falhou';
      try { const error = await response.json(); errorMsg = error.error || error.mensagem || errorMsg; } catch(_) {}
      showToast(`Erro: ${errorMsg}`, 'error');
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    showToast('Erro de conexão', 'error');
    return null;
  }
}

// ========================================
// DASHBOARD
// ========================================

async function loadDashboard() {
  const data = await apiFetch('/dashboard/stats');
  if (!data) return;

  renderDashboardCards(data);
  renderSalesChart(data.grafico_7dias);
}

function renderDashboardCards(data) {
  const cards = [
    {
      title: 'Vendas Hoje',
      value: `R$ ${data.vendas_hoje?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}`,
      icon: '💰'
    },
    {
      title: 'Vendas Semana',
      value: `R$ ${data.vendas_semana?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}`,
      icon: '📊'
    },
    {
      title: 'Vendas Mês',
      value: `R$ ${data.vendas_mes?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}`,
      icon: '📈'
    },
    {
      title: 'Pedidos Pendentes',
      value: data.pedidos_pendentes || 0,
      icon: '⏳',
      type: data.pedidos_pendentes > 0 ? 'warning' : 'success'
    },
    {
      title: 'Estoque Crítico',
      value: data.estoque_critico || 0,
      icon: '⚠️',
      type: data.estoque_critico > 0 ? 'critical' : 'success'
    },
    {
      title: 'Leads Novos',
      value: data.leads_novos || 0,
      icon: '🎯'
    }
  ];

  const html = cards.map(card => `
    <div class="card ${card.type || ''}">
      <h3>${card.icon} ${card.title}</h3>
      <div class="value">${card.value}</div>
    </div>
  `).join('');

  document.getElementById('dashboardCards').innerHTML = html;
}

function renderSalesChart(graphData = []) {
  const chartArea = document.getElementById('chartArea');
  
  if (!graphData || graphData.length === 0) {
    chartArea.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">Sem dados disponíveis</p>';
    return;
  }

  const maxValue = Math.max(...graphData.map(d => d.total || 0), 1);
  
  const html = `
    <div class="bar-chart">
      ${graphData.map((item, index) => {
        const height = (item.total / maxValue) * 100;
        return `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
            <div class="bar" style="height: ${height}%;">
              <div class="bar-value">R$ ${(item.total || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
            </div>
            <div class="bar-label">${item.data || `Dia ${index + 1}`}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  chartArea.innerHTML = html;
}

// ========================================
// ESTOQUE
// ========================================

async function loadEstoque() {
  const search = document.getElementById('estoqueSearch')?.value || '';
  const data = await apiFetch(`/estoque${search ? `?search=${encodeURIComponent(search)}` : ''}`);

  if (!data) return;
  const estoqueArr = Array.isArray(data) ? data : (data.estoque || []);

  const html = estoqueArr.map(item => `
    <tr>
      <td>${item.sku}</td>
      <td>${item.modelo}</td>
      <td>${item.tamanho}</td>
      <td>${item.cor}</td>
      <td>R$ ${(item.preco_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td>
        <span class="badge ${item.quantidade_disponivel <= 3 ? 'badge-danger' : 'badge-success'}">
          ${item.quantidade_disponivel}
        </span>
      </td>
      <td>${item.quantidade_total}</td>
      <td><span class="badge badge-info">${item.status}</span></td>
      <td>
        <button class="btn btn-primary btn-small" onclick="editarEstoque('${item.sku}')">Editar</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('estoqueTable').querySelector('tbody').innerHTML = html;
}

async function editarEstoque(sku) {
  const newQuantity = prompt('Nova quantidade total:');
  if (newQuantity === null || isNaN(newQuantity)) return;

  const result = await apiFetch(`/estoque/${sku}/quantidade`, {
    method: 'PATCH',
    body: JSON.stringify({ quantidade_total: parseInt(newQuantity) })
  });

  if (result) {
    showToast('Estoque atualizado com sucesso', 'success');
    loadEstoque();
  }
}

// ========================================
// PEDIDOS
// ========================================

async function loadPedidos() {
  const statusFilter = document.getElementById('pedidoStatusFilter')?.value || '';
  const entregaFilter = document.getElementById('pedidoEntregaFilter')?.value || '';
  const search = document.getElementById('pedidoSearch')?.value || '';

  let url = '/pedidos?limite=50&offset=0';
  if (statusFilter) url += `&status_pagamento=${statusFilter}`;
  if (entregaFilter) url += `&status_entrega=${entregaFilter}`;
  if (search) url += `&busca=${encodeURIComponent(search)}`;

  const data = await apiFetch(url);
  if (!data) return;
  const pedidosArr = Array.isArray(data) ? data : (data.pedidos || []);

  const html = pedidosArr.map(pedido => `
    <tr>
      <td>#${pedido.numero_pedido}</td>
      <td>${pedido.cliente_nome}</td>
      <td>${pedido.cliente_whatsapp || '—'}</td>
      <td>R$ ${(pedido.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td><span class="badge ${pedido.status_pagamento === 'PAGO' ? 'badge-success' : 'badge-warning'}">${pedido.status_pagamento}</span></td>
      <td><span class="badge ${pedido.status_entrega === 'ENTREGUE' ? 'badge-success' : 'badge-warning'}">${pedido.status_entrega}</span></td>
      <td>${pedido.data_pedido ? new Date(pedido.data_pedido).toLocaleDateString('pt-BR') : '—'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-primary btn-small" onclick="abrirPedido(${pedido.numero_pedido})" title="Ver detalhes">👁 Ver</button>
        <button class="btn btn-small" style="background:#f59e0b;color:#fff" onclick="editarStatusPedido(${pedido.numero_pedido},'${pedido.status_pagamento}','${pedido.status_entrega}')" title="Editar status">✏️ Status</button>
        <button class="btn btn-small" style="background:#ef4444;color:#fff" onclick="excluirPedido(${pedido.numero_pedido})" title="Excluir pedido">🗑 Excluir</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('pedidosTable').querySelector('tbody').innerHTML = html;
}

async function excluirPedido(numero) {
  if (!confirm(`Tem certeza que deseja apagar o Pedido #${numero}?\nEsta ação não pode ser desfeita.`)) return;

  const result = await apiFetch(`/pedidos/${numero}`, { method: 'DELETE' });
  if (result) {
    showToast(`Pedido #${numero} excluído com sucesso`, 'success');
    loadPedidos();
  }
}

async function editarStatusPedido(numero, statusPagAtual, statusEntregaAtual) {
  const PAGAMENTOS = ['PEDIDO', 'PAGO', 'CANCELADO'];
  const ENTREGAS   = ['PENDENTE', 'EM_TRANSITO', 'ENTREGUE', 'RETIRADA_NA_LOJA', 'CANCELADO'];

  // Modal inline simples
  const modalId = 'statusModal';
  document.getElementById(modalId)?.remove();

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <h3 style="margin:0 0 20px;font-size:16px;color:#1a1a1a">✏️ Editar Status — Pedido #${numero}</h3>

      <label style="font-size:12px;font-weight:600;color:#555;letter-spacing:.04em;text-transform:uppercase">Status de Pagamento</label>
      <select id="selPagto" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;margin:6px 0 16px;font-size:14px">
        ${PAGAMENTOS.map(s => `<option value="${s}" ${s === statusPagAtual ? 'selected' : ''}>${s}</option>`).join('')}
      </select>

      <label style="font-size:12px;font-weight:600;color:#555;letter-spacing:.04em;text-transform:uppercase">Status de Entrega</label>
      <select id="selEntrega" style="width:100%;padding:10px;border:1.5px solid #ddd;border-radius:8px;margin:6px 0 24px;font-size:14px">
        ${ENTREGAS.map(s => `<option value="${s}" ${s === statusEntregaAtual ? 'selected' : ''}>${s}</option>`).join('')}
      </select>

      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('${modalId}').remove()"
          style="flex:1;padding:10px;border:1.5px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:14px">
          Cancelar
        </button>
        <button onclick="salvarStatusPedido(${numero})"
          style="flex:1;padding:10px;background:#e75480;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">
          Salvar
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function salvarStatusPedido(numero) {
  const status_pagamento = document.getElementById('selPagto')?.value;
  const status_entrega   = document.getElementById('selEntrega')?.value;

  const result = await apiFetch(`/pedidos/${numero}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status_pagamento, status_entrega })
  });

  if (result) {
    document.getElementById('statusModal')?.remove();
    showToast(`Pedido #${numero} atualizado!`, 'success');
    loadPedidos();
  }
}

async function abrirPedido(numero) {
  const resp = await apiFetch(`/pedidos/${numero}`);
  if (!resp) return;
  const data = resp.pedido || resp;

  currentPedidoNumber = numero;
  // data.itens = array parseado pelo backend; data.itens_json = string bruta (não usar .map aqui)
  let itensArr = [];
  if (Array.isArray(data.itens)) {
    itensArr = data.itens;
  } else {
    try { itensArr = JSON.parse(data.itens_json || '[]'); } catch(_) { itensArr = []; }
  }
  const itemsHtml = itensArr.map(item => `
    <div><strong>${item.quantidade}x</strong> ${item.modelo} ${item.tamanho} ${item.cor} - R$ ${(item.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
  `).join('');

  const html = `
    <p><strong>Cliente:</strong> ${data.cliente_nome}</p>
    <p><strong>WhatsApp:</strong> ${data.cliente_whatsapp}</p>
    <p><strong>Email:</strong> ${data.cliente_email || 'N/A'}</p>
    <p><strong>Valor Total:</strong> R$ ${(data.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
    <p><strong>Status Pagamento:</strong> ${data.status_pagamento}</p>
    <p><strong>Status Entrega:</strong> ${data.status_entrega}</p>
    <p><strong>Endereço:</strong> ${data.endereco_entrega || 'N/A'}</p>
    <p><strong>Itens:</strong></p>
    <div style="margin-left: 20px;">${itemsHtml || 'Nenhum item'}</div>
  `;

  document.getElementById('pedidoDetail').innerHTML = html;
  document.getElementById('pedidoModal').classList.add('active');
}

async function marcarPedidoPago() {
  if (!currentPedidoNumber) return;
  const forma = prompt('Forma de pagamento (PIX, DINHEIRO, CARTÃO):') || 'PIX';
  
  const result = await apiFetch(`/pedidos/${currentPedidoNumber}/pagamento`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'PAGO', forma_pagamento: forma })
  });

  if (result) {
    showToast('Pedido marcado como pago', 'success');
    document.getElementById('pedidoModal').classList.remove('active');
    loadPedidos();
  }
}

async function marcarPedidoEntregue() {
  if (!currentPedidoNumber) return;
  
  const result = await apiFetch(`/pedidos/${currentPedidoNumber}/entrega`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'ENTREGUE' })
  });

  if (result) {
    showToast('Pedido marcado como entregue', 'success');
    document.getElementById('pedidoModal').classList.remove('active');
    loadPedidos();
  }
}

// ========================================
// CLIENTES
// ========================================

async function loadClientes() {
  const search = document.getElementById('clienteSearch')?.value || '';
  const url = `/clientes${search ? `?busca=${encodeURIComponent(search)}&limite=50&offset=0` : ''}`;
  
  const data = await apiFetch(url);
  if (!data || !Array.isArray(data)) return;

  const html = data.map(cliente => `
    <tr>
      <td>${cliente.nome}</td>
      <td>${cliente.whatsapp}</td>
      <td>${cliente.email || 'N/A'}</td>
      <td>R$ ${(cliente.total_gasto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td>${cliente.quantidade_pedidos || 0}</td>
      <td>${cliente.data_primeiro_pedido ? new Date(cliente.data_primeiro_pedido).toLocaleDateString('pt-BR') : 'N/A'}</td>
      <td>
        <button class="btn btn-primary btn-small" onclick="abrirCliente('${cliente.id_cliente}')">Ver</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('clientesTable').querySelector('tbody').innerHTML = html;
}

async function abrirCliente(id) {
  const cliente = await apiFetch(`/clientes/${id}`);
  if (!cliente) return;

  currentClienteId = id;

  const pedidosHtml = (cliente.pedidos || []).map(pedido => `
    <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
      <strong>#${pedido.numero_pedido}</strong> - R$ ${(pedido.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${pedido.status_pagamento}
    </div>
  `).join('') || '<p>Nenhum pedido</p>';

  const html = `
    <p><strong>Nome:</strong> ${cliente.nome}</p>
    <p><strong>WhatsApp:</strong> ${cliente.whatsapp}</p>
    <p><strong>Email:</strong> ${cliente.email || 'N/A'}</p>
    <p><strong>CPF:</strong> ${cliente.cpf || 'N/A'}</p>
    <p><strong>Total Gasto:</strong> R$ ${(cliente.total_gasto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
    <p><strong>Pedidos:</strong> ${cliente.quantidade_pedidos || 0}</p>
    <p><strong>Cadastro:</strong> ${cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('pt-BR') : 'N/A'}</p>
    <h4>Histórico de Pedidos:</h4>
    ${pedidosHtml}
  `;

  document.getElementById('clienteDetail').innerHTML = html;
  document.getElementById('clienteModal').classList.add('active');
}

// ========================================
// LEADS
// ========================================

async function loadLeads() {
  const statusFilter = document.getElementById('leadStatusFilter')?.value || '';
  const url = `/leads${statusFilter ? `?status=${statusFilter}` : ''}`;
  
  const data = await apiFetch(url);
  if (!data || !Array.isArray(data)) return;

  const html = data.map(lead => `
    <tr>
      <td>${lead.nome}</td>
      <td>${lead.celular}</td>
      <td>${lead.email || 'N/A'}</td>
      <td>${lead.fonte || 'N/A'}</td>
      <td>
        <select onchange="atualizarStatusLead('${lead.id}', this.value)" class="select-box">
          <option value="novo" ${lead.status === 'novo' ? 'selected' : ''}>Novo</option>
          <option value="contatado" ${lead.status === 'contatado' ? 'selected' : ''}>Contatado</option>
          <option value="interessado" ${lead.status === 'interessado' ? 'selected' : ''}>Interessado</option>
          <option value="cliente" ${lead.status === 'cliente' ? 'selected' : ''}>Cliente</option>
          <option value="vip" ${lead.status === 'vip' ? 'selected' : ''}>VIP</option>
        </select>
      </td>
      <td>R$ ${(lead.total_gasto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join('');

  document.getElementById('leadsTable').querySelector('tbody').innerHTML = html;
}

async function atualizarStatusLead(id, novoStatus) {
  const result = await apiFetch(`/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: novoStatus })
  });

  if (result) {
    showToast('Status do lead atualizado', 'success');
  }
}

// ========================================
// SUPORTE
// ========================================

async function loadSuporte() {
  const statusFilter = document.getElementById('suporteStatusFilter')?.value || '';
  const url = `/suporte${statusFilter ? `?status=${statusFilter}` : ''}`;
  
  const data = await apiFetch(url);
  if (!data || !Array.isArray(data)) return;

  const html = data.map(ticket => `
    <tr>
      <td>#${ticket.id}</td>
      <td>${ticket.cliente_nome}</td>
      <td>${ticket.assunto}</td>
      <td>${(ticket.mensagem || '').substring(0, 50)}...</td>
      <td><span class="badge ${ticket.status === 'ABERTO' ? 'badge-warning' : 'badge-success'}">${ticket.status}</span></td>
      <td>${new Date(ticket.data_criacao).toLocaleDateString('pt-BR')}</td>
      <td>
        <button class="btn btn-primary btn-small" onclick="abrirSuporte('${ticket.id}')">Responder</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('suporteTable').querySelector('tbody').innerHTML = html;
}

async function abrirSuporte(id) {
  const data = await apiFetch(`/suporte`);
  const ticket = data?.find(t => t.id === id);
  
  if (!ticket) return;

  currentSuporteId = id;
  const html = `
    <p><strong>Cliente:</strong> ${ticket.cliente_nome}</p>
    <p><strong>Email:</strong> ${ticket.cliente_email}</p>
    <p><strong>Assunto:</strong> ${ticket.assunto}</p>
    <p><strong>Mensagem:</strong></p>
    <div style="padding: 10px; background: #f5f5f5; border-radius: 4px; margin: 10px 0;">
      ${ticket.mensagem}
    </div>
    <p><strong>Data:</strong> ${new Date(ticket.data_criacao).toLocaleDateString('pt-BR')}</p>
  `;

  document.getElementById('suporteDetail').innerHTML = html;
  document.getElementById('suporteResponse').value = '';
  document.getElementById('suporteModal').classList.add('active');
}

async function enviarRespostaSuporte() {
  if (!currentSuporteId) return;

  const resposta = document.getElementById('suporteResponse').value.trim();
  if (!resposta) {
    showToast('Digite uma resposta', 'error');
    return;
  }

  const result = await apiFetch(`/suporte/${currentSuporteId}/responder`, {
    method: 'PATCH',
    body: JSON.stringify({ resposta })
  });

  if (result) {
    showToast('Resposta enviada com sucesso', 'success');
    document.getElementById('suporteModal').classList.remove('active');
    loadSuporte();
  }
}

// ========================================
// UTILITIES
// ========================================

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function logout() {
  localStorage.removeItem('adminToken');
  window.location.href = '/admin/login.html';
}
