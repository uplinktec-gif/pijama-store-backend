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
// Estado de filtros (cards do dashboard funcionam como atalhos)
let estoqueFiltro = { critico: false };

// Motivos válidos para baixa manual de estoque — espelha o backend
// (src/services/sqlite/estoque.js → MOTIVOS_BAIXA). Fonte da verdade é o
// servidor: toda baixa é re-validada no POST /estoque/:sku/baixa.
const MOTIVOS_BAIXA = [
  'Ação de Marketing / Permuta',
  'Uso Pessoal / Presente',
  'Defeito de Fábrica / Avaria',
  'Troca de Cliente',
  'Ajuste de Inventário (Perda/Roubo)'
];

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

  // Limpar filtro de estoque (badge "Mostrando apenas crítico")
  const limparBtn = document.getElementById('limparEstoqueFiltro');
  if (limparBtn) {
    limparBtn.addEventListener('click', () => {
      estoqueFiltro.critico = false;
      atualizarBadgeFiltro();
      loadEstoque();
    });
  }

  // Botão "Novo Item" — abre modal que herda preço do catálogo central
  const addEstoqueBtn = document.getElementById('addEstoqueBtn');
  if (addEstoqueBtn) {
    addEstoqueBtn.addEventListener('click', abrirModalNovoEstoque);
  }

  // Botões "Cancelar/X" do modal Novo Item
  document.querySelectorAll('[data-close="novoEstoqueModal"]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('novoEstoqueModal').classList.remove('active');
    });
  });

  const salvarNovoBtn = document.getElementById('salvarNovoEstoqueBtn');
  if (salvarNovoBtn) salvarNovoBtn.addEventListener('click', salvarNovoEstoque);

  // Atualiza preço exibido quando muda o modelo
  const modeloSelect = document.getElementById('novoEstoqueModelo');
  if (modeloSelect) modeloSelect.addEventListener('change', atualizarPrecoCatalogoBadge);

  // Modal de Baixa de Estoque
  const confirmarBaixaBtn = document.getElementById('confirmarBaixaBtn');
  if (confirmarBaixaBtn) confirmarBaixaBtn.addEventListener('click', confirmarBaixa);
  document.querySelectorAll('[data-close="baixaModal"]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('baixaModal').classList.remove('active');
    });
  });

  // Filtros do Relatório de Baixas
  const baixaMotivoFilter = document.getElementById('baixaMotivoFilter');
  if (baixaMotivoFilter) baixaMotivoFilter.addEventListener('change', () => loadBaixas());
  const baixaDataInicio = document.getElementById('baixaDataInicio');
  if (baixaDataInicio) baixaDataInicio.addEventListener('change', () => loadBaixas());
  const baixaDataFim = document.getElementById('baixaDataFim');
  if (baixaDataFim) baixaDataFim.addEventListener('change', () => loadBaixas());
  const baixaSearch = document.getElementById('baixaSearch');
  if (baixaSearch) baixaSearch.addEventListener('input', debounce(() => loadBaixas(), 300));

  // Widget COO (IA Diretor de Operações)
  const cooForm = document.getElementById('cooForm');
  if (cooForm) cooForm.addEventListener('submit', enviarPerguntaCOO);

  // Botão "Baixar Relatório (PDF)" no badge de filtro crítico
  const baixarPdfBtn = document.getElementById('baixarRelatorioPdfBtn');
  if (baixarPdfBtn) baixarPdfBtn.addEventListener('click', baixarRelatorioPdf);

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
    baixas: 'Relatório de Baixas',
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
    case 'baixas': loadBaixas(); break;
    case 'pedidos': loadPedidos(); break;
    case 'clientes': loadClientes(); break;
    case 'leads': loadLeads(); break;
    case 'suporte': loadSuporte(); break;
  }
}

// ========================================
// API HELPER
// ========================================

async function apiFetch(path, options = {}, extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
    ...options.headers
  };

  // Permite usar uma base diferente (ex: /api/ai-dashboard) sem perder o JWT
  const base = extra.base || API_BASE;

  try {
    const response = await fetch(`${base}${path}`, {
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

  // Backend envolve os stats em data.stats — extrair antes de renderizar
  const stats = data.stats || data;
  renderDashboardCards(stats);
  renderSalesChart(stats.grafico_7dias);
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
      type: data.pedidos_pendentes > 0 ? 'warning' : 'success',
      clickable: data.pedidos_pendentes > 0,
      action: 'goto-pedidos'
    },
    {
      title: 'Estoque Crítico',
      value: data.estoque_critico || 0,
      icon: '⚠️',
      type: data.estoque_critico > 0 ? 'critical' : 'success',
      clickable: data.estoque_critico > 0,
      action: 'filter-critico'
    },
    {
      title: 'Leads Novos',
      value: data.leads_novos || 0,
      icon: '🎯'
    }
  ];

  const html = cards.map(card => {
    const classes = ['card', card.type || '', card.clickable ? 'clickable' : ''].filter(Boolean).join(' ');
    const dataAttr = card.clickable ? `data-action="${card.action}"` : '';
    return `
      <div class="${classes}" ${dataAttr}>
        <h3>${card.icon} ${card.title}</h3>
        <div class="value">${card.value}</div>
      </div>
    `;
  }).join('');

  const container = document.getElementById('dashboardCards');
  container.innerHTML = html;

  // Listeners de clique nos cards atalho
  container.querySelectorAll('.card.clickable').forEach(el => {
    el.addEventListener('click', () => handleCardAction(el.dataset.action));
  });
}

/**
 * Trata clique em card-atalho do dashboard.
 * Cada action define um filtro e navega para a seção correspondente.
 */
function handleCardAction(action) {
  switch (action) {
    case 'filter-critico':
      estoqueFiltro.critico = true;
      showSection('estoque'); // showSection chama loadEstoque automaticamente
      break;
    case 'goto-pedidos':
      showSection('pedidos');
      break;
    default:
      console.warn('Card action desconhecida:', action);
  }
}

/**
 * Atualiza visibilidade do badge "Mostrando apenas crítico"
 */
function atualizarBadgeFiltro() {
  const badge = document.getElementById('estoqueFiltroBadge');
  if (!badge) return;
  badge.style.display = estoqueFiltro.critico ? 'inline-flex' : 'none';
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

/**
 * Cache do catálogo central (modelos + preços oficiais).
 * Carregado sob demanda, na primeira abertura do modal "Novo Item".
 */
let catalogoCache = null;

async function carregarCatalogo() {
  if (catalogoCache) return catalogoCache;
  const data = await apiFetch('/catalog');
  if (data?.success) catalogoCache = data;
  return catalogoCache;
}

function fmtMoeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function abrirModalNovoEstoque() {
  const cat = await carregarCatalogo();
  if (!cat) {
    showToast('Não consegui carregar o catálogo', 'error');
    return;
  }

  // Popular dropdowns com base no catálogo central
  const selModelo = document.getElementById('novoEstoqueModelo');
  selModelo.innerHTML = cat.catalog
    .map(c => `<option value="${c.modelo}" data-preco="${c.preco_unitario}">${c.modelo} — R$ ${fmtMoeda(c.preco_unitario)}</option>`)
    .join('');

  const selTam = document.getElementById('novoEstoqueTamanho');
  selTam.innerHTML = (cat.tamanhos || []).map(t => `<option value="${t}">${t}</option>`).join('');

  const selCor = document.getElementById('novoEstoqueCor');
  selCor.innerHTML = (cat.cores || []).map(c => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('novoEstoqueQtd').value = 0;
  atualizarPrecoCatalogoBadge();
  document.getElementById('novoEstoqueModal').classList.add('active');
}

function atualizarPrecoCatalogoBadge() {
  const sel = document.getElementById('novoEstoqueModelo');
  const opt = sel?.options[sel.selectedIndex];
  const preco = Number(opt?.dataset?.preco) || 0;
  document.getElementById('novoEstoquePrecoValor').textContent = preco > 0 ? `R$ ${fmtMoeda(preco)}` : 'sem preço no catálogo';
}

async function salvarNovoEstoque() {
  const modelo = document.getElementById('novoEstoqueModelo').value;
  const tamanho = document.getElementById('novoEstoqueTamanho').value;
  const cor = document.getElementById('novoEstoqueCor').value;
  const qtd = parseInt(document.getElementById('novoEstoqueQtd').value, 10);

  if (!modelo || !tamanho || !cor || isNaN(qtd) || qtd < 0) {
    showToast('Preencha modelo, tamanho, cor e quantidade', 'error');
    return;
  }

  // Preço NÃO é enviado — o backend usa o catálogo central
  const res = await apiFetch('/estoque', {
    method: 'POST',
    body: JSON.stringify({ modelo, tamanho, cor, quantidade_total: qtd })
  });

  if (res?.success) {
    showToast(`✓ ${res.sku} cadastrado (R$ ${fmtMoeda(res.preco_unitario)})`, 'success');
    document.getElementById('novoEstoqueModal').classList.remove('active');
    loadEstoque();
  }
}

async function loadEstoque() {
  const search = document.getElementById('estoqueSearch')?.value || '';
  // Monta query string respeitando os filtros ativos (atalhos do dashboard)
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (estoqueFiltro.critico) params.set('critico', 'true');
  const qs = params.toString();
  const data = await apiFetch(`/estoque${qs ? `?${qs}` : ''}`);

  // Sincroniza o badge visual com o estado do filtro
  atualizarBadgeFiltro();

  if (!data) return;
  const estoqueArr = Array.isArray(data) ? data : (data.estoque || []);

  const html = estoqueArr.map(item => {
    // SKU virtual = furo de grade (modelo+cor existe, mas esse tamanho nunca foi cadastrado)
    const ehFuro = item.virtual === true;
    const sufixoSku = ehFuro
      ? ` <span class="badge badge-furo" title="Tamanho não cadastrado para essa cor">furo de grade</span>`
      : '';
    const corEsc = (item.cor || '').replace(/'/g, "\\'");
    const acao = ehFuro
      ? `<button class="btn btn-primary btn-small" onclick="cadastrarFuroDeGrade('${item.modelo}','${item.tamanho}','${corEsc}')">Cadastrar</button>`
      : `<button class="btn btn-primary btn-small" onclick="editarEstoque('${item.sku}')">Editar</button>
         <button class="btn btn-danger btn-small" onclick="abrirModalBaixa('${item.sku}','${item.modelo}','${item.tamanho}','${corEsc}',${item.quantidade_disponivel})">Baixa</button>`;
    return `
      <tr class="${ehFuro ? 'row-furo' : ''}">
        <td>${item.sku}${sufixoSku}</td>
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
        <td>${acao}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('estoqueTable').querySelector('tbody').innerHTML = html;

  // Atualiza badge de filtro com contagem de furos de grade (se aplicável)
  if (estoqueFiltro.critico) {
    const furos = data?.furos_de_grade ?? estoqueArr.filter(i => i.virtual).length;
    const total = estoqueArr.length;
    const label = document.getElementById('estoqueFiltroLabel');
    if (label) {
      label.textContent = furos > 0
        ? `⚠️ Estoque crítico: ${total} item(ns) — ${furos} furo(s) de grade`
        : `⚠️ Mostrando apenas estoque crítico (${total} item${total !== 1 ? 's' : ''})`;
    }
  }
}

/**
 * Cadastra um SKU virtual (furo de grade) — reutiliza o modal de Novo Item
 * com modelo/tamanho/cor já pré-preenchidos.
 */
async function cadastrarFuroDeGrade(modelo, tamanho, cor) {
  const cat = await carregarCatalogo();
  if (!cat) {
    showToast('Não consegui carregar o catálogo', 'error');
    return;
  }

  // Popular dropdowns
  const selModelo = document.getElementById('novoEstoqueModelo');
  selModelo.innerHTML = cat.catalog
    .map(c => `<option value="${c.modelo}" data-preco="${c.preco_unitario}" ${c.modelo === modelo ? 'selected' : ''}>${c.modelo} — R$ ${fmtMoeda(c.preco_unitario)}</option>`)
    .join('');

  const selTam = document.getElementById('novoEstoqueTamanho');
  const tamanhos = cat.tamanhos || [];
  const tamanhosFinais = tamanhos.includes(tamanho) ? tamanhos : [...tamanhos, tamanho];
  selTam.innerHTML = tamanhosFinais.map(t => `<option value="${t}" ${t === tamanho ? 'selected' : ''}>${t}</option>`).join('');

  const selCor = document.getElementById('novoEstoqueCor');
  const cores = cat.cores || [];
  const coresFinais = cores.includes(cor) ? cores : [...cores, cor];
  selCor.innerHTML = coresFinais.map(c => `<option value="${c}" ${c === cor ? 'selected' : ''}>${c}</option>`).join('');

  document.getElementById('novoEstoqueQtd').value = 0;
  atualizarPrecoCatalogoBadge();
  document.getElementById('novoEstoqueModal').classList.add('active');
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
// BAIXA DE ESTOQUE + RELATÓRIO DE BAIXAS
// ========================================

// Motivos permitidos (espelha MOTIVOS_BAIXA do backend, que é a fonte da verdade
// e valida toda baixa). Usado no dropdown do modal e no filtro do relatório.
const MOTIVOS_BAIXA = [
  'Ação de Marketing / Permuta',
  'Uso Pessoal / Presente',
  'Defeito de Fábrica / Avaria',
  'Troca de Cliente',
  'Ajuste de Inventário (Perda/Roubo)'
];

/**
 * Abre o modal de baixa pré-preenchido com o item selecionado.
 */
function abrirModalBaixa(sku, modelo, tamanho, cor, disponivel) {
  document.getElementById('baixaSku').value = sku;
  document.getElementById('baixaItemInfo').innerHTML =
    `${modelo} • ${tamanho} • ${cor}<br><small style="font-weight:400;color:#666;">SKU: ${sku} — disponível: ${disponivel}</small>`;

  // Popular dropdown de motivos (sempre, para garantir lista fresca)
  const sel = document.getElementById('baixaMotivo');
  sel.innerHTML = '<option value="">— Selecione o motivo —</option>' +
    MOTIVOS_BAIXA.map(m => `<option value="${m}">${m}</option>`).join('');

  // Reset dos campos
  document.getElementById('baixaQtd').value = 1;
  document.getElementById('baixaQtd').max = disponivel;
  document.getElementById('baixaObservacao').value = '';

  document.getElementById('baixaModal').classList.add('active');
}

/**
 * Valida e confirma a baixa. Motivo é OBRIGATÓRIO — sem ele, não envia.
 */
async function confirmarBaixa() {
  const sku = document.getElementById('baixaSku').value;
  const quantidade = parseInt(document.getElementById('baixaQtd').value, 10);
  const motivo = document.getElementById('baixaMotivo').value;
  const observacao = document.getElementById('baixaObservacao').value;

  if (!quantidade || quantidade <= 0) {
    showToast('Informe uma quantidade válida (maior que zero)', 'error');
    return;
  }
  if (!motivo) {
    showToast('Selecione o motivo da baixa — é obrigatório', 'error');
    return;
  }

  const result = await apiFetch(`/estoque/${sku}/baixa`, {
    method: 'POST',
    body: JSON.stringify({ quantidade, motivo, observacao })
  });

  if (result) {
    showToast(`✓ Baixa registrada: -${quantidade} (${motivo})`, 'success');
    document.getElementById('baixaModal').classList.remove('active');
    loadEstoque();
  }
}

/**
 * Carrega o Relatório de Baixas (log_estoque) com filtros opcionais.
 */
async function loadBaixas() {
  const motivo = document.getElementById('baixaMotivoFilter')?.value || '';
  const sku = document.getElementById('baixaSearch')?.value || '';
  const dataInicio = document.getElementById('baixaDataInicio')?.value || '';
  const dataFim = document.getElementById('baixaDataFim')?.value || '';

  const params = new URLSearchParams();
  if (motivo) params.set('motivo', motivo);
  if (sku) params.set('sku', sku);
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim) params.set('data_fim', dataFim);
  const qs = params.toString();

  const data = await apiFetch(`/estoque/baixas${qs ? `?${qs}` : ''}`);
  if (!data) return;

  // Popular o filtro de motivos uma vez (a partir da fonte do backend — fonte da verdade)
  const filtro = document.getElementById('baixaMotivoFilter');
  if (filtro && filtro.options.length <= 1) {
    const motivos = Array.isArray(data.motivos) ? data.motivos : [];
    filtro.innerHTML = '<option value="">Todos os Motivos</option>' +
      motivos.map(m => `<option value="${m}">${m}</option>`).join('');
  }

  const baixas = data.baixas || [];
  const totalUnidades = baixas.reduce((acc, b) => acc + (Number(b.quantidade) || 0), 0);
  const resumo = document.getElementById('baixasResumo');
  if (resumo) {
    resumo.textContent = baixas.length
      ? `${baixas.length} baixa(s) • ${totalUnidades} unidade(s) no período/filtro`
      : '';
  }

  const tbody = document.getElementById('baixasTable').querySelector('tbody');
  if (!baixas.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px;">Nenhuma baixa registrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = baixas.map(b => {
    const dt = b.data_hora ? new Date(b.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' }) : '—';
    const produto = [b.modelo, b.tamanho, b.cor].filter(Boolean).join(' • ') || '—';
    return `
      <tr>
        <td>${dt}</td>
        <td>${escapeHtml(b.sku || '')}</td>
        <td>${escapeHtml(produto)}</td>
        <td><span class="badge badge-danger">-${b.quantidade}</span></td>
        <td>${escapeHtml(b.motivo || '')}</td>
        <td>${escapeHtml(b.observacao || '')}</td>
        <td>${escapeHtml(b.usuario || '')}</td>
      </tr>`;
  }).join('');
}

// Escape simples para evitar quebra de HTML com observações livres
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

// ========================================
// IA COO — Diretor de Operações (Dashboard)
// ========================================

// Histórico em memória (não persiste entre F5; reset a cada login)
const cooHistorico = [];

/**
 * Renderiza markdown de forma segura — se marked.js carregou, usa.
 * Caso contrário, faz escape simples e preserva quebras de linha.
 */
function renderMarkdown(texto) {
  if (typeof marked !== 'undefined' && marked.parse) {
    try {
      return marked.parse(texto, { breaks: true, gfm: true });
    } catch (e) {
      console.warn('marked falhou:', e);
    }
  }
  // Fallback: escape + <br>
  const escaped = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\n/g, '<br>');
}

/**
 * Adiciona uma mensagem (user ou bot) ao chat e dá scroll ao final.
 */
function adicionarMensagemCOO(role, conteudo, { isTyping = false } = {}) {
  const mensagens = document.getElementById('cooMensagens');
  if (!mensagens) return null;

  const wrap = document.createElement('div');
  wrap.className = `coo-msg coo-msg-${role === 'user' ? 'user' : 'bot'}`;

  const bubble = document.createElement('div');
  bubble.className = 'coo-bubble';

  if (isTyping) {
    bubble.innerHTML = `<div class="coo-typing"><span></span><span></span><span></span></div>`;
  } else if (role === 'user') {
    // Mensagem do usuário: texto puro escapado
    bubble.textContent = conteudo;
  } else {
    // Bot: render markdown
    bubble.innerHTML = renderMarkdown(conteudo);
  }

  wrap.appendChild(bubble);
  mensagens.appendChild(wrap);
  mensagens.scrollTop = mensagens.scrollHeight;
  return wrap;
}

/**
 * Envia pergunta ao backend e renderiza a resposta.
 */
// ========================================
// EXPORTAÇÃO PDF — Relatório de Reposição
// ========================================

/**
 * Captura as linhas VISÍVEIS da tabela de estoque (respeitando o filtro ativo)
 * e gera um PDF para impressão/decisão de compras.
 *
 * Colunas: SKU, Modelo, Tamanho, Cor, Disponível, Sugestão de Compra (em branco).
 *
 * Requer: jsPDF + jspdf-autotable carregados via CDN no <head>.
 */
function baixarRelatorioPdf() {
  // Verifica se as libs do CDN carregaram (defer pode demorar)
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
    showToast('Bibliotecas de PDF ainda carregando — tente novamente em 1s', 'error');
    return;
  }

  // ── 1. Capturar SOMENTE as linhas visíveis na tabela ─────────────────────
  // A ordem das colunas no DOM é: SKU | Modelo | Tamanho | Cor | Preço | Disponível | Total | Status | Ações
  // Indices que nos interessam:                0       1       2      3         5            (texto)
  const tbody = document.querySelector('#estoqueTable tbody');
  if (!tbody) {
    showToast('Tabela de estoque não encontrada', 'error');
    return;
  }

  const linhas = Array.from(tbody.querySelectorAll('tr'))
    .filter(tr => tr.offsetParent !== null) // apenas linhas realmente visíveis
    .map(tr => {
      const c = tr.querySelectorAll('td');
      // Strip sufixo "furo de grade" que aparece como badge dentro da célula SKU
      const skuLimpo = (c[0]?.textContent || '')
        .replace(/\s*furo\s+de\s+grade\s*/i, '')
        .trim();
      return {
        sku:        skuLimpo,
        modelo:     (c[1]?.textContent || '').trim(),
        tamanho:    (c[2]?.textContent || '').trim(),
        cor:        (c[3]?.textContent || '').trim(),
        disponivel: (c[5]?.textContent || '').trim(),
        ehFuro:     tr.classList.contains('row-furo')
      };
    })
    .filter(row => row.sku); // descarta linhas em branco / mensagens

  if (linhas.length === 0) {
    showToast('Nenhum item visível na tabela para exportar', 'error');
    return;
  }

  // ── 2. Inicializar jsPDF em retrato (A4 portrait) ────────────────────────
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();   // ~210mm
  const margin = 14;

  // ── 3. Cabeçalho ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Relatório de Reposição Crítica', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Pluma Pijamas — Boa Vista/RR', pageWidth / 2, 25, { align: 'center' });

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Boa_Vista' });
  const furos = linhas.filter(r => r.ehFuro).length;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em ${agora}`, margin, 32);
  const resumo = furos > 0
    ? `${linhas.length} críticos · ${furos} furos de grade`
    : `Total de itens críticos: ${linhas.length}`;
  doc.text(resumo, pageWidth - margin, 32, { align: 'right' });
  doc.setTextColor(0);

  // ── 4. Tabela com autotable ──────────────────────────────────────────────
  // Larguras das colunas somam ~ (pageWidth - 2*margin) = 182mm
  const widthDisp = pageWidth - margin * 2; // largura útil
  doc.autoTable({
    startY: 38,
    head: [['SKU', 'Modelo', 'Tamanho', 'Cor', 'Disponível', 'Sugestão de Compra (Qtd)']],
    body: linhas.map(r => [
      r.sku,
      r.modelo,
      r.tamanho,
      r.cor,
      r.disponivel,
      '' // célula em branco para preenchimento manual
    ]),
    theme: 'striped', // linhas zebradas
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [231, 84, 128], // rosa Pluma
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center'
    },
    bodyStyles: { valign: 'middle' },
    alternateRowStyles: { fillColor: [250, 245, 248] },
    columnStyles: {
      0: { cellWidth: widthDisp * 0.22, fontStyle: 'bold' }, // SKU
      1: { cellWidth: widthDisp * 0.14 },                    // Modelo
      2: { cellWidth: widthDisp * 0.10, halign: 'center' },  // Tamanho
      3: { cellWidth: widthDisp * 0.14 },                    // Cor
      4: { cellWidth: widthDisp * 0.12, halign: 'center', fontStyle: 'bold', textColor: [200, 50, 50] }, // Disponível
      5: { cellWidth: widthDisp * 0.28, fillColor: [255, 255, 255] }  // Sugestão (branco para escrever)
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Rodapé com numeração de página
      const totalPages = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${data.pageNumber} de ${totalPages}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
      doc.text(
        '🌙 Pluma Pijamas — Documento interno para reposição',
        margin,
        doc.internal.pageSize.getHeight() - 8
      );
      doc.setTextColor(0);
    }
  });

  // ── 5. Salvar ────────────────────────────────────────────────────────────
  const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  doc.save(`relatorio-reposicao-${hoje}.pdf`);
  showToast(`✓ PDF gerado: ${linhas.length} item(ns)`, 'success');
}

async function enviarPerguntaCOO(e) {
  if (e) e.preventDefault();

  const input = document.getElementById('cooInput');
  const submitBtn = document.getElementById('cooSubmit');
  const pergunta = input.value.trim();
  if (!pergunta) return;

  // UI: bloqueia input, mostra pergunta, indicador de "digitando"
  input.value = '';
  input.disabled = true;
  submitBtn.disabled = true;
  adicionarMensagemCOO('user', pergunta);
  const typingNode = adicionarMensagemCOO('bot', '', { isTyping: true });

  try {
    const data = await apiFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ pergunta, historico: cooHistorico.slice(-6) })
    }, { base: '/api/ai-dashboard' });

    if (typingNode) typingNode.remove();

    if (!data || data.error) {
      adicionarMensagemCOO('bot', `❌ ${data?.error || 'Erro ao processar pergunta.'}`);
      return;
    }

    const resposta = data.resposta || '_(resposta vazia)_';
    adicionarMensagemCOO('bot', resposta);

    // Atualiza histórico para próximas perguntas (contexto multi-turno)
    cooHistorico.push({ role: 'user', content: pergunta });
    cooHistorico.push({ role: 'assistant', content: resposta });
    // Mantém só os 12 últimos turnos (6 pares) em memória
    while (cooHistorico.length > 12) cooHistorico.shift();
  } catch (err) {
    if (typingNode) typingNode.remove();
    adicionarMensagemCOO('bot', `❌ Erro de conexão: ${err.message}`);
  } finally {
    input.disabled = false;
    submitBtn.disabled = false;
    input.focus();
  }
}
