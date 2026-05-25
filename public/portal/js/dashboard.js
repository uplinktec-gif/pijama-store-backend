// Dashboard for Portal do Cliente

let dadosCliente = null;
let dadosPedidos = [];
let dadosRecomendacoes = [];
let estoqueGlobal = {}; // Armazenar estoque para seleção de produtos
let produtoSelecionado = null; // Produto em seleção na modal

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

    <!-- Product Selection Modal -->
    <div id="produtoModal" class="modal">
      <div class="modal-content">
        <span class="modal-close" onclick="fecharModalProduto()">&times;</span>
        <div id="produtoConteudo"></div>
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

  document.getElementById('produtoModal').addEventListener('click', (e) => {
    if (e.target.id === 'produtoModal') fecharModalProduto();
  });

  // Carrega estoque para seleção de produtos
  carregarEstoque();

  // Conecta ao SSE para atualizações de estoque em tempo real
  conectarSSEEstoque();
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
        <button type="button" class="order-button" style="width: 100%;" onclick="abrirModalProduto('${rec.modelo}')">
          Selecionar Tamanho/Cor
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

// ===== MODAL DE SELEÇÃO DE PRODUTOS =====

// Carrega estoque disponível da API
async function carregarEstoque() {
  try {
    const response = await fazerRequisicao('/api/store/products');
    if (response && response.estoque) {
      estoqueGlobal = response.estoque;
      console.log('✓ Estoque carregado:', Object.keys(estoqueGlobal).length, 'modelos');
    }
  } catch (erro) {
    console.error('Erro ao carregar estoque:', erro);
  }
}

// Abre modal de seleção de produto
function abrirModalProduto(modelo) {
  const modal = document.getElementById('produtoModal');
  const conteudo = document.getElementById('produtoConteudo');

  produtoSelecionado = {
    modelo: modelo.toUpperCase(),
    tamanho: null,
    cor: null,
    quantidade: 1
  };

  const modeloData = estoqueGlobal[produtoSelecionado.modelo];
  if (!modeloData) {
    conteudo.innerHTML = '<p style="color: #e75480;">Modelo não encontrado</p>';
    modal.classList.add('show');
    return;
  }

  let html = `
    <h2 style="color: #e75480; margin-bottom: 20px;">${produtoSelecionado.modelo}</h2>
    <div id="etapa-tamanho">
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; margin-bottom: 10px; color: #333;">Selecione o Tamanho:</label>
        <div class="tamanho-selector">
  `;

  // Coletar tamanhos únicos
  const tamanhos = new Set();
  for (const key in modeloData) {
    const [tamanho] = key.split('|');
    tamanhos.add(tamanho);
  }

  // Renderizar botões de tamanho
  Array.from(tamanhos).sort().forEach(tamanho => {
    html += `
      <button type="button" class="size-button" onclick="selecionarTamanho('${tamanho}')">
        ${tamanho}
      </button>
    `;
  });

  html += `
        </div>
      </div>
    </div>

    <div id="etapa-cor" style="display: none;">
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; margin-bottom: 10px; color: #333;">Selecione a Cor:</label>
        <div class="color-selector" id="colorSelector"></div>
      </div>
      <button type="button" class="back-button" onclick="voltarParaTamanho()" style="margin-top: 15px;">
        ← Voltar
      </button>
    </div>

    <div id="etapa-confirmacao" style="display: none; text-align: center;">
      <h3 style="color: #333; margin-bottom: 10px;">Seleção Confirmada</h3>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p><strong>${produtoSelecionado.modelo}</strong></p>
        <p id="selecaoTexto" style="color: #666; margin: 5px 0;"></p>
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; margin-bottom: 10px;">Quantidade:</label>
        <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
          <button type="button" class="qty-btn" onclick="alterarQuantidade(-1)">−</button>
          <input type="number" id="quantidadeInput" value="1" min="1" max="10" style="width: 50px; padding: 8px; text-align: center; border: 2px solid #e0e0e0; border-radius: 8px;">
          <button type="button" class="qty-btn" onclick="alterarQuantidade(1)">+</button>
        </div>
      </div>
      <button type="button" class="order-button" style="width: 100%; background: linear-gradient(135deg, #e75480 0%, #d43a70 100%); color: white;" onclick="adicionarAoCarrinho()">
        ✓ Adicionar ao Carrinho
      </button>
      <button type="button" class="back-button" onclick="voltarParaTamanho()" style="margin-top: 10px; width: 100%;">
        ← Voltar
      </button>
    </div>
  `;

  conteudo.innerHTML = html;
  modal.classList.add('show');
}

// Seleciona um tamanho e mostra cores disponíveis
function selecionarTamanho(tamanho) {
  produtoSelecionado.tamanho = tamanho;

  const modeloData = estoqueGlobal[produtoSelecionado.modelo];
  const cores = {}; // Armazenar cor → disponibilidade

  // Coletar cores com disponibilidade para o tamanho selecionado
  for (const key in modeloData) {
    const [t, cor] = key.split('|');
    if (t === tamanho) {
      cores[cor] = modeloData[key].disponivel;
    }
  }

  if (Object.keys(cores).length === 0) {
    alert(`Nenhuma cor disponível para o tamanho ${tamanho}`);
    return;
  }

  // Mostrar tela de seleção de cor
  document.getElementById('etapa-tamanho').style.display = 'none';
  document.getElementById('etapa-cor').style.display = 'block';

  let colorHTML = '';
  const coresPorSigla = {
    'Azul': '#2563eb',
    'AZUL': '#2563eb',
    'Bordô': '#991b1b',
    'BORDÔ': '#991b1b',
    'Preto': '#1f2937',
    'PRETO': '#1f2937',
    'Cinza': '#9ca3af',
    'CINZA': '#9ca3af',
    'Branco': '#f3f4f6',
    'BRANCO': '#f3f4f6'
  };

  Object.keys(cores).sort().forEach(cor => {
    const corHex = coresPorSigla[cor] || '#cccccc';
    const disponivel = cores[cor];
    const isDisabled = disponivel === 0;
    const disabledAttr = isDisabled ? ' disabled' : '';
    const onclickAttr = isDisabled ? '' : `onclick="selecionarCor('${cor}')"`;

    colorHTML += `
      <button type="button" class="color-button" style="background-color: ${corHex}; border: 2px solid #ddd;"${disabledAttr}${onclickAttr ? ' ' + onclickAttr : ''} title="${cor}"></button>
    `;
  });

  document.getElementById('colorSelector').innerHTML = colorHTML;
}

// Seleciona uma cor e mostra confirmação
function selecionarCor(cor) {
  produtoSelecionado.cor = cor;

  document.getElementById('etapa-cor').style.display = 'none';
  document.getElementById('etapa-confirmacao').style.display = 'block';

  document.getElementById('selecaoTexto').innerHTML = `
    Tamanho: <strong>${produtoSelecionado.tamanho}</strong><br>
    Cor: <strong>${produtoSelecionado.cor}</strong>
  `;
}

// Volta para seleção de tamanho
function voltarParaTamanho() {
  produtoSelecionado.tamanho = null;
  produtoSelecionado.cor = null;

  document.getElementById('etapa-tamanho').style.display = 'block';
  document.getElementById('etapa-cor').style.display = 'none';
  document.getElementById('etapa-confirmacao').style.display = 'none';
}

// Altera quantidade
function alterarQuantidade(delta) {
  const input = document.getElementById('quantidadeInput');
  let valor = parseInt(input.value) + delta;
  if (valor < 1) valor = 1;
  if (valor > 10) valor = 10;
  input.value = valor;
  produtoSelecionado.quantidade = valor;
}

// Adiciona ao carrinho (placeholder)
function adicionarAoCarrinho() {
  alert(`✓ ${produtoSelecionado.quantidade}x ${produtoSelecionado.modelo} (${produtoSelecionado.tamanho}, ${produtoSelecionado.cor}) adicionado ao carrinho!`);
  fecharModalProduto();
}

// Conecta ao SSE para atualizações de estoque em tempo real
function conectarSSEEstoque() {
  try {
    // Cria conexão EventSource com o servidor
    const eventSource = new EventSource('/api/sse/estoque');

    // Listener para mensagem inicial de conexão
    eventSource.addEventListener('open', () => {
      console.log('✓ Conexão SSE estabelecida com sucesso');
    });

    // Listener para eventos de estoque atualizado
    eventSource.addEventListener('data', (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Se for evento de conexão inicial, ignorar
        if (msg.tipo === 'conectado') {
          console.log('✓ SSE pronto para atualizações:', msg.mensagem);
          return;
        }

        // Se for evento de estoque atualizado, recarregar
        if (msg.tipo === 'estoque-atualizado') {
          console.log('🔄 Estoque atualizado em tempo real:', msg.dados.sku);

          // Invalida cache local
          delete estoqueGlobal[msg.dados.sku];

          // Recarrega estoque do servidor
          carregarEstoque();

          // Notifica usuário (suavemente)
          mostrarNotificacaoEstoque(msg.dados);
        }

        // Se for evento de estoque criado (novo item)
        if (msg.tipo === 'estoque-criado') {
          console.log('✨ Novo item de estoque:', msg.dados.sku);
          carregarEstoque();
          mostrarNotificacaoEstoque(msg.dados, 'novo');
        }

        // Se for evento de estoque deletado
        if (msg.tipo === 'estoque-deletado') {
          console.log('❌ Item deletado:', msg.dados.sku);
          delete estoqueGlobal[msg.dados.sku];
          mostrarNotificacaoEstoque(msg.dados, 'deletado');
        }

      } catch (erro) {
        console.warn('⚠️ Erro ao processar evento SSE:', erro.message);
      }
    });

    // Listener para erros
    eventSource.addEventListener('error', (erro) => {
      console.error('❌ Erro na conexão SSE:', erro);
      // Tenta reconectar em 5 segundos
      setTimeout(() => {
        console.log('🔄 Tentando reconectar ao SSE...');
        eventSource.close();
        conectarSSEEstoque();
      }, 5000);
    });

    // Armazena referência global para poder fechar depois
    window.sseEstoqueConnection = eventSource;

  } catch (erro) {
    console.error('Erro ao conectar SSE:', erro);
  }
}

// Função auxiliar para mostrar notificação de atualização de estoque
function mostrarNotificacaoEstoque(dados, tipo = 'atualizado') {
  // Criar elemento de notificação se não existir
  let notificacoes = document.getElementById('notificacoesContainer');
  if (!notificacoes) {
    notificacoes = document.createElement('div');
    notificacoes.id = 'notificacoesContainer';
    notificacoes.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
    `;
    document.body.appendChild(notificacoes);
  }

  // Criar elemento de notificação
  const notif = document.createElement('div');
  notif.style.cssText = `
    background: #fff;
    border-left: 4px solid #e75480;
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    max-height: 100px;
    overflow: hidden;
  `;

  let mensagem = '';
  if (tipo === 'novo') {
    mensagem = `✨ Novo produto disponível: ${dados.sku || dados.modelo}`;
  } else if (tipo === 'deletado') {
    mensagem = `❌ Produto indisponível: ${dados.sku || dados.modelo}`;
  } else {
    mensagem = `🔄 ${dados.sku || dados.modelo} teve seu estoque atualizado`;
    if (dados.mudancas && dados.mudancas.quantidade_total) {
      const de = dados.mudancas.quantidade_total.de;
      const para = dados.mudancas.quantidade_total.para;
      mensagem += ` (${de} → ${para} unidades)`;
    }
  }

  notif.innerHTML = `<strong>Atualização de Estoque</strong><br>${mensagem}`;
  notificacoes.insertBefore(notif, notificacoes.firstChild);

  // Remove notificação após 5 segundos
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 5000);
}

// Adiciona CSS para animações
if (!document.getElementById('sse-animations')) {
  const style = document.createElement('style');
  style.id = 'sse-animations';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Fecha modal de produto
function fecharModalProduto() {
  document.getElementById('produtoModal').classList.remove('show');
  produtoSelecionado = null;
}
