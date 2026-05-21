# CLAUDE.md — Memória do Projeto Pijama Store

Este arquivo é lido automaticamente pelo Claude Code em toda sessão.
Contém regras e contexto que NUNCA devem ser esquecidos.

---

## ⚠️ REGRAS MAIS IMPORTANTES

### 1. Deploy
**O código roda em uma VPS, NÃO no PC local de Felipe.**

| Item | Valor |
|------|-------|
| VPS IP | `177.7.47.211` |
| Porta | `3000` |
| Pasta na VPS | `/opt/pijama-store/` |
| Node.js na VPS | `/root/.nvm/versions/node/v24.15.0/bin/node` |
| Chave SSH | `~/.ssh/id_rsa` (Windows: `C:\Users\Felipe\.ssh\id_rsa`) |

**Após qualquer mudança de código:**
```bash
bash deploy.sh
```
Nunca dizer que está pronto sem ter feito o deploy.

### 2. Banco de dados — SQLite (NÃO mais Google Sheets)
- **Banco**: `data/pijama-store.db` (arquivo local, não vai pro git)
- **Biblioteca**: `sql.js` (in-memory + persistência em disco)
- **Config**: `src/config/database.js`
- **Serviços**: `src/services/sqlite/` (7 arquivos: estoque, pedidos, clientes, leads, conversas, fotos, suporte)
- Google Sheets ainda existe mas é **LEGADO** — apenas para Google OAuth login

**Para migrar dados do Sheets → SQLite (só necessário em PC novo):**
```bash
npm run migrate
```

---

## Arquitetura

- **Backend**: Node.js + Express, ESM modules (`"type": "module"`)
- **WhatsApp**: Evolution API em `http://177.7.47.211:32775` (instância: `pijama-store`)
- **IA**: Claude Haiku (Anthropic) — arquivo `src/config/gemini.js` (nome legado, mantido)
- **Banco**: SQLite via sql.js — `data/pijama-store.db`
- **Webhook WhatsApp**: `http://177.7.47.211:3000/api/webhook/whatsapp`
- **Painel admin**: `http://177.7.47.211:3000/admin` (acesso só localhost/SSH tunnel)
- **Portal cliente**: `http://177.7.47.211:3000/portal`

### GitHub
```
https://github.com/uplinktec-gif/pijama-store-backend
```

**Workflow:**
```bash
git pull origin main   # antes de começar
git add . && git commit -m "..." && git push   # ao terminar
```

---

## Negócio

- Loja de pijamas femininos em Boa Vista - RR — **Pluma Pijamas**
- **Donos**: Felipe (ADMIN) e Pluma (OPERADOR)
- **Equipe**: Júlly (OPERADOR)
- **Modelos**: ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE
- **Tamanhos**: P, M, G, GG
- **Cores**: azul marinho, preto, bordô, cinza, marrom
- **PIX**: plumabv@gmail.com (JULLY PRISCILA ESCORCIO ROSENDO / CLOUDWALK IP LTDA)
- **Cartão**: `https://linknabio.gg/plumapijamas`
- **Frete**: R$ 10,00 fixo (entrega), R$ 0 (retirada na loja)

## Números WhatsApp autorizados
- Felipe: `95981188675` (ADMIN)
- Júlly: `95981225668` (OPERADOR)
- Pluma: `95991268494` (OPERADOR)

---

## Fluxo de uma mensagem WhatsApp

```
WhatsApp → Evolution API → POST /api/webhook/whatsapp
  → webhook.controller.js
  → conversas.js (processarMensagemComContexto)
    → FastPath (regex) — sem Claude para msgs simples
    → processarComClaudeComRetry (3 tentativas + backoff)
      → sanitizarParaWhatsApp() — NUNCA envia JSON bruto
    → switch(action): criar_pedido | confirmar_pagamento | ...
  → sender.js → Evolution API → WhatsApp
```

### Fast-path (sem chamar Claude ~70% das msgs):
- Saudações: "oi", "olá", "bom dia"...
- "pedidos" → listar pendentes
- "pedido X pago pix" → confirmar pagamento
- "entregue pedido X" → marcar entregue
- "@estoque", "@analise"

---

## Painel Admin

- **URL**: `http://177.7.47.211:3000/admin`
- **Acesso externo**: bloqueado por IP whitelist (403)
- **Para acessar remotamente**: SSH tunnel
  ```bash
  ssh -L 8080:localhost:3000 root@177.7.47.211
  # Depois: http://localhost:8080/admin
  ```
- **Seções**: Dashboard, Pedidos, Estoque, Clientes, Leads, Suporte
- **API**: `/admin/api/*` (controller: `src/controllers/admin.controller.js`)

---

## Arquivos críticos

| Arquivo | Função |
|---------|--------|
| `src/services/business/conversas.js` | Cérebro do bot — fast-path + Claude |
| `src/services/business/pedidos.js` | Lógica de criação/atualização de pedidos |
| `src/services/sqlite/pedidos.js` | CRUD de pedidos no SQLite |
| `src/services/sqlite/estoque.js` | CRUD de estoque no SQLite |
| `src/config/database.js` | Inicialização SQLite (sql.js) |
| `src/controllers/admin.controller.js` | Endpoints do painel admin |
| `src/config/gemini.js` | Cliente Claude Haiku (IA) |
| `src/config/users.js` | Roles e permissões por WhatsApp |
| `deploy.sh` | **Script de deploy para a VPS** |

---

## Fotos dos Produtos

- Gerenciadas na tabela `fotos` do SQLite (também ainda na aba FOTOS do Sheets)
- Formato: `modelo | cor | photo_ids_json` (IDs do Google Drive em JSON array)
- **Cores pendentes de foto**: MIA/preto, MIA/azul marinho, LIA/cinza, NUBIA/cinza, LIVIA/bordô, BEATRIZ/bordô

---

## Comandos úteis

```bash
# Deploy completo para a VPS
bash deploy.sh

# Migrar dados Sheets → SQLite (só em PC novo)
npm run migrate

# Migração em modo preview (sem escrever)
npm run migrate -- --dry-run

# Ver logs ao vivo na VPS
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "tail -f /opt/pijama-store/logs/combined-$(date +%Y-%m-%d).log"

# Health check
curl http://177.7.47.211:3000/health

# Verificar processo na VPS
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "ps aux | grep 'node /opt/pijama-store' | grep -v grep"

# Reiniciar servidor na VPS manualmente
ssh root@177.7.47.211 'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && kill -9 $(lsof -ti :3000) 2>/dev/null; sleep 2; cd /opt/pijama-store && nohup node server.js >> logs/server.log 2>&1 &'
```

---

## Variáveis de ambiente obrigatórias (.env)

```
WHATSAPP_VERIFY_TOKEN=...
ANTHROPIC_API_KEY=...
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=pijama-store
CLIENTE_SESSION_SECRET=...
```
Ver `.env.example` para lista completa.
