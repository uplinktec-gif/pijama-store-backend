# 🧪 Como Testar o Admin Panel (Guia Rápido)

## ⚡ Teste Rápido em 2 Minutos

### 1. Inicie o servidor
```bash
cd C:\Users\Felipe\pijama-store-backend
npm start
```

Espere até ver:
```
✓ Servidor rodando em http://localhost:3000
✓ Database inicializado com sucesso
```

### 2. Abra o painel admin
```
http://localhost:3000/admin
```

Você deve ver uma **tela de login escura** com:
- Ícone de lua 🌙
- Título "Pluma Admin"
- Campo "Usuário"
- Campo "Senha"
- Botão "Entrar"

### 3. Faça login
```
Usuário: felipe
Senha: pijama2025
```

Clique em "Entrar"

### 4. Verifique o Dashboard
Após login, você deve ver:
- Sidebar esquerda com menu (📊 Dashboard, 📋 Pedidos, 📦 Estoque, etc)
- Dashboard com 4 cards (Vendas Hoje, Vendas Mês, Pedidos Pendentes, Estoque Crítico)
- Gráfico de vendas dos últimos 7 dias
- Últimos pedidos

### 5. Teste a seção ESTOQUE
1. Clique em "📦 Estoque" no menu
2. Deve carregar uma tabela com **140 itens**
3. Colunas: Modelo, Tamanho, Cor, Disponível, Reservado, Total, Preço, Status, Editar

### 6. Faça logout
1. Clique no botão "🚪 Logout" (parte inferior da sidebar)
2. Você volta para a tela de login

---

## 🔐 Credenciais Disponíveis

| Usuário | Senha | Role | Descrição |
|---------|-------|------|-----------|
| **felipe** | pijama2025 | admin | Admin completo |
| jully | jully2025 | operador | Operador (Júlly) |
| pluma | pluma2025 | operador | Operador (Pluma) |

---

## ✅ Checklist de Funcionamento

- [ ] Login modal carrega
- [ ] Login com "felipe / pijama2025" funciona
- [ ] Dashboard exibe 4 cards com dados
- [ ] Seção Estoque carrega 140 itens
- [ ] Token é armazenado (verifique DevTools → Application → localStorage → admin_token)
- [ ] Logout button funciona
- [ ] Após logout, tela volta ao login

---

## 🐛 Se Algo Não Funcionar

### Problema: Tela fica em branco
**Solução:** Abra DevTools (F12) → Console. Procure por erros em vermelho.

### Problema: "Token não fornecido"
**Solução:** Certifique-se que fez login. O token é armazenado em localStorage automaticamente.

### Problema: Estoque carrega vazio
**Solução:** Isso não deve acontecer (há 140 registros). Se acontecer, verifique DevTools → Network e procure por erros na requisição GET /admin/api/estoque.

### Problema: Servidor não inicia
**Solução:** 
```bash
# Verifique se a porta 3000 está livre
netstat -ano | findstr :3000

# Se estiver em uso, mate o processo
taskkill /PID <PID> /F

# Ou mude a porta
set PORT=3001 && npm start
```

---

## 🔍 Teste via Curl (Sem UI)

Se preferir testar via linha de comando:

### Login
```bash
curl -X POST http://localhost:3000/admin/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"usuario\":\"felipe\",\"senha\":\"pijama2025\"}"
```

Copie o `token` da resposta.

### Acessar Estoque com Token
```bash
curl http://localhost:3000/admin/api/estoque \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

Deve retornar JSON com 140 itens.

---

## 📱 Teste em Diferentes Navegadores

- ✅ Chrome
- ✅ Firefox  
- ✅ Edge
- ✅ Safari (macOS)

---

## 🔧 Troubleshooting Detalhado

### DevTools Console Errors?
1. Abra F12 → Console
2. Procure por erros em vermelho
3. Se disser "TypeError: fetch is not a function", há problema na estrutura do admin.js

### Network Tab?
1. Abra F12 → Network
2. Recarregue a página (F5)
3. Procure por requisição POST `/admin/api/auth/login`
   - Status deve ser 200 OK
   - Response deve ter campo `token`
4. Procure por requisição GET `/admin/api/estoque`
   - Status deve ser 200 OK
   - Response deve ter `items` array com 140 elementos

### LocalStorage?
1. Abra F12 → Application → Storage → Local Storage
2. Procure por domínio localhost:3000
3. Deve haver chave `admin_token` com um valor longo (JWT)

---

## 🎯 O Que Testa a Implementação?

✅ **Autenticação:**
- Requisição POST ao `/admin/api/auth/login` com credenciais
- Retorno de JWT token
- Armazenamento seguro em localStorage

✅ **Autorização:**
- Token injetado em cada requisição via Authorization header
- Middleware adminAuth valida token
- Acesso negado sem token (401)

✅ **Dados:**
- Acesso à API `/admin/api/estoque` com dados reais
- 140 itens de estoque carregados
- Cálculo correto de disponibilidade (total - reservado)

✅ **UX:**
- Login/logout funcionam
- Sidebar/dashboard mostram/ocultam corretamente
- Toast notifications funcionam

---

## 📊 Estatísticas Esperadas

```
Total de itens no estoque:      140
Total disponível:               64 (alguns com quantidade 0)
Modelos disponíveis:            ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE
Tamanhos:                       P, M, G, GG, XG
Cores:                          Azul Marinho, Preto, Bordô, Cinza, Marrom, etc
```

---

## 🚀 Próximo Passo

Após validar que tudo está funcionando:
1. Fazer login e explorar as outras seções (Pedidos, Clientes, Leads, Suporte)
2. Verificar se os dados das outras seções também carregam corretamente
3. Testar edição de estoque (clicar em "Editar" e mudar quantidade)

---

**Dúvidas?** Consulte `ADMIN_PANEL_FIXES.md` para detalhes técnicos.

---

Data: 2026-05-23  
Versão: 1.0  
Status: ✅ Pronto para usar
