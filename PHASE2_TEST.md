# Plano de Testes — FASE 2: Conversas Multi-Turno

## Status Atual

✅ Implementado:
- Sistema de contexto de conversa (CONVERSAS sheet)
- Detecção automática de tipo de mensagem
- Fluxos de: novo pedido, pagamento, entrega, consulta, cancelamento
- Persistência de contexto entre mensagens

⏳ Próximos:
- Teste end-to-end com WhatsApp real
- Ajustes baseado em feedback
- Edge cases e tratamento de erros

---

## Cenários de Teste

### Cenário 1: Novo Pedido (Fluxo Básico)

**Mensagem 1** (Cliente):
```
2 zara g bordô 150 pra joão
```

**Resposta Esperada**:
```
Perfeito, João! Seu pedido #[N]:
2x ZARA G bordô (R$ 259,80)
Total: R$ 259,80

Retirada na loja ou entrega?
```

**Contexto Salvo**:
- `numero_pedido_atual`: [N]
- `modelo`: "ZARA"
- `tamanho`: "G"
- `cor`: "bordô"
- `quantidade`: 2
- `valor_total`: 259.80
- `pedido_incompleto`: true
- `aguardando`: null

---

### Cenário 2: Confirmar Tipo de Entrega

**Mensagem 2** (Cliente):
```
entrega
```

**Resposta Esperada**:
```
Perfeito! Tipo de entrega: Entrega em domicílio

Qual é o endereço de entrega?
```

**Contexto Atualizado**:
- `tipo_entrega`: "ENTREGA"
- `aguardando`: "endereco"

---

### Cenário 3: Fornecer Endereço

**Mensagem 3** (Cliente):
```
Rua das Flores, 123, Apto 45, Boa Vista - RR
```

**Resposta Esperada**:
```
Perfeito! Seus dados foram salvos.

Pedido #[N]
Total: R$ 259,80

Como você quer pagar? (PIX, dinheiro ou cartão)
```

**Contexto Atualizado**:
- `endereco_entrega`: "Rua das Flores, 123, Apto 45, Boa Vista - RR"
- `aguardando`: null
- `pedido_incompleto`: true (aguardando pagamento)

---

### Cenário 4: Confirmar Pagamento

**Mensagem 4** (Cliente):
```
paguei no pix
```

**Resposta Esperada**:
```
Obrigado! Pagamento confirmado ✓
Pedido #[N] - Status: PENDENTE DE ENTREGA
Entrega prevista: segunda-feira

Qualquer dúvida, é só chamar!
```

**Contexto Finalizado**:
- `pagamento_confirmado`: true
- `forma_pagamento`: "PIX"
- `status`: "FINALIZADA"

---

### Cenário 5: Novo Pedido + Retirada

**Mensagem 1** (Cliente):
```
1 mia p preto pra maria
```

**Contexto**: Novo contexto criado para Maria

---

**Mensagem 2** (Cliente):
```
retirada
```

**Resposta Esperada**:
```
Perfeito! Tipo de entrega: Retirada na loja

Data/horário da retirada?
```

---

**Mensagem 3** (Cliente):
```
sábado 14h
```

**Resposta Esperada**:
```
Perfeito! Seus dados foram salvos.

Pedido #[N]
Total: R$ 89,90

Como você quer pagar? (PIX, dinheiro ou cartão)
```

---

### Cenário 6: Consultar Status Existente

**Contexto Ativo**: João tem pedido #[N] em progresso

**Mensagem** (Cliente):
```
qual é o status do pedido?
```

**Resposta Esperada**:
```
Pedido #[N]
Status: Aguardando pagamento
Valor: R$ 259,80

Confirme o pagamento para prosseguir!
```

---

### Cenário 7: Cancelar Pedido

**Contexto Ativo**: Maria tem pedido #[N] não pago

**Mensagem** (Cliente):
```
cancelar
```

**Resposta Esperada**:
```
Pedido #[N] foi cancelado. Se tiver outras dúvidas, é só chamar!
```

**Contexto Finalizado**:
- `status`: "FINALIZADA"

---

### Cenário 8: Mensagem Ininteligível

**Mensagem** (Cliente):
```
blablabla
```

**Resposta Esperada**:
```
Desculpe, não entendi. Você pode:
• Fazer um novo pedido
• Confirmar pagamento
• Consultar status do pedido
• Cancelar
```

---

## Casos de Erro (Edge Cases)

### Erro 1: Estoque Indisponível

**Mensagem**:
```
100 zara g bordô pra pedro
```

**Esperado**: Erro de validação (estoque insuficiente)

**Resposta Esperada**:
```
Desculpe, não temos essa quantidade de ZARA G bordô em estoque.
Disponível: [X] peças

Quer levar menos ou escolher outro tamanho/cor?
```

---

### Erro 2: Número WhatsApp Não Autorizado

**Contexto**: Mensagem de +5595999999999 (não está em AUTHORIZED_WHATSAPP_NUMBERS)

**Esperado**: Mensagem ignorada silenciosamente (logged como aviso)

---

### Erro 3: Sem Credenciais Google Sheets

**Contexto**: service-account.json não existe ou GOOGLE_SHEETS_ID vazio

**Esperado**: Erro no carregamento de contexto, resposta de erro genérica

```
Desculpe, ocorreu um erro. Tente novamente ou entre em contato.
```

---

### Erro 4: Google Sheets API Indisponível

**Contexto**: Conexão com Google falha

**Esperado**: Retry lógico, erro após timeout

---

## Verificação de Banco de Dados

Após cada teste, verificar em Google Sheets:

### CONVERSAS Sheet

```
WHATSAPP             | STATUS      | CONTEXTO_JSON
+5595988123456       | FINALIZADA  | {"numero_pedido_atual": 1, "forma_pagamento": "PIX", ...}
+5595987654321       | ATIVA       | {"numero_pedido_atual": 2, "aguardando": "endereco", ...}
```

### PEDIDOS_E_VENDAS Sheet

```
NUMERO_PEDIDO | CLIENTE_NOME | STATUS_PAGAMENTO | STATUS_ENTREGA | DATA_PAGAMENTO
1             | João         | PAGO             | PENDENTE       | [timestamp]
2             | Maria        | PENDENTE         | PENDENTE       | null
```

### CLIENTES Sheet

```
WHATSAPP         | NOME  | QUANTIDADE_PEDIDOS | TOTAL_GASTO | MODELO_FAVORITO
+5595988123456   | João  | 1                  | 259.80      | ZARA
+5595987654321   | Maria | 1                  | 89.90       | MIA
```

---

## Checklist de Testes

- [ ] Cenário 1: Novo pedido (fluxo básico)
- [ ] Cenário 2: Confirmar entrega
- [ ] Cenário 3: Fornecer endereço
- [ ] Cenário 4: Confirmar pagamento PIX
- [ ] Cenário 5: Novo pedido + retirada
- [ ] Cenário 6: Consultar status
- [ ] Cenário 7: Cancelar pedido
- [ ] Cenário 8: Mensagem ininteligível
- [ ] Erro 1: Estoque indisponível
- [ ] Erro 2: Número não autorizado
- [ ] Erro 3: Sem credenciais
- [ ] Verificar CONVERSAS sheet
- [ ] Verificar PEDIDOS_E_VENDAS sheet
- [ ] Verificar CLIENTES sheet
- [ ] Testar com 3+ clientes simultâneos
- [ ] Testar com mensagens fora de ordem
- [ ] Testar timeout (conversa ativa > 24h)

---

## Notas

- Sistema de contexto persiste entre mensagens
- Conversas expiram automaticamente após confirmação/cancelamento
- Contexto armazenado em JSON permite extensão futura
- Detecção de tipo de mensagem é baseada em regex + padrões

---

## Próximas Melhorias (Phase 3)

- Análise de padrões de compra
- Recomendações automáticas baseadas em histórico
- Relatórios diários automáticos
- Dashboard web opcional
