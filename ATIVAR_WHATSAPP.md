# 🚀 ATIVAR WHATSAPP - GUIA RÁPIDO

**Status Atual:**
- ✅ Servidor rodando em `http://localhost:3000`
- ✅ Google Sheets conectado com 140 SKUs
- ✅ Testes webhook passando 3/3
- ⏳ Aguardando túnel público + configuração WhatsApp

---

## PASSO 1: Criar Túnel Público (5 minutos)

Escolha UMA das opções abaixo:

### ✨ Opção A: ngrok (Recomendado - Mais simples)

**Se já tem ngrok instalado:**
```powershell
# Abra PowerShell NOVO (não feche o servidor)
ngrok http 3000
```

**Se NÃO tem ngrok:**

1. **Baixar ngrok:**
   - Visite: https://ngrok.com/download
   - Clique em **Windows** → baixa `ngrok-v3-windows-amd64.zip`
   - Extraia em: `C:\ngrok\`

2. **Adicionar ao PATH (para rodar em qualquer lugar):**
   - Abra: **Configuração do Sistema** → **Variáveis de Ambiente**
   - Na seção **Variáveis do Usuário**, clique **Novo**
     - Nome: `Path`
     - Valor: `C:\ngrok`
   - Clique **OK** duas vezes

3. **Abra PowerShell NOVO e execute:**
   ```powershell
   ngrok http 3000
   ```

**Resultado esperado:**
```
Session Status                online
Account                       [sua conta]
Forwarding                    https://abcd1234.ngrok-free.app -> http://localhost:3000
```

✅ **COPIE A URL** (exemplo: `https://abcd1234.ngrok-free.app`)

---

### 🔵 Opção B: Cloudflare Tunnel (Gratuito, permanente)

**Se prefere não usar ngrok:**

1. **Instale Cloudflare Tunnel:**
   - Abra PowerShell como **Administrador**
   - Execute:
     ```powershell
     choco install cloudflared
     ```
   - Aguarde instalação

2. **Abra PowerShell NOVO e execute:**
   ```powershell
   cloudflared tunnel run --url http://localhost:3000
   ```

**Resultado esperado:**
```
2026-05-17 15:45:30 INF ...
Your quick tunnel has been created! Visit it at (it may take some time to be reachable):
https://your-tunnel-xyz.trycloudflare.com
```

✅ **COPIE A URL**

---

## PASSO 2: Configurar no WhatsApp Business (3 minutos)

1. **Acesse:** https://business.facebook.com

2. **Navegue:**
   - Clique em **WhatsApp** (barra lateral)
   - Clique em **API Setup**

3. **Procure por WEBHOOK:**
   - Localize a seção **Webhook**
   - Clique em **Edit** (ou **Configure**)

4. **Preencha 3 campos:**

   **Campo 1 - Callback URL:**
   ```
   https://abcd1234.ngrok-free.app/api/webhook/whatsapp
   ```
   (Cole sua URL do passo 1 + `/api/webhook/whatsapp`)

   **Campo 2 - Verify Token:**
   ```
   seu_verify_token_arbitrario
   ```
   (Use exatamente este valor do `.env`)

   **Campo 3 - Subscribe to events:**
   - ✅ Marque: `messages`
   - ✅ Marque: `message_status` (opcional)

5. **Clique:** `Verify and Save`

**Resultado esperado:** ✅ Página mostra "Success"

⚠️ **Se mostrar erro:**
- Verifique se ngrok/cloudflare ainda está rodando
- Verifique o Verify Token (deve ser exatamente `seu_verify_token_arbitrario`)
- Tente novamente

---

## PASSO 3: Teste com Mensagem Real (2 minutos)

1. **No seu celular, abra WhatsApp**

2. **Envie uma mensagem:**
   ```
   2 zara g bordô pra joão
   ```

3. **Aguarde resposta do sistema** (deve chegar em segundos):
   ```
   Perfeito, João! Seu pedido #1:
   2x ZARA G bordô (R$ 259,80)
   Total: R$ 259,80
   ```

4. **Verifique Google Sheets:**
   - Abra: https://docs.google.com/spreadsheets/d/1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U
   - Vá para aba: **PEDIDOS_E_VENDAS**
   - Deve aparecer nova linha com seu pedido

5. **Verifique os logs do servidor:**
   - No terminal onde servidor está rodando
   - Deve aparecer:
     ```
     [INFO] Processando mensagem com contexto
     [INFO] clienteWhatsApp: +5595988123456
     [INFO] texto: 2 zara g bordô pra joão
     ```

✅ **Quando tudo acima funcionar: PARABÉNS! Sistema está 🟢 ATIVO!**

---

## 🎯 PRÓXIMOS TESTES (Opcional)

Teste estes cenários:

| Mensagem | Esperado | Onde Ver |
|----------|----------|----------|
| `2 zara g bordô pra joão` | Pedido criado | PEDIDOS_E_VENDAS |
| `1 mia p preto` | Pede nome | WhatsApp |
| `maria` | Pedido para Maria | PEDIDOS_E_VENDAS |
| `@análise` | Análises vendas | WhatsApp (só Felipe) |
| `@estoque` | Status estoque | WhatsApp |

---

## ⚠️ TROUBLESHOOTING RÁPIDO

### "Webhook verification failed"
- ✓ Verifique se ngrok/cloudflare ainda está rodando
- ✓ Copie novamente a URL (muda cada vez que reinicia)
- ✓ Verify Token deve ser `seu_verify_token_arbitrario`

### "Não estou recebendo mensagens"
- ✓ Seu número está em `AUTHORIZED_WHATSAPP_NUMBERS`? (.env linha 21)
- ✓ ngrok/cloudflare ainda está rodando?
- ✓ Teste: `curl https://sua-url/api/webhook/whatsapp?test=1`

### "Servidor mostra erro 500"
- ✓ Verifique se Google Sheets está conectado
- ✓ Verifique se ANTHROPIC_API_KEY é válida
- ✓ Veja logs no terminal

---

## 📞 PRECISA DE AJUDA?

- **Documentação completa:** `WEBHOOK_SETUP.md`
- **Testes automáticos:** `node scripts/test-webhook.js`
- **Status do sistema:** `SISTEMA_STATUS.txt`

---

## ✅ CHECKLIST FINAL

Marque cada item antes de considerar pronto:

- [ ] ngrok ou cloudflare rodando (vejo a URL pública)
- [ ] Webhook configurado no painel WhatsApp
- [ ] Cliquei "Verify and Save" (vejo ✅ Success)
- [ ] Enviei mensagem de teste do WhatsApp
- [ ] Recebi resposta no WhatsApp
- [ ] Novo pedido apareceu em PEDIDOS_E_VENDAS
- [ ] Logs mostram processamento

🎉 **Quando todos os checks estiverem marcados: PARABÉNS! Sistema está totalmente operacional!**

---

**Criado:** 2026-05-17  
**Status:** 🟡 Aguardando ativação do webhook
