# AGENTS.md — Guia do projeto para agentes de código (Codex etc.)

> Este arquivo orienta agentes de IA trabalhando neste repositório.
> Fonte irmã: `CLAUDE.md` (mesmo conteúdo, mantido para o Claude Code). **Se editar um, espelhe no outro.**

## O que é este projeto

Backend + loja + bot de WhatsApp da **Pluma Pijamas** (Boa Vista-RR, Brasil).
- **Backend**: Node.js 20 + Express, ESM (`"type": "module"`), entrypoint `server.js`.
- **Banco**: SQLite via `better-sqlite3` (WAL) — `data/pijama-store.db` (NÃO versionado).
- **WhatsApp**: Evolution API (externa, na VPS) — instância `pijama-store`, integração Baileys.
- **IA do bot**: Claude (Anthropic) via `src/config/claude.js`.
- **Front da loja**: `public/store/index.html` (vanilla JS servido pelo Express). ⚠️ Existe uma cópia ÓRFÃ em `src/public/store/` — NÃO edite a órfã; a servida é a de `public/store/` (ver `src/app.js`).
- **Painel admin**: `public/admin/` + rotas `/admin/api/*`.

## Produção (contexto — o agente normalmente NÃO tem acesso)

- Roda numa VPS (`177.7.47.211`), pasta `/opt/pijama-store`, porta **5000**, process manager **PM2** (`pijama-store`, `ecosystem.config.cjs`).
- Deploy: `bash deploy.sh` (scp + npm install + rebuild better-sqlite3 + pm2 restart + health-check). **Rodado pelo Felipe da máquina local** — exige chave SSH que não está no repo.
- A menos que o ambiente tenha sido configurado com SSH/segredos, um agente cloud **não consegue deployar nem tocar o banco de produção**. Entregue o código pronto; o deploy é humano/local.

## O que NÃO está no repo (não invente, não commite)

- `.env` — segredos e catálogo dinâmico: `CATALOG_MODELS/SIZES/COLORS`, `MODEL_PRICES`, chaves da Evolution/Anthropic, números de WhatsApp autorizados. Há um `.env.example`.
- `data/*.db` — banco (produção na VPS; cada dev tem o seu).
- Chave SSH da VPS.
- **NUNCA** commite segredos, tokens ou chaves. `.env` é gitignored — mantenha assim.

## Arquitetura do bot (o coração)

Fluxo de uma mensagem: Evolution API → `POST /api/webhook/whatsapp` → `src/services/business/bot/orquestrador.js`:
1. **Fluxos pendentes** têm prioridade absoluta (`baixa_pendente`, `troca_pendente`, `pedido_parcial`… no contexto da conversa).
2. **FastPath** (`bot/fastpath.js`) — regex que resolve ~70% das msgs sem IA.
3. **Claude** (`bot/claude.js`) — system prompt com estoque real injetado; responde SÓ JSON `{action, resposta, dados}`; `sanitizarParaWhatsApp()` garante que JSON cru nunca vá pro cliente.
4. Dispatch por `action` → handlers → `src/services/whatsapp/sender.js`.

Módulos-chave em `src/services/business/bot/`: `orquestrador.js` (dispatch), `fastpath.js`, `claude.js`, `formatters.js`, `notificacoes.js` (avisos a cliente/admin), `troca.js` (troca de mercadoria, admin-only), `baixaTexto.js` (baixa de estoque, admin-only), `retiradaInterna.js`, `historico.js`, `lote.js`, `analytics.js`.

CRUD SQLite em `src/services/sqlite/` (estoque, pedidos, clientes, fotos, …).

## Regras de negócio críticas

- **Estoque é a fonte única da verdade** — a IA é proibida de inventar modelos/cores/tamanhos fora do banco.
- **Operações de estoque são atômicas**: `transaction()` + guarda `changes()` (ver `reservarEstoque`, `baixarEstoque`, `processarTroca` em `src/services/sqlite/estoque.js`). Mantenha esse padrão em qualquer nova operação.
- **Não usar DELETE em `estoque`** — `estoque_versao` tem FK para `estoque.sku`. Zerar + `status='INATIVO'` (soft delete).
- ⚠️ `UPPER()` do SQLite NÃO converte acentos (Ú/ú) — cuidado com matches em `Núbia`/`Lívia`; use igualdade exata ou normalize em JS.
- **Permissões**: `src/config/users.js` (`temPermissao`, roles ADMIN/OPERADOR/CLIENTE por número de WhatsApp). Operações de estoque/troca/baixa são ADMIN/OPERADOR.
- **Preços**: catálogo central em `MODEL_PRICES` (.env) → sincronizado ao estoque por `scripts/sync-precos.mjs` no deploy. Checkout SEMPRE recalcula preço do banco (nunca confiar no front).
- Fuso horário do negócio: **America/Boa_Vista (UTC-4)**.
- Tamanhos: adulto P/M/G/GG · infantil por idade "04","06","08","10" (strings). Front deriva tamanhos do estoque — não hardcode.
- Cores: o sistema usa "Chocolate" (não "Marrom") e "Verde mint" (não "Menta").

## Modelos do catálogo (jul/2026)

- Feminino adulto: ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE, LUNA, BIA, LUIZA
- Masculino: MATHEUS · Infantil (por idade): LIZZIE, INFANTIL
- Estampas/cores: Azul, Azul Jeans, Preto, Bordô, Cinza, Chocolate, Verde mint, Pink, Colors, Xadrez

## Convenções

- Código/comentários em **português**; commits estilo `feat:`/`fix:`/`docs:` em pt-BR.
- ESM puro (`import`), sem TypeScript.
- Testes: Jest (`npm test`) — usa `--experimental-vm-modules`.
- Trabalhe em **branches de feature** e abra PR — não commite direto na `main`.
- Antes de finalizar: `node --check` nos arquivos alterados (o deploy valida sintaxe no Node 20).

## Fotos dos produtos

Tabela `fotos` (modelo, cor minúscula, `photo_ids_json` = array de IDs do Google Drive ou paths locais `/img/...`, `eh_capa`). Front resolve via `GDR()` → `lh3.googleusercontent.com/d/<id>=w800`. Cadastro: `scripts/registrar-fotos-remessa.mjs`.
