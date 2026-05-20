# 🔧 Guia de Configuração - Pijama Store

Instruções detalhadas para configurar o sistema do zero.

## Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn
- Conta Google com acesso ao Google Sheets
- Conta WhatsApp Business (Meta ou Evolution API)
- Chave Anthropic API (opcional - usa regex se não disponível)

## 1. Clonar e Instalar

```bash
# Clone o repositório
git clone <repo-url>
cd pijama-store-backend

# Instale dependências
npm install
```

## 2. Configurar Google Sheets

### 2.1 Criar projeto no Google Cloud

1. Acesse https://console.cloud.google.com
2. Crie um novo projeto: "Pijama Store"
3. Ative as APIs:
   - Google Sheets API
   - Google Drive API

### 2.2 Criar Service Account

1. Vá para "Credenciais" → "Criar Credencial" → "Service Account"
2. Preencha:
   - Service account name: `pijama-store-app`
   - Description: `Sistema de gestão de vendas`
3. Clique "Criar e Continuar"
4. Pule "Concessão de acesso de funções"
5. Vá para a aba "Chaves" → "Adicionar Chave" → "Criar nova chave"
6. Selecione "JSON" → "Criar"
7. Salve o arquivo como `service-account.json` na raiz do projeto

### 2.3 Criar Google Sheet

1. Acesse https://sheets.google.com
2. Crie uma planilha chamada "Pijama Store"
3. Copie o ID da URL: `sheets.google.com/spreadsheets/d/{ID_AQUI}`
4. Crie 4 abas:
   - ESTOQUE
   - PEDIDOS_E_VENDAS
   - CLIENTES
   - CONVERSAS

### 2.4 Compartilhar com Service Account

1. Clique em "Compartilhar"
2. Insira o email do service account (veja em `service-account.json`)
3. Dê permissão de "Editor"

## 3. Configurar Variáveis de Ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

Edite `.env` com seus valores:

```env
# Google Sheets
GOOGLE_SHEETS_CREDENTIALS_PATH=./service-account.json
GOOGLE_SHEETS_ID=1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U

# WhatsApp (Meta ou Evolution)
WHATSAPP_PHONE_NUMBER_ID=seu_phone_id
WHATSAPP_ACCESS_TOKEN=seu_token
WHATSAPP_VERIFY_TOKEN=seu_verify_token

# Anthropic Claude API (opcional)
ANTHROPIC_API_KEY=sk-ant-xxx

# Números autorizados
NUMERO_FELIPE=5595988123456
NUMERO_JULLY=5595987654321
AUTHORIZED_WHATSAPP_NUMBERS=5595988123456,5595987654321

# Servidor
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Catálogo
CATALOG_MODELS=ZARA,MIA,LIA,NÚBIA,LÍVIA,BEATRIZ,ANNE
CATALOG_SIZES=P,M,G,GG
CATALOG_COLORS=azul marinho,preto,bordô,cinza,marrom
MODEL_PRICES={"ZARA":129.90,"MIA":89.90,"LIA":129.90,"NÚBIA":169.90,"LÍVIA":129.90,"BEATRIZ":89.90,"ANNE":159.90}
```

## 4. Configurar WhatsApp (Meta)

### 4.1 Setup Webhook

1. Acesse https://developers.facebook.com
2. Vá para seu app → "Configurações" → "Webhooks"
3. Configure:
   - **Callback URL**: `https://seu-dominio.com/api/webhook/whatsapp`
   - **Verify Token**: Use o valor de `WHATSAPP_VERIFY_TOKEN` no .env
   - **Inscrever em**: `messages`, `message_status`

### 4.2 Obter Tokens

1. Vá para "WhatsApp Business" → "API Setup"
2. Copie `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_ACCESS_TOKEN`

## 5. Configurar Evolution API (alternativa)

Se usar Evolution API em vez de Meta:

```env
# Em sender.js:
EVOLUTION_API_URL=http://seu-ip:porta
EVOLUTION_INSTANCE=pijama-store
EVOLUTION_API_KEY=admin
```

## 6. Poplar Estoque Inicial

```bash
npm run seed
```

Isso insere os 140 SKUs (7 modelos × 4 tamanhos × 5 cores).

Se preferir manualmente:

1. Abra a planilha do Google Sheets
2. Na aba ESTOQUE, insira os headers (linha 1):
   ```
   SKU | MODELO | TAMANHO | COR | PREÇO | QTD_TOTAL | QTD_RESERVADA | QTD_DISPONÍVEL
   ```
3. Adicione as fórmulas para QUANTIDADE_DISPONÍVEL: `=F{row}-G{row}`

## 7. Iniciar Servidor

```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

Você deve ver:
```
✓ Servidor rodando em http://localhost:3000
✓ Google Sheets conectado
✓ WhatsApp webhook pronto
✓ Scheduler inicializado: 5 tarefas agendadas
```

## 8. Testar Sistema

### Test Manual via WhatsApp

Envie para Felipe (+5595988123456):
```
2 zara g bordo 150 pra joão
```

Você deve receber resposta com número do pedido.

### Teste via Webhook (curl)

```bash
curl -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5595988123456",
            "type": "text",
            "text": {"body": "2 zara g bordo 150 pra joão"},
            "timestamp": "'$(date +%s)'"
          }]
        }
      }]
    }]
  }'
```

## 9. Verificar Logs

```bash
tail -f logs/combined-$(date +%Y-%m-%d).log
```

## 10. Primeiros Passos

1. ✅ Servidor rodando
2. ✅ Google Sheets conectado
3. ✅ Estoque populado (140 SKUs)
4. ✅ Teste manual via WhatsApp
5. ✅ Verifique logs para erros
6. ✅ Teste endpoints da API via postman ou curl

## Troubleshooting de Setup

### Google Sheets retorna 401 Unauthorized
- Verifique se service-account.json está na raiz
- Verifique se o email do service account tem acesso à planilha
- Verifique se GOOGLE_SHEETS_ID está correto

### WhatsApp não recebe mensagens
- Verifique se AUTHORIZED_WHATSAPP_NUMBERS contém o número
- Verifique os logs para erros de Evolution API
- Teste o webhook com curl (veja Test Manual)

### Testes falhando
```bash
npm test -- --verbose
npm run test:coverage
```

## Deployment

Para colocar em produção:

```bash
# 1. Build/verificar
npm test
npm run test:coverage

# 2. Configure variáveis
NODE_ENV=production LOG_LEVEL=info

# 3. Use processo manager (PM2, Forever, etc)
pm2 start server.js --name "pijama-store"

# 4. Configure nginx/apache como reverse proxy
```

## Próximas Etapas

1. Customize os mensagens de resposta em `src/services/nlp/formatter.js`
2. Ajuste permissões em `src/config/users.js`
3. Configure escalas de horários em `src/services/scheduler/jobs.js`
4. Adicione mais produtos conforme necessário

---
**Setup Completo!** O sistema está pronto para usar. 🎉
