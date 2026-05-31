# 🎬 PLANO VISUAL — VPS Setup em 8 Fases

## 🎯 Meta Final

```
┌─────────────────────────────────────────┐
│  VPS Rodando 24/7                       │
│  • Servidor Node.js (porta 5000)        │
│  • PM2 gerenciando processo             │
│  • Auto-restart se travar               │
│  • Auto-deploy via GitHub webhook       │
│  • Banco SQLite sincronizado            │
│                                         │
│  Cliente acessa:                        │
│  ✅ Site /portal (pedir pijamas)      │
│  ✅ Admin /admin (gerenciar estoque)  │
│  ✅ Bot WhatsApp (automação)          │
│  ✅ API /api (integrações)            │
└─────────────────────────────────────────┘
```

---

## 📍 Onde você está agora

```
PC Local (Seu computador)
   ↓
   └─→ Você edita código
   └─→ git push para GitHub
   └─→ FIM (pode desligar PC)

GitHub (Fonte de verdade)
   ↓
   └─→ Webhook dispara automaticamente

VPS (Servidor 24/7) ← VOCÊ CONFIGURA AGORA
   ↓
   └─→ Deploy automático
   └─→ Servidor reinicia
   └─→ Novo código VIVO em 30 segundos
```

---

## ⏱️ Tempo por Fase

| Fase | O que faz | Tempo | Dificuldade |
|------|-----------|-------|-------------|
| 1 | Instalar Node + PM2 | 5 min | 🟢 Fácil |
| 2 | Clonar repositório | 5 min | 🟢 Fácil |
| 3 | Criar .env | 10 min | 🟡 Médio |
| 4 | npm install | 5 min | 🟢 Fácil |
| 5 | pm2 start | 2 min | 🟢 Fácil |
| 6 | Testar servidor | 1 min | 🟢 Fácil |
| 7 | Webhook GitHub | 5 min | 🟡 Médio |
| 8 | Banco de dados | 1 min | 🟢 Fácil |
| **TOTAL** | | **34 min** | |

---

## 🔄 FASE 1: Preparar VPS

### O que você faz
1. Conecta no VPS via SSH
2. Verifica se Node.js v20+ está instalado
3. Instala PM2 (mantém servidor rodando)
4. Configura PM2 para iniciar automaticamente no reboot

### Comando resumido
```bash
ssh root@177.7.47.211
node --version              # v20+?
sudo npm install -g pm2
pm2 startup && pm2 save
```

### Como saber se funcionou
```bash
pm2 --version              # Deve mostrar versão
node --version             # v20.x.x ou superior
```

---

## 🔄 FASE 2: Clonar Repositório

### O que você faz
1. Cria chave SSH no VPS (para clonar sem senha)
2. Adiciona chave pública no GitHub
3. Clona repositório

### Comando resumido
```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub         # Copiar
# Ir para GitHub → Settings → SSH keys → Add key → Colar

mkdir -p /opt/pijama-store && cd /opt/pijama-store
git clone git@github.com:uplinktec-gif/pijama-store-backend.git .
```

### Como saber se funcionou
```bash
ls /opt/pijama-store
# Deve ter: src/, public/, .git, package.json, etc.
```

---

## 🔄 FASE 3: Criar Arquivo .env

### O que você faz
1. Abre editor nano
2. Copia variáveis de ambiente
3. Substitui valores em `<>` com valores reais
4. Salva arquivo

### Valores que você precisa (pedir a Felipe)
```
EVOLUTION_API_KEY         (WhatsApp)
ANTHROPIC_API_KEY         (Claude)
WHATSAPP_VERIFY_TOKEN     (Webhook)
NUMERO_FELIPE, etc.       (Contatos)
```

### Valores que você gera
```
CLIENTE_SESSION_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
GITHUB_WEBHOOK_SECRET  = mesmo processo acima
```

### Comando resumido
```bash
nano /opt/pijama-store/.env
# Colar conteúdo do PROXIMOS_PASSOS.md
# Salvar: Ctrl+O, Enter, Ctrl+X
```

### Como saber se funcionou
```bash
cat /opt/pijama-store/.env | grep EVOLUTION_API_KEY
# Deve mostrar seu valor
```

---

## 🔄 FASE 4: npm install

### O que você faz
Baixa todas as dependências Node.js do projeto

### Comando
```bash
cd /opt/pijama-store
npm install --production
```

### Como saber se funcionou
```bash
ls -la node_modules | head
# Deve ter muitos diretórios (centenas de pacotes)
```

---

## 🔄 FASE 5: Iniciar Servidor

### O que você faz
1. Inicia servidor com PM2
2. PM2 vai manter rodando 24/7
3. Se travar, reinicia automaticamente

### Comando
```bash
pm2 start server.js --name "pijama-store" --env production
pm2 status
pm2 logs pijama-store    # Ver logs (Ctrl+C para sair)
```

### Como saber se funcionou
```bash
pm2 status
# Deve mostrar: pijama-store | online | fork | ...
```

---

## 🔄 FASE 6: Testar Servidor

### O que você faz
Verifica se servidor está respondendo

### Comando
```bash
curl http://localhost:5000/health
```

### Resultado esperado
```json
{
  "status": "ok",
  "timestamp": "2026-05-24T...",
  "environment": "production"
}
```

---

## 🔄 FASE 7: GitHub Webhook (Auto-Deploy)

### O que você faz
1. Cria script de deploy no VPS
2. Configura webhook no GitHub
3. Próximo `git push` = auto-deploy no VPS

### Comando para criar script
```bash
cat > /opt/pijama-store/deploy.sh << 'EOF'
#!/bin/bash
set -e
echo "[$(date)] Deploy..."
cd /opt/pijama-store
git fetch origin && git reset --hard origin/main
npm install --production
pm2 restart pijama-store
echo "[$(date)] Done!"
EOF

chmod +x /opt/pijama-store/deploy.sh
/opt/pijama-store/deploy.sh    # Testar
```

### Configurar GitHub (via browser)
1. Ir para: https://github.com/uplinktec-gif/pijama-store-backend/settings/hooks
2. Clicar "Add webhook"
3. Preencher:
   - **Payload URL:** `http://177.7.47.211:5000/api/deploy/github`
   - **Content type:** `application/json`
   - **Secret:** Cole valor de `GITHUB_WEBHOOK_SECRET` do `.env`
   - **Events:** Selecionar "Push events"
4. Clicar "Add webhook"

### Como saber se funcionou
- Webhook deve mostrar status ✓ verde
- Quando você faz `git push`, deploy acontece automaticamente

---

## 🔄 FASE 8: Banco de Dados

### Opção A: Você tem banco recente no PC
```bash
# NO SEU PC (PowerShell)
scp C:\Users\Felipe\pijama-store-backend\data\pijama-store.db root@177.7.47.211:/opt/pijama-store/data/
```

### Opção B: Deixar servidor criar
```bash
# NO VPS
mkdir -p /opt/pijama-store/data
pm2 restart pijama-store
```

### Como saber se funcionou
```bash
# NO VPS
ls -lah /opt/pijama-store/data/pijama-store.db
# Deve existir com tamanho > 100KB
```

---

## ✅ DEPOIS QUE TUDO ESTIVER PRONTO

### Você terá
```
✅ Servidor rodando 24/7 (VPS)
✅ Auto-restart se travar
✅ Auto-deploy via GitHub
✅ Banco sincronizado
✅ 4 consumidores conectados:
   - Bot WhatsApp
   - Site /portal
   - Admin /admin
   - API /api/store
```

### Seu novo fluxo de trabalho
```
1. Edita código no PC
2. git push
3. GitHub webhook ativa
4. VPS auto-deploys em 30 seg
5. Novo código VIVO
6. PC pode desligar!
```

---

## 🆘 Problemas Comuns

| Problema | Solução |
|----------|---------|
| "Command not found: node" | FASE 1: Instalar Node.js |
| "Port 5000 in use" | `sudo lsof -i :5000` → `kill -9 <PID>` |
| "git clone fails" | FASE 2: Adicionar SSH key no GitHub |
| "pm2 status shows 'stopped'" | `pm2 logs pijama-store -n 100` → ver erro |
| ".env não encontrado" | FASE 3: Confirmar `nano .env` foi salvo |

---

## 📋 CHECKLIST ANTES DE COMEÇAR

- [ ] Você tem acesso SSH: `ssh root@177.7.47.211` funciona?
- [ ] Você tem os valores de Felipe:
  - [ ] EVOLUTION_API_KEY
  - [ ] ANTHROPIC_API_KEY
  - [ ] WHATSAPP_VERIFY_TOKEN
- [ ] Você tem os números WhatsApp (Felipe + Jully + Pluma)
- [ ] Você tem o arquivo `PROXIMOS_PASSOS.md` para referência
- [ ] Você está conectado à internet
- [ ] Seu terminal está aberto

---

## 🚀 PRONTO?

Se tudo acima faz sentido, está pronto para começar!

### Próximas ações (você faz):

1. **FASE 1-8:** Executar as 8 fases conforme acima
2. **Avisar quando terminar:** "VPS setup concluído"
3. **Continuamos com PASSO 2:** Sincronização de dados entre bot, site, admin, api

### Tempo total: ~35 minutos

**LET'S GO! 🚀**

