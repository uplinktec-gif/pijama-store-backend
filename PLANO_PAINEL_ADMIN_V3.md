# 📊 PAINEL ADMINISTRATIVO LOJA PLUMA — PLANO ARQUITETURAL COMPLETO

**Status**: 📋 Planejamento (Aguardando Aprovação)  
**Data**: 2026-05-24  
**Versão**: 3.0 (Rewrite Completo)

---

## 🎯 VISÃO GERAL

Painel administrativo moderno, funcional e integrado para gerenciar:
- **Financeiro** (vendas, despesas, lucros)
- **Estoque** (produtos, quantidades, histórico)
- **Mídia** (fotos de modelos/cores)
- **Pedidos** (gestão completa, status)
- **Clientes & Leads** (unificado, tagueamento)
- **Cupons** (promoções)
- **Dashboard** (analytics em tempo real)
- **Logs** (auditoria completa)
- **Controle de Usuários** (perfis de acesso)
- **Configurações** (gerais do sistema)

---

## 🛠️ STACK TECNOLÓGICO

### Backend
- **Framework**: Express.js (Node.js)
- **Banco de Dados**: PostgreSQL 14+ (local dev + VPS)
- **Autenticação**: JWT (simples, sem 2FA por enquanto)
- **ORM**: node-postgres (pg) + query builder manual
- **Logging**: Winston (já temos configurado)
- **Validação**: Joi ou validação manual

### Frontend
- **HTML5 semântico** (sem frameworks)
- **CSS3** (custom, sem Bootstrap para controle total)
- **JavaScript Vanilla** (modular, sem jQuery)
- **Chart.js** ou **ApexCharts** (gráficos)
- **LocalStorage** (sessão + preferências)

### DevOps
- **VPS**: 177.7.47.211
- **PM2** ou **systemd** (process management)
- **Nginx** (proxy reverso, se necessário)
- **Backup**: script automático PostgreSQL

---

## 📦 ESTRUTURA DE PASTAS DO PROJETO

```
pijama-store-backend/
├── src/
│   ├── config/
│   │   ├── database.js              (pool PostgreSQL)
│   │   ├── env.js                   (variáveis de ambiente)
│   │   └── logger.js                (logging)
│   │
│   ├── middleware/
│   │   ├── adminAuth.js             (JWT validation)
│   │   ├── adminPermissions.js      (role-based access)
│   │   └── errorHandler.js          (global error handling)
│   │
│   ├── controllers/
│   │   ├── admin/
│   │   │   ├── auth.controller.js           (login, editar senha)
│   │   │   ├── dashboard.controller.js      (stats, gráficos)
│   │   │   ├── estoque.controller.js        (CRUD produtos)
│   │   │   ├── pedidos.controller.js        (CRUD pedidos)
│   │   │   ├── clientes.controller.js       (CRUD clientes/leads)
│   │   │   ├── financeiro.controller.js     (vendas, despesas, lucros)
│   │   │   ├── midia.controller.js          (upload/gerenciar fotos)
│   │   │   ├── cupons.controller.js         (CRUD cupons)
│   │   │   ├── logs.controller.js           (auditoria)
│   │   │   ├── usuarios.controller.js       (perfis, permissões)
│   │   │   └── configuracoes.controller.js  (settings)
│   │
│   ├── services/
│   │   ├── admin/
│   │   │   ├── estoque.service.js
│   │   │   ├── pedidos.service.js
│   │   │   ├── clientes.service.js
│   │   │   ├── financeiro.service.js
│   │   │   ├── midia.service.js
│   │   │   ├── cupons.service.js
│   │   │   ├── logs.service.js
│   │   │   └── usuarios.service.js
│   │
│   ├── routes/
│   │   ├── admin.routes.js          (agrupa todas as rotas /admin/api)
│   │
│   ├── utils/
│   │   ├── validators.js            (validações gerais)
│   │   ├── helpers.js               (funções auxiliares)
│   │   └── formatters.js            (formatação de dados)
│   │
│   └── server.js                    (entrada principal)
│
├── public/
│   ├── admin/
│   │   ├── index.html               (SPA única)
│   │   ├── assets/
│   │   │   ├── css/
│   │   │   │   ├── global.css       (estilos globais)
│   │   │   │   ├── dashboard.css
│   │   │   │   ├── estoque.css
│   │   │   │   ├── pedidos.css
│   │   │   │   ├── clientes.css
│   │   │   │   ├── financeiro.css
│   │   │   │   ├── midia.css
│   │   │   │   ├── cupons.css
│   │   │   │   ├── logs.css
│   │   │   │   ├── usuarios.css
│   │   │   │   └── configuracoes.css
│   │   │   │
│   │   │   ├── js/
│   │   │   │   ├── main.js          (inicialização)
│   │   │   │   ├── auth.js          (login, logout, token)
│   │   │   │   ├── api.js           (wrapper para fetch)
│   │   │   │   ├── storage.js       (localStorage manager)
│   │   │   │   ├── ui.js            (componentes reutilizáveis)
│   │   │   │   ├── toast.js         (notificações)
│   │   │   │   ├── modal.js         (modais)
│   │   │   │   │
│   │   │   │   ├── modules/
│   │   │   │   │   ├── dashboard.js
│   │   │   │   │   ├── estoque.js
│   │   │   │   │   ├── pedidos.js
│   │   │   │   │   ├── clientes.js
│   │   │   │   │   ├── financeiro.js
│   │   │   │   │   ├── midia.js
│   │   │   │   │   ├── cupons.js
│   │   │   │   │   ├── logs.js
│   │   │   │   │   ├── usuarios.js
│   │   │   │   │   └── configuracoes.js
│   │   │   │   │
│   │   │   │   └── charts.js        (ApexCharts wrapper)
│   │   │   │
│   │   │   └── img/
│   │   │       ├── logo.png
│   │   │       └── icons/
│   │   │
│   │   └── lib/
│   │       └── apexcharts.min.js    (local, sem CDN)
│
├── scripts/
│   ├── setup-postgres.js            (criar DB, tabelas, seed)
│   ├── backup-postgres.sh           (backup automático)
│   └── migrate-data.js              (migração SQLite → PostgreSQL)
│
├── .env.example
├── .gitignore
├── package.json
└── PLANO_PAINEL_ADMIN_V3.md         (este arquivo)
```

---

## 🗄️ SCHEMA POSTGRESQL

### Tabelas Principais

#### 1. `admin_usuarios` (Autenticação)
```sql
CREATE TABLE admin_usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  role VARCHAR(20) DEFAULT 'operador' -- 'admin', 'vendas', 'estoque', 'operador'
  ativo BOOLEAN DEFAULT true,
  ultimo_acesso TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);
```

#### 2. `admin_logs` (Auditoria)
```sql
CREATE TABLE admin_logs (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES admin_usuarios(id),
  acao VARCHAR(50) NOT NULL, -- 'criar', 'atualizar', 'deletar'
  modulo VARCHAR(50) NOT NULL, -- 'estoque', 'pedidos', 'financeiro'
  tabela VARCHAR(50) NOT NULL,
  registro_id INTEGER,
  valor_anterior JSONB,
  valor_novo JSONB,
  ip_address VARCHAR(45),
  criado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_modulo (modulo),
  INDEX idx_criado_em (criado_em)
);
```

#### 3. `estoque_produtos` (Produtos)
```sql
CREATE TABLE estoque_produtos (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  modelo VARCHAR(50) NOT NULL,
  tamanho VARCHAR(10) NOT NULL,
  cor VARCHAR(50) NOT NULL,
  quantidade_total INTEGER NOT NULL DEFAULT 0,
  quantidade_reservada INTEGER NOT NULL DEFAULT 0,
  quantidade_disponivel INTEGER GENERATED ALWAYS AS (quantidade_total - quantidade_reservada) STORED,
  preco_unitario DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'ATIVO', -- 'ATIVO', 'INATIVO', 'DESCONTINUADO'
  data_atualizacao DATE,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_modelo (modelo),
  INDEX idx_cor (cor),
  INDEX idx_status (status)
);
```

#### 4. `estoque_historico` (Histórico de alterações)
```sql
CREATE TABLE estoque_historico (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES estoque_produtos(id),
  usuario_id INTEGER REFERENCES admin_usuarios(id),
  acao VARCHAR(50), -- 'adicionar', 'remover', 'ajuste'
  quantidade_anterior INTEGER,
  quantidade_nova INTEGER,
  motivo VARCHAR(200),
  criado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_produto_id (produto_id),
  INDEX idx_criado_em (criado_em)
);
```

#### 5. `pedidos` (Pedidos)
```sql
CREATE TABLE pedidos (
  numero_pedido SERIAL PRIMARY KEY,
  cliente_nome VARCHAR(100) NOT NULL,
  cliente_whatsapp VARCHAR(20),
  cliente_id INTEGER REFERENCES clientes(id),
  itens_json JSONB NOT NULL, -- [{modelo, tamanho, cor, quantidade, preco}]
  valor_total DECIMAL(10,2) NOT NULL,
  status_pagamento VARCHAR(20) DEFAULT 'PENDENTE', -- 'PENDENTE', 'PAGO', 'CANCELADO'
  forma_pagamento VARCHAR(20), -- 'PIX', 'CARTÃO', 'DINHEIRO', 'PENDENTE'
  status_entrega VARCHAR(20) DEFAULT 'PENDENTE', -- 'PENDENTE', 'ENVIADO', 'ENTREGUE', 'RETIRADA_NA_LOJA', 'CANCELADO'
  endereco_entrega TEXT,
  observacoes TEXT,
  cupom_aplicado VARCHAR(20),
  desconto_valor DECIMAL(10,2) DEFAULT 0,
  data_pagamento TIMESTAMP,
  data_entrega TIMESTAMP,
  data_pedido TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_cliente_nome (cliente_nome),
  INDEX idx_status_pagamento (status_pagamento),
  INDEX idx_status_entrega (status_entrega),
  INDEX idx_data_pedido (data_pedido)
);
```

#### 6. `clientes` (Clientes)
```sql
CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  whatsapp VARCHAR(20) UNIQUE,
  email VARCHAR(100),
  cpf VARCHAR(20) UNIQUE,
  endereco TEXT,
  cidade VARCHAR(50),
  estado VARCHAR(2),
  cep VARCHAR(10),
  status VARCHAR(20) DEFAULT 'cliente', -- 'lead', 'cliente', 'vip', 'inativo'
  tags VARCHAR(200), -- 'frequente', 'premium', 'potencial', separado por vírgula
  total_gasto DECIMAL(10,2) DEFAULT 0,
  quantidade_pedidos INTEGER DEFAULT 0,
  data_primeiro_pedido TIMESTAMP,
  data_ultimo_pedido TIMESTAMP,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_whatsapp (whatsapp),
  INDEX idx_status (status),
  INDEX idx_data_ultimo_pedido (data_ultimo_pedido)
);
```

#### 7. `financeiro_vendas` (Registro de Vendas)
```sql
CREATE TABLE financeiro_vendas (
  id SERIAL PRIMARY KEY,
  numero_pedido INTEGER REFERENCES pedidos(numero_pedido),
  cliente_id INTEGER REFERENCES clientes(id),
  valor_bruto DECIMAL(10,2) NOT NULL,
  desconto_valor DECIMAL(10,2) DEFAULT 0,
  desconto_percentual DECIMAL(5,2) DEFAULT 0,
  valor_liquido DECIMAL(10,2) NOT NULL,
  data_venda TIMESTAMP DEFAULT NOW(),
  data_recebimento TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'recebido', 'cancelado'
  forma_pagamento VARCHAR(20),
  INDEX idx_data_venda (data_venda),
  INDEX idx_status (status)
);
```

#### 8. `financeiro_despesas` (Despesas)
```sql
CREATE TABLE financeiro_despesas (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(100) NOT NULL,
  categoria VARCHAR(50) NOT NULL, -- 'aluguel', 'fornecedor', 'transporte', 'outros'
  valor DECIMAL(10,2) NOT NULL,
  data_despesa DATE NOT NULL,
  data_pagamento DATE,
  status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'pago', 'cancelado'
  recorrente BOOLEAN DEFAULT false,
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_categoria (categoria),
  INDEX idx_data_despesa (data_despesa)
);
```

#### 9. `midia_produtos` (Fotos de Produtos)
```sql
CREATE TABLE midia_produtos (
  id SERIAL PRIMARY KEY,
  modelo VARCHAR(50) NOT NULL,
  cor VARCHAR(50) NOT NULL,
  url_fotos JSONB NOT NULL, -- ["url1", "url2", "url3"]
  foto_capa VARCHAR(500), -- URL da foto destaque
  tipo_armazenamento VARCHAR(20), -- 'google_drive', 'local', 'url_externa'
  drive_folder_id VARCHAR(100), -- para Google Drive
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(modelo, cor),
  INDEX idx_modelo (modelo)
);
```

#### 10. `promocoes_cupons` (Cupons)
```sql
CREATE TABLE promocoes_cupons (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  descricao VARCHAR(200),
  tipo VARCHAR(20) NOT NULL, -- 'percentual', 'valor_fixo'
  valor_desconto DECIMAL(10,2) NOT NULL,
  limite_uso INTEGER,
  uso_atual INTEGER DEFAULT 0,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW(),
  INDEX idx_codigo (codigo),
  INDEX idx_ativo (ativo)
);
```

#### 11. `configuracoes_sistema` (Configurações)
```sql
CREATE TABLE configuracoes_sistema (
  id SERIAL PRIMARY KEY,
  chave VARCHAR(100) UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  tipo VARCHAR(20), -- 'string', 'number', 'boolean', 'json'
  descricao TEXT,
  atualizado_em TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 ROTAS API (/admin/api)

### Autenticação
```
POST   /auth/login                    {usuario, senha} → {token, nome, role}
POST   /auth/logout                   {}
PATCH  /auth/mudar-senha              {senha_atual, senha_nova}
```

### Dashboard
```
GET    /dashboard/stats               → {vendas_hoje, vendas_semana, vendas_mes, pedidos_pendentes, estoque_critico, ...}
GET    /dashboard/grafico-vendas      ?periodo=7d|30d|90d → [{data, valor}, ...]
GET    /dashboard/top-produtos        ?limite=10 → [{modelo, vendas, receita}, ...]
GET    /dashboard/alertas             → [{tipo, mensagem, severidade}, ...]
```

### Estoque
```
GET    /estoque                       ?modelo=&cor=&status=ATIVO → {items: [...], total}
GET    /estoque/:id                   → {produto}
POST   /estoque                       {modelo, tamanho, cor, preco, qtd} → {id}
PATCH  /estoque/:id/quantidade        {quantidade_total}
PATCH  /estoque/:id/preco             {preco_unitario}
DELETE /estoque/:id                   {} → {success}
GET    /estoque/historico/:id         → [{usuario, acao, quantidade_anterior, quantidade_nova, data}, ...]
POST   /estoque/importar-csv          (multipart/form-data: arquivo)
```

### Pedidos
```
GET    /pedidos                       ?status=&cliente=&data_inicio=&data_fim= → {items: [...], total}
GET    /pedidos/:numero               → {pedido com itens_json parseado}
POST   /pedidos                       {cliente_nome, cliente_whatsapp, itens, endereco, ...} → {numero_pedido}
PATCH  /pedidos/:numero/pagamento     {status, forma_pagamento}
PATCH  /pedidos/:numero/entrega       {status, data_entrega}
PATCH  /pedidos/:numero/endereco      {endereco_entrega}
DELETE /pedidos/:numero               {}
POST   /pedidos/:numero/aplicar-cupom {cupom_codigo}
```

### Clientes & Leads
```
GET    /clientes                      ?busca=&status=&tags=&pagina= → {items: [...], total}
GET    /clientes/:id                  → {cliente com pedidos}
POST   /clientes                      {nome, whatsapp, email, cpf, ...} → {id}
PATCH  /clientes/:id                  {campos editáveis}
DELETE /clientes/:id                  {}
POST   /clientes/:id/adicionar-tag    {tag}
DELETE /clientes/:id/remover-tag      {tag}
POST   /clientes/importar-csv         (multipart/form-data: arquivo)
```

### Financeiro
```
GET    /financeiro/vendas             ?data_inicio=&data_fim= → {items: [...], total_bruto, total_liquido}
GET    /financeiro/despesas           ?categoria=&data_inicio=&data_fim= → {items: [...], total}
POST   /financeiro/despesa            {titulo, categoria, valor, data, ...} → {id}
PATCH  /financeiro/despesa/:id        {campos editáveis}
DELETE /financeiro/despesa/:id        {}
GET    /financeiro/resumo             ?periodo=7d|30d|90d → {receita, despesa, lucro, margem}
GET    /financeiro/grafico-fluxo      → [{data, receita, despesa}, ...]
```

### Mídia
```
GET    /midia                         → [{modelo, cor, fotos: [urls], foto_capa}, ...]
GET    /midia/:modelo/:cor            → {fotos: [urls], foto_capa}
POST   /midia/:modelo/:cor/upload     (multipart/form-data: imagens) → {urls}
DELETE /midia/:modelo/:cor/:foto_url  {}
PATCH  /midia/:modelo/:cor/capa       {foto_url}
POST   /midia/conectar-google-drive   {folder_id}
```

### Cupons
```
GET    /cupons                        ?ativo= → {items: [...], total}
POST   /cupons                        {codigo, tipo, valor, data_inicio, data_fim, ...} → {id}
PATCH  /cupons/:id                    {campos editáveis}
DELETE /cupons/:id                    {}
GET    /cupons/validar/:codigo        → {valid: true/false, desconto}
```

### Logs (Auditoria)
```
GET    /logs                          ?usuario=&modulo=&acao=&data_inicio=&data_fim= → {items: [...], total}
GET    /logs/:id                      → {log detalhado}
GET    /logs/exportar                 → (download CSV/PDF)
```

### Usuários & Permissões
```
GET    /usuarios                      → {items: [...]}
POST   /usuarios                      {username, nome, email, role} → {id, senha_temporaria}
PATCH  /usuarios/:id                  {nome, email, role, ativo}
DELETE /usuarios/:id                  {}
GET    /usuarios/permissoes           → {permissoes_por_role}
```

### Configurações
```
GET    /configuracoes                 → {chave: valor, ...}
PATCH  /configuracoes/:chave          {valor}
GET    /configuracoes/export          → (download JSON)
POST   /configuracoes/import          (multipart/form-data: JSON)
POST   /configuracoes/backup          → {backup_file}
```

---

## 🎨 ESTRUTURA FRONTEND (SPA)

### index.html (estrutura base)
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Painel Admin — Loja Pluma</title>
  <link rel="stylesheet" href="/admin/assets/css/global.css">
</head>
<body>
  <!-- Login (mostrado inicialmente) -->
  <div id="login-container" style="display: none;">
    <!-- formulário login -->
  </div>

  <!-- SPA (mostrado após autenticação) -->
  <div id="app" style="display: none;">
    <!-- Header -->
    <header>
      <div class="logo">Pluma Pijamas</div>
      <nav class="breadcrumb" id="breadcrumb"></nav>
      <div class="user-menu">
        <span id="user-name"></span>
        <button id="btn-logout">Logout</button>
      </div>
    </header>

    <!-- Main Layout (Sidebar + Content) -->
    <main>
      <!-- Sidebar -->
      <aside class="sidebar">
        <nav class="menu">
          <a href="#" data-module="dashboard">📊 Dashboard</a>
          <a href="#" data-module="estoque">📦 Estoque</a>
          <a href="#" data-module="pedidos">🧾 Pedidos</a>
          <a href="#" data-module="clientes">👥 Clientes & Leads</a>
          <a href="#" data-module="financeiro">💰 Financeiro</a>
          <a href="#" data-module="midia">🖼️ Mídia</a>
          <a href="#" data-module="cupons">🏷️ Cupons</a>
          <a href="#" data-module="logs">📋 Logs</a>
          <a href="#" data-module="usuarios">👤 Usuários</a>
          <a href="#" data-module="configuracoes">⚙️ Configurações</a>
        </nav>
      </aside>

      <!-- Content Area -->
      <section class="content">
        <div id="module-container">
          <!-- módulos renderizados aqui -->
        </div>
      </section>
    </main>
  </div>

  <!-- Toast Notifications -->
  <div id="toast-container"></div>

  <!-- Modals -->
  <div id="modal-container"></div>

  <!-- Scripts -->
  <script src="/admin/assets/js/main.js"></script>
</body>
</html>
```

### Componentes Frontend (por módulo)

Cada módulo tem:
1. **HTML template** (estrutura)
2. **CSS** (estilos específicos)
3. **JS** (lógica e interações)

**Exemplo: Estoque**
```
/admin/assets/js/modules/estoque.js
  ├── renderizar()           → monta HTML da tabela
  ├── carregarDados()        → fetch /admin/api/estoque
  ├── editar(id)             → abre modal para editar
  ├── salvar(id, dados)      → faz PATCH
  ├── deletar(id)            → faz DELETE com confirmação
  ├── importar(arquivo)      → POST com arquivo CSV
  └── filtrar(modelo, cor)   → aplica filtros à tabela
```

---

## 🔄 FLUXOS DE DADOS

### Fluxo 1: Venda → Financeiro → Estoque
```
Cliente faz pedido
  ↓
Pedido criado (POST /pedidos)
  ↓
Log registrado (INSERT admin_logs)
  ↓
Estoque atualizado (UPDATE estoque_produtos, quantidade_reservada++)
  ↓
Log de estoque registrado (INSERT estoque_historico)
  ↓
Financeiro registrado (INSERT financeiro_vendas)
  ↓
Dashboard atualizado em tempo real (GET /dashboard/stats)
```

### Fluxo 2: Editar Estoque
```
Admin clica "Editar quantidade"
  ↓
Modal abre com quantidade atual
  ↓
Admin edita e salva (PATCH /estoque/:id/quantidade)
  ↓
Backend valida, atualiza BD
  ↓
Log registrado (quem alterou, quando, antes/depois)
  ↓
Resposta retorna {success: true}
  ↓
Toast "✅ Atualizado"
  ↓
Tabela recarrega
```

### Fluxo 3: Aplicar Cupom no Pedido
```
Admin cria pedido (POST /pedidos)
  ↓
Depois aplica cupom (POST /pedidos/:numero/aplicar-cupom)
  ↓
Backend valida cupom (data, uso, valor)
  ↓
Calcula desconto automático
  ↓
Atualiza valor_total no pedido
  ↓
Log registrado (cupom aplicado, desconto)
  ↓
Resposta retorna novo valor_total
  ↓
Pedido exibe com desconto
```

---

## 📅 CRONOGRAMA DE IMPLEMENTAÇÃO

### FASE 0: Setup & Autenticação (2-3h)
- [ ] Criar banco PostgreSQL local + VPS
- [ ] Setup pool de conexão (pg)
- [ ] Criar tabelas core (admin_usuarios, admin_logs)
- [ ] Implementar login (JWT)
- [ ] Implementar SPA basic (HTML + CSS base)
- [ ] Teste: login funciona, token armazenado

### FASE 1: Dashboard & Estoque (3-4h)
- [ ] Tabela `estoque_produtos` + `estoque_historico`
- [ ] API CRUD estoque (/admin/api/estoque)
- [ ] Frontend: Dashboard com stats básicas
- [ ] Frontend: Tabela Estoque com filtros
- [ ] Teste: consegue visualizar, editar, deletar produtos

### FASE 2: Pedidos & Clientes (3-4h)
- [ ] Tabelas `pedidos` + `clientes`
- [ ] API CRUD pedidos (/admin/api/pedidos)
- [ ] API CRUD clientes (/admin/api/clientes)
- [ ] Frontend: Listagem Pedidos com filtros
- [ ] Frontend: Listagem Clientes com busca
- [ ] Teste: criar pedido, listar, editar status

### FASE 3: Financeiro (2-3h)
- [ ] Tabelas `financeiro_vendas` + `financeiro_despesas`
- [ ] API Financeiro (/admin/api/financeiro)
- [ ] Frontend: Gráfico Vendas (ApexCharts)
- [ ] Frontend: Tabela Despesas com CRUD
- [ ] Frontend: Resumo Financeiro (receita, despesa, lucro)
- [ ] Teste: gráficos carregam, despesas criáveis

### FASE 4: Mídia & Cupons (2-3h)
- [ ] Tabelas `midia_produtos` + `promocoes_cupons`
- [ ] API Mídia com upload (multipart)
- [ ] API Cupons CRUD
- [ ] Frontend: Upload de fotos (drag & drop)
- [ ] Frontend: Gerenciador de Cupons
- [ ] Teste: upload funciona, cupons aplicáveis

### FASE 5: Logs & Usuários (2h)
- [ ] Sistema de Logs automático em todas operações
- [ ] API Logs com filtros
- [ ] API Usuários + Permissões
- [ ] Frontend: Tabela Logs com exportação CSV
- [ ] Frontend: Gerenciador de Usuários
- [ ] Teste: logs registram tudo corretamente

### FASE 6: Configurações & Polish (1-2h)
- [ ] Tabela `configuracoes_sistema`
- [ ] API Configurações
- [ ] Frontend: Tela Configurações
- [ ] Tema claro/escuro
- [ ] Responsividade (mobile, tablet)
- [ ] Teste: tudo funciona em todos dispositivos

### FASE 7: Deploy & Testes de Produção (1-2h)
- [ ] Setup PostgreSQL na VPS
- [ ] Migração de dados (SQLite → PostgreSQL)
- [ ] Deploy do backend + frontend
- [ ] Testes end-to-end na VPS
- [ ] Backup automático configurado

**Total Estimado**: 15-20h de desenvolvimento

---

## ⚙️ VARIÁVEIS DE AMBIENTE (.env)

```env
# Server
NODE_ENV=production
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pijama_store_admin
DB_USER=admin
DB_PASSWORD=sua_senha_segura
DB_SSL=false

# JWT
JWT_SECRET=sua_chave_secreta_aqui
JWT_EXPIRE=24h

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# Admin
ADMIN_DEFAULT_PASSWORD=admin
ADMIN_ALLOWED_IPS=127.0.0.1,::1,177.7.47.211

# Mídia
MEDIA_UPLOAD_DIR=./uploads
GOOGLE_DRIVE_FOLDER_ID=opcional
MAX_FILE_SIZE=10485760  # 10MB

# Email (para notificações futuras)
SMTP_HOST=opcional
SMTP_PORT=opcional
SMTP_USER=opcional
SMTP_PASS=opcional
```

---

## ✅ CRITÉRIOS DE SUCESSO

### MVP Completo quando:
- [ ] Login funciona (admin/admin)
- [ ] Dashboard mostra stats reais
- [ ] CRUD Estoque 100% funcional
- [ ] CRUD Pedidos 100% funcional
- [ ] CRUD Clientes 100% funcional
- [ ] Financeiro com gráficos
- [ ] Mídia com upload
- [ ] Cupons funcionando
- [ ] Logs registrando tudo
- [ ] Usuários editáveis
- [ ] Tudo responsivo
- [ ] Tudo funcionando na VPS

---

## 📝 NOTAS IMPORTANTES

1. **Sem WhatsApp por enquanto**: API Evolution fica para FASE 8 (em outro projeto)
2. **PostgreSQL local**: Usar `psql` ou DBeaver para desenvolvimento
3. **Sem autenticação externa**: Só usuário/senha local
4. **Logs automáticos**: Cada operação registra quem fez, quando e o quê
5. **SPA única**: Um único `index.html`, navegação via JavaScript
6. **CSS customizado**: Sem Bootstrap, controle total do design
7. **Performance**: Índices no PostgreSQL para queries rápidas
8. **Backup automático**: Script que roda diariamente, salva em `/backups`

---

## 🚀 PRÓXIMOS PASSOS (Após aprovação)

1. Setup PostgreSQL local
2. Criar scripts de setup (criar tabelas, seed data)
3. Começar FASE 0 (auth)
4. Deploy incremental (fase por fase)
5. Testes contínuos

---

**Status**: ⏳ Aguardando sua aprovação do plano  
**Próximo**: Você revisa, aprova, e começamos a codificar do zero
