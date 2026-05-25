# 🔄 PLANO DE SINCRONIZAÇÃO 3-CAMADAS
## Site/VPS ↔ Estoque ↔ Admin ↔ WhatsApp Bot

**Data**: 2026-05-24  
**Objetivo**: Eliminar inconsistências de dados entre todos os sistemas  
**Status**: Em implementação (Fase 1 iniciada)

---

## 📋 PROBLEMA IDENTIFICADO

| Sistema | Problema | Impacto |
|---------|----------|--------|
| Site/VPS | Estoque pode ficar dessincronizado | Vendas duplicadas, overstock |
| Admin | Pode não refletir mudanças em tempo real | Decisões baseadas em dados antigos |
| Bot WhatsApp | Estoque cacheado, usa dados antigos | Oferece produtos sem estoque |
| Database | Sem histórico de alterações | Impossível auditar | 

**Root cause**: Sem camada de versioning/event-log que sincronize todos os consumidores

---

## 🏗️ ARQUITETURA 3-CAMADAS

```
┌─────────────────────────────────────────┐
│  CAMADA 1: SOURCE OF TRUTH (Database)   │
│                                         │
│  - SQLite com estoque_version table     │
│  - Change log com timestamp             │
│  - Índices de performance               │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  CAMADA 2: EVENT BUS (Webhooks)         │
│                                         │
│  - POST /webhook/estoque-atualizado     │
│  - Notifica todos os consumidores       │
│  - Retry automático com backoff         │
│  - Dead letter queue para falhas        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  CAMADA 3: CLIENT-SIDE (Cache Local)    │
│                                         │
│  - Cache com TTL (30-60 segundos)       │
│  - Revalidação em webhook               │
│  - Fallback para API se webhook falha   │
│  - Auto-refresh em admin (10s)          │
└─────────────────────────────────────────┘
```

---

## 🔧 FASE 1: CAMADA 1 — Database com Version Control

### 1.1 Nova Tabela: `estoque_versao`

```sql
CREATE TABLE IF NOT EXISTS estoque_versao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  versao INTEGER NOT NULL UNIQUE,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  operacao TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  sku TEXT,
  mudancas_json TEXT,  -- {"campo": {"de": valor_antigo, "para": valor_novo}}
  usuario_id TEXT DEFAULT 'sistema',
  
  FOREIGN KEY(sku) REFERENCES estoque(sku)
);

-- Índice para buscar versão mais recente
CREATE INDEX idx_estoque_versao_timestamp ON estoque_versao(timestamp DESC);
```

### 1.2 Triggers (SQL.js não suporta, usar application logic)

No `src/config/database.js`, envolver toda UPDATE/INSERT de estoque com:

```js
async function registrarAlteracaoEstoque(sku, operacao, novoValor, valorAntigo) {
  const versao = await obterProximaVersao();
  const mudancas = {
    quantidade_total: { de: valorAntigo, para: novoValor }
  };
  
  await run(`
    INSERT INTO estoque_versao (versao, operacao, sku, mudancas_json)
    VALUES (?, ?, ?, ?)
  `, [versao, operacao, sku, JSON.stringify(mudancas)]);
  
  // Chamar webhook
  await notificarEstoqueAtualizado(sku, versao);
}
```

### 1.3 Novo Endpoint: Histórico de Alterações

**GET `/api/admin/estoque/historico?desde_versao=X`**

```json
{
  "versao_atual": 152,
  "alteracoes": [
    {
      "versao": 152,
      "timestamp": "2026-05-24T15:30:45Z",
      "sku": "ZARA_M_AZUL",
      "operacao": "UPDATE",
      "mudancas": {
        "quantidade_total": { "de": 5, "para": 4 }
      }
    }
  ]
}
```

---

## 🔔 FASE 2: CAMADA 2 — Event Bus (Webhooks)

### 2.1 Novo Endpoint: POST `/webhook/estoque-atualizado`

No `server.js`, adicionar:

```js
router.post('/webhook/estoque-atualizado', async (req, res) => {
  const { sku, versao, mudancas } = req.body;
  
  // Broadcast para todos os consumidores
  await Promise.allSettled([
    notificarSite(sku, versao),
    notificarAdmin(sku, versao),
    notificarBot(sku, versao)
  ]);
  
  res.json({ recebido: true });
});
```

### 2.2 Notificadores com Retry Automático

```js
// src/services/webhooks/notificadores.js
async function notificarSite(sku, versao, tentativas = 0) {
  try {
    await fetch(`http://localhost:3000/api/cache-invalidar`, {
      method: 'POST',
      body: JSON.stringify({ sku, versao, timestamp: Date.now() })
    });
  } catch (erro) {
    if (tentativas < 3) {
      // Retry com backoff exponencial
      setTimeout(() => notificarSite(sku, versao, tentativas + 1), 1000 * (2 ** tentativas));
    } else {
      // Salvar em fila de mortos (dead letter queue)
      await salvarEmFilaMorta('site', sku, versao);
    }
  }
}
```

### 2.3 Dead Letter Queue

Tabela para eventos que falharam:

```sql
CREATE TABLE IF NOT EXISTS webhooks_fila_morta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumidor TEXT,  -- 'site', 'admin', 'bot'
  sku TEXT,
  versao INTEGER,
  tentativas INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  erro_mensagem TEXT
);
```

---

## 💾 FASE 3: CAMADA 3 — Client-Side Cache

### 3.1 Cache no Frontend do Site

```js
// public/portal/js/cache.js
const CACHE_CONFIG = {
  TTL: 60000,  // 60 segundos
  lastFetch: {},
  data: {}
};

async function obterEstoqueComCache(modelo) {
  const agora = Date.now();
  
  // Se cache ainda é válido, retornar
  if (CACHE_CONFIG.data[modelo] && 
      agora - CACHE_CONFIG.lastFetch[modelo] < CACHE_CONFIG.TTL) {
    return CACHE_CONFIG.data[modelo];
  }
  
  // Senão, buscar da API
  const response = await fetch('/api/store/products');
  CACHE_CONFIG.data = response.estoque;
  CACHE_CONFIG.lastFetch[modelo] = agora;
  
  return CACHE_CONFIG.data[modelo];
}
```

### 3.2 Listener de Webhook no Frontend

```js
// Conectar ao servidor de eventos (SSE ou WebSocket)
const eventSource = new EventSource('/api/eventos-estoque');

eventSource.addEventListener('estoque.atualizado', (event) => {
  const { sku, versao } = JSON.parse(event.data);
  
  // Invalidar cache
  CACHE_CONFIG.data = {};
  CACHE_CONFIG.lastFetch = {};
  
  // Recarregar UI se o modal de seleção estiver aberto
  if (document.getElementById('produtoModal').classList.contains('show')) {
    carregarEstoque();
  }
});
```

### 3.3 Auto-Refresh no Admin Panel

```js
// public/admin/admin.js
setInterval(async () => {
  // Recarregar estoque a cada 10 segundos
  const novoEstoque = await fetch('/admin/api/estoque').then(r => r.json());
  
  // Comparar com cache local
  if (hashEstoque(novoEstoque) !== hashEstoque(estoqueLocal)) {
    atualizarTabelaEstoque(novoEstoque);
  }
}, 10000);
```

---

## ✅ IMPLEMENTAÇÃO PASSO A PASSO

### Semana 1 (40 min - Hoje)
- [ ] **1.1** Criar tabela `estoque_versao`
- [ ] **1.2** Modificar `src/config/database.js` para registrar alterações
- [ ] **1.3** Criar GET `/api/admin/estoque/historico`
- [ ] **Teste**: Inserir item e verificar histórico

### Semana 2 (1h 30min)
- [ ] **2.1** Implementar POST `/webhook/estoque-atualizado`
- [ ] **2.2** Criar notificadores com retry
- [ ] **2.3** Criar tabela `webhooks_fila_morta`
- [ ] **Teste**: Disparar webhook e verificar retries

### Semana 3 (1h)
- [ ] **3.1** Implementar cache no frontend (site)
- [ ] **3.2** Adicionar EventSource listener
- [ ] **3.3** Auto-refresh no admin
- [ ] **Teste**: Mudar estoque e verificar propagação em tempo real

### Semana 4 (30 min - Testes Integrados)
- [ ] Bot recebe webhook
- [ ] Site atualiza em tempo real
- [ ] Admin mostra dados atualizados
- [ ] Fallback quando webhook falha

---

## 📊 ANTES vs. DEPOIS

### ANTES (Sincronização Manual)
```
Local: 26 itens, 52 unidades
VPS:   1 item,  10 unidades  ❌ Dessincronizado
Admin: Mostra dados velhos
Bot:   Usa cache de 24h
```

### DEPOIS (Sincronização Automática 3-Camadas)
```
Local: 26 itens, 52 unidades  ✅
VPS:   26 itens, 52 unidades  ✅ (atualizado em < 1s)
Admin: 26 itens, 52 unidades  ✅ (atualizado em < 10s)
Bot:   26 itens, 52 unidades  ✅ (atualizado em < 2s)
```

---

## 🔐 Segurança

- ✅ Webhooks requerem token de autenticação
- ✅ Dead letter queue permanece no servidor
- ✅ Audit log permanente das alterações
- ✅ Rollback possível via histórico de versões

---

## 🎯 Próximas Ações

1. **Agora**: Implementar Camada 1 (versioning na database)
2. **Próximo**: Implementar Camada 2 (webhooks)
3. **Depois**: Implementar Camada 3 (client cache)
4. **Final**: Testes integrados de ponta a ponta

---

## 📞 Contato

Questões? Teste primeiro localmente, depois com VPS.
