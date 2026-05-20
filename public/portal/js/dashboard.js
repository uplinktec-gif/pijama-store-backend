// Dashboard for Portal do Cliente

let dadosCliente = null;
let dadosPedidos = [];
let dadosRecomendacoes = [];

// Show dashboard
async function mostrarDashboard() {
  const app = document.getElementById('app');

  // Show loading state
  app.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh;">
      <div class="loading" style="margin-right: 15px;"></div>
      <p>Carregando seu portal...</p>
    </div>
  `;

  try {
    const idCliente = obterIdCliente();
    const nomeCliente = obterNomeCliente();

    if (!idCliente || !nomeCliente) {
      limparToken();
      verificarAutenticacao();
      return;
    }

    // Fetch data in parallel
    const [perfilResp, pedidosResp, recomendacoesResp] = await Promise.all([
      fazerRequisicao(`/api/cliente/${idCliente}/perfil`),
      fazerRequisicao(`/api/cliente/${idCliente}/pedidos`),
      fazerRequisicao(`/api/cliente/${idCliente}/recomendacoes`)
    ]);

    if (!perfilResp || !pedidosResp || !recomendacoesResp) {
      throw new Error('Erro ao carregar dados');
    }

    dadosCliente = perfilResp.perfil || perfilResp;
    dadosPedidos = pedidosResp.pedidos || [];
    dadosRecomendacoes = recomendacoesResp.recomendacoes || [];

    renderizarDashboard();
  } catch (erro) {
    console.error('Erro ao carregar dashboard:', erro);
    app.innerHTML = `
      <div class="login-container">
        <h1>Erro</h1>
        <p class="error-message show">${erro.message || 'Erro ao carregar seu portal'}</p>
        <button class="login-btn" onclick="fazerLogout()">Voltar ao Login</button>
      </div>
    `;
  }
}

// Render dashboard
function renderizarDashboard() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="dashboard-container">
      <!-- Top Navigation -->
      <div class="top-nav">
        <div class="nav-title">Portal do Cliente - Pluma Pijamas</div>
        <div class="nav-buttons">
          <button class="nav-btn" onclick="abrirModalPerfil()">👤 Meu Perfil</button>
          <button class="nav-btn" onclick="fazerLogout()">🚪 Sair</button>
        </div>
      </div>

      <!-- Header -->
      <div class="dashboard-header">
        <h1>Olá, ${dadosCliente.nome}!</h1>
        <div class="client-stats">
          <div class="stat">
            <div class="stat-value">${dadosPedidos.length}</div>
            <div class="stat-label">Pedidos</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatarMoeda(dadosCliente.total_gasto)}</div>
            <div class="stat-label">Total Gasto</div>
          </div>
          <div class="stat">
            <div class="stat-value">${dadosCliente.modelo_favorito || '-'}</div>
            <div class="stat-label">Modelo Favorito</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatarData(dadosCliente.data_ultimo_pedido)}</div>
            <div class="stat-label">Última Compra</div>
          </div>
        </div>
      </div>

      <!-- Orders Section -->
      <div class="section">
        <h2>📦 Seus Pedidos</h2>
        <div id="pedidosContainer"></div>
      </div>

      <!-- Recommendations Section -->
      <div class="section">
        <h2>✨ Recomendados para Você</h2>
        <div id="recomendacoesContainer"></div>
      </div>

      <!-- Contact Form -->
      <div class="section">
        <h2>💬 Fale Conosco</h2>
        <p style="color: #666; margin-bottom: 20px;">Tem alguma dúvida ou sugestão? Nos envie uma mensagem!</p>
        <form id="contatoForm" class="contact-form">
          <textarea
            id="mensagem"
            name="mensagem"
            placeholder="Digite sua mensagem aqui..."
            required
          ></textarea>
          <button type="submit" class="contact-btn">Enviar Mensagem</button>
          <div id="contatoFeedback" class="error-message"></div>
        </form>
      </div>
    </div>

    <!-- Profile Modal -->
    <div id="perfilModal" class="modal">
      <div class="modal-content">
        <span class="modal-close" onclick="fecharModalPerfil()">&times;</span>
        <h2 style="color: #e75480; margin-bottom: 20px;">Meu Perfil</h2>
        <div id="perfilConteudo"></div>
      </div>
    </div>

    <!-- Order Details Modal -->
    <div id="detalhesModal" class="modal">
      <div class="modal-content">
        <span class="modal-close" onclick="fecharModalDetalhes()">&times;</span>
        <div id="detalhesConteudo"></div>
      </div>
    </div>
  `;

  // Render orders
  renderizarPedidos();

  // Render recommendations
  renderizarRecomendacoes();

  // Setup contact form
  document.getElementById('contatoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    enviarMensagemContato();
  });

  // Close modals when clicking outside
  document.getElementById('perfilModal').addEventListener('click', (e) => {
    if (e.target.id === 'perfilModal') fecharModalPerfil();
  });

  document.getElementById('detalhesModal').addEventListener('click', (e) => {
    if (e.target.id === 'detalhesModal') fecharModalDetalhes();
  });
}

// Render orders
function renderizarPedidos() {
  const container = document.getElementById('pedidosContainer');

  if (!dadosPedidos || dadosPedidos.length === 0) {
    mostrarVazio(container, 'Você ainda não tem nenhum pedido. 🛍️');
    return;
  }

  let html = '';
  dadosPedidos.forEach(pedido => {
    const statusPagamento = obterTextoStatusPagamento(pedido.status_pagamento);
    const statusEntrega = obterTextoStatusEntrega(pedido.status_entrega);
    const itensFormatados = formatarItens(pedido.itens || pedido.DESCRICAO_PEDIDO || []);

    html += `
      <div class="order-card">
        <div class="order-header">
          <div class="order-number">Pedido #${pedido.numero || pedido.NUMERO_PEDIDO}</div>
          <div style="display: flex; gap: 10px;">
            <span class="order-status ${obterClasseStatus(pedido.status_pagamento)}">${statusPagamento}</span>
            <span class="order-status ${obterClasseStatus(pedido.status_entrega)}">${statusEntrega}</span>
          </div>
        </div>

        <div class="order-items">
          ${itensFormatados}
        </div>

        <div class="order-footer">
          <div>
            <div class="order-price">${formatarMoeda(pedido.valor_total || pedido.VALOR_TOTAL)}</div>
            <div class="order-date">${formatarData(pedido.data || pedido.DATA_PEDIDO)}</div>
          </div>
          <button type="button" class="order-button" onclick="abrirModalDetalhes(${pedido.numero || pedido.NUMERO_PEDIDO})">
            Ver Detalhes
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render recommendations
function renderizarRecomendacoes() {
  const container = document.getElementById('recomendacoesContainer');

  if (!dadosRecomendacoes || dadosRecomendacoes.length === 0) {
    mostrarVazio(container, 'Nenhuma recomendação disponível no momento.');
    return;
  }

  let html = '<div class="recommendations-grid">';

  dadosRecomendacoes.forEach(rec => {
    html += `
      <div class="recommendation-card">
        <div class="product-name">${rec.modelo}</div>
        <div class="product-details">
          ${rec.tamanho} • ${rec.cor}
        </div>
        <div class="product-price">${formatarMoeda(rec.preco)}</div>
        <div class="product-motivo">"${rec.motivo}"</div>
        <button type="button" class="order-button" style="width: 100%;">
          Compartilhar Modelo
        </button>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// Open profile modal
function abrirModalPerfil() {
  const modal = document.getElementById('perfilModal');
  const conteudo = document.getElementById('perfilConteudo');

  let html = `
    <div class="profile-item">
      <div class="profile-label">Nome</div>
      <div class="profile-value">${dadosCliente.nome}</div>
    </div>
    <div class="profile-item">
      <div class="profile-label">WhatsApp</div>
      <div class="profile-value">${formatarWhatsApp(dadosCliente.whatsapp)}</div>
    </div>
  `;

  if (dadosCliente.email) {
    html += `
      <div class="profile-item">
        <div class="profile-label">Email</div>
        <div class="profile-value">${dadosCliente.email}</div>
      </div>
    `;
  }

  if (dadosCliente.endereco) {
    html += `
      <div class="profile-item">
        <div class="profile-label">Endereço</div>
        <div class="profile-value">${dadosCliente.endereco}</div>
      </div>
    `;
  }

  html += `
    <div class="profile-item">
      <div class="profile-label">Total de Pedidos</div>
      <div class="profile-value">${dadosCliente.quantidade_pedidos || 0}</div>
    </div>
    <div class="profile-item">
      <div class="profile-label">Total Gasto</div>
      <div class="profile-value">${formatarMoeda(dadosCliente.total_gasto)}</div>
    </div>
    <div class="profile-item">
      <div class="profile-label">Modelo Favorito</div>
      <div class="profile-value">${dadosCliente.modelo_favorito || 'Sem favorito'}</div>
    </div>
    <div class="profile-item">
      <div class="profile-label">Primeira Compra</div>
      <div class="profile-value">${formatarData(dadosCliente.data_primeiro_pedido)}</div>
    </div>
    <div class="profile-item" style="border-bottom: none;">
      <div class="profile-label">Última Compra</div>
      <div class="profile-value">${formatarData(dadosCliente.data_ultimo_pedido)}</div>
    </div>
  `;

  conteudo.innerHTML = html;
  modal.classList.add('show');
}

// Close profile modal
function fecharModalPerfil() {
  document.getElementById('perfilModal').classList.remove('show');
}

// Open order details modal
function abrirModalDetalhes(numeroPedido) {
  const pedido = dadosPedidos.find(p => (p.numero || p.NUMERO_PEDIDO) === numeroPedido);
  if (!pedido) return;

  const modal = document.getElementById('detalhesModal');
  const conteudo = document.getElementById('detalhesConteudo');

  const statusPagamento = obterTextoStatusPagamento(pedido.status_pagamento);
  const statusEntrega = obterTextoStatusEntrega(pedido.status_entrega);
  const itensFormatados = formatarItens(pedido.itens || pedido.DESCRICAO_PEDIDO || []);

  let html = `
    <h2 style="color: #e75480; margin-bottom: 20px;">Pedido #${pedido.numero || pedido.NUMERO_PEDIDO}</h2>

    <div class="profile-item">
      <div class="profile-label">Data do Pedido</div>
      <div class="profile-value">${formatarData(pedido.data || pedido.DATA_PEDIDO)}</div>
    </div>

    <div class="profile-item">
      <div class="profile-label">Status Pagamento</div>
      <div class="profile-value">${statusPagamento}</div>
    </div>

    <div class="profile-item">
      <div class="profile-label">Status Entrega</div>
      <div class="profile-value">${statusEntrega}</div>
    </div>

    <div class="profile-item">
      <div class="profile-label">Itens</div>
      <div class="profile-value">${itensFormatados || '-'}</div>
    </div>

    <div class="profile-item">
      <div class="profile-label">Quantidade</div>
      <div class="profile-value">${pedido.quantidade_total || pedido.QUANTIDADE_TOTAL || '-'}</div>
    </div>

    <div class="profile-item">
      <div class="profile-label">Valor Total</div>
      <div class="profile-value">${formatarMoeda(pedido.valor_total || pedido.VALOR_TOTAL)}</div>
    </div>

    <div class="profile-item">
      <div class="profile-label">Tipo de Entrega</div>
      <div class="profile-value">${pedido.tipo_entrega || pedido.TIPO_ENTREGA || '-'}</div>
    </div>
  `;

  if (pedido.endereco_entrega || pedido.ENDERECO_ENTREGA) {
    html += `
      <div class="profile-item">
        <div class="profile-label">Endereço de Entrega</div>
        <div class="profile-value">${pedido.endereco_entrega || pedido.ENDERECO_ENTREGA}</div>
      </div>
    `;
  }

  if (pedido.data_entrega || pedido.DATA_ENTREGA) {
    html += `
      <div class="profile-item">
        <div class="profile-label">Data de Entrega</div>
        <div class="profile-value">${formatarData(pedido.data_entrega || pedido.DATA_ENTREGA)}</div>
      </div>
    `;
  }

  if (pedido.observacoes || pedido.OBSERVACOES) {
    html += `
      <div class="profile-item" style="border-bottom: none;">
        <div class="profile-label">Observações</div>
        <div class="profile-value">${pedido.observacoes || pedido.OBSERVACOES}</div>
      </div>
    `;
  }

  conteudo.innerHTML = html;
  modal.classList.add('show');
}

// Close order details modal
function fecharModalDetalhes() {
  document.getElementById('detalhesModal').classList.remove('show');
}

// Send contact message
async function enviarMensagemContato() {
  const idCliente = obterIdCliente();
  const textarea = document.getElementById('mensagem');
  const feedback = document.getElementById('contatoFeedback');
  const btn = document.querySelector('.contact-btn');

  const mensagem = textarea.value.trim();
  if (!mensagem) {
    feedback.textContent = 'Digite uma mensagem antes de enviar';
    feedback.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  feedback.classList.remove('show');

  try {
    const response = await fazerRequisicao(`/api/cliente/${idCliente}/contato`, {
      method: 'POST',
      body: JSON.stringify({ mensagem })
    });

    if (response && response.sucesso) {
      feedback.textContent = '✅ Mensagem enviada com sucesso! Entraremos em contato em breve.';
      feedback.style.background = '#d4edda';
      feedback.style.color = '#155724';
      feedback.classList.add('show');
      textarea.value = '';

      // Clear message after 5 seconds
      setTimeout(() => {
        feedback.classList.remove('show');
      }, 5000);
    } else {
      throw new Error(response?.mensagem || 'Erro ao enviar mensagem');
    }
  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro);
    feedback.textContent = erro.message || 'Erro ao enviar mensagem. Tente novamente.';
    feedback.style.background = '#fff3cd';
    feedback.style.color = '#856404';
    feedback.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar Mensagem';
  }
}
