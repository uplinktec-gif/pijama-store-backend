// Authentication logic for Portal do Cliente

// Check if user is already authenticated
function verificarAutenticacao() {
  if (validarToken()) {
    // User already authenticated, go to dashboard
    mostrarDashboard();
    return;
  }
  mostrarLogin();
}

// Render login form
function mostrarLogin() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="login-container">
      <h1>Pluma Pijamas</h1>
      <p>Portal do Cliente</p>

      <div id="errorMessage" class="error-message"></div>

      <form id="loginForm">
        <div class="form-group">
          <label for="cpf">CPF</label>
          <input
            type="text"
            id="cpf"
            name="cpf"
            placeholder="000.000.000-00"
            required
            autocomplete="off"
          >
        </div>

        <button type="submit" class="login-btn">
          Acessar Portal
        </button>
      </form>

      <p class="confirmation-text">
        Digite seu CPF para acessar seu histórico de pedidos e recomendações personalizadas.
      </p>
    </div>
  `;

  const form = document.getElementById('loginForm');
  const cpfInput = document.getElementById('cpf');

  // Format CPF input as user types
  cpfInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      if (value.length <= 3) {
        e.target.value = value;
      } else if (value.length <= 6) {
        e.target.value = value.slice(0, 3) + '.' + value.slice(3);
      } else if (value.length <= 9) {
        e.target.value = value.slice(0, 3) + '.' + value.slice(3, 6) + '.' + value.slice(6);
      } else {
        e.target.value = value.slice(0, 3) + '.' + value.slice(3, 6) + '.' + value.slice(6, 9) + '-' + value.slice(9, 11);
      }
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    executarLogin();
  });
}

// Handle login
async function executarLogin() {
  const cpfInput = document.getElementById('cpf');
  const errorDiv = document.getElementById('errorMessage');
  const cpf = cpfInput.value.replace(/\D/g, '');

  errorDiv.classList.remove('show');
  errorDiv.textContent = '';

  // Validate CPF
  if (!validarCPF(cpf)) {
    mostrarErroLogin('CPF inválido. Digite um CPF com 11 dígitos.');
    return;
  }

  // Disable button
  const btn = document.querySelector('.login-btn');
  btn.disabled = true;
  btn.textContent = 'Autenticando...';

  try {
    const response = await fazerRequisicao('/api/cliente/autenticar', {
      method: 'POST',
      body: JSON.stringify({ cpf })
    });

    if (!response) {
      throw new Error('Erro ao autenticar');
    }

    if (!response.sucesso) {
      mostrarErroLogin(response.mensagem || 'Erro ao autenticar');
      btn.disabled = false;
      btn.textContent = 'Acessar Portal';
      return;
    }

    // Store token and client info
    salvarToken(response.token);
    salvarInfoCliente(response.id_cliente, response.nome);

    // Show confirmation with last 2 CPF digits
    mostrarConfirmacaoIdentidade(response.nome, response.ultimos_dois_cpf);
  } catch (erro) {
    console.error('Erro no login:', erro);
    mostrarErroLogin(erro.message || 'Erro ao conectar. Tente novamente.');
    btn.disabled = false;
    btn.textContent = 'Acessar Portal';
  }
}

// Show identity confirmation
function mostrarConfirmacaoIdentidade(nome, ultimosDoisDigitos) {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="login-container">
      <h1>Confirme sua Identidade</h1>
      <p class="confirmation-text">
        Olá, <strong>${nome}!</strong><br><br>
        Para segurança, confirme que você é o titular da conta.<br><br>
        <strong>Últimos 2 dígitos do CPF: ${ultimosDoisDigitos}</strong>
      </p>

      <button id="confirmarBtn" class="login-btn">
        Sim, é meu CPF
      </button>
      <button id="cancelarBtn" class="login-btn" style="background: white; color: #e75480; border: 2px solid #e75480; margin-top: 10px;">
        Cancelar
      </button>
    </div>
  `;

  document.getElementById('confirmarBtn').addEventListener('click', () => {
    mostrarDashboard();
  });

  document.getElementById('cancelarBtn').addEventListener('click', () => {
    limparToken();
    mostrarLogin();
  });
}

// Show error message in login form
function mostrarErroLogin(mensagem) {
  const errorDiv = document.getElementById('errorMessage');
  if (errorDiv) {
    errorDiv.textContent = mensagem;
    errorDiv.classList.add('show');
  }
}

// Logout
function fazerLogout() {
  limparToken();
  verificarAutenticacao();
}

// Initialize app
function inicializarApp() {
  verificarAutenticacao();
}
