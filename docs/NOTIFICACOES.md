# Notificações WhatsApp - Novo Cliente e VIP

## Visão Geral

Sistema automático de notificações via WhatsApp que alerta Felipe/Júlly sobre:
- 📝 Novo cliente cadastrado no site
- 🎉 Novo cliente faz primeira compra (pagamento confirmado)
- ⭐ Cliente promovido a VIP (R$ 500+)

## Fluxos de Notificação

### 1. Novo Cadastro via CPF

**Gatilho:** POST `/auth/cliente/registrar` com sucesso

**Sequência:**
```
Cliente preenche formulário de cadastro
→ POST /auth/cliente/registrar
→ registrarCliente() validado
→ Cliente criado em CLIENTES sheet
→ Lead criado em LEADS sheet
→ enviarNotificacaoNovoCliente()
→ Felipe recebe notificação no WhatsApp
```

**Mensagem para Felipe:**
```
📝 *NOVO CLIENTE CADASTRADO NO SITE!*

👤 João Silva
📱 95988123456
📧 joao@email.com

Link para contato: https://wa.me/5595988123456
```

**Código:**
```javascript
// em src/controllers/auth.controller.js
async function enviarNotificacaoNovoCliente(nome, whatsapp, email) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) return;

  const mensagem = `📝 *NOVO CLIENTE CADASTRADO NO SITE!* ...`;
  await enviarMensagem(numeroFelipe, mensagem);
}
```

**Ambiente:** .env
```
NUMERO_FELIPE=95981188675  # Número de Felipe
```

---

### 2. Novo Cliente - Primeira Compra Paga

**Gatilho:** Pagamento confirmado para pedido de novo cliente

**Sequência:**
```
Cliente envia: "pedido #123 foi pago"
→ processarStatusUpdate(tipo='pagamento')
→ pedidosSheets.atualizarStatusPagamento() confirmado
→ leadsService.atualizarTotalGastoLead() executado
→ Se !isVip → enviarNotificacaoNovoClientePagou()
→ Felipe recebe notificação no WhatsApp
```

**Mensagem para Felipe:**
```
🎉 *NOVO CLIENTE PAGOU!*

👤 Maria Silva
📱 95988765432

📋 Pedido: #123
🛍️ Descrição: 2x ZARA M preto
💰 Valor: R$ 259,80
💳 Forma: PIX

🚚 Tipo: ENTREGA
```

**Código:**
```javascript
// em src/services/business/pedidos.js
async function enviarNotificacaoNovoClientePagou(pedido, numeroPedido) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) return;

  const mensagem = `🎉 *NOVO CLIENTE PAGOU!* ...`;
  await enviarMensagem(numeroFelipe, mensagem);
}
```

---

### 3. Cliente Promovido a VIP

**Gatilho:** Total gasto do cliente atinge/ultrapassa R$ 500

**Sequência:**
```
Cliente envia: "pedido #456 foi pago"
→ processarStatusUpdate(tipo='pagamento')
→ leadsService.atualizarTotalGastoLead()
   → novoTotal = 500.00 ou mais
   → isVip = true
   → status atualizado para 'vip'
→ enviarNotificacaoNovoVIP()
→ Felipe recebe notificação no WhatsApp

(Cliente também recebe mensagem na conversa)
```

**Mensagem para Felipe:**
```
⭐ *NOVO CLIENTE VIP!*

👤 Carlos Santos
📱 95981234567

🎯 Alcançou R$ 500+ em compras!

📋 Pedido: #456
🛍️ Descrição: 1x BEATRIZ P bordô
💰 Valor: R$ 89,90
💳 Forma: DINHEIRO

💡 Sugestão: Ofereça frete grátis ou desconto exclusivo!
```

**Mensagem para Cliente:**
```
🎉 *Cliente VIP!* Você atingiu R$ 500+ em compras!
```

**Código:**
```javascript
// em src/services/business/pedidos.js
async function enviarNotificacaoNovoVIP(pedido, numeroPedido) {
  const numeroFelipe = process.env.NUMERO_FELIPE;
  if (!numeroFelipe) return;

  const mensagem = `⭐ *NOVO CLIENTE VIP!* ...`;
  await enviarMensagem(numeroFelipe, mensagem);
}
```

---

## Integração com Módulos

### auth.controller.js

**Função:** registrarCliente()

```javascript
// Após criar lead com sucesso
if (leadResultado.success) {
  // Notificar Felipe sobre novo cadastro no site
  enviarNotificacaoNovoCliente(nome, whatsappNumero, email).catch(e =>
    logger.warn('[notif-cadastro] Erro ao notificar:', e.message)
  );
}
```

---

### business/pedidos.js

**Função:** processarStatusUpdate()

```javascript
// Após confirmar pagamento com sucesso
if (updateResult.success) {
  // Atualizar lead: total gasto e status
  const leadUpdate = await leadsService.atualizarTotalGastoLead(
    pedido.cliente_whatsapp,
    pedido.valor_total,
    numero_pedido
  );

  if (leadUpdate.success && leadUpdate.isVip) {
    // Novo VIP
    enviarNotificacaoNovoVIP(pedido, numero_pedido);
  } else if (leadUpdate.success && !leadUpdate.isVip) {
    // Novo cliente que pagou
    enviarNotificacaoNovoClientePagou(pedido, numero_pedido);
  }
}
```

---

## Variáveis de Ambiente Necessárias

```env
# Número de Felipe (obrigatório para notificações)
NUMERO_FELIPE=95981188675

# Número de Júlly (futuro - para notificações customizadas)
NUMERO_JULLY=95981225668
```

---

## Configuração Requerida

### 1. Evolution API / WhatsApp
- ✅ Conexão com Evolution API funcionando
- ✅ serviço `enviarMensagem()` em `src/services/whatsapp/sender.js`
- ✅ NUMERO_FELIPE configurado no .env

### 2. Google Sheets
- ✅ Aba LEADS criada (ver `docs/LEADS.md`)
- ✅ Aba CLIENTES com coluna de celular

### 3. Servidor
- ✅ Variáveis de ambiente carregadas
- ✅ Logs habilitados para `[notif-*]`

---

## Logs e Debugging

### Logs Gerados

```
[notif-cadastro] Notificação enviada para Felipe: João Silva
[notif-cliente] Notificação enviada para Felipe: 123
[notif-vip] Notificação enviada para Felipe: 456

[notif-cadastro] Erro ao enviar notificação: [erro]
```

### Verificação Manual

**Testar notificação de cadastro:**
```bash
# Via endpoint de teste
curl -X POST http://localhost:3000/test/notif-cadastro \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Teste Silva",
    "whatsapp": "95988123456",
    "email": "teste@email.com"
  }'
```

---

## Problemas Comuns

### P: Notificação não foi recebida

**Checklist:**
- ✓ NUMERO_FELIPE está configurado em `.env`
- ✓ Servidor está rodando (`npm run dev`)
- ✓ Evolution API está conectada
- ✓ Felipe tem WhatsApp ativo
- ✓ Verificar logs: `[notif-*]`

### P: Erro "NUMERO_FELIPE não configurado"

```
Solution: Adicionar em .env:
NUMERO_FELIPE=5595981188675
```

### P: "Erro ao enviar notificação" mas lead foi criado

```
Problem: Evolution API desconectada
Solution: Verificar conexão Evolution API
          Ver em src/services/whatsapp/sender.js
```

---

## Futuro - Multi-Usuário

Atualmente apenas Felipe recebe notificações. Roadmap:

```javascript
// Futuro: Diferentes notificações para diferentes usuários
const config = {
  NOVO_CLIENTE: ['NUMERO_FELIPE'],         // Apenas Felipe
  NOVO_VIP: ['NUMERO_FELIPE', 'NUMERO_JULLY'], // Felipe + Júlly
  PAGAMENTO: ['NUMERO_FELIPE'],            // Apenas Felipe
};
```

---

## Referências

- Arquivo: `src/controllers/auth.controller.js` → `enviarNotificacaoNovoCliente()`
- Arquivo: `src/services/business/pedidos.js` → `enviarNotificacao*()`
- Arquivo: `src/services/sheets/leads.js` → `atualizarTotalGastoLead()`
- Documentação LEADS: `docs/LEADS.md`
- Documentação WhatsApp: `docs/WHATSAPP.md`
