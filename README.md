# Pijama Store — Sistema de Gestão de Vendas

Sistema inteligente de gestão de vendas, estoque e análises para a loja de pijamas (Felipe & Júlly).

## Visão Geral

- **Interface**: WhatsApp (linguagem natural)
- **Banco de dados**: Google Sheets
- **IA**: Claude API (Anthropic)
- **Backend**: Node.js + Express

## Arquitetura

```
WhatsApp → Node.js → Claude API → Google Sheets
```

## Configuração Inicial

### 1. Clonar/Baixar projeto
```bash
cd C:\Users\Felipe\pijama-store-backend
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
# Copiar .env.example para .env
cp .env.example .env

# Editar .env com suas credenciais
# - GOOGLE_SHEETS_ID
# - WHATSAPP tokens
# - ANTHROPIC_API_KEY
```

### 4. Credenciais Google Sheets
Coloque o arquivo `service-account.json` na raiz do projeto.

### 5. Rodar servidor
```bash
npm run dev
```

Você verá:
```
✓ Servidor rodando em http://localhost:3000
```

## Endpoints

### Health Check
```
GET /health
```

### Test (desenvolvimento)
```
GET /api/test
```

### WhatsApp Webhook
```
POST /api/webhook/whatsapp
GET /api/webhook/whatsapp (verificação)
```

### API de Estoque
```
GET /api/estoque                        (listar todo estoque)
GET /api/estoque/baixo?limite=5         (itens com estoque baixo)
GET /api/estoque/modelo/:modelo         (itens de um modelo)
GET /api/estoque/relatorio              (relatório de estoque)
```

### API de Clientes
```
GET /api/clientes/:whatsapp             (perfil do cliente)
GET /api/clientes/vips                  (clientes VIP)
GET /api/clientes/inativos?dias=30      (clientes inativos)
GET /api/clientes/relatorio             (relatório de clientes)
```

### API de Pedidos
```
GET /api/entregas-pendentes             (pedidos aguardando entrega)
```

## Fases de Desenvolvimento

- **Fase 1** ✅ (MVP): Criar pedidos, validar estoque, gerar número sequencial
- **Fase 2** 🔄 (Multi-turno): Conversa contextual, confirmação de pagamento/entrega
- **Fase 3** ⏳ (Análises): Análises e recomendações automáticas
- **Fase 4** ⏳ (Produção): Otimizações e hardening

## Fluxo Multi-Turno (Fase 2)

O sistema agora suporta conversas com contexto:

1. **Nova Conversa**: "2 zara g bordô 150 pra joão"
   - Sistema interpreta e cria contexto
   - Responde com confirmação

2. **Confirmar Tipo de Entrega**: "entrega"
   - Sistema lembra o pedido anterior
   - Pede endereço se entrega

3. **Confirmar Pagamento**: "paguei no pix"
   - Sistema localiza pedido
   - Marca como pago

4. **Consultar Status**: "qual meu pedido?"
   - Sistema retorna status com contexto

Conversas são armazenadas em `CONVERSAS` sheet para persistência.

## Estrutura de Pastas

```
src/
├── config/        # Configurações (env, sheets, claude)
├── services/      # Lógica de negócio
│   ├── sheets/    # Google Sheets API (estoque, pedidos, clientes, conversas)
│   ├── whatsapp/  # WhatsApp API (webhook, sender)
│   ├── nlp/       # Claude NLP (interpreter, validator)
│   └── business/  # Lógica de negócio (pedidos, estoque, clientes, conversas)
├── controllers/   # Controllers HTTP (webhook, api)
├── routes/        # Rotas (api)
├── models/        # Validação schema (Joi)
├── utils/         # Utilidades (logger)
└── app.js         # App Express
```

## Catálogo

### Modelos
ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE

### Tamanhos
P, M, G, GG

### Cores
azul marinho, preto, bordô, cinza, marrom

### Preços (por modelo)
- ZARA: R$ 129,90
- MIA: R$ 89,90
- LIA: R$ 129,90
- NÚBIA: R$ 169,90
- LÍVIA: R$ 129,90
- BEATRIZ: R$ 89,90
- ANNE: R$ 159,90

## Desenvolvimento

### Rodar em modo desenvolvimento
```bash
npm run dev
```

### Rodar testes
```bash
npm test
```

### Popular estoque inicial (script)
```bash
npm run seed
```

Este script gera e insere dados iniciais na planilha ESTOQUE:
- 140 SKUs (7 modelos × 4 tamanhos × 5 cores)
- Quantidade aleatória entre 10-50 peças por SKU
- Preços corretos por modelo
- Pronto para testar o sistema

**Pré-requisitos:**
- Google Sheets deve estar configurada (abas criadas)
- `service-account.json` deve estar na raiz do projeto
- `GOOGLE_SHEETS_ID` deve estar no `.env`

## Logs

Os logs são salvos em:
- `logs/combined.log` (todos os eventos)
- `logs/error.log` (apenas erros)

## Troubleshooting

### Porta 3000 já em uso
```bash
# Trocar porta
PORT=3001 npm run dev
```

### Variáveis de ambiente não carregadas
```bash
# Verificar se .env existe na raiz
# Verificar se .env contém as variáveis corretas
```

### Erro ao conectar Google Sheets
```bash
# Verificar service-account.json
# Verificar GOOGLE_SHEETS_ID
# Verificar permissões na conta de serviço
```

## Documentação Completa

Ver arquivo de plano: `C:\Users\Felipe\.claude\plans\kind-twirling-noodle.md`

## Status

- [x] Estrutura do projeto
- [x] Configurações iniciais
- [ ] Fase 1: MVP (pedidos básicos)
- [ ] Fase 2: Fluxo completo
- [ ] Fase 3: Análises
- [ ] Fase 4: Produção

---

**Desenvolvido com ❤️ por Felipe & Júlly**
