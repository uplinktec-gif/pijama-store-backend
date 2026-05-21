# Sistema de LEADS - Gestão de Contatos para Marketing

## Visão Geral

O sistema de LEADS permite rastrear e gerenciar contatos de clientes no Google Sheets, estabelecendo um pipeline completo de relacionamento:

```
novo → visitante → cliente → vip
```

## Estrutura de Dados

### Aba LEADS no Google Sheets

| Coluna | Campo | Tipo | Obrigatório | Descrição |
|--------|-------|------|---|-----------|
| A | DATA_CRIACAO | ISO 8601 | Sim | Quando o lead foi criado |
| B | NOME | Texto | Sim | Nome do cliente |
| C | CELULAR | Texto | Sim | Telefone (obrigatório para marketing) |
| D | EMAIL | Texto | Não | Email do cliente |
| E | FONTE | Enum | Sim | De onde veio: `site_cadastro`, `site_compra`, `google_oauth`, `cpf` |
| F | PRIMEIRA_INTERACAO | ISO 8601 | Sim | Primeira vez que contato com o cliente |
| G | ULTIMA_INTERACAO | ISO 8601 | Sim | Última interação registrada |
| H | STATUS | Enum | Sim | Estágio: `novo`, `visitante`, `cliente`, `vip` |
| I | TOTAL_GASTO | Decimal | Sim | Valor total gasto em compras (R$) |
| J | NUMERO_PEDIDOS | Integer | Sim | Quantos pedidos já fez |
| K | OBSERVACOES | Texto | Não | Notas adicionais sobre o cliente |

## Fluxos de Criação de Leads

### 1. Cadastro via Site (CPF)
```
Cliente acessa site → Clica "Cadastrar"
→ Preenche: nome, CPF, celular, email
→ POST /auth/cliente/registrar
→ criarLead(nome, celular, email, 'site_cadastro')
→ Entrada criada em LEADS
```

### 2. Login via Google OAuth
```
Cliente acessa site → Clica "Entrar com Gmail"
→ Autentica no Google
→ googleCallback criado/atualizado em CLIENTES
→ ⚠️ LEAD NÃO criado (ainda não tem celular)
→ Celular será capturado no checkout
```

### 3. Primeira Compra via WhatsApp
```
Cliente envia msg WhatsApp: "2 zara g preto"
→ processarMensagemPedido()
→ Se cliente não existe em CLIENTES:
   → criarCliente(nome, whatsapp, ...)
   → criarLead(nome, whatsapp, '', 'site_compra')
→ Pedido criado, lead registrado
```

## Progressão de Status

| Status | Quando | Ação |
|--------|--------|------|
| **novo** | Lead criado | Aguardando primeira compra |
| **visitante** | Fez primeira compra | Status pode ser atualizado manualmente |
| **cliente** | Confirmou pagamento | Auto-atualizado ao confirmar pagamento de pedido |
| **vip** | Total gasto ≥ R$ 500 | Auto-promovido ao confirmar pagamento |

### Fluxo de Pagamento
```
Cliente envia: "pedido #123 foi pago"
→ processarStatusUpdate(tipo='pagamento')
→ atualizarStatusPagamento(numero=123, status='PAGO')
→ atualizarTotalGastoLead(celular, valor_pedido, numero_pedido)
  → novoTotal = lead.totalGasto + valor_pedido
  → Se novoTotal >= 500 → status = 'vip' ✨
  → Senão → status = 'cliente'
→ Resposta inclui 🎉 se foi promovido a VIP
```

## API de Serviço

### leadsService.criarLead(nome, celular, email, fonte)

**Parâmetros:**
- `nome` (string, obrigatório): Nome do cliente
- `celular` (string, obrigatório): Telefone com 10+ dígitos
- `email` (string, opcional): Email do cliente
- `fonte` (string, obrigatório): `'site_cadastro'` | `'site_compra'` | `'google_oauth'` | `'cpf'`

**Retorno:**
```javascript
{ 
  success: true,
  rowIndex: 2  // Linha inserida no Sheets
}
```

**Comportamento:**
- Normaliza celular (remove caracteres não-numéricos)
- Verifica se celular já existe (deduplicação)
- Cria com status `'novo'`
- Usa ISO 8601 para timestamps

---

### leadsService.buscarLeadPorCelular(celular)

**Retorno:**
```javascript
{
  rowIndex: 5,
  nome: "Maria Silva",
  celular: "95988123456",
  status: "cliente",
  totalGasto: 250.50
}
// ou null se não encontrado
```

---

### leadsService.atualizarStatusLead(celular, status)

**Parâmetros:**
- `celular` (string): Número normalizado
- `status` (string): `'novo'` | `'visitante'` | `'cliente'` | `'vip'`

**Efeito:**
- Atualiza coluna H (STATUS)
- Atualiza coluna G (ULTIMA_INTERACAO) com timestamp atual

---

### leadsService.atualizarTotalGastoLead(celular, valor, numeroPedido)

**Parâmetros:**
- `celular` (string): Número normalizado
- `valor` (number): Valor gasto no pedido (R$)
- `numeroPedido` (number): ID do pedido para referência

**Retorno:**
```javascript
{
  success: true,
  newTotal: 500.50,
  isVip: true  // se foi promovido
}
```

**Comportamento:**
- Localiza lead pelo celular
- Soma valor ao TOTAL_GASTO
- Incrementa NUMERO_PEDIDOS
- **Auto-promoção**: Se `newTotal >= 500` → status = `'vip'`
- Senão → status = `'cliente'`

---

### leadsService.listarLeadsNovos()

**Retorno:**
```javascript
[
  {
    rowIndex: 2,
    dataCriacao: "2026-05-21T14:30:00Z",
    nome: "João Silva",
    celular: "95988123456",
    email: "joao@email.com",
    fonte: "site_cadastro",
    status: "novo"
  },
  // ... últimas 24 horas
]
```

**Uso:** Relatório diário, notificações para Felipe/Júlly

---

### leadsService.listarClientesParaMerchan()

**Retorno:**
```javascript
[
  {
    rowIndex: 5,
    nome: "Maria Silva",
    celular: "95988123456",
    email: "maria@email.com",
    status: "vip",           // 'cliente' ou 'vip'
    totalGasto: 850.00,
    numeroPedidos: 4,
    ultimaInteracao: "2026-05-21T10:45:00Z"
  },
  // ... ordenado por totalGasto DESC
]
```

**Uso:** Seleção de clientes para campanhas, recomendações VIP

---

### leadsService.adicionarObservacao(celular, observacao)

**Uso:**
```javascript
await leadsService.adicionarObservacao(
  "95988123456",
  "Cliente preferiu ZARA. Alergico a tinta azul marinho."
);
```

**Efeito:**
- Salva observação na coluna K
- Útil para anotações manuais sobre preferências

---

## Integração com Módulos

### 1. auth.controller.js

**registrarCliente()** - Quando CPF se cadastra:
```javascript
// Após criar cliente com sucesso
const leadResultado = await leadsService.criarLead(
  nome,
  whatsappNumero,
  email || '',
  'site_cadastro'
);
```

---

### 2. business/pedidos.js

**processarMensagemPedido()** - Quando novo cliente compra via WhatsApp:
```javascript
// Se cliente não existe
const leadResult = await leadsService.criarLead(
  pedidoInterpretado.cliente_nome,
  pedidoInterpretado.cliente_whatsapp,
  '',  // email não disponível via WhatsApp
  'site_compra'
);
```

**processarStatusUpdate()** - Quando pagamento é confirmado:
```javascript
// Após confirmar pagamento
const leadUpdate = await leadsService.atualizarTotalGastoLead(
  pedido.cliente_whatsapp,
  pedido.valor_total,
  numero_pedido
);

if (leadUpdate.isVip) {
  mensagem_usuario += '\n\n🎉 *Cliente VIP!* Você atingiu R$ 500+ em compras!';
}
```

---

## Inicialização

### Automática

Na inicialização do servidor (`server.js`):
```javascript
await inicializarSheetLeads();
```

Verifica e cria a aba LEADS se não existir.

### Manual

Executar script:
```bash
node scripts/init-leads-sheet.js
```

---

## Casos de Uso

### 📊 Análise de Clientes
```javascript
// Próximos da VIP (>R$ 400)
const clientes = await leadsService.listarClientesParaMerchan();
const proximosVip = clientes.filter(c => c.totalGasto > 400 && c.totalGasto < 500);
```

### 📢 Campanha de Marketing
```javascript
// Todos os clientes (cliente + vip)
const clientes = await leadsService.listarClientesParaMerchan();

clientes.forEach(c => {
  enviarWhatsApp(c.celular, `Olá ${c.nome}! Novo modelo chegou...`);
});
```

### 🎯 Recomendações Personalizadas
```javascript
// Cliente VIP merece atenção especial
const cliente = await leadsService.buscarLeadPorCelular(celular);

if (cliente?.status === 'vip') {
  // Oferecer frete grátis, desconto, etc.
}
```

### 📋 Relatório Diário
```javascript
// Novos leads das últimas 24h
const novos = await leadsService.listarLeadsNovos();
console.log(`Novos leads: ${novos.length}`);
novos.forEach(l => {
  console.log(`  ${l.nome} - ${l.fonte}`);
});
```

---

## Boas Práticas

✅ **DO:**
- Sempre normalizar celular antes de buscar (`replace(/\D/g, '')`)
- Usar `buscarLeadPorCelular()` antes de atualizar (verifica existência)
- Capturar celular de Google OAuth no checkout ou perfil
- Registrar fonte corretamente para análise
- Adicionar observações sobre preferências do cliente

❌ **DON'T:**
- Criar lead sem celular (usar até email depois)
- Atualizar status manualmente se não tem lógica clara
- Deixar OBSERVACOES vazio (usar para anotações úteis)
- Confundir NUMERO_PEDIDOS (quantidade) com NUMERO_PEDIDO (último ID)

---

## Roadmap

### ✅ Implementado
- Criar/buscar/atualizar leads
- Deduplicação por celular
- Auto-promoção a VIP em R$ 500+
- Listagem para relatórios e merchan

### 🔲 Futuro
- Integração com SMS marketing
- Segmentação por preferência de modelo
- Filtro por data/período
- API pública para Portal do Cliente
- Webhook de novo VIP para Felipe/Júlly

---

## Troubleshooting

**P: Lead não foi criado após cadastro**
- ✓ Verificar se celular tem 10+ dígitos
- ✓ Conferir Google Sheets tem aba LEADS
- ✓ Ver logs do servidor para erros

**P: Cliente criado em CLIENTES mas não em LEADS**
- ✓ Executar `node scripts/init-leads-sheet.js`
- ✓ Conferir se leads.js foi atualizado
- ✓ Reiniciar servidor

**P: VIP não foi promovido ao R$ 500**
- ✓ Conferir se `atualizarTotalGastoLead` foi chamado
- ✓ Confirmar pagamento com status 'PAGO'
- ✓ Verificar cálculo: `totalGasto + novo_valor >= 500`

---

## Referências

- [Google Sheets API Docs](https://developers.google.com/sheets/api)
- Arquivo: `src/services/sheets/leads.js`
- Teste: `scripts/init-leads-sheet.js`
