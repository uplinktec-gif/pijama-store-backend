/**
 * AUTH-MODAL.JS
 * Sistema de autenticação por CPF e Google OAuth
 * Modal integrada à HOME e CHECKOUT
 */

class AuthModal {
  constructor() {
    this.modal = null;
    this.overlay = null;
    this.token = sessionStorage.getItem('authToken');
    this.clienteInfo = null;
    this.init();
  }

  init() {
    // Criar HTML da modal
    this.criarHTML();

    // Recuperar elementos
    this.modal = document.querySelector('.auth-modal-overlay');
    this.overlay = this.modal;

    // Listeners
    this.setupEventListeners();

    // Restaurar sessão se tiver token
    this.restaurarSessao();
  }

  criarHTML() {
    const html = `
      <div class="auth-modal-overlay" id="authModalOverlay">
        <div class="auth-modal">
          <!-- HEADER -->
          <div class="auth-modal-header">
            <h2>Bem-vindo à Pluma</h2>
            <button class="auth-modal-close" onclick="authModal.fecharModal()">×</button>
          </div>

          <!-- TABS -->
          <div class="auth-tabs">
            <button class="auth-tab active" data-tab="login">Entrar</button>
            <button class="auth-tab" data-tab="cadastro">Cadastrar</button>
          </div>

          <!-- CONTEÚDO -->
          <div class="auth-content">

            <!-- TAB 1: LOGIN -->
            <form class="auth-form active" id="loginForm" data-tab="login">
              <div id="loginError" class="auth-error"></div>
              <div id="loginSuccess" class="auth-success"></div>

              <div class="auth-form-group">
                <label>Celular com DDD</label>
                <input
                  type="tel"
                  id="loginCelular"
                  placeholder="(95) 98765-4321"
                  autocomplete="tel"
                  inputmode="numeric"
                  maxlength="16"
                >
              </div>

              <div class="auth-form-group">
                <label>CPF <span style="font-size:12px;color:#aaa;font-weight:400">(sua senha)</span></label>
                <input
                  type="text"
                  id="loginCpf"
                  placeholder="000.000.000-00"
                  autocomplete="off"
                  inputmode="numeric"
                  maxlength="14"
                >
              </div>

              <button type="submit" class="auth-btn" id="loginCpfBtn">
                <span class="btn-text">Entrar</span>
                <span class="auth-loading" style="display:none;"></span>
              </button>

              <div class="auth-divider">OU</div>

              <button type="button" class="auth-btn auth-btn-secondary" id="loginGoogleBtn">
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%234285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/%3E%3Cpath fill='%3434A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/%3E%3Cpath fill='%23FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/%3E%3Cpath fill='%23EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/%3E%3Cpath fill='none' d='M1 1h22v22H1z'/%3E%3C/svg%3E" alt="Google" />
                <span>Entrar com Gmail</span>
              </button>

              <div class="auth-help-text">
                Não tem conta? <a href="javascript:void(0)" onclick="authModal.trocarTab('cadastro')">Crie uma</a>
              </div>
            </form>

            <!-- TAB 2: CADASTRO -->
            <form class="auth-form" id="cadastroForm" data-tab="cadastro">
              <div id="cadastroError" class="auth-error"></div>
              <div id="cadastroSuccess" class="auth-success"></div>

              <div class="auth-form-group">
                <label>Nome Completo</label>
                <input
                  type="text"
                  id="cadastroNome"
                  placeholder="João Silva"
                  autocomplete="off"
                >
              </div>

              <div class="auth-form-group">
                <label>CPF</label>
                <input
                  type="text"
                  id="cadastroCpf"
                  placeholder="00000000000"
                  autocomplete="off"
                >
              </div>

              <div class="auth-form-group">
                <label>Celular <span style="color: #e75480;">*</span></label>
                <input
                  type="tel"
                  id="cadastroCelular"
                  placeholder="11987654321"
                  autocomplete="off"
                >
              </div>

              <div class="auth-form-group">
                <label>Email (opcional)</label>
                <input
                  type="email"
                  id="cadastroEmail"
                  placeholder="seu@email.com"
                  autocomplete="off"
                >
              </div>

              <button type="submit" class="auth-btn" id="cadastroBtn">
                <span class="btn-text">Criar Conta</span>
                <span class="auth-loading" style="display:none;"></span>
              </button>

              <div class="auth-help-text">
                Já tem conta? <a href="javascript:void(0)" onclick="authModal.trocarTab('login')">Faça login</a>
              </div>
            </form>

          </div>
        </div>
      </div>
    `;

    // Inserir modal no final do body
    if (!document.querySelector('.auth-modal-overlay')) {
      document.body.insertAdjacentHTML('beforeend', html);
    }
  }

  setupEventListeners() {
    // Tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.trocarTab(e.target.dataset.tab);
      });

    });

    // Formatação automática — celular: (95) 98765-4321
    const celularInput = document.getElementById('loginCelular');
    if (celularInput) {
      celularInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
        else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
        else if (v.length > 0) v = `(${v}`;
        e.target.value = v;
      });
    }

    // Formatação automática — CPF: 000.000.000-00
    const cpfInput = document.getElementById('loginCpf');
    if (cpfInput) {
      cpfInput.addEventListener('input', (e) => {
        const input = e.target;
        const cursorPos = input.selectionStart;
        const anterior = input.value;

        // Pegar só os dígitos digitados até agora
        let digits = anterior.replace(/\D/g, '').slice(0, 11);

        // Formatar
        let formatted = digits;
        if (digits.length > 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
        else if (digits.length > 6) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
        else if (digits.length > 3) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;

        if (input.value !== formatted) {
          // Ajustar cursor: contar quantos dígitos havia antes da posição do cursor
          const digitsBeforeCursor = anterior.slice(0, cursorPos).replace(/\D/g, '').length;
          input.value = formatted;

          // Reposicionar cursor na posição equivalente
          let newPos = 0;
          let digitsCount = 0;
          for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) digitsCount++;
            if (digitsCount === digitsBeforeCursor) { newPos = i + 1; break; }
          }
          input.setSelectionRange(newPos, newPos);
        }
      });
    }

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.loginComCPF();
      });
    }

    // Google button
    const googleBtn = document.getElementById('loginGoogleBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.loginComGoogle();
      });
    }

    // Cadastro form
    const cadastroForm = document.getElementById('cadastroForm');
    if (cadastroForm) {
      cadastroForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.cadastrarComCPF();
      });
    }

    // Fechar modal ao clicar no overlay (fora da modal)
    // Usa mousedown para rastrear onde o clique COMEÇOU —
    // evita fechar quando o usuário clicou dentro e arrastou o mouse pra fora
    let mouseDownNoOverlay = false;
    this.overlay.addEventListener('mousedown', (e) => {
      mouseDownNoOverlay = (e.target === this.overlay);
    });
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && mouseDownNoOverlay) {
        this.fecharModal();
      }
      mouseDownNoOverlay = false;
    });

    // Fechar com ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.fecharModal();
      }
    });
  }

  /**
   * LOGIN COM CELULAR + CPF
   */
  async loginComCPF() {
    const celularInput = document.getElementById('loginCelular');
    const cpfInput = document.getElementById('loginCpf');

    const celular = (celularInput?.value || '').replace(/\D/g, '');
    const cpf = (cpfInput?.value || '').replace(/\D/g, '');

    if (!celular || celular.length < 10) {
      this.mostrarErro('login', 'Informe o celular com DDD. Ex: (95) 98765-4321');
      celularInput?.focus();
      return;
    }

    if (!cpf || cpf.length !== 11) {
      this.mostrarErro('login', 'CPF inválido. Use 11 dígitos.');
      cpfInput?.focus();
      return;
    }

    this.mostrarLoading('loginCpfBtn', true);
    this.limparMensagens('login');

    try {
      const response = await fetch('/auth/cliente/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, cpf })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          this.mostrarMensagem('login', 'Número não encontrado. Vamos criar uma conta?', 'aviso');
          setTimeout(() => this.trocarTab('cadastro'), 1500);
        } else {
          this.mostrarErro('login', data.mensagem || 'Celular ou CPF incorretos.');
        }
        return;
      }

      // Login com sucesso!
      this.onLoginSuccess(data);

    } catch (error) {
      this.mostrarErro('login', 'Erro de conexão. Tente novamente.');
      console.error('Erro em loginComCPF:', error);
    } finally {
      this.mostrarLoading('loginCpfBtn', false);
    }
  }

  /**
   * CONFIRMAÇÃO DE IDENTIDADE
   */
  mostrarConfirmacaoIdentidade(cpf, ultimos2) {
    const loginForm = document.getElementById('loginForm');
    const conteudo = loginForm.querySelector('.auth-form-group').parentElement;

    // Limpar erros anteriores
    this.limparMensagens('login');

    // Criar HTML de confirmação
    const confirmHTML = `
      <div class="auth-confirm-identity">
        <p>Para confirmar sua identidade, digite os últimos 2 dígitos do seu CPF:</p>
        <input
          type="text"
          id="confirmIdentityInput"
          placeholder="Ex: 01"
          maxlength="2"
          autocomplete="off"
          style="text-align: center;"
        >
        <p style="font-size: 11px; color: #999; margin-top: 8px;">
          Digite apenas os 2 últimos números
        </p>
      </div>
    `;

    // Inserir confirmação
    const firstGroup = loginForm.querySelector('.auth-form-group');
    firstGroup.insertAdjacentHTML('afterend', confirmHTML);

    // Desabilitar input anterior
    document.getElementById('loginCpf').disabled = true;

    // Alterar botão
    const btn = document.getElementById('loginCpfBtn');
    btn.textContent = 'Confirmar Identidade';
    btn.onclick = (e) => {
      e.preventDefault();
      this.confirmarIdentidade(cpf, ultimos2);
    };

    // Focus no novo input
    document.getElementById('confirmIdentityInput').focus();
  }

  /**
   * CONFIRMAR IDENTIDADE - Segunda etapa
   */
  async confirmarIdentidade(cpf, ultimos2Esperados) {
    const confirmInput = document.getElementById('confirmIdentityInput');
    const digitosDigitados = confirmInput.value.trim();

    if (digitosDigitados.length !== 2 || !/^\d{2}$/.test(digitosDigitados)) {
      this.mostrarErro('login', 'Digite exatamente 2 dígitos.');
      confirmInput.focus();
      return;
    }

    this.mostrarLoading('loginCpfBtn', true);

    try {
      const response = await fetch('/auth/cliente/confirmar-identidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf,
          ultimos_2_digitos: digitosDigitados
        })
      });

      const data = await response.json();

      if (!response.ok) {
        this.mostrarErro('login', data.mensagem || 'Identidade não confirmada. Tente novamente.');
        confirmInput.value = '';
        confirmInput.focus();
        return;
      }

      // Sucesso! Salvar token
      sessionStorage.setItem('authToken', data.token);
      this.token = data.token;
      this.clienteInfo = {
        id_cliente: data.id_cliente,
        nome: data.nome,
        ja_tem_telefone: data.ja_tem_telefone
      };

      this.mostrarMensagem('login', `Bem-vindo, ${data.nome}!`, 'sucesso');
      setTimeout(() => {
        this.fecharModal();
        this.atualizarUILogado();
        window.dispatchEvent(new Event('clienteAutenticado'));
      }, 800);

    } catch (error) {
      this.mostrarErro('login', 'Erro de conexão. Tente novamente.');
      console.error('Erro em confirmarIdentidade:', error);
    } finally {
      this.mostrarLoading('loginCpfBtn', false);
    }
  }

  /**
   * CADASTRO COM CPF
   */
  async cadastrarComCPF() {
    const nome = document.getElementById('cadastroNome').value.trim();
    const cpf = document.getElementById('cadastroCpf').value.replace(/\D/g, '');
    const celular = document.getElementById('cadastroCelular').value.replace(/\D/g, '');
    const email = document.getElementById('cadastroEmail').value.trim();

    // Validações
    if (!nome || nome.length < 3) {
      this.mostrarErro('cadastro', 'Nome deve ter pelo menos 3 caracteres.');
      document.getElementById('cadastroNome').focus();
      return;
    }

    if (!cpf || cpf.length !== 11) {
      this.mostrarErro('cadastro', 'CPF inválido. Use 11 dígitos.');
      document.getElementById('cadastroCpf').focus();
      return;
    }

    if (!celular || celular.length < 10 || celular.length > 11) {
      this.mostrarErro('cadastro', 'Celular inválido. Use 10 ou 11 dígitos.');
      document.getElementById('cadastroCelular').focus();
      return;
    }

    this.mostrarLoading('cadastroBtn', true);
    this.limparMensagens('cadastro');

    try {
      const response = await fetch('/auth/cliente/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf,
          nome,
          celular,
          email: email || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        this.mostrarErro('cadastro', data.mensagem || 'Erro ao criar conta');
        return;
      }

      // Sucesso! Salvar token
      sessionStorage.setItem('authToken', data.token);
      this.token = data.token;
      this.clienteInfo = {
        id_cliente: data.id_cliente,
        nome: data.nome,
        ja_tem_telefone: true
      };

      this.mostrarMensagem('cadastro', `Conta criada com sucesso! Bem-vindo, ${data.nome}!`, 'sucesso');
      setTimeout(() => {
        this.fecharModal();
        this.atualizarUILogado();
        window.dispatchEvent(new Event('clienteAutenticado'));
      }, 1000);

    } catch (error) {
      this.mostrarErro('cadastro', 'Erro de conexão. Tente novamente.');
      console.error('Erro em cadastrarComCPF:', error);
    } finally {
      this.mostrarLoading('cadastroBtn', false);
    }
  }

  /**
   * LOGIN COM GOOGLE
   */
  loginComGoogle() {
    // Redirecionar para endpoint Google OAuth
    window.location.href = '/auth/google';
  }

  /**
   * RESTAURAR SESSÃO
   */
  async restaurarSessao() {
    if (!this.token) return;

    try {
      const response = await fetch('/auth/validar-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.clienteInfo = {
          id_cliente: data.id_cliente,
          nome: data.nome_cliente
        };
        this.atualizarUILogado();
      } else {
        // Token inválido
        sessionStorage.removeItem('authToken');
        this.token = null;
      }
    } catch (error) {
      console.error('Erro ao restaurar sessão:', error);
    }
  }

  /**
   * ATUALIZAR UI - Cliente Logado
   */
  atualizarUILogado() {
    const btn = document.querySelector('.btn-auth-header');
    if (!btn) return;

    if (this.clienteInfo && this.token) {
      const nomeCompleto = this.clienteInfo.nome || 'Cliente';
      const nomeFormatado = this.extrairPrimeiroUltimoNome(nomeCompleto);

      // Substituir botão simples por wrapper com dropdown
      const wrapper = document.createElement('div');
      wrapper.className = 'user-menu-wrapper';
      wrapper.id = 'userMenuWrapper';

      wrapper.innerHTML = `
        <button class="btn-auth-header logado" id="userMenuBtn" title="Minha conta">
          <span>👤 ${nomeFormatado}</span>
          <span class="user-chevron">▼</span>
        </button>
        <div class="user-dropdown" id="userDropdown">
          <div class="user-dropdown-header">
            <div class="user-dropdown-name">${nomeCompleto}</div>
            <div class="user-dropdown-sub">Minha conta</div>
          </div>
          <button class="user-dropdown-item" id="btnMeusPedidos">
            <span class="item-icon">📦</span> Meus Pedidos
          </button>
          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item danger" id="btnLogout">
            <span class="item-icon">🚪</span> Sair
          </button>
        </div>
      `;

      // Substituir o btn original pelo wrapper
      btn.parentNode.replaceChild(wrapper, btn);

      // Abrir/fechar dropdown ao clicar no botão
      document.getElementById('userMenuBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
      });

      // Fechar ao clicar fora
      document.addEventListener('click', () => wrapper.classList.remove('open'));

      // Ações do menu
      document.getElementById('btnMeusPedidos').addEventListener('click', () => {
        wrapper.classList.remove('open');
        this.abrirModalPedidos();
      });

      document.getElementById('btnLogout').addEventListener('click', () => {
        wrapper.classList.remove('open');
        this.logout();
      });

    } else {
      // Não logado — restaurar botão simples se necessário
      const wrapper = document.getElementById('userMenuWrapper');
      if (wrapper) {
        const btn = document.createElement('button');
        btn.className = 'btn-auth-header';
        btn.textContent = 'Entrar';
        btn.title = 'Clique para fazer login';
        btn.onclick = () => this.abrirModal();
        wrapper.parentNode.replaceChild(btn, wrapper);
      } else {
        const b = document.querySelector('.btn-auth-header');
        if (b) {
          b.innerHTML = 'Entrar';
          b.classList.remove('logado');
          b.onclick = () => this.abrirModal();
          b.title = 'Clique para fazer login';
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // MODAL MEUS PEDIDOS
  // ─────────────────────────────────────────────

  abrirModalPedidos() {
    // Criar overlay se não existir
    let overlay = document.getElementById('pedidosModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pedidos-modal-overlay';
      overlay.id = 'pedidosModalOverlay';
      overlay.innerHTML = `
        <div class="pedidos-modal" id="pedidosModal">
          <div class="pedidos-modal-header">
            <span class="pedidos-modal-title">📦 Meus Pedidos</span>
            <button class="pedidos-modal-close" id="fecharPedidosModal">✕</button>
          </div>
          <div class="pedidos-modal-body" id="pedidosModalBody">
            <div class="pedidos-loading">
              <span class="pedidos-loading-spinner">⏳</span>
              Carregando seus pedidos...
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Fechar ao clicar fora ou no X
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.fecharModalPedidos();
      });
      document.getElementById('fecharPedidosModal').addEventListener('click', () => this.fecharModalPedidos());
    }

    overlay.classList.add('open');
    this.carregarPedidos();
  }

  fecharModalPedidos() {
    const overlay = document.getElementById('pedidosModalOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  async carregarPedidos() {
    const body = document.getElementById('pedidosModalBody');
    if (!body) return;

    try {
      // Extrair id do cliente do token JWT
      let idCliente = this.clienteInfo?.id_cliente;

      if (!idCliente && this.token) {
        try {
          const payload = JSON.parse(atob(this.token.split('.')[1]));
          idCliente = payload?.id_cliente || payload?.clienteId;
        } catch (_) {}
      }

      if (!idCliente) {
        body.innerHTML = `
          <div class="pedidos-vazio">
            <div style="font-size:36px;margin-bottom:10px">🛍️</div>
            Você ainda não tem pedidos.
          </div>`;
        return;
      }

      const res = await fetch(`/api/cliente/${idCliente}/pedidos`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      // Token expirado — limpar sessão silenciosamente
      if (res.status === 401) {
        sessionStorage.removeItem('authToken');
        body.innerHTML = `
          <div class="pedidos-vazio">
            <div style="font-size:36px;margin-bottom:10px">🔒</div>
            Sessão expirada. Faça login novamente.
          </div>`;
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const pedidos = data.pedidos || [];

      if (pedidos.length === 0) {
        body.innerHTML = `
          <div class="pedidos-vazio">
            <div style="font-size:40px;margin-bottom:12px">🛍️</div>
            Você ainda não tem pedidos.<br>
            <small style="color:#ccc">Explore nossa coleção!</small>
          </div>`;
        return;
      }

      body.innerHTML = pedidos.map(p => this.renderPedidoCard(p)).join('');

    } catch (err) {
      console.error('[pedidos] Erro:', err);
      body.innerHTML = `
        <div class="pedidos-vazio">
          <div style="font-size:36px;margin-bottom:10px">🛍️</div>
          Você ainda não tem pedidos.
        </div>`;
    }
  }

  renderPedidoCard(p) {
    // Badges de status
    const badgePagto = this.badgePagamento(p.status_pagamento);
    const badgeEntrega = this.badgeEntrega(p.status_entrega);

    // Itens formatados
    let itensTexto = p.descricao_pedido || '—';
    try {
      const itens = JSON.parse(p.itens_json || '[]');
      if (itens.length > 0) {
        itensTexto = itens.map(i => `${i.quantidade || 1}x ${i.modelo} ${i.tamanho} ${i.cor}`).join(' · ');
      }
    } catch (_) {}

    // Data formatada
    const data = p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR') : '—';

    // Valor formatado
    const valor = p.valor_total ? `R$ ${parseFloat(p.valor_total).toFixed(2).replace('.', ',')}` : '—';

    // Info de entrega
    let entregaInfo = '';
    if (p.status_entrega === 'ENTREGUE' && p.data_entrega) {
      entregaInfo = `Entregue em ${new Date(p.data_entrega).toLocaleDateString('pt-BR')}`;
    } else if (p.tipo_entrega === 'RETIRADA') {
      entregaInfo = 'Retirada na loja';
    } else if (p.endereco_entrega) {
      entregaInfo = p.endereco_entrega;
    }

    return `
      <div class="pedido-card">
        <div class="pedido-card-header">
          <div>
            <div class="pedido-numero">Pedido #${p.numero_pedido}</div>
            <div class="pedido-data">${data}</div>
          </div>
          <div class="pedido-badges">
            ${badgePagto}
            ${badgeEntrega}
          </div>
        </div>
        <div class="pedido-itens">${itensTexto}</div>
        <div class="pedido-footer">
          <span class="pedido-valor">${valor}</span>
          ${entregaInfo ? `<span class="pedido-entrega-info">📍 ${entregaInfo}</span>` : ''}
        </div>
      </div>`;
  }

  badgePagamento(status) {
    const map = {
      'PAGO':      ['badge-pago',      '✅ Pago'],
      'PEDIDO':    ['badge-pendente',  '⏳ Aguardando pagamento'],
      'CANCELADO': ['badge-cancelado', '❌ Cancelado'],
    };
    const [cls, label] = map[status] || ['badge-pendente', status || '—'];
    return `<span class="badge-status ${cls}">${label}</span>`;
  }

  badgeEntrega(status) {
    const map = {
      'ENTREGUE':         ['badge-entregue', '📬 Entregue'],
      'RETIRADA_NA_LOJA': ['badge-retirada', '🏪 Retirado'],
      'EM_TRANSITO':      ['badge-transito', '🚚 A caminho'],
      'PENDENTE':         ['badge-pendente', '📦 Em preparo'],
    };
    const [cls, label] = map[status] || ['badge-pendente', status || '—'];
    return `<span class="badge-status ${cls}">${label}</span>`;
  }

  /**
   * Extrai primeiro e último nome, capitalizando cada um
   */
  extrairPrimeiroUltimoNome(nomeCompleto) {
    if (!nomeCompleto) return 'Cliente';

    const palavras = nomeCompleto.trim().split(/\s+/).filter(p => p.length > 0);

    if (palavras.length === 0) return 'Cliente';
    if (palavras.length === 1) return this.capitalizar(palavras[0]);

    const primeiro = this.capitalizar(palavras[0]);
    const ultimo = this.capitalizar(palavras[palavras.length - 1]);

    return `${primeiro} ${ultimo}`;
  }

  /**
   * Capitaliza a primeira letra de uma palavra
   */
  capitalizar(palavra) {
    if (!palavra) return '';
    return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
  }

  /**
   * LOGOUT
   */
  async logout() {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }

    sessionStorage.removeItem('authToken');
    this.token = null;
    this.clienteInfo = null;
    this.atualizarUILogado();
    location.reload();
  }

  /**
   * UTILITÁRIOS
   */

  trocarTab(tabName) {
    // Remover active de todas as tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.auth-form').forEach(form => {
      form.classList.remove('active');
    });

    // Ativar tab selecionada
    document.querySelector(`.auth-tab[data-tab="${tabName}"]`).classList.add('active');
    document.querySelector(`.auth-form[data-tab="${tabName}"]`).classList.add('active');

    // Limpar confirmação de identidade se voltou para login
    if (tabName === 'login') {
      this.resetarFormLogin();
    }
  }

  resetarFormLogin() {
    const loginForm = document.getElementById('loginForm');
    loginForm.innerHTML = `
      <div id="loginError" class="auth-error"></div>
      <div id="loginSuccess" class="auth-success"></div>

      <div class="auth-form-group">
        <label>CPF</label>
        <input
          type="text"
          id="loginCpf"
          placeholder="00000000000"
          autocomplete="off"
          inputmode="numeric"
        >
      </div>

      <button type="submit" class="auth-btn" id="loginCpfBtn">
        Entrar com CPF
      </button>

      <div class="auth-divider">OU</div>

      <button type="button" class="auth-btn auth-btn-secondary" id="loginGoogleBtn">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%234285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/%3E%3Cpath fill='%3334A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/%3E%3Cpath fill='%23FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/%3E%3Cpath fill='%23EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/%3E%3Cpath fill='none' d='M1 1h22v22H1z'/%3E%3C/svg%3E" alt="Google" />
        <span>Entrar com Gmail</span>
      </button>

      <div class="auth-help-text">
        Não tem conta? <a href="javascript:void(0)" onclick="authModal.trocarTab('cadastro')">Crie uma</a>
      </div>
    `;

    // Re-attach event listeners
    this.setupEventListeners();
  }

  mostrarErro(tab, mensagem) {
    const errorEl = document.getElementById(`${tab}Error`);
    if (errorEl) {
      errorEl.textContent = `❌ ${mensagem}`;
      errorEl.classList.add('show');
    }
  }

  mostrarMensagem(tab, mensagem, tipo = 'sucesso') {
    const elementId = tipo === 'sucesso' ? `${tab}Success` : `${tab}Error`;
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = tipo === 'sucesso' ? `✅ ${mensagem}` : `⚠️ ${mensagem}`;
      el.classList.add('show');
    }
  }

  limparMensagens(tab) {
    const errorEl = document.getElementById(`${tab}Error`);
    const successEl = document.getElementById(`${tab}Success`);
    if (errorEl) errorEl.classList.remove('show');
    if (successEl) successEl.classList.remove('show');
  }

  mostrarLoading(btnId, show) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const loader = btn.querySelector('.auth-loading');
    const text = btn.querySelector('.btn-text');

    if (show) {
      if (loader) loader.style.display = 'inline-block';
      if (text) text.style.display = 'none';
      btn.disabled = true;
    } else {
      if (loader) loader.style.display = 'none';
      if (text) text.style.display = 'inline';
      btn.disabled = false;
    }
  }

  abrirModal() {
    if (this.overlay) {
      this.overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  fecharModal() {
    if (this.overlay) {
      this.overlay.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
  }

  irParaPerfil() {
    // TODO: implementar página de perfil
    alert('Página de perfil em desenvolvimento');
  }
}

// Instanciar globalmente
window.authModal;
document.addEventListener('DOMContentLoaded', () => {
  window.authModal = new AuthModal();
});

// Verificar se retornou do Google OAuth
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auth') && params.get('auth') === 'success') {
    const token = params.get('token');
    if (token) {
      sessionStorage.setItem('authToken', token);
      // Limpar URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Recarregar para restaurar UI
      location.reload();
    }
  }
});
