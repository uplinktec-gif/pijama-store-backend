# ⚡ QUICK START - ATIVAR WHATSAPP

## ✅ Status Atual

Sistema testado e pronto! ✓

```
✓ Servidor rodando em http://localhost:3000
✓ Webhook testado localmente (3/3 testes passaram)
✓ Google Sheets conectado com 140 SKUs
✓ Scheduler com 5 jobs agendados
```

---

## 🚀 PRÓXIMOS 3 PASSOS (5 minutos)

### PASSO 1: Criar Túnel Público (ngrok)

**Para Windows:**

```powershell
# Abra um PowerShell NOVO (não feche o outro onde servidor está rodando)

# Se tiver instalado ngrok globalmente:
ngrok http 3000

# Se não tiver, baixe de: https://ngrok.com/download
# Extraia e execute: ngrok.exe http 3000
```

**Resultado esperado:**
```
Forwarding     https://abcd1234.ngrok-free.app → http://localhost:3000
```

**Copie a URL** (tipo `https://abcd1234.ngrok-free.app`)

---

### PASSO 2: Configurar no WhatsApp Business

1. Acesse: **[Meta Business Suite](https://business.facebook.com)**

2. Navegue:
   - **WhatsApp** → **API Setup**

3. Procure por **Webhook** e clique **Edit**

4. **Configure 3 campos:**

   **Campo 1 - Callback URL:**
   ```
   https://abcd1234.ngrok-free.app/api/webhook/whatsapp
   ```
   (Cole a URL do ngrok + `/api/webhook/whatsapp`)

   **Campo 2 - Verify Token:**
   ```
   seu_verify_token_arbitrario
   ```

   **Campo 3 - Subscribe to events:**
   ```
   ✓ messages
   ✓ message_status (opcional)
   ```

5. Clique **Verify and Save**

**Esperado:** Página mostra ✅ "Success"

---

### PASSO 3: Teste com Mensagem Real

1. **No seu celular**, abra WhatsApp

2. Envie uma mensagem pro seu número:
   ```
   2 zara g bordô pra joão
   ```

3. **Verifique 2 coisas:**

   **A)** Resposta no WhatsApp:
   ```
   Perfeito, João! Seu pedido #1:
   2x ZARA G bordô (R$ 259,80)
   Total: R$ 259,80
   ```

   **B)** Google Sheets (PEDIDOS_E_VENDAS):
   ```
   Nova linha com o pedido criado
   Status: PEDIDO (aguardando pagamento)
   ```

**Quando ambos funcionarem**: Sistema está 🟢 ATIVO!

---

## 📊 VERIFICAÇÃO RÁPIDA

```bash
# No terminal do servidor, deve aparecer:
[INFO] Processando mensagem com contexto
[INFO] clienteWhatsApp: +5595988123456
[INFO] texto: 2 zara g bordô pra joão
```

---

## 🎯 PRÓXIMOS TESTES (Opcional)

Teste estes cenários:

| Mensagem | Esperado | Onde Verificar |
|----------|----------|----------------|
| `2 zara g bordô pra joão` | Pedido criado | PEDIDOS_E_VENDAS |
| `1 mia p preto` | Sistema pede nome | WhatsApp |
| (responde) `maria` | Pedido criado para Maria | PEDIDOS_E_VENDAS |
| `@análise` | Análises de vendas | WhatsApp |
| `@estoque` | Status do estoque | WhatsApp |

---

## ⚠️ SE ALGO DER ERRADO

### "Webhook verification failed"
- ✓ Verifique o Verify Token (deve ser igual ao `.env`)
- ✓ Clique "Edit" novamente e salve

### "Não recebendo mensagens"
- ✓ Verifique se ngrok ainda está rodando
- ✓ Copie a URL correta (muda cada vez que reinicia)
- ✓ Teste localmente: `node scripts/test-webhook.js`

### "Servidor retorna erro 500"
- ✓ Verifique logs do servidor
- ✓ Confirme que Google Sheets está conectado
- ✓ Confirme ANTHROPIC_API_KEY no `.env`

### "ngrok não inicia"
- ✓ Use Cloudflare Tunnel alternativo:
  ```bash
  choco install cloudflared
  cloudflared tunnel run --url http://localhost:3000
  ```

---

## 📋 CHECKLIST FINAL

Antes de considerar "ativo":

- [ ] ngrok rodando e URL pública copiada
- [ ] Webhook configurado no painel WhatsApp
- [ ] Webhook verification passou ✅
- [ ] Mensagem de teste enviada
- [ ] Resposta recebida no WhatsApp
- [ ] Pedido criado no Google Sheets
- [ ] Logs mostrando processamento

✅ **Quando todos os itens têm check: PRONTO!**

---

## 🎉 PARABÉNS!

Seu sistema pijama-store está **100% operacional**!

Agora ele pode:
- ✅ Receber pedidos via WhatsApp
- ✅ Validar estoque em tempo real
- ✅ Criar pedidos no Google Sheets
- ✅ Gerar análises automáticas
- ✅ Enviar recomendações

---

## 📞 PRÓXIMA FASE

Quando quiser deixar rodando 24/7:

1. **Deploy em VPS** (Hostinger ou outro)
   - Sistema atual funciona 100% em VPS

2. **Usar PM2** para manter processo rodando
   ```bash
   npm install -g pm2
   pm2 start server.js --name pijama-store
   pm2 startup
   pm2 save
   ```

3. **Usar serviço de tunnel permanente**
   - ngrok: pagar plano básico (~$5/mês)
   - Cloudflare Tunnel: gratuito permanente

---

**Criado em**: 2026-05-17  
**Status**: 🟢 Pronto para produção
