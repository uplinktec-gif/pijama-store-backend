# Portal do Cliente - Guia de Testes

## 🚀 Setup Inicial

### 1. Verificar Ambiente

```bash
# Navegar até o diretório do projeto
cd C:\Users\Felipe\pijama-store-backend

# Instalar dependências (se não fizer ainda)
npm install

# Verificar se o servidor está rodando
npm run dev
```

**Esperado**: Servidor rodando em `http://localhost:3000`

---

## 📋 Preparar Dados de Teste no Google Sheets

### Adicionar CPF na aba CLIENTES

Atualmente, o portal procura pelo CPF no campo **EMAIL**. Para testar:

1. Abrir Google Sheets: https://docs.google.com/spreadsheets/d/{GOOGLE_SHEETS_ID}
2. Ir para aba **CLIENTES**
3. Encontrar um cliente existente (ex: Maria da Silva)
4. Na coluna **D (EMAIL)**, adicionar um CPF (ex: `12345678901`)
5. Salvar a planilha

**Exemplo de cliente de teste:**
```
ID_CLIENTE: uuid-123
NOME: Maria da Silva
WHATSAPP: 5595988123456
EMAIL: 12345678901  ← CPF aqui temporariamente
ENDERECO: Rua das Flores, 123
BAIRRO: Centro
CIDADE: Boa Vista
...
TOTAL_GASTO: 500.00
QUANTIDADE_PEDIDOS: 3
MODELO_FAVORITO: ZARA
```

### Adicionar PEDIDOS de Teste

Garantir que a aba **PEDIDOS_E_VENDAS** tem pedidos para o cliente:

**Exemplo:**
```
NUMERO_PEDIDO: 1
DATA_PEDIDO: 2026-05-15T10:00:00Z
CLIENTE_NOME: Maria da Silva
CLIENTE_WHATSAPP: 5595988123456
DESCRICAO_PEDIDO: 2x ZARA M preto, 1x MIA P azul
QUANTIDADE_TOTAL: 3
VALOR_TOTAL: 349.70
TIPO_ENTREGA: ENTREGA
ENDERECO_ENTREGA: Rua das Flores, 123
STATUS_PAGAMENTO: PAGO
FORMA_PAGAMENTO: PIX
STATUS_ENTREGA: ENTREGUE
ITENS_JSON: [{"modelo":"ZARA","tamanho":"M","cor":"preto","quantidade":2},{"modelo":"MIA","tamanho":"P","cor":"azul","quantidade":1}]
DATA_PAGAMENTO: 2026-05-15T11:00:00Z
DATA_ENTREGA: 2026-05-18T14:00:00Z
OBSERVACOES: Entrega sem problemas
```

---

## 🧪 Testar Endpoints Backend

### 1. Autenticar Cliente (POST)

```bash
curl -X POST http://localhost:3000/api/cliente/autenticar \
  -H "Content-Type: application/json" \
  -d '{"cpf":"12345678901"}'
```

**Resposta esperada:**
```json
{
  "sucesso": true,
  "nome": "Maria da Silva",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "id_cliente": "uuid-123",
  "pedidos_count": 1,
  "ultimos_dois_cpf": "01"
}
```

**Erros possíveis:**
- 400: CPF inválido ou não fornecido
- 404: Cliente não encontrado
- 500: Erro no servidor (verificar logs)

---

### 2. Obter Pedidos (GET)

```bash
# Substituir {TOKEN} pelo token da resposta anterior
curl -X GET http://localhost:3000/api/cliente/uuid-123/pedidos \
  -H "Authorization: Bearer {TOKEN}"
```

**Resposta esperada:**
```json
{
  "sucesso": true,
  "pedidos": [
    {
      "numero": 1,
      "data": "2026-05-15T10:00:00Z",
      "itens": [
        {"modelo":"ZARA","tamanho":"M","cor":"preto","quantidade":2}
      ],
      "valor_total": 259.80,
      "status_pagamento": "PAGO",
      "status_entrega": "ENTREGUE",
      "data_entrega": "2026-05-18T14:00:00Z",
      "tipo_entrega": "ENTREGA",
      "endereco_entrega": "Rua das Flores, 123"
    }
  ]
}
```

**Verificar:**
- ✅ Itens formatados corretamente
- ✅ Valores monetários como float
- ✅ Datas em ISO 8601

---

### 3. Obter Perfil (GET)

```bash
curl -X GET http://localhost:3000/api/cliente/uuid-123/perfil \
  -H "Authorization: Bearer {TOKEN}"
```

**Resposta esperada:**
```json
{
  "sucesso": true,
  "perfil": {
    "nome": "Maria da Silva",
    "whatsapp": "5595988123456",
    "email": "maria@email.com",
    "endereco": "Rua das Flores, 123",
    "bairro": "Centro",
    "cidade": "Boa Vista",
    "total_gasto": 500.00,
    "quantidade_pedidos": 3,
    "modelo_favorito": "ZARA",
    "data_primeiro_pedido": "2026-03-01T10:00:00Z",
    "data_ultimo_pedido": "2026-05-18T14:00:00Z"
  }
}
```

---

### 4. Obter Recomendações (GET)

```bash
curl -X GET http://localhost:3000/api/cliente/uuid-123/recomendacoes \
  -H "Authorization: Bearer {TOKEN}"
```

**Resposta esperada:**
```json
{
  "sucesso": true,
  "recomendacoes": [
    {
      "modelo": "BEATRIZ",
      "cor": "preto",
      "tamanho": "M",
      "motivo": "Similar ao seu favorito ZARA",
      "preco": 89.90
    },
    {
      "modelo": "LIA",
      "cor": "bordô",
      "tamanho": "G",
      "motivo": "Modelo popular com clientes que gostam de ZARA",
      "preco": 129.90
    }
  ]
}
```

**Verificar:**
- ✅ 3 recomendações retornadas
- ✅ Modelos não são os que o cliente já comprou
- ✅ Preços estão corretos
- ✅ Motivos em português

---

### 5. Enviar Mensagem "Fale Conosco" (POST)

```bash
curl -X POST http://localhost:3000/api/cliente/uuid-123/contato \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mensagem":"Quero trocar o tamanho do pedido #1"}'
```

**Resposta esperada:**
```json
{
  "sucesso": true,
  "mensagem_id": "uuid-msg-456",
  "resposta": "Sua mensagem foi enviada para Pluma! Responderemos em breve."
}
```

**Verificar:**
- ✅ Mensagem salva em sheet SUPORTE
- ✅ Status inicial é "ABERTO"
- ✅ Mensagem_id é um UUID único

---

## 🌐 Testar Frontend no Navegador

### 1. Acessar Portal

1. Abrir navegador: `http://localhost:3000/portal`
2. Você deve ver **Tela de Login** com:
   - Campo "CPF"
   - Botão "Acessar Portal"
   - Mensagem: "Digite seu CPF para acessar seu histórico de pedidos"

### 2. Fazer Login

1. Digitar CPF de teste: `123.456.789-01`
   - Campo deve aceitar e formatar automaticamente
2. Clicar "Acessar Portal"
3. Você deve ver **Confirmação de Identidade** com:
   - "Olá, Maria da Silva!"
   - Últimos 2 dígitos do CPF: `01`
   - Botões "Sim, é meu CPF" e "Cancelar"

### 3. Confirmar Identidade

1. Clicar "Sim, é meu CPF"
2. Dashboard deve carregar com:

**Dashboard - Parte 1: Header**
```
Olá, Maria!
┌─────────────────────────┐
│ Pedidos: 3              │
│ Total Gasto: R$ 500,00  │
│ Modelo Favorito: ZARA   │
│ Última Compra: 18/05... │
└─────────────────────────┘
```

**Dashboard - Parte 2: Pedidos**
```
📦 Seus Pedidos

[Pedido #1 - PAGO, ENTREGUE]
2x ZARA M preto, 1x MIA P azul
R$ 349,70
15/05/2026
[Ver Detalhes]
```

**Dashboard - Parte 3: Recomendações**
```
✨ Recomendados para Você

[BEATRIZ - preto - M]
R$ 89,90
"Similar ao seu favorito ZARA"
[Compartilhar Modelo]

[LIA - bordô - G]
R$ 129,90
"Modelo popular..."
[Compartilhar Modelo]
```

**Dashboard - Parte 4: Fale Conosco**
```
💬 Fale Conosco
[Text area para mensagem]
[Enviar Mensagem]
```

**Navegação:**
```
Portal do Cliente - Pluma Pijamas
[👤 Meu Perfil] [🚪 Sair]
```

---

### 4. Testar "Ver Detalhes" de Pedido

1. Clicar em "Ver Detalhes" em um pedido
2. Modal deve abrir com:
   - Número do pedido
   - Data
   - Status pagamento (✅ PAGO)
   - Status entrega (✅ ENTREGUE)
   - Itens completos
   - Valor total
   - Tipo de entrega
   - Endereço de entrega
   - Data de entrega

---

### 5. Testar "Meu Perfil"

1. Clicar em "👤 Meu Perfil"
2. Modal deve abrir com:
   - Nome
   - WhatsApp (formatado)
   - Email
   - Endereço
   - Total de pedidos
   - Total gasto
   - Modelo favorito
   - Primeira compra (data)
   - Última compra (data)

---

### 6. Testar "Fale Conosco"

1. Rolar até a seção "Fale Conosco"
2. Clicar no textarea
3. Digitar: `Quero mudar a cor do pedido #1`
4. Clicar "Enviar Mensagem"
5. Você deve ver:
   - Botão desabilitado com "Enviando..."
   - Após 2-3 segundos: "✅ Mensagem enviada com sucesso!"
   - Textarea limpo
   - Mensagem desaparece após 5 segundos

**Verificar:**
- ✅ Mensagem foi salva em sheet SUPORTE
- ✅ Status é "ABERTO"
- ✅ Cliente e timestamp foram registrados

---

### 7. Testar "Sair"

1. Clicar "🚪 Sair"
2. Você deve retornar para **Tela de Login**
3. Tentar acessar `/portal` novamente deve voltar ao login (não ao dashboard)

---

## 📱 Testar Responsividade Mobile

### 1. Redimensionar Navegador

Chrome DevTools:
1. Pressionar `F12`
2. Clicar ícone "Toggle device toolbar" ou `Ctrl+Shift+M`
3. Selecionar "iPhone 12" ou "Pixel 5"

### 2. Verificar Layouts

**Mobile (< 768px):**
- ✅ Login container com padding reduzido
- ✅ Dashboard header com fonte menor
- ✅ Estatísticas em 2 colunas (não 4)
- ✅ Pedidos ocupam 100% da largura
- ✅ Botões de navegação em coluna
- ✅ Modal responsivo

**Tablet (768px - 1024px):**
- ✅ Layout intermediário

**Desktop (> 1024px):**
- ✅ Layout completo com espaçamento

---

## 🔐 Testar Segurança

### 1. Tentar Acessar Sem Token

```bash
curl http://localhost:3000/api/cliente/uuid-123/pedidos
```

**Esperado**: Erro 401 "Não autenticado"

---

### 2. Tentar Acessar Outro Cliente

1. Fazer login como Maria
2. Obter token de Maria
3. Tentar: `GET /api/cliente/uuid-outro-cliente/pedidos`

**Esperado**: Erro 403 "Não tem permissão"

---

### 3. Testar SessionStorage

1. Abrir Portal e fazer login
2. Abrir DevTools (`F12`)
3. Ir para "Application" → "Session Storage"
4. Verificar:
   - `portalToken` = JWT token
   - `clienteId` = uuid do cliente
   - `clienteNome` = nome do cliente

---

### 4. Fechar Aba e Reabrir

1. Fazer login no portal
2. Fechar a aba do portal (não o navegador todo)
3. Abrir nova aba
4. Acessar `http://localhost:3000/portal`

**Esperado**: Login vazio (sessionStorage foi limpo)

---

## 📊 Testar Formatações

### CPF
- Input: `12345678901`
- Display: `123.456.789-01` ✅

### WhatsApp
- Input: `5595988123456`
- Display: `(55) 95988-123456` ✅

### Data
- Input: `2026-05-15T10:00:00Z`
- Display: `15/05/2026` ✅

### Moeda
- Input: `259.80`
- Display: `R$ 259,80` ✅

---

## 🚀 Checklist Final

- [ ] Login com CPF funciona
- [ ] Dashboard carrega com dados corretos
- [ ] Pedidos aparecem formatados
- [ ] Recomendações são geradas
- [ ] "Ver Detalhes" mostra modal
- [ ] "Meu Perfil" mostra dados
- [ ] "Fale Conosco" salva mensagem
- [ ] "Sair" limpa token e volta ao login
- [ ] Mobile é responsivo
- [ ] Toque de token é seguro
- [ ] Formatações estão corretas
- [ ] Sem erros no console (F12)

---

## 🐛 Troubleshooting

### Erro: "Cliente não encontrado"

**Causa**: CPF não existe no email da aba CLIENTES

**Solução**:
1. Verificar Google Sheets
2. Encontrar cliente teste
3. Adicionar CPF no campo EMAIL (coluna D)
4. Exemplo: `12345678901`

---

### Erro: "Erro ao conectar"

**Causa**: Google Sheets não está respondendo

**Solução**:
1. Verificar variáveis .env
2. `GOOGLE_SHEETS_ID` está correto?
3. `GOOGLE_SHEETS_CREDENTIALS_PATH` está correto?
4. Arquivo `service-account.json` existe?
5. Reiniciar servidor: `npm run dev`

---

### Dashboard não carrega

**Causa**: Token inválido ou expirado

**Solução**:
1. Limpar sessionStorage: `sessionStorage.clear()`
2. Fazer novo login
3. Verificar logs do servidor

---

### Recomendações vazias

**Causa**: API de IA (Gemini/Claude) não retornou resposta

**Solução**:
1. Verificar `GEMINI_API_KEY` no .env
2. Verificar logs: `npm run dev`
3. Gemini Free Tier pode ter limite de requisições

---

## 📝 Próximos Passos

Após todos os testes passarem:

1. ✅ Fazer backup do Google Sheets
2. ✅ Fazer deploy no VPS: `bash deploy.sh`
3. ✅ Testar em produção: `https://seu-dominio.com/portal`
4. ✅ Adicionar CPF a todos os clientes no Google Sheets
5. ✅ Divulgar link do portal para clientes
