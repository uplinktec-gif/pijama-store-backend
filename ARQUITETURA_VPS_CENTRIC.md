# 🏗️ Nova Arquitetura: VPS como Servidor Primário

## 🔄 O que Mudou

### ❌ Arquitetura Antiga (Descartada)
```
PC Local (desligado frequentemente)
    ↓ SSH/SCP sync (esporádico)
    ↓
VPS (passivo, recebe dados)
```

**Problemas:**
- PC local sempre desligado → sem sincronização
- Sincronização manual via script SSH/SCP
- Dados podem ficar desincronizados
- VPS depende de PC local para atualizações
- Não funciona em produção 24/7

---

### ✅ Nova Arquitetura (Atual)
```
GitHub Repository (fonte de verdade)
    ↑ git push (seu PC local)
    ↓ git webhook
VPS 177.7.47.211 (servidor primário 24/7)
    ├─ Node.js + Express (porta 5000)
    ├─ SQLite (dados locais)
    ├─ PM2 (auto-restart, auto-start no boot)
    ├─ Nginx (reverse proxy, HTTPS)
    └─ Banco de dados sincronizado
        ↓
        ├─ Site /portal (clientes)
        ├─ Bot WhatsApp (Evolution API)
        ├─ Admin Panel /admin (gestão)
        └─ API de Vendas /api/store
```

**Vantagens:**
- VPS roda 24/7 independentemente do PC local
- Deployments automáticos via Git webhook
- Uma fonte de verdade (GitHub main branch)
- Sem sincronização manual
- Escalável, profissional, confiável
- Monitorado continuamente

---

## 📊 Fluxo de Trabalho

### Desenvolvimento (seu PC local)
```
1. Fazer mudanças no código
2. git add / git commit / git push origin main
3. GitHub recebe o push
```

### Deployment Automático (VPS)
```
1. GitHub webhook dispara
2. VPS executa /deploy.sh
3. git pull, npm install, pm2 restart
4. Novo código está vivo em 30 segundos
5. Clientes acessam versão atualizada imediatamente
```

### Monitoramento (contínuo)
```
ssh root@177.7.47.211
pm2 logs pijama-store  # ver logs em tempo real
pm2 status            # status do servidor
pm2 monit             # uso de CPU/memória
```

---

## 🔒 Segurança

Todas as variáveis sensíveis estão em `.env` no VPS:
- `ANTHROPIC_API_KEY` (Claude)
- `EVOLUTION_API_KEY` (WhatsApp)
- `CLIENTE_SESSION_SECRET` (sessões)
- `GITHUB_WEBHOOK_SECRET` (webhook)

**Nenhum dado sensível fica no GitHub** (arquivo `.env` é ignorado por `.gitignore`).

---

## 📍 URLs de Acesso

### Produção (VPS)
- **Site**: `http://177.7.47.211:5000/` (ou com domínio)
- **Portal do Cliente**: `http://177.7.47.211:5000/portal`
- **Admin Panel**: `http://177.7.47.211:5000/admin`
- **API**: `http://177.7.47.211:5000/api/`
- **Health Check**: `http://177.7.47.211:5000/health`
- **Webhook WhatsApp**: `http://177.7.47.211:5000/api/webhook/whatsapp`

### Desenvolvimento (seu PC)
- **Site**: `http://localhost:5000/`
- **Portal do Cliente**: `http://localhost:5000/portal`
- **Admin Panel**: `http://localhost:5000/admin`
- **API**: `http://localhost:5000/api/`

---

## 🚀 Próximas Etapas

### PASSO 2 (Em Desenvolvimento)
**Sincronização de Dados entre Consumidores**

Objetivo: Garantir que estoque, pedidos e clientes estejam sempre sincronizados entre:
1. ✅ Bot WhatsApp (recebe e cria pedidos)
2. ✅ Site /portal (clientes visualizam/compram)
3. ✅ Admin Panel (gerencia estoque)
4. ✅ API /api/store (consultas externas)

**Verificação:**
- Pedido criado no bot → aparece no admin em tempo real
- Estoque atualizado no admin → reflete imediatamente no site
- Cliente do portal → consegue ver seus pedidos

### PASSO 3 (Próximo)
**Teste de Integridade da Ordem Completa**

Fluxo completo:
1. Cliente envia mensagem WhatsApp
2. Bot processa e cria pedido
3. Estoque é reservado
4. Admin pode gerenciar entrega
5. Cliente recebe notificação

### PASSO 4 (Otimizações)
**Melhorias de Performance**

- Fast-path do bot (evita Claude em 80% dos casos)
- Cache de estoque
- Retry automático em falhas
- Alertas de estoque crítico

### PASSO 5 (Monitoramento)
**Sistema 24/7 Resiliente**

- Health checks automáticos
- Alertas por email/WhatsApp
- Logs centralizados
- Backup automático de banco de dados
- Recovery em caso de falha

---

## 📝 Checklist de Setup VPS

Antes de continuar com PASSO 2, confirme que tem:

- [ ] Acesso SSH ao VPS funciona: `ssh root@177.7.47.211`
- [ ] Node.js 20+ instalado: `node --version`
- [ ] PM2 instalado: `pm2 --version`
- [ ] Repositório clonado: `/opt/pijama-store` existe
- [ ] `.env` preenchido com todas as variáveis
- [ ] Servidor rodando: `pm2 status` mostra "online"
- [ ] Health check funciona: `curl http://localhost:5000/health`
- [ ] Webhook GitHub configurado (ou cron job)
- [ ] Banco de dados sincronizado (26 itens de estoque)

**Ver `VPS_DEPLOYMENT_SETUP.md` para instruções passo a passo.**

---

## 🎯 Objetivo Final

**Um sistema de vendas escalável, profissional e 24/7 que funciona sem intervenção do PC local.**

- ✅ VPS roda independentemente
- ✅ Deployments automáticos via Git
- ✅ Dados sincronizados entre 4 consumidores
- ✅ Monitoramento contínuo
- ✅ Backups automáticos
- ✅ Pronto para crescimento

