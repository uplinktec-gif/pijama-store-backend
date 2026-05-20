// Utility functions for Portal do Cliente

// Format CPF with mask: XXX.XXX.XXX-XX
function formatarCPF(cpf) {
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Validate CPF format and length
function validarCPF(cpf) {
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.length === 11;
}

// Format WhatsApp number
function formatarWhatsApp(numero) {
  const cleaned = numero.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
  }
  return numero;
}

// Format date to DD/MM/YYYY
function formatarData(isoDate) {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Format currency to Brazilian real
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
}

// Get token from sessionStorage
function obterToken() {
  return sessionStorage.getItem('portalToken');
}

// Set token to sessionStorage
function salvarToken(token) {
  sessionStorage.setItem('portalToken', token);
}

// Clear token from sessionStorage
function limparToken() {
  sessionStorage.removeItem('portalToken');
  sessionStorage.removeItem('clienteId');
  sessionStorage.removeItem('clienteNome');
}

// Check if token exists and is valid
function validarToken() {
  return !!obterToken();
}

// Make API request with auth token
async function fazerRequisicao(url, opcoes = {}) {
  const token = obterToken();

  const headersDefault = {
    'Content-Type': 'application/json',
    ...opcoes.headers
  };

  if (token) {
    headersDefault['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...opcoes,
      headers: headersDefault
    });

    if (response.status === 401) {
      // Token expired or invalid
      limparToken();
      window.location.href = '/portal';
      return null;
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.mensagem || `Erro ${response.status}`);
    }

    return await response.json();
  } catch (erro) {
    console.error('Erro na requisição:', erro);
    throw erro;
  }
}

// Get status badge class
function obterClasseStatus(status) {
  const status_lower = status.toLowerCase();
  if (status_lower === 'entregue') return 'status-entregue';
  if (status_lower === 'pago') return 'status-pago';
  if (status_lower === 'pendente') return 'status-pendente';
  return 'status-pendente';
}

// Get status text in Portuguese
function obterTextoStatus(status) {
  const statusMap = {
    'ENTREGUE': '✅ Entregue',
    'PAGO': '⏳ Pago',
    'PENDENTE': '🕐 Pendente',
    'entregue': '✅ Entregue',
    'pago': '⏳ Pago',
    'pendente': '🕐 Pendente'
  };
  return statusMap[status] || status;
}

// Get client ID from sessionStorage
function obterIdCliente() {
  return sessionStorage.getItem('clienteId');
}

// Get client name from sessionStorage
function obterNomeCliente() {
  return sessionStorage.getItem('clienteNome');
}

// Set client info to sessionStorage
function salvarInfoCliente(idCliente, nomeCliente) {
  sessionStorage.setItem('clienteId', idCliente);
  sessionStorage.setItem('clienteNome', nomeCliente);
}

// Format purchase history text
function formatarHistoricoCompras(quantidadePedidos, totalGasto) {
  if (quantidadePedidos === 0) return 'Nenhuma compra ainda';
  return `${quantidadePedidos} compra${quantidadePedidos > 1 ? 's' : ''} | Total: ${formatarMoeda(totalGasto)}`;
}

// Format item list from pedido
function formatarItens(itens) {
  if (!itens) return '';

  if (Array.isArray(itens)) {
    return itens.map(item => {
      const modelo = item.modelo || '';
      const tamanho = item.tamanho || '';
      const cor = item.cor || '';
      const quantidade = item.quantidade || 1;
      return `${quantidade}x ${modelo} ${tamanho} ${cor}`.trim();
    }).join(', ');
  }

  // If it's JSON string, parse it
  try {
    const parsed = typeof itens === 'string' ? JSON.parse(itens) : itens;
    return formatarItens(parsed);
  } catch (e) {
    return String(itens);
  }
}

// Get payment status in Portuguese
function obterTextoStatusPagamento(statusPagamento) {
  const map = {
    'PAGO': '✅ PAGO',
    'PEDIDO': '⏳ PENDENTE',
    'pago': '✅ PAGO',
    'pedido': '⏳ PENDENTE'
  };
  return map[statusPagamento] || statusPagamento;
}

// Get delivery status in Portuguese
function obterTextoStatusEntrega(statusEntrega) {
  const map = {
    'ENTREGUE': '✅ ENTREGUE',
    'PENDENTE': '🚚 PENDENTE',
    'RETIRADA_NA_LOJA': '🏪 RETIRADA NA LOJA',
    'entregue': '✅ ENTREGUE',
    'pendente': '🚚 PENDENTE',
    'retirada_na_loja': '🏪 RETIRADA NA LOJA'
  };
  return map[statusEntrega] || statusEntrega;
}

// Show loading spinner
function mostrarCarregamento(elemento) {
  elemento.innerHTML = '<div class="loading"></div><p>Carregando...</p>';
}

// Show error message
function mostrarErro(elemento, mensagem) {
  elemento.innerHTML = `<div class="error-message show">${mensagem}</div>`;
}

// Show empty state
function mostrarVazio(elemento, mensagem = 'Nenhum item para exibir') {
  elemento.innerHTML = `<div class="empty-state"><p>${mensagem}</p></div>`;
}
