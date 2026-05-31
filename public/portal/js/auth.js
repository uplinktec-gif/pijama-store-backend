// Authentication logic for Portal do Cliente (Session-based)

// Check if user is already authenticated by attempting to fetch dashboard
async function verificarAutenticacao() {
  try {
    const response = await fetch('/api/store/user', {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const user = await response.json();
      mostrarDashboard(user);
    } else {
      mostrarLogin();
    }
  } catch (error) {
    console.error('Erro ao verificar autenticação:', error);
    mostrarLogin();
  }
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
          <label for="email">Email</label>
          <input
            type="text"
            id="email"
            name="email"
            placeholder="seu@email.com"
            required
            autocomplete="off"
          >
        </div>

        <button type="submit" class="login-btn">
          Acessar Portal
        </button>
      </form>

      <p class="confirmation-text">
        Digite seu email para acessar seu histórico de pedidos e recomendações personalizadas.
      </p>
    </div>
  `;

  const form = document.getElementById('loginForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    executarLogin();
  });
}

// Handle login
async function executarLogin() {
  const emailInput = document.getElementById('email');
  const errorDiv = document.getElementById('errorMessage');
  const email = emailInput.value.trim();

  errorDiv.classList.remove('show');
  errorDiv.textContent = '';

  // Validate email is not empty
  if (!email) {
    mostrarErroLogin('Por favor, digite seu email.');
    return;
  }

  // Disable button
  const btn = document.querySelector('.login-btn');
  btn.disabled = true;
  btn.textContent = 'Autenticando...';

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ cpf: email })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      mostrarErroLogin(data.error || 'Email não encontrado.');
      btn.disabled = false;
      btn.textContent = 'Acessar Portal';
      return;
    }

    // Success - navigate to portal
    setTimeout(() => {
      window.location.href = data.redirect || '/portal/dashboard';
    }, 500);
  } catch (erro) {
    console.error('Erro no login:', erro);
    mostrarErroLogin('Erro ao conectar. Tente novamente.');
    btn.disabled = false;
    btn.textContent = 'Acessar Portal';
  }
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
async function fazerLogout() {
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
  }
  window.location.href = '/portal';
}

// Initialize app
function inicializarApp() {
  verificarAutenticacao();
}
