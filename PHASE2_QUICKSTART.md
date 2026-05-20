# Quick Start — FASE 2 Testing

## ✅ Status Atual
- Phase 2 implementada e pronta para testes
- Servidor rodando em http://localhost:3000
- Sistema de contexto multi-turno funcional

## 🚀 Como Testar Agora

### Opção 1: Teste Local (Sem WhatsApp)

Criar teste manual editando `src/services/business/conversas.js` temporariamente:

```javascript
// No final do arquivo, adicionar:
async function teste() {
  const msg1 = "2 zara g bordô 150 pra joão";
  const result1 = await processarMensagemComContexto(msg1, "+5595988123456");
  console.log("Msg 1:", result1.resposta);

  const msg2 = "entrega";
  const result2 = await processarMensagemComContexto(msg2, "+5595988123456");
  console.log("Msg 2:", result2.resposta);

  const msg3 = "rua das flores 123";
  const result3 = await processarMensagemComContexto(msg3, "+5595988123456");
  console.log("Msg 3:", result3.resposta);
}

teste().catch(console.error);
```

Rodar: `node src/services/business/conversas.js`

### Opção 2: Teste com cURL (Simular Webhook)

```bash
# Simular webhook do WhatsApp
curl -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "1",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "messages": [{
            "from": "+5595988123456",
            "id": "wamid.123",
            "type": "text",
            "text": {
              "body": "2 zara g bordô 150 pra joão"
            }
          }]
        }
      }]
    }]
  }'
```

Verificar logs:
```bash
tail -f logs/combined.log
```

### Opção 3: Teste com WhatsApp Real

1. **Configurar credenciais WhatsApp** em `.env`
2. **Validar webhook** em Meta Business Manager
3. **Enviar mensagem via WhatsApp** para seu número
4. **Sistema responde automaticamente**

Ver logs: `tail -f logs/combined.log`

## 📊 Verificar Contexto Salvo

Depois de testar, verificar em Google Sheets aba `CONVERSAS`:

```
WHATSAPP          | STATUS      | CONTEXTO_JSON
+5595988123456    | FINALIZADA  | {"numero_pedido_atual": 1, "forma_pagamento": "PIX", ...}
```

## 🧪 Cenários Rápidos

### 1. Novo Pedido Completo (5 mensagens)
```
Cliente: 2 zara g bordô 150 pra joão
Sistema: [responde com pedido #N]

Cliente: entrega
Sistema: [pede endereço]

Cliente: rua das flores 123
Sistema: [pede forma de pagamento]

Cliente: paguei no pix
Sistema: [confirma pedido]

Resultado: Contexto em CONVERSAS = FINALIZADA
Pedido em PEDIDOS_E_VENDAS = STATUS_PAGAMENTO = PAGO
```

### 2. Cancelamento
```
Cliente: cancelar
Sistema: [confirma cancelamento]

Resultado: Contexto = FINALIZADA, STATUS = CANCELADO
```

### 3. Retirada
```
Cliente: 1 mia p preto pra maria
Sistema: [responde]

Cliente: retirada
Sistema: [pede horário]

Cliente: sábado 14h
Sistema: [pede pagamento]

Cliente: dinheiro
Sistema: [confirma]
```

## 🔍 Debug

### Ver todos os logs
```bash
tail -f logs/combined.log
```

### Ver apenas erros
```bash
tail -f logs/error.log
```

### Checar estrutura do contexto
Google Sheets → CONVERSAS → Coluna C (CONTEXTO_JSON) → Copiar conteúdo e parsear em: https://jsoncrack.com/

## ⚠️ Problemas Comuns

### Problema: "Google Sheets não está inicializado"
**Solução**: Verificar service-account.json na raiz + GOOGLE_SHEETS_ID em .env

### Problema: "ANTHROPIC_API_KEY não configurada"
**Solução**: Necessário para interpreter (Phase 1). Para Phase 2 testes básicos, pode ignorar.

### Problema: Contexto não está sendo salvo
**Solução**: Verificar se CONVERSAS sheet existe e tem headers corretos

### Problema: Webhook não processa mensagens
**Solução**: 
1. Verificar AUTHORIZED_WHATSAPP_NUMBERS em .env
2. Testar com número autorizado
3. Ver logs de erro

## 📋 Checklist Pré-Teste

- [ ] `npm run dev` rodando em port 3000
- [ ] service-account.json na raiz do projeto
- [ ] GOOGLE_SHEETS_ID preenchido em .env
- [ ] Google Sheets tem 4 abas: ESTOQUE, PEDIDOS_E_VENDAS, CLIENTES, CONVERSAS
- [ ] CONVERSAS sheet tem headers: WHATSAPP, STATUS, CONTEXTO_JSON, DATA_INICIO, ULTIMA_ATUALIZACAO, NUMERO_PEDIDO_ATUAL, OBSERVACOES
- [ ] Node.js 18+ instalado (`node --version`)
- [ ] Todas as dependências instaladas (`npm install`)

## 📈 Próximos Passos

✅ Phase 2 implementada
📝 Seguir PHASE2_TEST.md para testes detalhados
🔄 Corrigir bugs encontrados
📊 Coletar feedback de teste

---

**Dúvidas?** Ver `PHASE2_TEST.md` para documentação completa dos cenários.
