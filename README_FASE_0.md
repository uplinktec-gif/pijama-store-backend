# 🎯 FASE 0 — Autenticação JWT Admin Panel

## 📖 Visão Geral

FASE 0 é a **primeira etapa** de implementação da automação Pluma. Consiste em criar um painel admin robusto com autenticação JWT, permitindo que Felipe, Júlly e Pluma gerenciem o estoque, pedidos, clientes e leads de forma segura.

**Status:** ✅ **100% COMPLETO E FUNCIONANDO**

---

## 🚀 Como Usar o Painel Admin

### 1. **Acessar o Painel**
```
http://localhost:7000/admin
```

### 2. **Fazer Login**
Use uma das 4 contas admin criadas:

| Usuário | Senha | Nome |
|---------|-------|------|
| `admin` | `admin` | Admin |
| `felipe` | `pijama2025` | Felipe |
| `jully` | `jully2025` | Júlly |
| `pluma` | `pluma2025` | Pluma |

### 3. **Operações Disponíveis**

#### Dashboard
- Vendas de hoje, semana, mês
- Gráfico de 7 dias
- Pedidos pendentes
- Estoque crítico
- Leads novos

#### Estoque
- Ver todos os itens (26 modelos/cores)
- Editar quantidade total
- Editar preço unitário
- Filtrar por status

#### Pedidos
- Listar pedidos com filtros
- Marcar como pago
- Marcar como entregue
- Ver detalhes completos

#### Clientes
- Ver histórico de compras
- Detalhes de cada cliente
- Total gasto
- Modelo favorito

#### Leads
- Lista de leads com status
- Atualizar status
- Análise de conversão

#### Suporte
- Mensagens abertas
- Responder à clientes
- Status de ticket

---

## 🔐 Segurança

### Autenticação JWT
- **Token:** Válido por 8 horas
- **Secret:** Configurável via `.env` (JWT_SECRET)
- **Hash:** bcryptjs com 10 rounds
- **Storage:** localStorage no navegador

### Bearer Token
Ao fazer requisições à API, enviar:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:7000/admin/api/estoque
```

### Proteção de Rotas
Todas as rotas do admin (exceto `/admin/api/auth/login`) requerem token válido.

---

## 🏗️ Arquitetura Técnica

### Stack
- **Backend:** Express.js (Node.js)
- **Database:** SQLite (sql.js) com persistência em arquivo
- **Auth:** JWT + bcryptjs
- **Frontend:** HTML/CSS/JavaScript vanilla
- **Porta:** 7000

### Estrutura de Arquivos
```
pijama-store-backend/
├── src/
│   ├── config/
│   │   ├── database.js           (SQLite com 8 tabelas)
│   │   ├── sheets.js             (Google OAuth)
│   │   └── ...
│   ├── middleware/
│   │   └── authAdmin.js          (JWT validation)
│   ├── controllers/
│   │   └── admin.controller.js   (Endpoints)
│   ├── routes/
│   │   └── admin.routes.js       (Rotas protegidas)
│   └── services/sqlite/          (Camada de dados)
│       ├── estoque.js
│       ├── pedidos.js
│       ├── clientes.js
│       ├── leads.js
│       ├── conversas.js
│       ├── fotos.js
│       └── suporte.js
├── public/admin/                 (Frontend)
│   ├── index.html
│   ├── admin.css
│   └── admin.js
├── data/
│   └── pijama-store.db          (SQLite file)
├── scripts/
│   └── init-admin-user.js       (Setup inicial)
├── .env                          (Configuração)
└── server.js                     (Entry point)
```

### Banco de Dados (SQLite)
8 tabelas principais:
1. **estoque** — Produtos (26 itens)
2. **pedidos** — Vendas realizadas
3. **clientes** — Cadastro de compradores
4. **leads** — Potenciais clientes
5. **conversas** — Contexto de chat WhatsApp
6. **fotos** — Assets de produtos
7. **suporte** — Tickets de atendimento
8. **admin_usuarios** — Credenciais admin

13 índices para performance otimizada.

---

## 📊 Endpoints API Admin

### Autenticação
```
POST /admin/api/auth/login
Body: { username, password }
Response: { success, token, usuario, nome, role }
```

### Dashboard
```
GET /admin/api/stats (Bearer token)
Response: { vendas, pedidos_pendentes, estoque_critico, grafico_7dias, ... }
```

### Estoque
```
GET    /admin/api/estoque
POST   /admin/api/estoque
PATCH  /admin/api/estoque/:sku/quantidade
PATCH  /admin/api/estoque/:sku/preco
```

### Pedidos
```
GET    /admin/api/pedidos
GET    /admin/api/pedidos/:numero
PATCH  /admin/api/pedidos/:numero/pagamento
PATCH  /admin/api/pedidos/:numero/entrega
PATCH  /admin/api/pedidos/:numero/endereco
```

### Clientes
```
GET    /admin/api/clientes
GET    /admin/api/clientes/:id
PATCH  /admin/api/clientes/:id
```

### Leads
```
GET    /admin/api/leads
PATCH  /admin/api/leads/:id/status
```

### Suporte
```
GET    /admin/api/suporte
PATCH  /admin/api/suporte/:id/responder
```

---

## ⚙️ Configuração de Ambiente

### `.env` — Variáveis Críticas
```env
# JWT Authentication (FASE 0)
JWT_SECRET=pluma-pijamas-jwt-2025-secreto
JWT_EXPIRES_IN=8h
PORT=7000

# Database
DB_PATH=./data/pijama-store.db

# APIs Externas
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
EVOLUTION_API_URL=http://177.7.47.211:32775
EVOLUTION_API_KEY=...

# Admin Accounts
ADMIN_SENHA_FELIPE=pijama2025
ADMIN_SENHA_JULLY=jully2025
ADMIN_SENHA_PLUMA=pluma2025

# Portal do Cliente
CLIENTE_SESSION_SECRET=...
```

---

## 🔧 Operações Comuns

### Reiniciar Servidor
```bash
npm start
```

### Adicionar Novo Admin
```bash
# 1. Editar init-admin-user.js
# 2. Rodar script
node scripts/init-admin-user.js
```

### Resetar Banco
```bash
rm data/pijama-store.db
npm start  # Recria schema vazio
```

### Testar Endpoint
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:7000/admin/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | jq -r .token)

# Usar token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:7000/admin/api/stats
```

---

## 🧪 Testes Implementados

### Fluxos Validados
- ✅ Login com credenciais válidas
- ✅ Login com senha incorreta (401)
- ✅ Acesso sem token (401)
- ✅ Acesso com token válido (200)
- ✅ Acesso com token expirado (401)
- ✅ Todos os 4 usuários conseguem fazer login
- ✅ Compatibilidade com ambos formatos (`username,password` e `usuario,senha`)
- ✅ Dashboard retorna dados reais
- ✅ Endpoints de estoque/pedidos/clientes funcionam

---

## 📈 Próximos Passos (FASES 1-8)

Conforme plano `kind-twirling-noodle.md`:

### FASE 1 — Limpeza de Código Legado (2-3h)
- Remover Google Sheets API de todas as routes
- Mover dados de Sheets para SQLite
- Deletar arquivos em `src/services/sheets/`

### FASE 2 — Camada SQLite Completa (2h)
- Validar 7 serviços sqlite já criados
- Adicionar validações e tratamento de erros

### FASE 3 — Imports Atualizados (30 min)
- Trocar `sheets/` por `sqlite/` em business services
- Remover código legado

### FASE 4 — Bot Otimizado (1.5h)
- Implementar fast-path rules (regex pré-compilados)
- Retry logic com exponential backoff
- Reduzir chamadas ao Claude

### FASE 5 — Admin API Completa (1.5h)
- Implementar todos os endpoints de CRUD
- Validações e tratamento de erros

### FASE 6 — Painel Admin UI (2h)
- Dashboard com gráficos reais
- Tabelas editáveis
- Filtros e paginação

### FASE 7 — Deploy VPS (1h)
- Transfer para VPS (177.7.47.211)
- PM2 auto-restart
- HTTPS com SSL

### FASE 8 — Testes e Validação (1h)
- Suite de testes unitários
- Testes de integração
- Validação de segurança

**Tempo Total Estimado:** ~12h

---

## 🆘 Troubleshooting

### Erro: "Token não fornecido"
- Verificar se está enviando `Authorization: Bearer <token>` no header

### Erro: "Credenciais inválidas"
- Verificar username/password na tabela `admin_usuarios`
- Executar `node scripts/init-admin-user.js` para resetar

### Erro: "Token expirado"
- Fazer novo login para obter token novo

### Servidor não inicia na porta 7000
- Verificar se não há outro processo usando a porta
- Trocar PORT em `.env`

### Admin panel não carrega
- Verificar se servidor está rodando (`npm start`)
- Verificar console do browser para erros JS
- Limpar cache do browser (Ctrl+Shift+Delete)

---

## 📞 Contato & Suporte

- **Desenvolvedor:** Claude + Felipe
- **Repository:** `pijama-store-backend`
- **VPS:** `177.7.47.211` (root user)
- **Última Atualização:** 2026-05-24

---

**FASE 0 está pronto para uso.** Próxima fase será a limpeza de código legado e otimização do bot WhatsApp.

