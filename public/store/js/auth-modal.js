/**
 * AUTH-MODAL.JS — Sistema OTP Frictionless
 * Fluxo: CPF → (cliente existe → OTP WhatsApp) | (novo → Cadastro)
 */

class AuthModal {
  constructor() {
    this.overlay   = null;
    this.token     = sessionStorage.getItem('authToken');
    this.clienteInfo = null;
    this._cpfAtual  = '';          // CPF digitado no passo 1
    this._wppMask   = '';          // "*****7766" retornado pela API
    this._estado    = 'cpf';       // 'cpf' | 'otp' | 'cadastro'
    this.init();
  }

  // ─── INIT ────────────────────────────────────────────────────────────────────

  init() {
    this._criarHTML();
    this.overlay = document.getElementById('authModalOverlay');
    this._setupListeners();
    this._restaurarSessao();
  }

  _criarHTML() {
    if (document.getElementById('authModalOverlay')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="auth-modal-overlay" id="authModalOverlay">
        <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Login Pluma">

          <div class="auth-modal-header">
            <div class="auth-modal-logo">🎀 Pluma Pijamas</div>
            <button class="auth-modal-close" id="authModalClose" aria-label="Fechar">×</button>
          </div>

          <div class="auth-modal-body" id="authModalBody">
            <!-- conteúdo dinâmico injetado por _renderEstado() -->
          </div>

        </div>
      </div>
    `);
  }

  _setupListeners() {
    document.getElementById('authModalClose')
      .addEventListener('click', () => this.fecharModal());

    // Fechar ao clicar no overlay (fora do modal)
    let mouseDownFora = false;
    this.overlay.addEventListener('mousedown', e => {
      mouseDownFora = e.target === this.overlay;
    });
    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay && mouseDownFora) this.fecharModal();
      mouseDownFora = false;
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.overlay?.classList.contains('active'))
        this.fecharModal();
    });
  }

  // ─── RENDERIZAÇÃO DOS 3 ESTADOS ──────────────────────────────────────────────

  _renderEstado(estado) {
    this._estado = estado;
    const body = document.getElementById('authModalBody');

    if (estado === 'cpf')       body.innerHTML = this._htmlCPF();
    else if (estado === 'otp')  body.innerHTML = this._htmlOTP();
    else if (estado === 'cadastro') body.innerHTML = this._htmlCadastro();

    // Listeners dos forms após re-render
    const form = body.querySelector('form');
    if (form) form.addEventListener('submit', e => {
      e.preventDefault();
      if (estado === 'cpf')      this._enviarCPF();
      else if (estado === 'otp') this._confirmarOTP();
      else                       this._confirmarCadastro();
    });

    // Formatação automática de CPF
    const cpfEl = body.querySelector('.input-cpf');
    if (cpfEl) {
      cpfEl.addEventListener('input', e => this._formatarCPF(e.target));
      if (this._cpfAtual) cpfEl.value = this._cpfAtual;
    }

    // Formatação automática de WhatsApp
    const wppEl = body.querySelector('.input-wpp');
    if (wppEl) wppEl.addEventListener('input', e => this._formatarWPP(e.target));

    // Foco automático
    setTimeout(() => {
      (body.querySelector('.input-otp') ||
       body.querySelector('.input-cpf') ||
       body.querySelector('[autofocus]'))?.focus();
    }, 100);

    // Voltar
    const backBtn = body.querySelector('.auth-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => this._renderEstado('cpf'));
  }

  _htmlCPF() {
    return `
      <div class="auth-step">
        <h2 class="auth-title">Identificação</h2>
        <p class="auth-sub">Digite seu CPF para entrar ou criar conta</p>
        <form autocomplete="off">
          <div class="auth-msg" id="authMsg"></div>
          <div class="auth-field">
            <label for="inputCPF">CPF</label>
            <input id="inputCPF" class="input-cpf"
              type="text" inputmode="numeric"
              placeholder="000.000.000-00" maxlength="14"
              autocomplete="off" required>
          </div>
          <button type="submit" class="auth-btn" id="authSubmitBtn">
            <span class="btn-text">Continuar</span>
            <span class="auth-spinner" style="display:none"></span>
          </button>
        </form>
      </div>`;
  }

  _htmlOTP() {
    return `
      <div class="auth-step">
        <h2 class="auth-title">Código de acesso</h2>
        <p class="auth-sub">
          Enviamos um código de 4 dígitos para o WhatsApp<br>
          <strong>${this._wppMask}</strong>
        </p>
        <form autocomplete="off">
          <div class="auth-msg" id="authMsg"></div>
          <div class="auth-field otp-field">
            <label for="inputOTP">Código</label>
            <input id="inputOTP" class="input-otp"
              type="text" inputmode="numeric"
              placeholder="0000" maxlength="4"
              autocomplete="one-time-code" required>
          </div>
          <button type="submit" class="auth-btn" id="authSubmitBtn">
            <span class="btn-text">Confirmar</span>
            <span class="auth-spinner" style="display:none"></span>
          </button>
          <button type="button" class="auth-back-btn">← Voltar</button>
        </form>
      </div>`;
  }

  _htmlCadastro() {
    return `
      <div class="auth-step">
        <h2 class="auth-title">Primeiro acesso 🎉</h2>
        <p class="auth-sub">Informe seu nome e WhatsApp para criar sua conta</p>
        <form autocomplete="off">
          <div class="auth-msg" id="authMsg"></div>
          <div class="auth-field">
            <label for="inputNome">Nome completo</label>
            <input id="inputNome" type="text"
              placeholder="Seu nome" maxlength="80"
              autofocus autocomplete="off" required>
          </div>
          <div class="auth-field">
            <label for="inputWPP">WhatsApp (com DDD)</label>
            <input id="inputWPP" class="input-wpp"
              type="tel" inputmode="numeric"
              placeholder="(95) 99999-9999"
              autocomplete="off" required>
          </div>
          <button type="submit" class="auth-btn" id="authSubmitBtn">
            <span class="btn-text">Criar conta e continuar</span>
            <span class="auth-spinner" style="display:none"></span>
          </button>
          <button type="button" class="auth-back-btn">← Voltar</button>
        </form>
      </div>`;
  }

  // ─── AÇÕES DOS 3 ESTADOS ─────────────────────────────────────────────────────

  async _enviarCPF() {
    const input = document.getElementById('inputCPF');
    const cpf   = (input?.value || '').replace(/\D/g, '');

    if (cpf.length !== 11) {
      this._msg('CPF inválido. Verifique os 11 dígitos.', 'erro');
      input?.focus();
      return;
    }

    this._cpfAtual = input.value; // Guardar com formatação para preservar no back
    this._loading(true);
    this._msg('');

    try {
      const res  = await fetch('/api/auth/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf })
      });
      const data = await res.json();

      if (!res.ok) {
        this._msg(data.erro || 'Erro ao verificar CPF.', 'erro');
        return;
      }

      if (data.novo_cliente) {
        // Cliente novo → mostrar cadastro
        this._renderEstado('cadastro');
      } else {
        // Cliente existe → mostrar campo de código
        this._wppMask = data.whatsapp_mascarado || '';
        this._renderEstado('otp');
      }

    } catch (_) {
      this._msg('Erro de conexão. Tente novamente.', 'erro');
    } finally {
      this._loading(false);
    }
  }

  async _confirmarOTP() {
    const codigo = (document.getElementById('inputOTP')?.value || '').trim();
    const cpf    = this._cpfAtual.replace(/\D/g, '');

    if (codigo.length !== 4 || !/^\d{4}$/.test(codigo)) {
      this._msg('Digite os 4 dígitos do código.', 'erro');
      return;
    }

    this._loading(true);
    this._msg('');

    try {
      const res  = await fetch('/api/auth/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, codigo })
      });
      const data = await res.json();

      if (!res.ok) {
        this._msg(data.erro || 'Código incorreto.', 'erro');
        return;
      }

      this._finalizarLogin(data.token, data.cliente);

    } catch (_) {
      this._msg('Erro de conexão. Tente novamente.', 'erro');
    } finally {
      this._loading(false);
    }
  }

  async _confirmarCadastro() {
    const nome = (document.getElementById('inputNome')?.value || '').trim();
    const wpp  = (document.getElementById('inputWPP')?.value  || '').replace(/\D/g, '');
    const cpf  = this._cpfAtual.replace(/\D/g, '');

    if (!nome || nome.length < 3) {
      this._msg('Nome deve ter pelo menos 3 letras.', 'erro');
      return;
    }
    if (wpp.length < 10 || wpp.length > 11) {
      this._msg('WhatsApp inválido. Use DDD + número.', 'erro');
      return;
    }

    this._loading(true);
    this._msg('');

    try {
      const res  = await fetch('/api/auth/cadastrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, nome, whatsapp: wpp })
      });
      const data = await res.json();

      // WhatsApp já tem conta → redirecionar para tela de OTP automaticamente
      if (data.tipo === 'whatsapp_existente') {
        this._wppMask = data.whatsapp_mascarado || `*****${wpp.slice(-4)}`;
        this._renderEstado('otp');
        this._msg(data.mensagem || 'Código enviado para o WhatsApp cadastrado.', 'sucesso');
        return;
      }

      if (!res.ok || !data.ok) {
        this._msg(data.erro || 'Erro ao criar conta.', 'erro');
        return;
      }

      this._finalizarLogin(data.token, data.cliente);

    } catch (_) {
      this._msg('Erro de conexão. Tente novamente.', 'erro');
    } finally {
      this._loading(false);
    }
  }

  // ─── FINALIZAÇÃO DE LOGIN ─────────────────────────────────────────────────────

  _finalizarLogin(token, cliente) {
    // Persistir sessão
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('clienteInfo', JSON.stringify(cliente));
    this.token      = token;
    this.clienteInfo = cliente;

    // Feedback de sucesso
    this._msg(`✅ Bem-vinda, ${cliente.nome.split(' ')[0]}!`, 'sucesso');

    setTimeout(() => {
      this.fecharModal();
      this.atualizarUILogado();
      window.dispatchEvent(new Event('clienteAutenticado'));
    }, 700);
  }

  // ─── RESTAURAR SESSÃO ─────────────────────────────────────────────────────────

  async _restaurarSessao() {
    if (!this.token) return;

    try {
      const res = await fetch('/auth/validar-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        this.clienteInfo = {
          id_cliente: data.id_cliente || data.cliente?.id_cliente,
          nome:       data.nome_cliente || data.cliente?.nome || data.nome,
          whatsapp:   data.whatsapp    || data.cliente?.whatsapp,
          email:      data.email       || data.cliente?.email
        };
        sessionStorage.setItem('clienteInfo', JSON.stringify(this.clienteInfo));
        this.atualizarUILogado();
      } else {
        sessionStorage.removeItem('authToken');
        this.token = null;
      }
    } catch (_) {}
  }

  // ─── ABRIR / FECHAR ──────────────────────────────────────────────────────────

  abrirModal() {
    this._cpfAtual = '';
    this._renderEstado('cpf');
    this.overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  fecharModal() {
    this.overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  // ─── UI — BOTÃO DE HEADER ────────────────────────────────────────────────────

  atualizarUILogado() {
    const btn = document.querySelector('.btn-auth-header');
    if (!btn) return;

    if (this.clienteInfo && this.token) {
      const nome = this._primeiroUltimoNome(this.clienteInfo.nome || 'Cliente');

      const wrapper = document.createElement('div');
      wrapper.className = 'user-menu-wrapper';
      wrapper.id = 'userMenuWrapper';
      wrapper.innerHTML = `
        <button class="btn-auth-header logado" id="userMenuBtn" title="Minha conta">
          <span>👤 ${nome}</span>
          <span class="user-chevron">▼</span>
        </button>
        <div class="user-dropdown" id="userDropdown">
          <div class="user-dropdown-header">
            <div class="user-dropdown-name">${this.clienteInfo.nome || nome}</div>
            <div class="user-dropdown-sub">Minha conta</div>
          </div>
          <button class="user-dropdown-item" id="btnMeusPedidos">
            <span class="item-icon">📦</span> Meus Pedidos
          </button>
          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item danger" id="btnLogout">
            <span class="item-icon">🚪</span> Sair
          </button>
        </div>`;

      btn.parentNode.replaceChild(wrapper, btn);

      document.getElementById('userMenuBtn').addEventListener('click', e => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
      });
      document.addEventListener('click', () => wrapper.classList.remove('open'));
      document.getElementById('btnMeusPedidos').addEventListener('click', () => {
        wrapper.classList.remove('open');
        this.abrirModalPedidos();
      });
      document.getElementById('btnLogout').addEventListener('click', () => {
        wrapper.classList.remove('open');
        this.logout();
      });

    } else {
      const wrapper = document.getElementById('userMenuWrapper');
      if (wrapper) {
        const b = document.createElement('button');
        b.className = 'btn-auth-header';
        b.textContent = 'Entrar';
        b.onclick = () => this.abrirModal();
        wrapper.parentNode.replaceChild(b, wrapper);
      }
    }
  }

  // ─── MODAL MEUS PEDIDOS (mantido intacto) ────────────────────────────────────

  abrirModalPedidos() {
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
            <div class="pedidos-loading"><span class="pedidos-loading-spinner">⏳</span> Carregando...</div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) this.fecharModalPedidos(); });
      document.getElementById('fecharPedidosModal').addEventListener('click', () => this.fecharModalPedidos());
    }
    overlay.classList.add('open');
    this.carregarPedidos();
  }

  fecharModalPedidos() {
    document.getElementById('pedidosModalOverlay')?.classList.remove('open');
  }

  async carregarPedidos() {
    const body = document.getElementById('pedidosModalBody');
    if (!body) return;
    try {
      let idCliente = this.clienteInfo?.id_cliente;
      if (!idCliente && this.token) {
        try { idCliente = JSON.parse(atob(this.token.split('.')[1]))?.id_cliente; } catch(_) {}
      }
      if (!idCliente) { body.innerHTML = '<div class="pedidos-vazio">🛍️<br>Você ainda não tem pedidos.</div>'; return; }

      const res = await fetch(`/api/cliente/${idCliente}/pedidos`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.status === 401) {
        sessionStorage.removeItem('authToken');
        body.innerHTML = '<div class="pedidos-vazio">🔒<br>Sessão expirada. Faça login novamente.</div>';
        return;
      }
      const data   = await res.json();
      const pedidos = data.pedidos || [];
      body.innerHTML = pedidos.length
        ? pedidos.map(p => this._renderPedidoCard(p)).join('')
        : '<div class="pedidos-vazio">🛍️<br>Você ainda não tem pedidos.</div>';
    } catch(_) {
      body.innerHTML = '<div class="pedidos-vazio">🛍️<br>Você ainda não tem pedidos.</div>';
    }
  }

  _renderPedidoCard(p) {
    let itensTexto = p.descricao_pedido || '—';
    try {
      const itens = JSON.parse(p.itens_json || '[]');
      if (itens.length) itensTexto = itens.map(i => `${i.quantidade||1}x ${i.modelo} ${i.tamanho} ${i.cor}`).join(' · ');
    } catch(_) {}

    const pgtoBadge   = { PAGO:'badge-pago ✅ Pago', PEDIDO:'badge-pendente ⏳ Aguardando', CANCELADO:'badge-cancelado ❌ Cancelado' };
    const entregaBadge = { ENTREGUE:'badge-entregue 📬 Entregue', RETIRADA_NA_LOJA:'badge-retirada 🏪 Retirado', PENDENTE:'badge-pendente 📦 Em preparo' };

    const [pc, pl] = (pgtoBadge[p.status_pagamento] || 'badge-pendente —').split(' ').reduce((a,v,i) => i===0?[v,a[1]]:[a[0],a[1]+' '+v], ['','']);
    const [ec, el] = (entregaBadge[p.status_entrega] || 'badge-pendente —').split(' ').reduce((a,v,i) => i===0?[v,a[1]]:[a[0],a[1]+' '+v], ['','']);

    return `<div class="pedido-card">
      <div class="pedido-card-header">
        <div><div class="pedido-numero">Pedido #${p.numero_pedido}</div>
          <div class="pedido-data">${p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR') : '—'}</div></div>
        <div class="pedido-badges">
          <span class="badge-status ${pc}">${pl.trim()}</span>
          <span class="badge-status ${ec}">${el.trim()}</span>
        </div>
      </div>
      <div class="pedido-itens">${itensTexto}</div>
      <div class="pedido-footer">
        <span class="pedido-valor">R$ ${parseFloat(p.valor_total||0).toFixed(2).replace('.',',')}</span>
      </div>
    </div>`;
  }

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────

  async logout() {
    try { await fetch('/auth/logout', { method: 'POST' }); } catch(_) {}
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('clienteInfo');
    this.token = null;
    this.clienteInfo = null;
    this.atualizarUILogado();
    location.reload();
  }

  // ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────

  _msg(texto, tipo = '') {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent = texto;
    el.className   = 'auth-msg' + (tipo ? ` auth-msg-${tipo}` : '');
    el.style.display = texto ? 'block' : 'none';
  }

  _loading(on) {
    const btn     = document.getElementById('authSubmitBtn');
    if (!btn) return;
    const spinner = btn.querySelector('.auth-spinner');
    const text    = btn.querySelector('.btn-text');
    btn.disabled = on;
    if (spinner) spinner.style.display = on ? 'inline-block' : 'none';
    if (text)    text.style.display    = on ? 'none' : 'inline';
  }

  _formatarCPF(input) {
    let d = input.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 9)      d = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    else if (d.length > 6) d = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    else if (d.length > 3) d = `${d.slice(0,3)}.${d.slice(3)}`;
    input.value = d;
  }

  _formatarWPP(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if      (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    input.value = v;
  }

  _primeiroUltimoNome(nome) {
    const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'Cliente';
    if (partes.length === 1) return this._cap(partes[0]);
    return `${this._cap(partes[0])} ${this._cap(partes[partes.length - 1])}`;
  }

  _cap(s) { return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : ''; }
}

// ─── INSTANCIAR ───────────────────────────────────────────────────────────────

window.authModal = null;
document.addEventListener('DOMContentLoaded', () => {
  window.authModal = new AuthModal();
});

// Retorno do Google OAuth
window.addEventListener('load', () => {
  const p = new URLSearchParams(window.location.search);
  if (p.get('auth') === 'success' && p.get('token')) {
    sessionStorage.setItem('authToken', p.get('token'));
    window.history.replaceState({}, document.title, window.location.pathname);
    location.reload();
  }
});
