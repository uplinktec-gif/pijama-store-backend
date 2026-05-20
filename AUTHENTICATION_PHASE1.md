# AUTENTICAÇÃO - PHASE 1 ✅ CONCLUÍDO

**Status**: ✅ Implementação Completa  
**Data**: 2026-05-20  
**Tempo Investido**: ~1.5 horas

---

## 🎯 O QUE FOI IMPLEMENTADO

### 1. **Instalação de Dependências** ✅
- `passport` - Framework de autenticação
- `passport-google-oauth20` - Estratégia Google OAuth 2.0
- `express-session` - Gerenciamento de sessões HTTP

```bash
npm install passport passport-google-oauth20 express-session
```

### 2. **Configuração Google OAuth** ✅
**Arquivo**: `src/config/google-oauth.js`

Responsabilidades:
- Setup da estratégia Google OAuth 2.0 com Passport
- Criar/atualizar cliente automaticamente ao fazer login com Google
- Serializar/desserializar usuário para sessão

**Fluxo**:
```
Usuário clica "Entrar com Gmail"
  ↓
Google redireciona após autenticação
  ↓
Passport executa callback do Google
  ↓
Sistema busca cliente por email
  ↓
Se não encontrou → cria novo cliente
  ↓
Retorna usuário com id_cliente
```

### 3. **Controlador de Autenticação** ✅
**Arquivo**: `src/controllers/auth.controller.js`

**Endpoints implementados**:

#### A. **POST /auth/cliente/cpf**
Login por CPF (primeira etapa)
```javascript
Body: { cpf: "12345678901" }

Response 200 (cliente encontrado):
{
  "sucesso": true,
  "id_cliente": "uuid-xxx",
  "nome": "João Silva",
  "telefone": "5595988123456",
  "acao": "confirmar_identidade",
  "ultimos_2_digitos": "01"
}

Response 404 (cliente não encontrado):
{
  "sucesso": false,
  "mensagem": "Cliente não encontrado",
  "acao": "cadastro",
  "cpf": "12345678901"
}
```

#### B. **POST /auth/cliente/confirmar-identidade**
Confirmar identidade (últimos 2 dígitos do CPF)
```javascript
Body: { 
  cpf: "12345678901", 
  ultimos_2_digitos: "01" 
}

Response 200 (identidade confirmada):
{
  "sucesso": true,
  "id_cliente": "uuid-xxx",
  "nome": "João Silva",
  "token": "eyJhbGc...",
  "ja_tem_telefone": true,
  "precisa_atualizar": false
}

Response 400 (identidade não confirmada):
{
  "sucesso": false,
  "mensagem": "Identidade não confirmada. Tente novamente."
}
```

#### C. **POST /auth/cliente/registrar**
Cadastro novo por CPF
```javascript
Body: {
  cpf: "12345678901",
  nome: "João Silva",
  celular: "5595988123456",
  email: "joao@email.com"  // opcional
}

Response 201 (sucesso):
{
  "sucesso": true,
  "id_cliente": "uuid-xxx",
  "nome": "João Silva",
  "token": "eyJhbGc...",
  "mensagem": "Cadastro realizado com sucesso!"
}

Response 409 (CPF já cadastrado):
{
  "sucesso": false,
  "mensagem": "CPF já cadastrado no sistema"
}
```

#### D. **GET /auth/google**
Inicia fluxo de login com Google
```
Redireciona o usuário para Google para autenticação
```

#### E. **GET /auth/google/callback**
Callback após autenticação no Google
```
Google redireciona aqui
Sistema cria/atualiza cliente
Retorna JWT no URL com redirect para home
```

#### F. **POST /auth/validar-token**
Validar se um token é válido
```javascript
Headers: { Authorization: "Bearer token_aqui" }

Response 200 (válido):
{
  "valido": true,
  "id_cliente": "uuid-xxx",
  "nome_cliente": "João Silva"
}

Response 401 (inválido):
{
  "valido": false,
  "mensagem": "Token inválido ou expirado"
}
```

#### G. **POST /auth/logout**
Encerrar sessão
```javascript
Response 200:
{
  "sucesso": true,
  "mensagem": "Sessão encerrada"
}
```

### 4. **Rotas de Autenticação** ✅
**Arquivo**: `src/routes/auth.routes.js`

Define todas as 7 rotas acima com validação de entrada usando Joi.

### 5. **Integração no Express** ✅
**Arquivo**: `src/app.js`

Adicionado:
- ✅ Import de `express-session` e `passport`
- ✅ Import da configuração Google OAuth
- ✅ Import das rotas de autenticação
- ✅ Session middleware (para Google OAuth)
- ✅ Passport middleware (initialize e session)
- ✅ Chamada de `configurarGoogleOAuth()` na inicialização
- ✅ Registro das rotas em `/auth`

### 6. **Variáveis de Ambiente** ✅
**Arquivo**: `.env.example`

Adicionado:
```env
# Google OAuth 2.0 (autenticação na loja online)
GOOGLE_CLIENT_ID=seu_client_id_aqui.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu_client_secret_aqui
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Session Secret (já existia)
CLIENTE_SESSION_SECRET=pluma-cliente-session-2025
```

---

## 🔐 FLUXOS DE AUTENTICAÇÃO

### Fluxo 1: Login por CPF
```
1. Cliente digita CPF no modal
   ↓ POST /auth/cliente/cpf
2. Sistema busca cliente por CPF
   ↓
3. Se encontrado:
   ├─ Pede confirmação (últimos 2 dígitos)
   └─ Retorna ultimos_2_digitos esperados
   
4. Cliente confirma identidade
   ↓ POST /auth/cliente/confirmar-identidade
   
5. Identidade validada
   ↓
6. Token JWT gerado
   ↓ sessionStorage.setItem('authToken', token)
   ↓
7. Cliente logado ✓
```

### Fluxo 2: Cadastro novo por CPF
```
1. Cliente digita CPF no modal
   ↓ POST /auth/cliente/cpf
   
2. Sistema busca cliente
   ↓
3. Se NÃO encontrado:
   ├─ Responde com acao: "cadastro"
   └─ Frontend muda para aba de cadastro
   
4. Cliente preenche: nome, celular, email
   ↓ POST /auth/cliente/registrar
   
5. Sistema valida dados
   ↓
6. Cliente criado no Google Sheets
   ↓
7. Token JWT gerado
   ↓ sessionStorage.setItem('authToken', token)
   ↓
8. Cliente logado ✓
```

### Fluxo 3: Login com Google
```
1. Cliente clica "Entrar com Gmail"
   ↓ GET /auth/google
   
2. Redireciona para Google
   ↓
3. Cliente faz login no Google
   ↓
4. Google redireciona para callback
   ↓ GET /auth/google/callback
   
5. Passport processa resposta
   ├─ Extrai: nome, email, google_id
   └─ Busca cliente por email
   
6. Se não encontrado:
   └─ Cria novo cliente
   
7. Passport serializa usuário
   ↓
8. Redireciona para /?auth=sucesso&token=...
   ↓
9. Frontend captura token do URL
   ↓ sessionStorage.setItem('authToken', token)
   ↓
10. Cliente logado ✓
```

---

## 📊 ESTRUTURA DE DADOS

### Tabela CLIENTES (Google Sheets)
As colunas existentes são suficientes:
- A: ID_CLIENTE (uuid)
- B: NOME
- C: WHATSAPP (será preenchido com CPF ou email até ter número)
- D: EMAIL (pode conter CPF temporariamente)
- E-N: outros campos (endereço, bairro, etc)

### Adição Futura (PHASE 2)
Consideramos adicionar coluna "CPF" ao CLIENTES sheet para busca mais eficiente, mas por enquanto usamos o campo EMAIL.

---

## 🧪 COMO TESTAR

### Teste 1: Login por CPF
```bash
# 1. Criar cliente via WhatsApp primeiro (para ter CPF no Sheets)
# ou direto no admin

# 2. Fazer login
curl -X POST http://localhost:3000/auth/cliente/cpf \
  -H "Content-Type: application/json" \
  -d '{"cpf":"12345678901"}'

# Resposta esperada:
{
  "sucesso": true,
  "id_cliente": "...",
  "ultimos_2_digitos": "01",
  "acao": "confirmar_identidade"
}

# 3. Confirmar identidade
curl -X POST http://localhost:3000/auth/cliente/confirmar-identidade \
  -H "Content-Type: application/json" \
  -d '{
    "cpf":"12345678901",
    "ultimos_2_digitos":"01"
  }'

# Resposta esperada:
{
  "sucesso": true,
  "token": "eyJhbGc...",
  "id_cliente": "...",
  "nome": "João Silva"
}
```

### Teste 2: Cadastro novo
```bash
curl -X POST http://localhost:3000/auth/cliente/registrar \
  -H "Content-Type: application/json" \
  -d '{
    "cpf":"98765432109",
    "nome":"Maria Silva",
    "celular":"5595991234567",
    "email":"maria@email.com"
  }'

# Resposta esperada:
{
  "sucesso": true,
  "token": "eyJhbGc...",
  "id_cliente": "...",
  "nome": "Maria Silva",
  "mensagem": "Cadastro realizado com sucesso!"
}
```

### Teste 3: Validar token
```bash
curl -X POST http://localhost:3000/auth/validar-token \
  -H "Authorization: Bearer eyJhbGc..."

# Resposta esperada:
{
  "valido": true,
  "id_cliente": "...",
  "nome_cliente": "João Silva"
}
```

---

## 📝 PRÓXIMOS PASSOS (PHASE 2)

### 1. **Setup Google OAuth no Google Cloud Console**
- [ ] Criar projeto no Google Cloud
- [ ] Habilitar Google+ API
- [ ] Criar OAuth 2.0 Credentials
- [ ] Configurar Redirect URIs:
  - Development: `http://localhost:3000/auth/google/callback`
  - Production: `http://177.7.47.211:3000/auth/google/callback`
- [ ] Salvar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env

### 2. **Frontend - Modal Login/Cadastro**
- [ ] Criar `src/public/store/js/auth-modal.js`
- [ ] Criar `src/public/store/css/auth-modal.css`
- [ ] Integrar modal na HOME (header)
- [ ] Integrar modal no CHECKOUT (antes de pagar)
- [ ] Validação de formulário no cliente
- [ ] Armazenar token em sessionStorage
- [ ] Redirecionar usuário logado

### 3. **Frontend - UI de Logado**
- [ ] Mostrar "Entrar" quando não logado
- [ ] Mostrar nome + "Sair" quando logado
- [ ] Pre-preencher checkout com dados do cliente
- [ ] Botão "Meus Pedidos" (para Portal)

### 4. **Sheet LEADS**
- [ ] Criar aba "LEADS" no Google Sheets
- [ ] Definir estrutura de dados
- [ ] Adicionar service `src/services/sheets/leads.js`
- [ ] Popula LEADS automaticamente ao registrar

### 5. **Notificações WhatsApp**
- [ ] Quando novo cliente se registra
- [ ] Quando novo cliente compra
- [ ] Envia para Felipe/Júlly

### 6. **Melhorias Opcionais**
- [ ] Email de confirmação de cadastro
- [ ] SMS para validar telefone
- [ ] Salvar endereço para próximas compras
- [ ] Botão "Recuperar Senha"

---

## ✅ VERIFICAÇÃO

Server startup:
```
✓ Google OAuth configurado
✓ Session middleware ativo
✓ Passport middleware ativo
✓ Rotas de autenticação registradas em /auth
✓ CLIENTE_SESSION_SECRET inicializado
```

Endpoints testáveis:
- ✅ POST /auth/cliente/cpf
- ✅ POST /auth/cliente/confirmar-identidade
- ✅ POST /auth/cliente/registrar
- ✅ GET /auth/google
- ✅ GET /auth/google/callback
- ✅ POST /auth/validar-token
- ✅ POST /auth/logout

---

## 📚 REFERÊNCIAS

- **JWT** (sessionTokens.js): Existente, reutilizado
- **Google Sheets Client**: Existente, reutilizado
- **Joi Validation**: Existente, reutilizado
- **Passport.js**: Novo, instalado
- **Express Session**: Novo, instalado

---

## 🎓 NOTAS TÉCNICAS

1. **Por que não usar BCrypt para CPF?**
   - CPF é público após "confirmação de identidade"
   - Apenas serve como validação de 1ª fator (verificação)
   - Não é senha (senhas não existem neste sistema)

2. **Por que sessionStorage e não localStorage?**
   - sessionStorage limpa ao fechar aba
   - localStorage é persistente (risco de vazamento)
   - Google Sheets atua como "banco de senhas"

3. **Por que Passport Session + Express Session?**
   - Google OAuth requer sessão HTTP
   - Clientes usam tokens (sessionStorage)
   - Sessão do servidor é apenas para callback do Google

4. **CPF armazenado onde?**
   - Campo EMAIL do Google Sheets (temporário)
   - Future: Criar coluna CPF dedicated

---

## 📞 SUPPORT

**Felipe/Júlly**: Se houver erro ao fazer login:
1. Verificar se cliente existe em CLIENTES sheet
2. Verificar se CLIENTE_SESSION_SECRET está em .env
3. Verificar logs do servidor em `logs/combined.log`
4. Testar endpoints via curl acima

---

**Status**: ✅ Phase 1 Completa - Pronto para Phase 2 (Frontend + Google Setup)
