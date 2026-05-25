# ⚡ Próximos Passos - Ação Imediata Necessária

## 📋 O Que Foi Feito

✅ **PASSO 1 CONCLUÍDO**: Configuração de Segurança (CORS, session secret, test endpoint)

### Mudanças já no GitHub:
- CORS restrito a domínios conhecidos em produção
- Session secret obrigatório em produção
- Test endpoint protegido (desenvolvimento apenas)
- Cookies mais seguros (sameSite='lax')

**Link para ver mudanças:** https://github.com/uplinktec-gif/pijama-store-backend/commits/main

---

## 🚀 PRÓXIMOS PASSOS (Você Faz No VPS)

### ANTES DE COMEÇAR
Você tem acesso SSH ao VPS?
```bash
ssh root@177.7.47.211
```

Se NÃO conseguir conectar, PARE aqui e configure SSH primeiro.

---

### PASSO A-1: Preparar o VPS (15 minutos)

Se já tem Node.js instalado, pule para A-2.

```bash
# Conectar no VPS
ssh root@177.7.47.211

# Verificar se Node.js existe
node --version
npm --version

# Se não existir (ou versão < 18), instalar Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Confirmar
node --version  # Deve ser v20.x.x ou superior
```

---

### PASSO A-2: Instalar PM2 (5 minutos)

PM2 mantém o servidor rodando 24/7.

```bash
sudo npm install -g pm2

# Confirmar
pm2 --version

# Configurar para auto-start no reboot
pm2 startup
# Executar o comando que aparecer (geralmente começa com sudo)

# Exemplo (copiar e executar a saída do comando acima):
sudo /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

---

### PASSO A-3: Clonar Repositório (5 minutos)

```bash
# Se ainda não tem SSH key do VPS no GitHub, criar
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

# Mostrar chave pública
cat ~/.ssh/id_ed25519.pub
```

**IMPORTANTE**: Copiar a chave pública acima e adicionar em GitHub:
- Ir para: https://github.com/settings/ssh/new
- Colar a chave
- Clicar "Add SSH key"

Depois continuar:

```bash
# Criar diretório
mkdir -p /opt/pijama-store
cd /opt/pijama-store

# Clonar repositório
git clone git@github.com:uplinktec-gif/pijama-store-backend.git .

# Verificar
git status  # Deve estar em 'main' e updated
```

---

### PASSO A-4: Configurar Variáveis de Ambiente (10 minutos)

```bash
# Editar arquivo .env
nano /opt/pijama-store/.env
```

**Copiar e colar isto no editor:**

```env
# Ambiente
NODE_ENV=production
PORT=5000

# Evolution API (pedir valores a Felipe)
EVOLUTION_API_URL=http://177.7.47.211:32775
EVOLUTION_API_KEY=<PEDIR_A_FELIPE>
EVOLUTION_INSTANCE=pijama-store

# Claude API (pedir valor a Felipe)
ANTHROPIC_API_KEY=<PEDIR_A_FELIPE>

# WhatsApp Webhook (pedir valor a Felipe)
WHATSAPP_VERIFY_TOKEN=<PEDIR_A_FELIPE>

# Autenticação de Sessão (OBRIGATÓRIO em produção)
# Gerar valor aleatório executando no terminal:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CLIENTE_SESSION_SECRET=<GERAR_ALEATORIAMENTE_VEJA_ACIMA>

# Admin Panel
ADMIN_ALLOWED_IPS=127.0.0.1,::1,177.7.47.211
ADMIN_TOKEN=<OPCIONAL_PEDIR_A_FELIPE>

# Banco de dados
DB_PATH=/opt/pijama-store/data/pijama-store.db

# Catálogo (modelos de pijama)
CATALOG_MODELS=Anne,Lia,Lívia,Mia,Núbia,Zara
CATALOG_SIZES=P,M,G,GG
CATALOG_COLORS=Branco,Preto,Roxo,Rosa,Azul,Vermelho

# Números WhatsApp (pedir a Felipe)
AUTHORIZED_WHATSAPP_NUMBERS=95981188675,95981225668,95991268494
NUMERO_FELIPE=95981188675
NUMERO_JULLY=95981225668
NUMERO_PLUMA=95991268494

# Preços (em BRL)
MODEL_PRICES={"Anne": 79.90, "Lia": 79.90, "Lívia": 79.90, "Mia": 79.90, "Núbia": 79.90, "Zara": 79.90}

# Logs
LOG_LEVEL=info

# GitHub Webhook Secret (gerar aleatoriamente, mesmo processo acima)
GITHUB_WEBHOOK_SECRET=<GERAR_ALEATORIAMENTE>
```

**Salvar e sair:**
- Se usando `nano`: Ctrl+O (salvar), Enter, Ctrl+X (sair)
- Se usando `vi`: `:wq`

**Verificar que foi criado:**
```bash
cat /opt/pijama-store/.env | head -5
```

---

### PASSO A-5: Instalar Dependências (5 minutos)

```bash
cd /opt/pijama-store
npm install --production
```

---

### PASSO A-6: Iniciar o Servidor (2 minutos)

```bash
# Iniciar com PM2
pm2 start server.js --name "pijama-store" --env production

# Confirmar que está rodando
pm2 status
# Deve mostrar: pijama-store | online | fork

# Ver logs
pm2 logs pijama-store
# Deve mostrar: "✓ Servidor rodando em http://localhost:5000"
```

---

### PASSO A-7: Testar se Servidor Está Vivo (1 minuto)

```bash
# De dentro do VPS
curl http://localhost:5000/health

# Deve retornar JSON:
# {"status":"ok","timestamp":"...","environment":"production"}

# Se não funcionar, ver logs:
pm2 logs pijama-store -n 50
```

---

### PASSO A-8: Copiar Banco de Dados (1 minuto)

Você tem um banco de dados existente no VPS em `/opt/pijama-store/data/pijama-store.db`?

```bash
# Verificar
ls -lah /opt/pijama-store/data/pijama-store.db

# Se existe e tem tamanho > 100KB, OK
# Se não existe ou é vazio, precisamos criar
```

Se o banco está vazio, você pode:

**Opção 1: Copiar do PC local (se tiver arquivo recente)**
```bash
# No seu PC local (PowerShell)
scp C:\Users\Felipe\pijama-store-backend\data\pijama-store.db root@177.7.47.211:/opt/pijama-store/data/
```

**Opção 2: Deixar ser criado vazio (servidor vai criar estrutura automaticamente)**
```bash
# No VPS
mkdir -p /opt/pijama-store/data

# Servidor vai criar pijama-store.db automaticamente ao iniciar
pm2 restart pijama-store
```

---

### PASSO A-9: Configurar Auto-Start no Reboot (1 minuto)

```bash
# No VPS
pm2 save
pm2 startup

# Copiar e executar o comando que aparecer
# Exemplo (PODE SER DIFERENTE):
sudo /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

---

### PASSO A-10: Configurar GitHub Webhook (Optional, mas Recomendado)

Isto faz deploy automático quando você faz `git push`.

**Opção A: Com Webhook (automático)**

1. No VPS, criar arquivo `/opt/pijama-store/deploy.sh`:

```bash
# No VPS
cat > /opt/pijama-store/deploy.sh << 'EOF'
#!/bin/bash
set -e
echo "[$(date)] Iniciando deploy..."
cd /opt/pijama-store
git fetch origin
git reset --hard origin/main
npm install --production
pm2 restart pijama-store
echo "[$(date)] Deploy finalizado!"
EOF

chmod +x /opt/pijama-store/deploy.sh

# Testar
/opt/pijama-store/deploy.sh
```

2. No seu PC local, editar `src/app.js` e adicionar rota de webhook:

```javascript
// Adicionar após imports
import { exec } from 'child_process';

// Adicionar após registrar as outras rotas
app.post('/api/deploy/github', (req, res) => {
  const token = req.headers['x-webhook-token'];
  if (token !== process.env.GITHUB_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  exec('/opt/pijama-store/deploy.sh', (error, stdout) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Deploy iniciado' });
  });
});
```

3. Fazer `git push`:
```bash
git add src/app.js
git commit -m "feat: add GitHub webhook endpoint for auto-deploy"
git push origin main
```

4. No GitHub, adicionar webhook:
- Ir para: https://github.com/uplinktec-gif/pijama-store-backend/settings/hooks
- Clicar "Add webhook"
- **Payload URL**: `http://177.7.47.211:5000/api/deploy/github`
- **Content type**: `application/json`
- **Secret**: Cole o valor de `GITHUB_WEBHOOK_SECRET` do `.env`
- **Events**: Selecionar apenas "Push events"
- Clicar "Add webhook"

**Opção B: Com Cron Job (a cada 5 minutos)**

```bash
# No VPS
crontab -e

# Adicionar linha:
*/5 * * * * /opt/pijama-store/deploy.sh >> /var/log/pijama-deploy.log 2>&1
```

---

## ✅ Checklist de Conclusão

Depois de completar A-1 até A-10, você deve ter:

- [ ] SSH acesso ao VPS funciona
- [ ] Node.js 20+ instalado
- [ ] PM2 instalado e configurado
- [ ] Repositório clonado em `/opt/pijama-store`
- [ ] Arquivo `.env` preenchido
- [ ] `npm install` executou sem erros
- [ ] Servidor rodando: `pm2 status` mostra "online"
- [ ] Health check funciona: `curl http://localhost:5000/health`
- [ ] PM2 configurado para auto-start
- [ ] GitHub webhook ou cron job configurado
- [ ] Banco de dados sincronizado

---

## 🎯 Depois de Fazer Setup do VPS

Avise quando terminar A-1 até A-10, e vamos para:

**PASSO 2: Sincronização de Dados entre Consumidores**

Isto vai verificar:
1. ✅ Bot WhatsApp acessa dados corretos
2. ✅ Site /portal mostra estoque atualizado
3. ✅ Admin Panel consegue gerenciar tudo
4. ✅ Pedidos criados no bot aparecem no admin em tempo real

---

## 📞 Se Algo Não Funcionar

1. Ver logs: `pm2 logs pijama-store -n 100`
2. Testar manualmente: `curl http://localhost:5000/health`
3. Verificar variáveis: `cat /opt/pijama-store/.env | grep ANTHROPIC`
4. Verificar porta: `sudo lsof -i :5000`

Se ficar travado, comunique o erro exato dos logs. Vou ajudar a resolver.

