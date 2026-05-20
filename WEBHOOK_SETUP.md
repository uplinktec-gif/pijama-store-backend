# 🔗 CONFIGURAÇÃO DO WEBHOOK WHATSAPP

**Data**: 2026-05-17  
**Status**: Pronto para ativação

---

## 📋 RESUMO

O backend está pronto para receber mensagens do WhatsApp. Faltam apenas 2 passos:

1. **Expor servidor local ao público** (túnel)
2. **Apontar webhook no painel WhatsApp Business**

---

## 🚀 PASSO 1: CRIAR TÚNEL PÚBLICO

### Opção A: ngrok (Recomendado)

#### 1.1 - Download e Instalação

**Windows:**
```powershell
# Opção 1: Baixar do site (recomendado)
# Acesse: https://ngrok.com/download
# Extraia o ngrok.exe em C:\ngrok\

# Opção 2: Via Chocolatey (se tiver instalado)
choco install ngrok

# Opção 3: Via npm (pode ter limitações)
npm install -g ngrok
```

#### 1.2 - Iniciar o Túnel

```bash
# No PowerShell/Terminal:
ngrok http 3000

# Você verá algo assim:
# Forwarding  https://abc123def456.ngrok-free.app -> http://localhost:3000
```

**Copie a URL em azul** (ex: `https://abc123def456.ngrok-free.app`)  
Esta será a URL pública do seu servidor!

---

### Opção B: Cloudflare Tunnel (Alternativa)

Se preferir usar Cloudflare:

```bash
# Instalar Cloudflare Tunnel
choco install cloudflared

# Criar túnel
cloudflared tunnel run --url http://localhost:3000
```

---

## ⚙️ PASSO 2: CONFIGURAR NO WHATSAPP BUSINESS

### 2.1 - Acessar Painel do WhatsApp Business

1. Vá para: **[Meta Business Suite](https://business.facebook.com)**
2. Login com sua conta Meta
3. Selecione seu **Business Account**
4. Clique em **WhatsApp > API Setup**

### 2.2 - Configurar Webhook

1. Na seção "Webhook", clique em **Edit** (ou **Configure**)

2. **URL do Webhook**: Cole a URL pública com o path do webhook
   ```
   https://abc123def456.ngrok-free.app/api/webhook/whatsapp
   ```

3. **Verify Token**: Use o valor do seu `.env`
   ```
   seu_verify_token_arbitrario
   ```
   (Você pode mudar em `.env` se quiser)

4. **Subscribe to webhook fields**:
   Marque:
   - ✅ `messages`
   - ✅ `message_status` (opcional, mas útil)

5. Clique **Verify and Save**

### 2.3 - Verificação Automática

O sistema fará uma requisição GET para:
```
GET https://abc123def456.ngrok-free.app/api/webhook/whatsapp?
  hub.mode=subscribe&
  hub.verify_token=seu_verify_token_arbitrario&
  hub.challenge=challenge_token_aqui
```

Se vir "Success" ✅ no painel, está configurado!

---

## 🧪 PASSO 3: TESTAR

### 3.1 - Envie uma mensagem de teste

Desde o número autorizado (seu WhatsApp):
```
2 zara g bordô pra joão
```

### 3.2 - Verifique os logs

```bash
# Ver logs do servidor
tail -f server.log

# Esperado:
# [INFO] Processando mensagem com contexto
# [INFO] clienteWhatsApp: +5595988123456
# [INFO] texto: 2 zara g bordô pra joão
```

### 3.3 - Verifique Google Sheets

1. Abra: **[Google Sheets - Pijama Store](https://docs.google.com/spreadsheets/d/1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U)**

2. Vá para aba **PEDIDOS_E_VENDAS**

3. Deve ter um novo pedido criado com:
   - Data e hora do pedido
   - Número do pedido (sequencial)
   - Seus dados
   - Produtos solicitados
   - Status: PEDIDO (aguardando pagamento)

---

## 🔐 Variáveis de Ambiente Importantes

Verifique seu `.env`:

```env
# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id
WHATSAPP_ACCESS_TOKEN=seu_access_token
WHATSAPP_VERIFY_TOKEN=seu_verify_token_arbitrario

# Autorização
AUTHORIZED_WHATSAPP_NUMBERS=5595988123456,5595987654321
```

Se mudar `WHATSAPP_VERIFY_TOKEN`, mude também no painel WhatsApp!

---

## 📊 FLUXO ESPERADO

```
1. Você envia no WhatsApp
   "2 zara g bordô pra joão"
   ↓
2. WhatsApp envia para webhook
   POST /api/webhook/whatsapp
   ↓
3. Sistema processa
   - Claude API interpreta
   - Valida estoque
   - Cria pedido no Sheets
   ↓
4. Sistema responde
   "Perfeito, João! Seu pedido #123:
    2x ZARA G bordô (R$ 259,80)
    Total: R$ 259,80"
   ↓
5. Você recebe no WhatsApp
```

---

## ⚠️ TROUBLESHOOTING

### "Webhook verification failed"
- ❌ Verify Token errado no painel
- ✅ Verifique se está igual ao .env
- ✅ Tente novamente

### "Webhook not receiving messages"
- ❌ URL pública incorreta
- ✅ Teste: `curl https://seu-url/api/webhook/whatsapp?test=1`
- ✅ Verifique se ngrok ainda está rodando

### "Servidor retorna 404"
- ❌ Caminho do webhook errado
- ✅ Deve ser: `/api/webhook/whatsapp`
- ✅ Não `/webhook/whatsapp`

### "ngrok timeout"
- ❌ ngrok parou de rodar
- ✅ Reinicie o terminal
- ✅ Execute: `ngrok http 3000`

---

## 🎯 PRÓXIMOS PASSOS

Após o webhook estar funcionando:

1. **Teste 1**: "2 zara g bordô pra joão"
   - Esperado: Pedido criado #1

2. **Teste 2**: "1 mia p preto" (sem cliente)
   - Sistema pedirá: "Qual seu nome?"
   - Você responde: "maria"
   - Sistema cria pedido para Maria

3. **Teste 3**: "@análise" (apenas você, Felipe)
   - Sistema retorna análises de vendas

4. **Teste 4**: "@análise" (alguém não autorizado)
   - Sistema retorna: "Você não tem permissão"

---

## 📞 CONTATO / SUPORTE

Se tiver problemas:

1. Verifique `server.log`
2. Verifique `ngrok.log` (se usar ngrok)
3. Teste URL pública: `curl https://seu-url/health`
4. Confirme que servidor está rodando: `netstat -ano | findstr :3000`

---

## ✅ CHECKLIST FINAL

Antes de considerar pronto:

- [ ] ngrok/Cloudflare rodando e URL pública funcionando
- [ ] URL configurada no painel WhatsApp Business
- [ ] Verify token correto
- [ ] Teste simples recebido e processado
- [ ] Pedido criado no Google Sheets
- [ ] Resposta recebida no WhatsApp
- [ ] Logs mostrando processamento correto

**Quando tudo estiver verde**: Sistema está vivo! 🎉

---

**Próxima fase**: Testes em produção com histórico real de pedidos.
