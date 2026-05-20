# 🚀 Configurar Evolution API - Guia Completo

**Status Atual:**
- ✅ Node.js servidor rodando em `http://localhost:3000`
- ✅ Evolution API rodando em `http://177.7.47.211:32775`
- ✅ WhatsApp instance criada: "pijama-store"
- ✅ Instância autenticada com número: 5531650001
- ⏳ Aguardando configuração de webhook

---

## PASSO 1: Obter URL Pública para Webhook

### Opção A: Usar IP da Hostinger (Recomendado - Simplest)

Se o Node.js servidor está na mesma VPS Hostinger que Evolution API:

**URL Base**: `http://177.7.47.211:3000`

**Webhook Endpoint**: `http://177.7.47.211:3000/api/webhook/whatsapp`

### Opção B: Usar Ngrok (Se localhost)

Se está testando localmente:

```bash
# Terminal 1: Iniciar servidor
npm start

# Terminal 2: Iniciar ngrok
ngrok http 3000
```

Resultado esperado:
```
Forwarding  https://xxxxx.ngrok-free.app -> http://localhost:3000
```

**Webhook Endpoint**: `https://xxxxx.ngrok-free.app/api/webhook/whatsapp`

### Opção C: Usar Cloudflare Tunnel (Se localhost)

```bash
# Terminal 1: Iniciar servidor
npm start

# Terminal 2: Instalar e iniciar Cloudflare
# Instalar: choco install cloudflared
# Depois:
cloudflared tunnel run --url http://localhost:3000
```

**Webhook Endpoint**: `https://your-tunnel-xxxxx.trycloudflare.com/api/webhook/whatsapp`

---

## PASSO 2: Configurar Webhook na Evolution Manager

1. **Acesse Evolution Manager:**
   - Abra: `http://177.7.47.211:32775`
   - Faça login (credenciais: evolution/admin)

2. **Navegue até Instância "pijama-store":**
   - Clique em "Instances" ou "Minhas Instâncias"
   - Selecione "pijama-store"

3. **Configure Webhook:**
   - Procure por "Webhook Settings" ou "Configurações de Webhook"
   - Clique em "Add Webhook" ou "Editar"

4. **Preencha os campos:**

   **URL do Webhook:**
   ```
   http://177.7.47.211:3000/api/webhook/whatsapp
   ```
   (ou a URL correspondente da sua opção acima)

   **Eventos a Receber:**
   - ✅ messages (OBRIGATÓRIO)
   - ✅ message_status (Opcional - para confirmar entrega)
   - ✅ presence (Opcional - para ver status de digitação)

   **Método:** POST

   **Headers** (se exigido):
   ```
   Content-Type: application/json
   ```

5. **Salve a Configuração:**
   - Clique "Save" ou "Salvar"
   - Aguarde confirmação (geralmente leva alguns segundos)

---

## PASSO 3: Testar Webhook

### Teste Local (Before Going Live)

```bash
# Terminal
npm test scripts/test-webhook.js

# Esperado:
# ✓ GET /api/webhook/whatsapp: OK
# ✓ POST /api/webhook/whatsapp: OK
```

### Teste com WhatsApp Real

1. **No seu celular, abra WhatsApp**

2. **Envie mensagem de teste:**
   ```
   teste
   ```

3. **Aguarde resposta do sistema:**
   ```
   [Resposta automática do sistema]
   ```

4. **Verifique os logs:**
   ```bash
   # No terminal do servidor, você deve ver:
   [INFO] Processando mensagem com contexto
   [INFO] clienteWhatsApp: 5531650001
   [INFO] texto: teste
   ```

### Teste de Pedido Completo

1. **Envie:**
   ```
   2 zara g bordô pra joão
   ```

2. **Resposta esperada:**
   ```
   Perfeito, João! Seu pedido #1:
   2x ZARA G bordô (R$ 259,80)
   Total: R$ 259,80
   
   Como você gostaria de receber? (entrega/retirada)
   ```

3. **Verifique Google Sheets:**
   - Abra: https://docs.google.com/spreadsheets/d/1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U
   - Vá para aba: **PEDIDOS_E_VENDAS**
   - Deve aparecer novo pedido

---

## 🔧 Troubleshooting

### "Webhook não está recebendo mensagens"

✓ **Verificação 1:** URL do webhook está correta?
```bash
curl http://177.7.47.211:3000/api/webhook/whatsapp?test=1
# Esperado: 200 OK
```

✓ **Verificação 2:** Instância Evolution está conectada?
- Abra Evolution Manager
- Verifique status de "pijama-store" (deve estar verde/online)
- Se não estiver, faça login novamente com QR code

✓ **Verificação 3:** Número autorizado?
- Seu número está em `.env` na variável `AUTHORIZED_WHATSAPP_NUMBERS`?
- Padrão: `5595988123456,5595987654321,5531650001`

✓ **Verificação 4:** Servidor Node.js está rodando?
```bash
curl http://localhost:3000/health
# Esperado: {"status":"ok",...}
```

✓ **Verificação 5:** Verifique logs do servidor
```bash
# Terminal onde servidor está rodando:
# Procure por mensagens [ERROR] ou [WARN]
```

### "Erro 500 no webhook"

- Verifique se Google Sheets está conectado
- Verifique se ANTHROPIC_API_KEY é válida
- Veja logs do servidor para mais detalhes

### "Evolution API diz 'Instance disconnected'"

1. Vá para Evolution Manager
2. Clique em "pijama-store"
3. Gere novo QR code
4. Abra WhatsApp no celular e escaneie o QR
5. Aguarde até mudar o status para "Connected" (verde)

---

## 📞 Estrutura de Payload Esperado

### Webhook FROM Evolution API

A Evolution API enviará payloads com este formato:

```json
{
  "data": {
    "message": {
      "id": "msg_id_xxx",
      "from": "5531650001",
      "body": "2 zara g bordô pra joão",
      "timestamp": 1716033000,
      "type": "text"
    }
  }
}
```

Ou formato alternativo (depende da versão):

```json
{
  "messages": [
    {
      "from": "5531650001",
      "body": "2 zara g bordô pra joão",
      "id": "msg_id_xxx"
    }
  ]
}
```

**Node.js automatically handles both formats** ✓

---

## ✅ Checklist Final

Marque cada item quando completado:

- [ ] URL do webhook configurada em Evolution Manager
- [ ] Evolution Manager mostra "Connected" para instância pijama-store
- [ ] Enviei mensagem de teste pelo WhatsApp
- [ ] Recebi resposta do sistema
- [ ] Verificar logs do servidor (não há [ERROR])
- [ ] Novo pedido apareceu em Google Sheets
- [ ] Teste com "2 zara g bordô pra joão" funcionou

**Quando todos os ☑️ estiverem marcados: Sistema está 🟢 ATIVO!**

---

## 🎯 Próximos Passos

Depois que webhook estiver funcionando:

1. **Testar mais cenários:**
   - `1 mia p preto` (pedir nome)
   - `maria` (completar pedido)
   - `@análise` (relatorio - só Felipe)
   - `@estoque` (status estoque)

2. **Deploy em Produção:**
   - Migrar para VPS permanente
   - Configurar HTTPS (Let's Encrypt)
   - Backup automático de dados
   - Monitoramento 24/7

---

**Criado:** 2026-05-17  
**Última atualização:** 2026-05-18
