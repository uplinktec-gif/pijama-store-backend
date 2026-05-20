# 🎨 Customização de Branding - Portal do Cliente

## Favicon (Ícone na Aba)

### Localização
```
public/portal/favicon.svg
```

### Como está agora
- Fundo com gradiente rosa (#e75480 → #d43a70)
- Letra "P" branca (Pluma Pijamas)
- Pequeno detalhe/ponto branco

### Como Customizar

#### Opção 1: Editar o SVG direto
Abrir `public/portal/favicon.svg` e modificar:

```svg
<!-- Mudar cores -->
<stop offset="0%" style="stop-color:#SEU-COR;stop-opacity:1" />

<!-- Mudar texto -->
<text>Seu-Texto-Aqui</text>

<!-- Adicionar mais elementos SVG -->
```

#### Opção 2: Usar um PNG/ICO
Se preferir um arquivo de imagem:

1. Criar imagem 256x256 ou 512x512 pixels (PNG)
2. Colocar em `public/portal/favicon.png`
3. Atualizar em `public/portal/index.html`:
```html
<link rel="icon" type="image/png" href="/portal/favicon.png">
```

#### Opção 3: Usar Emoji (mais rápido)
No `index.html`:
```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>👕</text></svg>">
```

---

## Cores do Portal

### Paleta Atual (Pluma)
- **Primária**: `#e75480` (Rosa/Pink)
- **Primária Escura**: `#d43a70` (Rosa mais escuro)
- **Texto**: `#333` (Cinza escuro)
- **Fundo**: `#f5f7fa` → `#f0f2f5` (Gradiente cinza claro)
- **Erro**: `#856404` (Marrom alarme)
- **Sucesso**: `#155724` (Verde)

### Onde Mudar

#### 1. Cores no CSS
Abrir `public/portal/css/style.css` e procurar por:

```css
/* Exemplo: mudar cor primária */
#e75480  → Sua cor aqui
#d43a70  → Sua cor escura aqui
```

**Lugares principais:**
- Linha 20: Links
- Linha 70: Títulos (h1)
- Linha 114: Botão login
- Linha 195: Borda de cards
- Linha 252: Número de pedidos
- Linha 310: Preço

#### 2. Cores no Favicon
Editar `public/portal/favicon.svg`:
```svg
<stop offset="0%" style="stop-color:#E75480;stop-opacity:1" />
<stop offset="100%" style="stop-color:#D43A70;stop-opacity:1" />
```

---

## Logo da Pluma

### Onde Adicionar?
Se quiser adicionar o logo da Pluma em cima:

**No Header:**
```html
<div class="dashboard-header">
  <img src="/logo-pluma.png" alt="Pluma Pijamas" style="height: 40px; margin-bottom: 20px;">
  <h1>Olá, ${nome}!</h1>
</div>
```

**No Login:**
```html
<div class="login-container">
  <img src="/logo-pluma.png" alt="Pluma Pijamas" style="height: 50px; margin-bottom: 20px;">
  <h1>Pluma Pijamas</h1>
</div>
```

### Preparar Logo
1. Pegar logo PNG/SVG da Pluma (transparente é melhor)
2. Colocar em `public/logo-pluma.png` (ou `/portal/logo.png`)
3. Ajustar altura conforme necessário
4. Adicionar ao HTML

---

## Fonte (Tipografia)

### Fonte Atual
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

Isto usa a fonte do sistema do usuário (rápido, nada para baixar).

### Se Quiser Font Customizada

#### Google Fonts
Adicionar no `<head>` do `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&display=swap" rel="stylesheet">
```

Depois no CSS:
```css
body {
  font-family: 'Poppins', sans-serif;
}
```

---

## Mensagens e Textos

### Onde Mudar Textos

#### Login
Arquivo: `public/portal/js/auth.js`
```javascript
// Linha ~20
<h1>Pluma Pijamas</h1>
<p>Portal do Cliente</p>

// Linha ~60
<p class="confirmation-text">
  Digite seu CPF para acessar seu histórico de pedidos...
</p>
```

#### Dashboard
Arquivo: `public/portal/js/dashboard.js`
```javascript
// Linha ~91
<h1>Olá, ${dadosCliente.nome}!</h1>

// Linha ~98
<div class="stat-label">Pedidos</div>

// Linha ~180
<h2>📦 Seus Pedidos</h2>

// Linha ~190
<h2>✨ Recomendados para Você</h2>

// Linha ~205
<h2>💬 Fale Conosco</h2>
```

#### Confirmação de Identidade
Arquivo: `public/portal/js/auth.js`, função `mostrarConfirmacaoIdentidade`:
```javascript
<p class="confirmation-text">
  Olá, <strong>${nome}!</strong><br><br>
  Para segurança, confirme que você é o titular da conta.
</p>
```

---

## Emojis e Ícones

### Emojis Usados Atualmente

| Emoji | Onde | Significado |
|-------|------|-------------|
| 📦 | "Seus Pedidos" | Pacotes/Pedidos |
| ✨ | "Recomendações" | Produtos especiais |
| 💬 | "Fale Conosco" | Mensagem/Chat |
| 👤 | Botão Perfil | Usuário/Perfil |
| 🚪 | Botão Sair | Porta/Saída |
| ✅ | Status entregue | Checkmark |
| ⏳ | Status pago | Ampulheta |
| 🕐 | Status pendente | Relógio |
| 🚚 | Entrega | Caminhão |
| 🏪 | Retirada | Loja |

### Mudar Emojis

No arquivo `dashboard.js`, procurar pelos emojis e substituir:

```javascript
// Linha ~184
<h2>📦 Seus Pedidos</h2>  // Mudar 📦 aqui

// Linha ~194
<h2>✨ Recomendados para Você</h2>  // Mudar ✨ aqui

// Linha ~205
<h2>💬 Fale Conosco</h2>  // Mudar 💬 aqui
```

**Sites com emojis:**
- https://emojipedia.org/
- https://getemoji.com/

---

## Responsividade

### Breakpoints Atuais

```css
@media (max-width: 768px) {
  /* Mobile: até 768px */
}
```

Se quiser adicionar mais breakpoints:

```css
/* Extra pequeno (celular) */
@media (max-width: 480px) {
  .login-container { padding: 15px; }
}

/* Pequeno (celular grande) */
@media (max-width: 768px) {
  /* Atual */
}

/* Médio (tablet) */
@media (min-width: 769px) and (max-width: 1024px) {
  /* Novo */
}

/* Grande (desktop) */
@media (min-width: 1025px) {
  /* Novo */
}
```

---

## Efeitos e Animações

### Animações Atuais

| Animação | Onde | Código |
|----------|------|--------|
| Fade in | Modal abre | `fadeIn 0.3s ease` |
| Slide up | Dashboard carrega | `slideUp 0.3s ease` |
| Spin | Carregando | `spin 1s linear infinite` |
| Hover | Botões | `transform: translateY(-2px)` |

### Mudar Velocidades

No `style.css`:

```css
/* Mais rápido */
animation: slideUp 0.1s ease;  /* Era 0.3s */

/* Mais lento */
animation: spin 2s linear infinite;  /* Era 1s */
```

### Adicionar Animação Nova

```css
@keyframes sua-animacao {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Usar */
.elemento { animation: sua-animacao 0.5s ease; }
```

---

## Meta Tags (SEO/Social)

### Adicionar em `index.html` para melhor sharing:

```html
<head>
  <!-- ... atual ... -->

  <!-- Meta tags sociais -->
  <meta property="og:title" content="Portal do Cliente - Pluma Pijamas">
  <meta property="og:description" content="Acesse seu histórico de pedidos e recomendações personalizadas">
  <meta property="og:image" content="/logo-pluma.png">
  <meta property="og:url" content="https://seu-dominio.com/portal">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Portal do Cliente - Pluma Pijamas">
  <meta name="twitter:description" content="Acesse seu histórico de pedidos e recomendações personalizadas">
  <meta name="twitter:image" content="/logo-pluma.png">

  <!-- Descrição geral -->
  <meta name="description" content="Portal seguro para clientes da Pluma Pijamas. Veja seu histórico de pedidos, receba recomendações personalizadas e fale conosco.">
</head>
```

---

## Checklist de Customização

- [ ] Favicon está com as cores certas?
- [ ] Logo da Pluma adicionado (se aplicável)?
- [ ] Textos estão em português correto?
- [ ] Cores combinam com marca Pluma?
- [ ] Fonte é legível em mobile?
- [ ] Emojis fazem sentido?
- [ ] Meta tags adicionadas para SEO?
- [ ] Testado em desktop/tablet/mobile?

---

## 🎨 Dicas de Design

1. **Consistência**: Usar sempre as 3-5 mesmas cores
2. **Espaçamento**: 20px é padrão entre seções
3. **Tipografia**: Máx 2 tamanhos (grande para h1, pequeno para texto)
4. **Botões**: Sempre com feedback visual (hover, disabled state)
5. **Contraste**: Texto escuro em fundo claro (ou vice-versa)
6. **Acessibilidade**: Semântica HTML, alt-text em imagens

---

## 📞 Precisa de Help?

Se quiser fazer customizações mais complexas:
- Cores do gradiente: Editar `style.css` linhas 14-15
- Layout inteiro: Editar `index.html` > `dashboard.js`
- Fonte custom: Adicionar Google Fonts no `<head>`
- Logo próprio: Colocar arquivo PNG/SVG em `public/`

Tudo está bem organizado e comentado! 😊
