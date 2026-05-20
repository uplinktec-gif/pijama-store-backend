# SETUP - Configuração Inicial

Guia passo-a-passo para configurar o Pijama Store Backend em sua máquina.

## 1️⃣ Pré-Requisitos

- **Node.js 18+** - Download em https://nodejs.org/
- **Git** - Para clonar o repositório
- **Google Cloud Console** - Para credenciais do Google Sheets
- **WhatsApp Business Account** - Com número e token de acesso
- **Anthropic API Key** - De https://console.anthropic.com/

## 2️⃣ Instalação Básica

### Windows
```powershell
# Clone o repositório
git clone <url-do-repo>
cd pijama-store-backend

# Instale dependências
npm install

# Crie arquivo .env
copy .env.example .env
```

### macOS / Linux
```bash
git clone <url-do-repo>
cd pijama-store-backend
npm install
cp .env.example .env
```

## 3️⃣ Configurar Google Sheets

### Passo 1: Criar Google Cloud Project
1. Vá para https://console.cloud.google.com/
2. Crie um novo projeto (nome: "Pijama Store")
3. Ative a API do Google Sheets:
   - Clique em "Enable APIs and Services"
   - Procure por "Google Sheets API"
   - Clique em "Enable"

### Passo 2: Criar Service Account
1. No Cloud Console, vá para "Service Accounts"
2. Clique em "Create Service Account"
3. Nome: `pijama-store-backend`
4. Clique em "Create and Continue"
5. Clique em "Grant this service account access to project"
6. Role: `Editor`
7. Clique em "Continue" e depois "Done"

### Passo 3: Criar Chave JSON
1. Clique no service account criado
2. Vá para aba "Keys"
3. Clique em "Add Key" → "Create new key"
4. Escolha JSON
5. Baixe o arquivo (será salvo como `*.json`)
6. Salve na pasta do projeto como `service-account.json`

### Passo 4: Criar Google Sheet
1. Vá para https://sheets.google.com/
2. Crie uma nova planilha (nome: "Pijama Store - Database")
3. Crie 4 abas com estes nomes exatos:
   - `ESTOQUE`
   - `PEDIDOS_E_VENDAS`
   - `CLIENTES`
   - `CONVERSAS`
4. Copie o ID da planilha (está na URL: `/d/{AQUI}/edit`)
5. Compartilhe a planilha com o email do service account:
   - Clique em "Share"
   - Cole: `pijama-store-backend@seu-projeto.iam.gserviceaccount.com`
   - Permissão: Editor
   - Não precisa notificar

## 4️⃣ Configurar WhatsApp

### Obter Credenciais WhatsApp Business
1. Vá para https://developers.facebook.com/
2. Crie um app (tipo: Business)
3. Adicione o produto "WhatsApp" ao app
4. Em "WhatsApp" → "Getting Started":
   - Você receberá:
     - `PHONE_NUMBER_ID` (número do negócio)
     - `WHATSAPP_ACCESS_TOKEN` (token de acesso)
     - `VERIFY_TOKEN` (crie um aleatório, ex: `meu_token_seguro_123`)
5. Configure o webhook:
   - URL do webhook: `https://seu-servidor.com/webhook/whatsapp`
   - Verify Token: (o que você criou)
   - Subscribe to messages event

### Configurar Números Autorizados
WhatsApp enviará para seu servidor as mensagens de números que tem conversas com seu bot.

Exemplo de autorização em `.env`:
```
AUTHORIZED_WHATSAPP_NUMBERS=5595988123456,5595987654321
```

## 5️⃣ Configurar Anthropic API

1. Vá para https://console.anthropic.com/
2. Clique em "API Keys"
3. Crie uma nova chave
4. Copie a chave (começa com `sk-ant-...`)
5. Salve de forma segura (não compartilhe!)

## 6️⃣ Configurar Variáveis de Ambiente

Edite o arquivo `.env` criado:

```env
# GOOGLE SHEETS
GOOGLE_SHEETS_CREDENTIALS_PATH=./service-account.json
GOOGLE_SHEETS_ID=sua-planilha-id-aqui

# WHATSAPP
WHATSAPP_PHONE_NUMBER_ID=seu-phone-id
WHATSAPP_ACCESS_TOKEN=seu-token-longo
WHATSAPP_VERIFY_TOKEN=seu-verify-token-seguro

# ANTHROPIC (Claude)
ANTHROPIC_API_KEY=sk-ant-seu-token-aqui

# APLICAÇÃO
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# USUÁRIOS AUTORIZADOS (WhatsApp numbers)
NUMERO_FELIPE=5595988123456
NUMERO_JULLY=5595987654321
AUTHORIZED_WHATSAPP_NUMBERS=5595988123456,5595987654321
```

## 7️⃣ Popular Estoque Inicial

Se você tem um arquivo `estoque.csv` ou quer popular manualmente:

```bash
# Popular estoque de exemplo
npm run seed
```

Ou:

1. Vá para o Google Sheets
2. Na aba `ESTOQUE`, adicione os headers:
   ```
   ID_PRODUTO | MODELO | TAMANHO | COR | PREÇO | QTD_TOTAL | QTD_RESERVADA | STATUS
   ```
3. Adicione seus produtos manualmente

Exemplo:
```
ZARA_P_AZUL | ZARA | P | azul marinho | 129.90 | 10 | 0 | ativo
ZARA_M_AZUL | ZARA | M | azul marinho | 129.90 | 8 | 0 | ativo
```

## 8️⃣ Testar Configuração

### Verificar Google Sheets
```bash
# Testar conexão com Google Sheets
npm test -- sheets.test.js
```

### Testar Claude API
```bash
# Testar interpretação de mensagens
npm test -- interpreter.test.js
```

### Rodar todos os testes
```bash
npm test
```

## 9️⃣ Iniciar o Servidor

### Desenvolvimento (com auto-reload)
```bash
npm run dev
```

Você deve ver:
```
✓ Servidor rodando em http://localhost:3000
✓ Webhook WhatsApp configurado em /webhook/whatsapp
✓ Scheduler inicializado com 5 jobs
```

### Produção
```bash
npm start
```

## 🔟 Configurar HTTPS para Webhook (Importante!)

WhatsApp exige que o webhook seja acessível via HTTPS.

### Opção 1: ngrok (Desenvolvimento)
```bash
# Instale ngrok: https://ngrok.com/download

# Crie um túnel para localhost:3000
ngrok http 3000
```

Você receberá uma URL como: `https://xxx.ngrok.io`

Configure no WhatsApp Cloud Console:
- Webhook URL: `https://xxx.ngrok.io/webhook/whatsapp`

### Opção 2: VPS em Produção (Felipe/Júlly)
Se vocês têm uma VPS (ex: Hostinger):
1. Deploy o código na VPS
2. Configure DNS para sua máquina
3. Instale SSL (Let's Encrypt é grátis)
4. Configure URL do webhook no WhatsApp

Exemplo com Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d seu-dominio.com
```

## 1️⃣1️⃣ Testar Fluxo Completo

1. **Enviar mensagem de teste**:
   - Abra WhatsApp
   - Envie uma mensagem para o número do bot:
     ```
     2 zara g bordô 150 pra joão
     ```

2. **Verificar resposta**:
   - Bot deve responder:
     ```
     Perfeito, João! Seu pedido #1:
     2x ZARA G bordô (R$ 259,80)
     Total: R$ 259,80
     
     Retirada na loja ou entrega?
     ```

3. **Verificar Google Sheets**:
   - Aba `PEDIDOS_E_VENDAS` deve ter a linha do pedido
   - Aba `ESTOQUE` deve ter quantidade reservada atualizada
   - Aba `CLIENTES` deve ter João registrado

4. **Verificar Logs**:
   - `logs/combined-%DATE%.log` deve conter a transação

## ❌ Troubleshooting

### "Cannot find module '@google-cloud/...'"
```bash
npm install
```

### "ANTHROPIC_API_KEY is missing"
Verifique se a chave está em `.env` (sem `sk-ant-` truncado)

### Webhook não está recebendo mensagens
1. Verifique se Verify Token está correto no WhatsApp Console
2. Verifique se URL do webhook é acessível (https, não http)
3. Use ngrok para testar localmente
4. Veja `logs/error-%DATE%.log` para erros

### Google Sheets não está sendo atualizado
1. Verifique se service account tem acesso (compartilhado)
2. Verifique se ID da planilha está correto em `.env`
3. Verifique se nomes das abas estão exatos (case-sensitive)

## ✅ Verificação Final

Tudo configurado? Verifique:

- [ ] `.env` preenchido com todas as credenciais
- [ ] `service-account.json` no diretório raiz
- [ ] Google Sheet criado com 4 abas
- [ ] Service account tem acesso ao Sheet
- [ ] WhatsApp webhook configurado
- [ ] `npm install` foi executado
- [ ] `npm test` passa em todos os testes
- [ ] `npm run dev` inicia o servidor sem erros

## 📞 Suporte

Dúvidas? Veja [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

Email: uplinktec@gmail.com
WhatsApp: +5595988123456
