# 🚀 Configuração de Deployment no VPS - Pijama Store

## 📋 Visão Geral

O servidor no VPS (`177.7.47.211`) será o **servidor de produção 24/7**. O PC local é apenas para desenvolvimento. Qualquer mudança é feita via Git push → Git pull no VPS → Auto-restart.

---

## ✅ PRÉ-REQUISITOS (Validar com Felipe)

Você tem acesso SSH ao VPS?

```bash
ssh root@177.7.47.211
```

Se sim, continue. Se não, você precisa de:
1. Chave SSH pública/privada configurada
2. Permissão do provedor VPS

---

## 🔧 FASE 1: Preparação do VPS

### 1.1 Conectar no VPS

```bash
ssh root@177.7.47.211
```

### 1.2 Instalar Node.js (se não tiver)

```bash
# Verificar se Node.js está instalado
node --version
npm --version

# Se não estiver, instalar Node 20+ (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalação
node --version  # v20.x.x ou superior
```

### 1.3 Instalar PM2 (gerenciador de processos)

PM2 mantém o servidor rodando 24/7, reinicia se travar, e auto-inicia após reboot.

```bash
sudo npm install -g pm2
pm2 --version  # confirmar

# Configurar PM2 para auto-start no boot
pm2 startup
# Executar o comando que PM2 sugerir (geralmente com 'sudo')
```

### 1.4 Criar diretório de aplicação

```bash
mkdir -p /opt/pijama-store
cd /opt/pijama-store
```

---

## 📥 FASE 2: Clonar Repositório do GitHub

### 2.1 Gerar Chave SSH para o VPS (se ainda não tiver)

Para clonar via SSH sem digitar senha toda vez:

```bash
# Gerar par de chaves
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Copiar a saída pública e adicionar em GitHub → Settings → SSH and GPG keys → New SSH key.

### 2.2 Clonar o repositório

```bash
cd /opt/pijama-store
git clone git@github.com:uplinktec-gif/pijama-store-backend.git .
# O ponto (.) clona direto no diretório atual
```

### 2.3 Verificar clonagem

```bash
ls -la
# Deve ver: src/, public/, .git, package.json, etc.

git status  # Deve estar em 'main' e updated
```

---

## 🔐 FASE 3: Variáveis de Ambiente

### 3.1 Criar arquivo `.env` no VPS

```bash
cd /opt/pijama-store
nano .env  # ou vi, ou seu editor favorito
```

### 3.2 Preencher as variáveis obrigatórias

```bash
# Ambiente
NODE_ENV=production
PORT=5000

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://177.7.47.211:32775
EVOLUTION_API_KEY=<sua_chave_evolution>
EVOLUTION_INSTANCE=pijama-store

# Claude API
ANTHROPIC_API_KEY=<sua_chave_anthropic>

# WhatsApp Webhook
WHATSAPP_VERIFY_TOKEN=<seu_token_webhook>

# Autenticação de Sessão (OBRIGATÓRIO em produção)
CLIENTE_SESSION_SECRET=<gerar_chave_aleatoria_forte>

# Admin Panel (opcional, recomendado)
ADMIN_ALLOWED_IPS=127.0.0.1,::1,177.7.47.211
ADMIN_TOKEN=<seu_token_admin>

# Banco de dados
DB_PATH=/opt/pijama-store/data/pijama-store.db

# Catálogo (exemplo)
CATALOG_MODELS=Anne,Lia,Lívia,Mia,Núbia,Zara
CATALOG_SIZES=P,M,G,GG
CATALOG_COLORS=Branco,Preto,Roxo,Rosa,Azul,Vermelho

# Números WhatsApp autorizados
AUTHORIZED_WHATSAPP_NUMBERS=95981188675,95981225668,95991268494
NUMERO_FELIPE=95981188675
NUMERO_JULLY=95981225668
NUMERO_PLUMA=95991268494

# Preços
MODEL_PRICES={"Anne": 79.90, "Lia": 79.90, "Lívia": 79.90, "Mia": 79.90, "Núbia": 79.90, "Zara": 79.90}

# Log
LOG_LEVEL=info
```

**Para gerar uma chave aleatória forte:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Salvar e sair

```bash
# Se usando nano: Ctrl+O (salvar), Enter, Ctrl+X (sair)
# Se usando vi: :wq (salvar e sair)
```

### 3.4 Verificar arquivo

```bash
cat .env | head -10  # confirmar que foi criado
```

---

## 📦 FASE 4: Instalar Dependências e Iniciar

### 4.1 Instalar npm packages

```bash
cd /opt/pijama-store
npm install --production
# --production evita instalar devDependencies desnecessários
```

### 4.2 Iniciar com PM2

```bash
pm2 start server.js --name "pijama-store" --env production
```

### 4.3 Verificar se está rodando

```bash
pm2 status  # Deve mostrar 'pijama-store' com status 'online'
pm2 logs pijama-store  # Ver últimas linhas de log
```

### 4.4 Configurar PM2 para auto-start

```bash
pm2 startup
# Copiar e executar o comando que aparecer (geralmente com sudo)

pm2 save
# Salvar lista de processos
```

Agora, se o VPS reiniciar, PM2 automaticamente inicia o servidor.

---

## 🔄 FASE 5: Auto-Deployment via Git Webhook

### Objetivo
Quando você fazer `git push` no seu PC local → GitHub automaticamente puxa a mudança no VPS, instala dependências, e reinicia o servidor.

### Opção A: GitHub Webhook (Recomendado)

#### 5A.1 Criar script de deployment

No VPS, criar arquivo `/opt/pijama-store/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "[$(date)] Iniciando deploy..."

cd /opt/pijama-store

# Fazer pull das mudanças
git fetch origin
git reset --hard origin/main
echo "[$(date)] Git pull concluído"

# Instalar dependências
npm install --production
echo "[$(date)] npm install concluído"

# Restart com PM2
pm2 restart pijama-store
echo "[$(date)] PM2 restart concluído"

# Log final
echo "[$(date)] Deploy finalizado com sucesso!"
```

Tornar executável:
```bash
chmod +x /opt/pijama-store/deploy.sh
```

#### 5A.2 Criar endpoint de webhook no Express

Adicionar rota em `src/routes/deploy.routes.js`:

```javascript
import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

router.post('/github', async (req, res) => {
  // Verificar token (simples, usar X-Hub-Signature em produção real)
  const token = req.headers['x-webhook-token'];
  if (token !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    await execAsync('/opt/pijama-store/deploy.sh');
    res.json({ success: true, message: 'Deploy iniciado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

Registrar em `src/app.js`:
```javascript
import deployRoutes from './routes/deploy.routes.js';
app.use('/api/deploy', deployRoutes);
```

#### 5A.3 Configurar webhook no GitHub

1. Ir para: `https://github.com/uplinktec-gif/pijama-store-backend/settings/hooks`
2. Clicar em "Add webhook"
3. Preencher:
   - **Payload URL**: `https://177.7.47.211:5000/api/deploy/github`
   - **Content type**: `application/json`
   - **Secret**: Mesmo valor de `GITHUB_WEBHOOK_SECRET` no `.env` do VPS
   - **Events**: Selecionar apenas "Push events"
4. Clicar "Add webhook"

### Opção B: Cron Job (Se Webhook não funcionar)

Atualizar a cada 5 minutos via cron:

```bash
# No VPS
crontab -e

# Adicionar linha:
*/5 * * * * /opt/pijama-store/deploy.sh >> /var/log/pijama-deploy.log 2>&1
```

Isto verifica GitHub a cada 5 minutos e faz deploy se houver mudanças.

---

## 🧪 FASE 6: Testar Deployment

### 6.1 Fazer uma mudança simples no PC local

```bash
# No seu PC local
cd C:\Users\Felipe\pijama-store-backend

# Fazer uma mudança simples (ex: comentário em um arquivo)
echo "# teste" >> README.md

# Commit e push
git add README.md
git commit -m "teste: verificar auto-deploy"
git push origin main
```

### 6.2 Verificar se o webhook foi acionado

No GitHub: Settings → Webhooks → recente → Mostrar delivery.
Deve mostrar status verde (200).

### 6.3 Verificar VPS

```bash
ssh root@177.7.47.211

# Ver logs
pm2 logs pijama-store

# Verificar se servidor está rodando
curl http://localhost:5000/health
```

Esperado:
```json
{ "status": "ok", "timestamp": "...", "environment": "production" }
```

---

## 🌐 FASE 7: Expor o Servidor Publicamente

### Opção A: Usar ngrok/Tunnelo (Temporário, para testes)

```bash
# No VPS
ngrok http 5000
# Ou: tunnelo http 5000
```

Isto dá um URL público tipo `https://abc123.ngrok.io`.

### Opção B: Domain + Reverse Proxy (Produção)

Se tem domínio `plumapijamas.com.br`:

Instalar Nginx no VPS:
```bash
sudo apt-get install -y nginx
```

Configurar `/etc/nginx/sites-available/pijama`:
```nginx
server {
    listen 80;
    server_name plumapijamas.com.br www.plumapijamas.com.br;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Ativar:
```bash
sudo ln -s /etc/nginx/sites-available/pijama /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📊 FASE 8: Monitoramento Contínuo

### 8.1 Ver status do servidor

```bash
ssh root@177.7.47.211
pm2 status
pm2 logs pijama-store  # últimas linhas
```

### 8.2 Reiniciar manualmente (se necessário)

```bash
pm2 restart pijama-store
pm2 stop pijama-store
pm2 start pijama-store
```

### 8.3 Ver uso de memória/CPU

```bash
pm2 monit  # monitir em tempo real
```

---

## 🔄 Workflow de Desenvolvimento → Produção

Após setup:

1. **No PC local**: Fazer mudanças no código
2. **No PC local**: `git push origin main`
3. **Automático**: GitHub webhook dispara → VPS executa `/deploy.sh`
4. **No VPS**: Servidor reinicia com novo código
5. **Clientes**: Recebem atualizações imediatamente

Nenhuma sincronização manual. VPS é a fonte de verdade 24/7.

---

## ⚠️ Troubleshooting

### Servidor não inicia

```bash
pm2 logs pijama-store -n 50  # ver últimas 50 linhas
```

Procurar por erros como:
- `ENOENT` (arquivo não encontrado) → Conferir caminhos em .env
- `EADDRINUSE` → Porta 5000 já está em uso
- `Module not found` → npm install não funcionou corretamente

### Webhook não funciona

1. Verificar se .env tem `GITHUB_WEBHOOK_SECRET`
2. Testar manualmente: `curl -X POST http://localhost:5000/api/deploy/github -H "x-webhook-token: VALOR"`
3. Se ngrok/tunnelo, conferir URL pública está ativa

### Banco de dados vazio

Se o `.db` foi copiado mas está vazio:
```bash
ls -lah /opt/pijama-store/data/pijama-store.db
# Deve ter tamanho > 100KB
```

Se vazio, copiar do backup:
```bash
cp /opt/pijama-store/backups/latest/pijama-store.db /opt/pijama-store/data/
pm2 restart pijama-store
```

---

## ✅ Checklist Final

- [ ] SSH acesso ao VPS funciona
- [ ] Node.js 20+ instalado no VPS
- [ ] PM2 instalado e configurado
- [ ] Git repositório clonado em `/opt/pijama-store`
- [ ] `.env` criado com todas as variáveis
- [ ] `npm install` executado
- [ ] Servidor rodando via `pm2 start`
- [ ] `/health` retorna JSON
- [ ] Webhook GitHub configurado (ou cron job)
- [ ] Teste de deploy funciona
- [ ] Monitoramento em tempo real via `pm2 logs`

---

## 🎯 Próximas Fases

1. **PASSO 2**: Sincronização de dados (estoque, pedidos, etc.) entre os 4 consumidores
2. **PASSO 3**: Testes de integridade da ordem
3. **PASSO 4**: Otimizações de bot WhatsApp
4. **PASSO 5**: Monitoramento e alertas 24/7

