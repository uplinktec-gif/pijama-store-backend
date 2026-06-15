# CLAUDE.md — Memória do Projeto Pluma Pijamas (bot WhatsApp)

Lido automaticamente pelo Claude Code em toda sessão. Contém regras e contexto que NUNCA devem ser esquecidos.

> Última revisão: 2026-06-15.

---

## ⚠️ REGRAS MAIS IMPORTANTES

### 1. Deploy — o código roda na VPS, NÃO no PC local

| Item | Valor |
|------|-------|
| VPS IP | `177.7.47.211` |
| **Porta da app** | **`5000`** |
| Pasta na VPS | `/opt/pijama-store/` |
| Node.js na VPS | **`/usr/bin/node` (Node 20.x)** — padronizado p/ evitar mismatch de ABI do `better-sqlite3` |
| Process manager | **PM2**, processo `pijama-store` (`ecosystem.config.cjs`) |
| Chave SSH | `~/.ssh/id_rsa` (Windows: `C:\Users\Felipe\.ssh\id_rsa`) |

**Após qualquer mudança de código:**
```bash
bash deploy.sh
```
O `deploy.sh` faz: `scp` de `src/ public/ scripts/ server.js package.json ecosystem.config.cjs .env` → VPS, `npm install --omit=dev`, **`npm rebuild better-sqlite3`** (Node 20), `pm2 restart`, e health-check em `:5000`. Nunca dizer que está pronto sem ter feito o deploy e visto `health: ok`.

> ⚠️ **Comandos manuais na VPS:** o terminal do Felipe sofre com *bracketed paste* (`^[[200~` cola junto e quebra comandos multi-linha). Para manutenção na VPS, use **comandos de uma linha só, encadeados com `&&`** (se o início corromper, a cadeia inteira aborta sem efeito), nunca multi-linha com `\` + `;`.

### 2. Banco de dados — SQLite via **better-sqlite3**
- **Banco**: `data/pijama-store.db` (arquivo local em disco, WAL mode, não vai pro git)
- **Lib**: `better-sqlite3` (síncrono, módulo nativo — recompilado no deploy)
- **Config**: `src/config/database.js` (exporta `query`, `queryOne`, `run`, `transaction`)
- **Serviços CRUD**: `src/services/sqlite/` (estoque, pedidos, clientes, leads, conversas, fotos, suporte)
- Operações que mexem em estoque usam `transaction()` + checagem de `changes()` (atômicas, anti-corrida).
- Google Sheets é **LEGADO** (só OAuth login). `npm run migrate` só em PC novo.

---

## Arquitetura

- **Backend**: Node.js + Express, ESM (`"type": "module"`), entrypoint `server.js`
- **WhatsApp**: Evolution API na VPS (instância `pijama-store`); URL em `.env` (`EVOLUTION_API_URL`)
- **IA**: Claude (Anthropic) — cliente em **`src/config/claude.js`** (`callAI`)
- **Banco**: better-sqlite3 — `data/pijama-store.db`
- **App / Webhook / Admin / Portal**: tudo na porta **5000**
  - Webhook WhatsApp: `POST /api/webhook/whatsapp`
  - Painel admin: `http://177.7.47.211:5000/admin` (whitelist de IP — só localhost/SSH tunnel)
  - Portal cliente: `http://177.7.47.211:5000/portal`

### GitHub
```
https://github.com/uplinktec-gif/pijama-store-backend
git pull origin main   # antes de começar
git add . && git commit -m "..." && git push   # ao terminar
```

---

## Estrutura da pasta (limpa em 2026-06-15)

A raiz contém **apenas o essencial**. Doc/scripts antigos foram para `/opt/_pijama-archive-20260615` na VPS (arquivo-morto, pode ser apagado quando não for mais útil).

```
server.js  package.json  package-lock.json  ecosystem.config.cjs
.env  .env.example  .gitignore  jest.config.js  deploy.sh  CLAUDE.md  README.md
src/  public/  scripts/  data/  docs/  tests/  node_modules/  logs/  .git/
```

### O cérebro do bot — `src/services/business/bot/` (modularizado)
| Arquivo | Função |
|---------|--------|
| `orquestrador.js` | **Entrada e dispatch.** Carrega contexto, checa fluxos pendentes, fast-path, e roteia para os handlers |
| `fastpath.js` | Regras regex que respondem sem chamar a IA (~70% das msgs) |
| `claude.js` | Chamada à IA (system prompt + retry/backoff + fallback) |
| `formatters.js` | Formatação das respostas pro WhatsApp |
| `notificacoes.js` | Avisos ao cliente (pagamento/entrega) e **ao admin** |
| `troca.js` | **Fluxo de troca de mercadoria (admin-only)** |
| `baixaTexto.js` | Baixa de estoque por texto (admin) com motivo + confirmação |
| `retiradaInterna.js` | Consumo interno dos sócios (sem cobrança) |
| `historico.js`, `lote.js`, `analytics.js` | Histórico de conversa, pedidos em lote, comandos `@` |

| Outros arquivos críticos | Função |
|---------|--------|
| `src/services/business/pedidos.js` | Criar/cancelar/entregar pedido + estorno de estoque |
| `src/services/sqlite/estoque.js` | CRUD estoque + `processarTroca()`, `baixarEstoque()` (atômicos) |
| `src/services/sqlite/pedidos.js` | CRUD de pedidos |
| `src/config/users.js` | Roles e permissões por número de WhatsApp |
| `src/config/claude.js` | Cliente Claude (IA) |
| `deploy.sh` | **Script de deploy para a VPS** |

---

## Fluxo de uma mensagem WhatsApp

```
WhatsApp → Evolution API → POST /api/webhook/whatsapp
  → orquestrador.js (processarMensagemComContexto)
    → 1) fluxos PENDENTES têm prioridade (baixa_pendente, troca_pendente, pedido_parcial...)
    → 2) FastPath (regex) — sem IA para msgs simples
    → 3) processarComClaudeComRetry (3 tentativas + backoff) → sanitizarParaWhatsApp (nunca envia JSON cru)
    → switch(action): criar_pedido | confirmar_pagamento | atualizar_entrega | solicitacao_troca | ...
  → sender.js → Evolution API → WhatsApp
```

### Funcionalidades do bot
- **Pedidos**: criar (texto livre ou lote), confirmar pagamento, marcar entrega/retirada
- **Histórico**: últimos N pedidos, filtro por **data/período** ("desde 08/06", "últimos 3 dias", "última semana") — fuso Boa Vista (UTC-4)
- **Estoque**: consulta, `@estoque`, alertas, resumo, reposição (curva ABC)
- **Baixa por texto** (admin): "baixa 1 zara m preto por defeito" → motivo + confirmação
- **Retirada interna** (sócios): "retirada 1 anne p bordô para jully" → sem pedido/cobrança
- **Troca de mercadoria** (admin) — ver abaixo

### 🔄 Troca de mercadoria (admin-only)
- **Quem pode**: só `ADMIN`/`OPERADOR` (gate `temPermissao(..., 'ANALYTICS_ESTOQUE')` em `bot/troca.js`). Cliente recebe mensagem educada de encaminhamento.
- **Fluxo** (`bot/troca.js`, `troca_pendente` no contexto): nº pedido → peça a devolver → peça nova (valida saldo; sem estoque → oferece alternativas) → confirmação Sim/Não.
- **Estoque**: `processarTroca(idPedido, itemAntigo, itemNovo)` em `sqlite/estoque.js` — numa **única transação atômica**: `+1` no total do item antigo, `-1` no novo (com guarda `changes()` → rollback total se faltar saldo). Grava 2 linhas em `log_estoque` (motivo "Troca de Cliente").
- **Admin**: `notificarAdminTroca()` avisa o WhatsApp do dono (`env.numeroFelipe`) sobre a troca pendente (logística reversa / etiqueta).

---

## Negócio

- Loja de pijamas femininos em Boa Vista - RR — **Pluma Pijamas**
- **Donos**: Felipe (ADMIN) e Pluma (OPERADOR) · **Equipe**: Júlly (OPERADOR)
- **Modelos**: ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE, **LUNA**
- **Tamanhos**: P, M, G, GG · **Cores**: azul, preto, bordô, cinza, marrom (+ variações como "azul jeans")
- **PIX**: plumabv@gmail.com (JULLY PRISCILA ESCORCIO ROSENDO / CLOUDWALK IP LTDA)
- **Cartão**: `https://linknabio.gg/plumapijamas`
- **Frete**: R$ 10,00 (entrega) · R$ 0 (retirada na loja)

### Números WhatsApp autorizados
- Felipe: `95981188675` (ADMIN)
- Júlly: `95981225668` (OPERADOR)
- Pluma: `95991268494` (OPERADOR)

---

## Comandos úteis

```bash
# Deploy completo para a VPS
bash deploy.sh

# Health check
curl http://177.7.47.211:5000/health

# Logs ao vivo na VPS (PM2)
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "/usr/bin/pm2 logs pijama-store"

# Status do processo
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "/usr/bin/pm2 status"

# Reiniciar manualmente na VPS
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "cd /opt/pijama-store && /usr/bin/pm2 restart pijama-store"

# Checar sintaxe de um arquivo no Node 20 da VPS antes de deployar
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "/usr/bin/node --check /opt/pijama-store/src/.../arquivo.js"

# Acesso ao painel admin (tunnel)
ssh -L 8080:localhost:5000 root@177.7.47.211   # depois: http://localhost:8080/admin
```

---

## Variáveis de ambiente obrigatórias (.env)

```
WHATSAPP_VERIFY_TOKEN=...
ANTHROPIC_API_KEY=...
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=pijama-store
EVOLUTION_API_URL=...
CLIENTE_SESSION_SECRET=...
NUMERO_FELIPE=95981188675   # usado p/ alertas ao admin (estoque crítico, trocas)
```
Ver `.env.example` para a lista completa.
