# Pijama Store Backend - Documentação Completa

Sistema inteligente de gestão de vendas e estoque para loja de pijamas, com interface via WhatsApp e análises automáticas.

## 🚀 Características

- **Interface WhatsApp**: Criar pedidos, confirmar pagamentos, consultar status em linguagem natural
- **IA/NLP**: Interpretação automática de mensagens usando Claude API
- **Google Sheets**: Database com ESTOQUE, PEDIDOS_E_VENDAS, CLIENTES
- **Análises Automáticas**: Relatórios diários, alertas de estoque baixo, recomendações personalizadas
- **Backup Automático**: Exportação JSON diária às 02:00 com retenção de 30 dias
- **Logging Rotacionado**: Arquivos de log rotacionados por dia com retenção automática
- **Testes**: Suite completa com Jest (70%+ cobertura)
- **Multi-Usuário**: Roles e permissões para ADMIN, OPERADOR, CLIENTE

## 📋 Requisitos

- Node.js 18+
- Google Sheets (credenciais de serviço)
- WhatsApp Business API (número autorizado)
- Anthropic API Key (Claude)

## ⚙️ Instalação

### 1. Clone e instale dependências
```bash
git clone <repo>
cd pijama-store-backend
npm install
```

### 2. Configure variáveis de ambiente
```bash
cp .env.example .env
# Editar .env com credenciais reais
```

### 3. Rodando localmente
```bash
npm run dev
```

Servidor rodará em `http://localhost:3000`

### 4. Rodando em produção
```bash
npm start
```

## 📊 Estrutura de Dados

### Google Sheets - Aba: ESTOQUE
```
A: ID_PRODUTO (ZARA_P_AZUL)
B: MODELO (ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE)
C: TAMANHO (P, M, G, GG)
D: COR (azul marinho, preto, bordô, cinza, marrom)
E: PREÇO_UNITÁRIO
F: QUANTIDADE_TOTAL
G: QUANTIDADE_RESERVADA (pedidos não pagos)
H: QUANTIDADE_DISPONÍVEL (F - G)
I: DATA_ATUALIZAÇÃO
J: OBSERVACOES
K: STATUS (ativo/inativo)
```

### Google Sheets - Aba: PEDIDOS_E_VENDAS
```
A: NUMERO_PEDIDO
B: DATA_PEDIDO
C: CLIENTE_NOME
D: CLIENTE_WHATSAPP
E: DESCRICAO_PEDIDO
F: QUANTIDADE_TOTAL
G: VALOR_TOTAL
H: TIPO_ENTREGA (RETIRADA/ENTREGA)
I: ENDERECO_ENTREGA
J: STATUS_PAGAMENTO (PEDIDO/PAGO)
K: FORMA_PAGAMENTO (PIX/CARTÃO/DINHEIRO/PENDENTE)
L: STATUS_ENTREGA (PENDENTE/ENTREGUE/RETIRADA_NA_LOJA)
M: ITENS_JSON (JSON)
N: DATA_PAGAMENTO
O: DATA_ENTREGA
P: OBSERVACOES
```

### Google Sheets - Aba: CLIENTES
```
A: ID_CLIENTE
B: NOME
C: WHATSAPP
D: EMAIL
E: ENDERECO
F: BAIRRO
G: CIDADE
H: TELEFONE_ALTERNATIVO
I: DATA_PRIMEIRO_PEDIDO
J: TOTAL_GASTO
K: QUANTIDADE_PEDIDOS
L: MODELO_FAVORITO
M: DATA_ULTIMO_PEDIDO
N: OBSERVACOES
O: ROLE (ADMIN/OPERADOR/CLIENTE)
```

## 🔐 Permissões por Função

### ADMIN (Felipe: +5595988123456)
- ✓ Criar pedidos via WhatsApp
- ✓ Confirmar pagamentos e entregas
- ✓ @análise (vendas últimos 7 dias)
- ✓ @estoque (análise de estoque)
- ✓ @recomendação (recomendação de compra)
- ✓ GET /api/logs (últimas 100 linhas)
- ✓ GET /api/backup/latest (info do backup)
- ✓ Relatório automático às 18:00
- ✓ Alertas de estoque às 10:00
- ✓ Recomendações VIPs às seg 09:00

### OPERADOR (Júlly: +5595987654321)
- ✓ Criar pedidos via WhatsApp
- ✓ Confirmar pagamentos e entregas
- ✓ @análise (vendas)
- ✓ @estoque (análise de estoque)
- ✗ @recomendação (recomendação de compra)
- ✗ Acesso a endpoints de API
- ✓ Resumo diário às 20:00

### CLIENTE (números não registrados)
- ✓ Criar pedidos
- ✓ Consultar status de pedidos pessoais
- ✓ @recomendação (personalizada para este cliente)
- ✗ Ver análises globais
- ✗ Acesso a endpoints de API

## 🛠️ Desenvolvimento

### Scripts Disponíveis
```bash
npm run dev              # Modo desenvolvimento (nodemon)
npm test                 # Rodar testes (todos)
npm run test:watch       # Testes em modo watch
npm run test:coverage    # Testes com cobertura (meta: 70%+)
npm start                # Produção
npm run seed             # Popular estoque inicial
```

### Estrutura de Pastas
```
pijama-store-backend/
├── src/
│   ├── config/
│   │   ├── env.js           # Carregamento de .env
│   │   ├── sheets.js        # Credenciais e cliente Google
│   │   ├── claude.js        # Inicialização Anthropic
│   │   └── users.js         # Roles e permissões
│   ├── services/
│   │   ├── business/
│   │   │   ├── conversas.js    # Fluxo de conversa
│   │   │   ├── pedidos.js      # Lógica de pedidos
│   │   │   ├── estoque.js      # Lógica de estoque
│   │   │   ├── clientes.js     # Lógica de clientes
│   │   │   ├── analytics.js    # Análises e relatórios
│   │   │   └── recomendacoes.js # Recomendações
│   │   ├── sheets/
│   │   │   ├── estoque.js      # CRUD estoque
│   │   │   ├── pedidos.js      # CRUD pedidos
│   │   │   ├── clientes.js     # CRUD clientes
│   │   │   └── conversas.js    # Contexto multi-turno
│   │   ├── whatsapp/
│   │   │   ├── webhook.js      # Receber mensagens
│   │   │   ├── sender.js       # Enviar mensagens
│   │   │   └── parser.js       # Parse de payloads
│   │   ├── nlp/
│   │   │   ├── interpreter.js  # Claude API
│   │   │   ├── validator.js    # Validação Joi
│   │   │   └── formatter.js    # Formatação
│   │   ├── scheduler/
│   │   │   └── jobs.js         # 5 jobs agendados
│   │   └── backup/
│   │       └── backupSheets.js # Backup JSON
│   ├── controllers/
│   ├── routes/
│   ├── utils/
│   │   ├── logger.js           # Winston + rotação diária
│   │   ├── validators.js
│   │   └── formatters.js
│   └── app.js                 # Express config
├── tests/
│   ├── unit/
│   │   ├── validator.test.js
│   │   ├── interpreter.test.js
│   │   └── logger.test.js
│   └── integration/
│       ├── conversas.test.js
│       ├── analytics.test.js
│       └── scheduler.test.js
├── backups/                   # JSON diários (30 dias)
├── logs/                      # Rotacionados por dia
├── docs/
│   ├── README.md             # Esta arquivo
│   ├── SETUP.md              # Configuração
│   ├── API.md                # Endpoints
│   └── TROUBLESHOOTING.md    # Problemas
├── .env.example
├── .gitignore
├── jest.config.js
├── package.json
└── server.js
```

## 📅 Jobs Agendados

| Horário | Descrição | Destinatário | Frequência |
|---------|-----------|--------------|-----------|
| 02:00 | Backup automático Google Sheets → JSON | Sistema | Diariamente |
| 10:00 | Alertas de estoque baixo | Felipe | Diariamente |
| 18:00 | Relatório diário de vendas | Felipe | Diariamente |
| 20:00 | Resumo do dia | Júlly | Diariamente |
| 09:00 seg | Recomendações para VIPs | Clientes | Segundas-feiras |

## 🔍 Logging

Logs são salvos automaticamente com rotação diária:

### Arquivos de Log
- `logs/combined-%DATE%.log` - Todos os logs (INFO, WARN, ERROR, DEBUG)
- `logs/error-%DATE%.log` - Apenas erros (ERROR level)

### Retenção
- Manutenção automática a cada novo log
- Delete automático de arquivos > 30 dias
- Inicializado em `src/utils/logger.js` com winston-daily-rotate-file

### Formato
```
[2026-05-17 18:45:30] INFO: Pedido #123 criado {whatsapp: "+5595988123456", modelo: "ZARA"}
[2026-05-17 18:46:15] ERROR: Estoque insuficiente {produto: "ZARA_G_BORDO", solicitado: 5, disponível: 2}
```

### Variáveis de Ambiente
```env
LOG_LEVEL=debug|info|warn|error  # Padrão: info
```

## 🧪 Testes

### Rodando Testes
```bash
npm test                 # Todos os testes (simples)
npm run test:watch      # Modo watch (desenvolvimento)
npm run test:coverage   # Com relatório de cobertura
```

### Cobertura Esperada
- **Global**: 70%+ linhas, 60%+ funções
- **Services**: 75%+ linhas, 70%+ funções
- **Reportado em**: stdout + `coverage/` (HTML)

### Arquivos de Teste
```
tests/
├── unit/
│   ├── validator.test.js       # 13 testes - Validação Joi
│   ├── interpreter.test.js     # 7 testes - Parsing Claude
│   └── logger.test.js          # 7 testes - Logging
└── integration/
    ├── conversas.test.js       # 15 testes - Fluxo multi-turno
    ├── analytics.test.js       # 18 testes - Cálculos
    └── scheduler.test.js       # 18 testes - Jobs agendados
```

### Executar Teste Específico
```bash
npm test -- validator.test.js
npm test -- conversas.test.js
```

## 🔄 Backup Automático

### Sistema de Backup
- **Quando**: Diariamente às 02:00
- **O quê**: Todas as 4 abas do Google Sheets (ESTOQUE, PEDIDOS_E_VENDAS, CLIENTES, CONVERSAS)
- **Onde**: `backups/pijama-store-2026-05-17-18-45.json`
- **Retenção**: Últimos 30 dias (auto-delete de antigos)

### Formato JSON
```json
{
  "data_backup": "2026-05-17T02:00:00.000Z",
  "spreadsheet_id": "...",
  "abas": {
    "ESTOQUE": {
      "headers": [...],
      "rows": [...],
      "total_linhas": 140
    },
    ...
  }
}
```

### Endpoints de Backup (Admin only)
```
GET /api/backup/latest
Response:
{
  "arquivo": "pijama-store-2026-05-17-02-00.json",
  "tamanho_kb": 45.32,
  "data_criacao": "2026-05-17T02:00:00.000Z"
}
```

## 📡 Fluxos de Usuário

### Fluxo 1: Criar Pedido
```
Cliente: "2 zara g bordô 150 pra joão"
System: Interpreta com Claude
         Valida estoque
         Gera NUMERO_PEDIDO
         Reserva itens
         Salva em PEDIDOS_E_VENDAS
Bot: "Perfeito, João! Seu pedido #123:
      2x ZARA G bordô (R$ 259,80)
      Total: R$ 259,80
      Retirada na loja ou entrega?"
```

### Fluxo 2: Confirmar Pagamento
```
Cliente: "peguei o pix da #123"
Bot: Detecta CONFIRMAR_PAGAMENTO
     Localiza pedido #123
     Atualiza STATUS_PAGAMENTO = "PAGO"
     Salva forma de pagamento
Bot: "Obrigado! Pagamento confirmado ✓
      Pedido #123 - Entrega: segunda-feira"
```

### Fluxo 3: Análise de Vendas (Admin)
```
Felipe: "@análise"
Bot: Calcula últimos 7 dias
     📊 ANÁLISE DE VENDAS (7 DIAS)
     💰 TOTAL: R$ 2.850,00
     📋 PEDIDOS: 12
     🎯 TICKET: R$ 237,50
     🔥 MAIS VENDIDOS:
        1. ZARA: 8 un
        2. MIA: 3 un
```

## 🚨 Troubleshooting

Ver [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para problemas comuns.

## 📝 Licença

MIT - Felipe & Júlly

## 🤝 Suporte

Dúvidas? Entre em contato via WhatsApp: +5595988123456
