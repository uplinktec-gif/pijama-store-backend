# CLAUDE.md — Memória do Projeto Pijama Store

Este arquivo é lido automaticamente pelo Claude Code em toda sessão.
Contém regras e contexto que NUNCA devem ser esquecidos.

---

## ⚠️ REGRA MAIS IMPORTANTE: DEPLOY

**O código roda em uma VPS, NÃO no PC local de Felipe.**

| Item | Valor |
|------|-------|
| VPS IP | `177.7.47.211` |
| Porta | `3000` |
| Pasta do projeto na VPS | `/opt/pijama-store/` |
| Node.js na VPS | `/root/.nvm/versions/node/v24.15.0/bin/node` |
| Chave SSH | `C:\Users\Felipe\.ssh\id_rsa` |

**Após QUALQUER mudança de código, rodar obrigatoriamente:**
```bash
bash deploy.sh
```
O script sincroniza `src/`, `server.js` e `.env` para a VPS e reinicia o servidor.
**Nunca avisar que está pronto sem ter feito o deploy.**

---

## Pagamento no Site

- **PIX**: chave `plumabv@gmail.com` (JULLY PRISCILA ESCORCIO ROSENDO / CLOUDWALK IP LTDA)
- **Cartão**: link InfinitePay → `https://linknabio.gg/plumapijamas`
- **Frete**: R$ 10,00 fixo para Entrega (motoboy) — zero para Retirada na loja
- Tela de pagamento mostra valor + botão copiar chave PIX + dados da conta ao copiar

## Fotos dos Produtos

Fotos gerenciadas na aba **FOTOS** do Google Sheets — sem precisar de código.
- Formato: `MODELO | COR | IDs` (IDs do Google Drive separados por vírgula)
- Para adicionar foto nova: inserir linha na planilha e salvar
- Cores sem foto ficam ocultas no site automaticamente
- **Cores pendentes de foto**: MIA/preto, MIA/azul marinho, LIA/cinza, NUBIA/cinza, LIVIA/bordô, BEATRIZ/bordô

## Arquitetura

- **Backend**: Node.js + Express em `/opt/pijama-store/` na VPS
- **WhatsApp**: Evolution API em `http://177.7.47.211:32775` (instância: `pijama-store`)
- **IA**: Groq API (llama-3.3-70b) — arquivo `src/config/gemini.js` (nome antigo, mantido por compatibilidade)
- **Banco de dados**: Google Sheets (planilha ID: `1pOcJUpc2A3x_-BoRslSTxw_iF9RndTxcf954YVhwD9U`)
- **Webhook WhatsApp**: configurado para `http://177.7.47.211:3000/api/webhook/whatsapp`
- **Painel admin**: servido em `http://177.7.47.211:3000/admin`

---

## Negócio

- Loja de pijamas femininos em Boa Vista - RR
- **Donos**: Felipe (ADMIN) e Pluma (OPERADOR)
- **Equipe**: Júlly (OPERADOR)
- **Modelos**: ZARA, MIA, LIA, NÚBIA, LÍVIA, BEATRIZ, ANNE
- **Tamanhos**: P, M, G, GG
- **Cores**: azul marinho, preto, bordô, cinza, marrom
- **PIX Pluma**: plumabv@gmail.com

## Números de WhatsApp autorizados
- Felipe: `95981188675`
- Júlly: `95981225668`
- Pluma: `95991268494`

---

## Google Sheets — Abas

| Aba | Uso |
|-----|-----|
| `ESTOQUE` | Inventário por SKU (modelo/tamanho/cor) |
| `PEDIDOS_E_VENDAS` | Todos os pedidos — colunas A-P |
| `CLIENTES` | Cadastro de clientes |
| `CONVERSAS` | Contexto multi-turno por número WhatsApp |

---

## Fluxo de uma mensagem WhatsApp

```
WhatsApp → Evolution API → POST /api/webhook/whatsapp
  → webhook.controller.js
  → conversas.js (processarMensagemComContexto)
    → detecção explícita de "pedidos" (antes do Groq)
    → processarComClaude (Groq AI)
      → sanitizarParaWhatsApp() — NUNCA envia JSON bruto
    → switch(action): criar_pedido | confirmar_pagamento | ...
  → sender.js → Evolution API → WhatsApp
```

---

## Regras do bot

- **Nunca enviar JSON bruto** para o WhatsApp — usar `sanitizarParaWhatsApp()`
- "pedidos" / "manda os pedidos" → `listar_pedidos_abertos` (detecção antes do Groq)
- Criação de pedido: resposta deve incluir o número em destaque (ex: `*Pedido #001*`)
- Confirmar pagamento: `"pedido 5 pago no pix"` → `confirmar_pagamento`
- Saindo entregar: `"saindo entregar pra Maria"` → `saindo_entrega`

---

## Arquivos críticos

| Arquivo | Função |
|---------|--------|
| `src/services/business/conversas.js` | Cérebro do bot — roteamento de intenções |
| `src/controllers/webhook.controller.js` | Recebe webhook, envia resposta ao WhatsApp |
| `src/services/business/pedidos.js` | Lógica de criação/atualização de pedidos |
| `src/services/sheets/pedidos.js` | CRUD de pedidos no Google Sheets |
| `src/config/gemini.js` | Cliente Groq (IA) |
| `src/config/users.js` | Roles e permissões por número WhatsApp |
| `deploy.sh` | **Script de deploy para a VPS** |

---

## Comandos úteis

```bash
# Deploy completo para a VPS
bash deploy.sh

# Ver logs ao vivo na VPS
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "tail -f /opt/pijama-store/logs/combined-$(date +%Y-%m-%d).log"

# Health check
curl http://177.7.47.211:3000/health

# Verificar processo na VPS
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "ps aux | grep 'node /opt/pijama-store' | grep -v grep"
```
