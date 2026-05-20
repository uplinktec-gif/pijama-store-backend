# API Documentation

Documentação completa de todos os endpoints e estruturas de dados da API.

## 📋 Índice

1. [Autenticação](#autenticação)
2. [Webhooks](#webhooks)
3. [Endpoints (Admin)](#endpoints-admin)
4. [Estruturas de Dados](#estruturas-de-dados)
5. [Mensagens WhatsApp](#mensagens-whatsapp)
6. [Fluxos de Conversa](#fluxos-de-conversa)

---

## 🔐 Autenticação

### WhatsApp Webhook
Autenticação por verificação de token:

```http
GET /webhook/whatsapp?hub.verify_token=meu_token&hub.challenge=12345
```

**Parâmetros**:
- `hub.verify_token` - Deve corresponder a `WHATSAPP_VERIFY_TOKEN` em `.env`
- `hub.challenge` - Retornado como resposta se token válido

**Resposta (sucesso)**:
```
HTTP/1.1 200 OK
12345
```

**Resposta (erro)**:
```
HTTP/1.1 403 Forbidden
```

### Autorização de Números
Números WhatsApp são autorizados via `.env`:
```env
AUTHORIZED_WHATSAPP_NUMBERS=5595988123456,5595987654321
```

Apenas números na lista podem enviar mensagens que serão processadas.

---

## 📡 Webhooks

### POST /webhook/whatsapp
Recebe mensagens do WhatsApp Business API.

**Headers**:
```
Content-Type: application/json
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
```

**Body (exemplo)**:
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "123456789",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "554733330000",
              "phone_number_id": "102345678901234"
            },
            "messages": [
              {
                "from": "5595988123456",
                "id": "wamid.xxx",
                "timestamp": "1234567890",
                "text": {
                  "body": "2 zara g bordô pra joão"
                },
                "type": "text"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Resposta**:
```json
HTTP/1.1 200 OK
{
  "success": true
}
```

**Processamento**:
1. Extrai `from` (número WhatsApp)
2. Verifica autorização em `AUTHORIZED_WHATSAPP_NUMBERS`
3. Extrai mensagem em `text.body`
4. Chama `processarMensagemComContexto()`
5. Responde via `sendMessage()`

---

## 🔌 Endpoints (Admin)

Endpoints de API (acesso apenas para ADMIN).

### GET /api/logs

Retorna últimas linhas do arquivo de log combinado.

**Autenticação**: WhatsApp + ADMIN role

**Query Parâmetros**:
- `lines` (opcional) - Número de linhas (padrão: 100, máximo: 500)
- `level` (opcional) - Filtro de level: `all|error|warn|info|debug`

**Exemplo**:
```
GET /api/logs?lines=50&level=error
```

**Resposta (sucesso)**:
```json
HTTP/1.1 200 OK
{
  "total_lines": 2850,
  "lines_returned": 50,
  "logs": [
    "[2026-05-17 18:45:30] ERROR: Estoque insuficiente {produto: 'ZARA_G_BORDO', solicitado: 5, disponível: 2}",
    "[2026-05-17 18:46:15] INFO: Pedido #123 criado {whatsapp: '+5595988123456'}"
  ]
}
```

**Resposta (não autorizado)**:
```json
HTTP/1.1 403 Forbidden
{
  "error": "Você não tem permissão para acessar logs"
}
```

---

### GET /api/backup/latest

Retorna informações do backup mais recente.

**Autenticação**: WhatsApp + ADMIN role

**Exemplo**:
```
GET /api/backup/latest
```

**Resposta (sucesso)**:
```json
HTTP/1.1 200 OK
{
  "arquivo": "pijama-store-2026-05-17-02-00.json",
  "tamanho_kb": 45.32,
  "data_criacao": "2026-05-17T02:00:00.000Z",
  "data_modificacao": "2026-05-17T02:00:15.000Z"
}
```

**Resposta (nenhum backup)**:
```json
HTTP/1.1 404 Not Found
{
  "error": "Nenhum backup disponível"
}
```

---

## 📊 Estruturas de Dados

### Pedido
```json
{
  "numero_pedido": 123,
  "data_pedido": "2026-05-17T18:45:30.000Z",
  "cliente_nome": "João",
  "cliente_whatsapp": "+5595988123456",
  "descricao_pedido": "2x ZARA G bordô, 1x MIA P preto",
  "quantidade_total": 3,
  "valor_total": 399.70,
  "tipo_entrega": "ENTREGA",
  "endereco_entrega": "Rua A, 123, Apt 4",
  "status_pagamento": "PEDIDO",
  "forma_pagamento": "PENDENTE",
  "status_entrega": "PENDENTE",
  "itens_json": [
    {
      "modelo": "ZARA",
      "tamanho": "G",
      "cor": "bordô",
      "quantidade": 2,
      "valor_unitario": 129.90,
      "valor_total": 259.80
    },
    {
      "modelo": "MIA",
      "tamanho": "P",
      "cor": "preto",
      "quantidade": 1,
      "valor_unitario": 139.90,
      "valor_total": 139.90
    }
  ],
  "data_pagamento": null,
  "data_entrega": null,
  "observacoes": "Cliente preferiu ZARA P mas estava fora"
}
```

### Cliente
```json
{
  "id_cliente": "cli_abc123",
  "nome": "João da Silva",
  "whatsapp": "+5595988123456",
  "email": "joao@email.com",
  "endereco": "Rua A, 123, Apt 4",
  "bairro": "Centro",
  "cidade": "Boa Vista",
  "telefone_alternativo": "+5595987654321",
  "data_primeiro_pedido": "2026-05-01T10:00:00.000Z",
  "total_gasto": 1299.70,
  "quantidade_pedidos": 5,
  "modelo_favorito": "ZARA",
  "data_ultimo_pedido": "2026-05-17T18:45:30.000Z",
  "observacoes": "Cliente VIP, sempre paga no prazo",
  "role": "CLIENTE"
}
```

### Produto (Estoque)
```json
{
  "id_produto": "ZARA_G_BORDO",
  "modelo": "ZARA",
  "tamanho": "G",
  "cor": "bordô",
  "preco_unitario": 129.90,
  "quantidade_total": 50,
  "quantidade_reservada": 7,
  "quantidade_disponivel": 43,
  "data_atualizacao": "2026-05-17T18:00:00.000Z",
  "observacoes": "Estoque em dia",
  "status": "ativo"
}
```

### Resposta de Conversa
```json
{
  "success": true,
  "resposta": "Perfeito, João! Seu pedido #123:\n2x ZARA G bordô (R$ 259,80)\nTotal: R$ 259,80\n\nRetirada na loja ou entrega?",
  "tipo": "NOVO_PEDIDO",
  "contextoAtualizado": false
}
```

### Análise de Vendas
```json
{
  "totalVendido": 2850.50,
  "quantidadePedidos": 12,
  "ticketMedio": 237.54,
  "maisVendidos": [
    {
      "modelo": "ZARA",
      "quantidade": 8,
      "valor": 1039.20
    },
    {
      "modelo": "MIA",
      "quantidade": 3,
      "valor": 419.70
    }
  ],
  "periodo_dias": 7
}
```

### Análise de Estoque
```json
{
  "totalProdutos": 140,
  "totalDisponivel": 523,
  "disponibilidade": 87.3,
  "alertas": [
    {
      "tipo": "URGENTE",
      "produto": "NÚBIA",
      "disponivel": 2,
      "diasRestantes": 1,
      "recomendacao": "Compre 50 unidades"
    },
    {
      "tipo": "AVISO",
      "produto": "BEATRIZ",
      "disponivel": 5,
      "diasRestantes": 3,
      "recomendacao": "Monitorar próxima semana"
    }
  ]
}
```

### Relatório Diário
```json
{
  "data": "2026-05-17",
  "hora": "18:00",
  "vendas": {
    "totalVendido": 2850.50,
    "quantidadePedidos": 12,
    "ticketMedio": 237.54,
    "maisVendidos": [...]
  },
  "estoque": {
    "totalProdutos": 140,
    "alertas": [...]
  },
  "clientes": {
    "vips": [
      {
        "nome": "João da Silva",
        "totalGasto": 1299.70,
        "quantidadePedidos": 5
      }
    ]
  }
}
```

---

## 💬 Mensagens WhatsApp

### Tipos de Mensagem Detectados

#### 1. NOVO_PEDIDO
```
"2 zara g bordô 150 pra joão"
"quero pedir 1 mia p preto"
"vender 3 beatriz m azul"
```

Bot responde pedindo tipo de entrega.

#### 2. CONFIRMAR_PAGAMENTO
```
"paguei no pix"
"transferi o dinheiro"
"paguei a #123 no cartão"
```

Bot atualiza status para PAGO.

#### 3. CONFIRMAR_ENTREGA
```
"entrega em casa"
"retirada na loja"
"vou retirar amanhã"
```

Bot pergunta endereço (se ENTREGA) ou horário (se RETIRADA).

#### 4. CONSULTAR_PEDIDO
```
"qual é o status do #123?"
"meu pedido chegou?"
"onde está meu pedido?"
```

Bot retorna status do pedido.

#### 5. ANALYTICS_VENDAS
```
"@análise"
"@analysis"
"análise de vendas"
```

Apenas ADMIN. Bot envia análise dos últimos 7 dias.

#### 6. ANALYTICS_ESTOQUE
```
"@estoque"
"qual é o estoque?"
"temos estoque?"
```

ADMIN/OPERADOR. Bot envia análise de estoque.

#### 7. ANALYTICS_RECOMENDACAO
```
"@recomendação"
"@recomendacao"
"o que vender?"
```

Qualquer role. Bot envia recomendação personalizada.

#### 8. CANCELAR
```
"cancelar"
"sair"
"nunca"
"de jeito nenhum"
```

Bot cancela pedido em andamento.

### Respostas do Bot

#### Novo Pedido Criado
```
Perfeito, João! Seu pedido #123:
2x ZARA G bordô (R$ 259,80)
Total: R$ 259,80

Retirada na loja ou entrega?
```

#### Pagamento Confirmado
```
Obrigado! Pagamento confirmado ✓
Pedido #123 - Status: PENDENTE DE ENTREGA
Entrega prevista: segunda-feira

Qualquer dúvida, é só chamar!
```

#### Sem Permissão
```
❌ Você não tem permissão para acessar análises de vendas.
```

#### Análise de Vendas
```
📊 ANÁLISE DE VENDAS (ÚLTIMOS 7 DIAS)

💰 TOTAL: R$ 2.850,00
📋 PEDIDOS: 12
🎯 TICKET MÉDIO: R$ 237,50

🔥 MAIS VENDIDOS:
   1. ZARA: 8 un (R$ 1.039,20)
   2. MIA: 3 un (R$ 419,70)
```

---

## 🔄 Fluxos de Conversa

### Fluxo 1: Criar Pedido Completo

```
Cliente: "2 zara g bordô pra joão"
     ↓
Bot:   "Perfeito, João! Seu pedido #123:
         2x ZARA G bordô (R$ 259,80)
         Total: R$ 259,80
         Retirada na loja ou entrega?"
     ↓
Cliente: "entrega na minha casa"
     ↓
Bot:   "Qual é o endereço de entrega?"
     ↓
Cliente: "Rua A, 123, Apt 4"
     ↓
Bot:   "Perfeito! Endereço salvo.
         Pedido #123
         Total: R$ 259,80
         Como você quer pagar? (PIX, dinheiro ou cartão)"
     ↓
Cliente: "pix"
     ↓
Bot:   "Pagamento confirmado ✓
         Pedido #123 - Entrega: segunda-feira"
```

### Fluxo 2: Confirmar Pagamento Later

```
Cliente: "paguei o pedido 123 no pix"
     ↓
Bot:   "Obrigado! Pagamento confirmado ✓
         Pedido #123
         Forma: PIX
         Data de entrega: segunda-feira"
```

### Fluxo 3: Consultar Pedido

```
Cliente: "qual é o status do #123?"
     ↓
Bot:   "Pedido #123
         Status: Aguardando pagamento
         Valor: R$ 259,80
         
         Confirme o pagamento para prosseguir!"
```

---

## 🧪 Exemplos de Curl

### Teste de Webhook Verification
```bash
curl "http://localhost:3000/webhook/whatsapp?hub.verify_token=seu_token&hub.challenge=12345"
# Resposta: 12345
```

### Envio de Mensagem (POST webhook)
```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5595988123456",
            "text": {"body": "2 zara g bordô pra joão"}
          }]
        }
      }]
    }]
  }'
```

### Obter Logs (Admin)
```bash
curl -H "X-WhatsApp-Number: 5595988123456" \
  http://localhost:3000/api/logs?lines=50&level=error
```

### Obter Backup Mais Recente (Admin)
```bash
curl -H "X-WhatsApp-Number: 5595988123456" \
  http://localhost:3000/api/backup/latest
```

---

## 📝 Status HTTP

| Code | Significado |
|------|-----------|
| 200 | Sucesso |
| 400 | Bad Request (dados inválidos) |
| 401 | Não autorizado (sem token/key) |
| 403 | Proibido (sem permissão) |
| 404 | Não encontrado (recurso não existe) |
| 429 | Rate limited (muitas requisições) |
| 500 | Erro interno do servidor |

---

## 🔐 Headers de Segurança

Todos os endpoints (exceto webhook verification) requerem:

```
Content-Type: application/json
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
```

Para endpoints de API (Admin):
```
X-WhatsApp-Number: 5595988123456
```

---

## ⏰ Rate Limits

- **WhatsApp**: 80 mensagens/segundo por número
- **Google Sheets**: 500 requisições/100s
- **Claude API**: Varia por tier (Pro/Business)
- **Logs API**: Ilimitado (local)
- **Backup API**: Ilimitado (local)

---

## 📞 Suporte

Dúvidas sobre API? Verifique:
- [README.md](./README.md) - Visão geral
- [SETUP.md](./SETUP.md) - Configuração
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Problemas

Email: uplinktec@gmail.com
