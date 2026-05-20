# Portal do Cliente - Guia de Deploy

## 📦 O que foi criado

### Backend (Node.js/Express)
- ✅ 5 endpoints API em `/api/cliente/*`
- ✅ Autenticação por CPF com JWT
- ✅ Sessões sem expiração (sessionStorage)
- ✅ Integração com Google Sheets
- ✅ Recomendações personalizadas com Claude/Gemini

### Frontend (HTML/CSS/JavaScript)
- ✅ Página de login (CPF apenas)
- ✅ Dashboard com pedidos, perfil, recomendações
- ✅ Modal de detalhes de pedido
- ✅ Modal de perfil
- ✅ Formulário "Fale Conosco"
- ✅ Design mobile-first responsivo
- ✅ Sem dependências JavaScript (vanilla JS)

### Arquivos Criados
```
public/portal/
├── index.html (25 linhas)
├── css/
│   └── style.css (700 linhas)
└── js/
    ├── utils.js (200 linhas)
    ├── auth.js (150 linhas)
    └── dashboard.js (450 linhas)

src/
├── controllers/
│   └── cliente.controller.js (371 linhas) ✏️ MODIFICADO
├── routes/
│   └── cliente.routes.js (45 linhas) ✨ NOVO
├── middleware/
│   └── clienteAuth.js (40 linhas) ✨ NOVO
├── utils/
│   └── sessionTokens.js (60 linhas) ✨ NOVO
└── services/sheets/
    ├── clientes.js (476 linhas) ✏️ MODIFICADO
    └── suporte.js (120 linhas) ✨ NOVO

server.js ✏️ MODIFICADO
app.js ✏️ MODIFICADO
.env ✏️ MODIFICADO
```

---

## 🔧 Dependências de Produção

**Já instaladas?** Verificar com:
```bash
npm ls | grep -E "(express|googleapis|@anthropic-ai|axios)"
```

**Dependências necessárias** (já deve estar em package.json):
- `express` ^4.18.0
- `googleapis` ^118.0.0
- `@anthropic-ai/sdk` (ou apenas use `callAI` do gemini.js)
- `axios` ^1.7.0
- `dotenv` ^16.4.0
- `uuid` ^9.0.0
- `winston` ^3.13.0

---

## 🚀 Deploy Local (Teste)

### 1. Preparar Ambiente
```bash
cd C:\Users\Felipe\pijama-store-backend

# Copiar .env se não existir
copy .env.example .env

# Verificar variáveis críticas no .env
# CLIENTE_SESSION_SECRET=pluma-cliente-session-2025
# GOOGLE_SHEETS_ID=seu_id_aqui
# GEMINI_API_KEY ou ANTHROPIC_API_KEY
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Rodar Servidor
```bash
npm run dev
```

**Esperado:**
```
✓ Servidor rodando em http://localhost:3000
✓ Ambiente: development
✓ Google Sheets inicializado
✓ Portal do Cliente disponível em http://localhost:3000/portal
```

### 4. Testar
- Abrir `http://localhost:3000/portal`
- Fazer login com CPF de teste
- Seguir guia em `PORTAL_TESTING.md`

---

## 🌐 Deploy em Produção (VPS)

### 1. Preparar VPS

**Conexão SSH:**
```bash
ssh root@177.7.47.211
```

**Verificar espaço:**
```bash
df -h
```

### 2. Copiar Código para VPS

**Opção A: Git (recomendado)**
```bash
# No VPS
cd /home/pijama-store
git clone https://seu-repo.git . (ou git pull se já existe)
cd pijama-store-backend
```

**Opção B: SFTP (manual)**
```bash
# No seu PC (PowerShell)
scp -r "C:\Users\Felipe\pijama-store-backend\public\portal" root@177.7.47.211:/home/pijama-store/pijama-store-backend/public/
scp -r "C:\Users\Felipe\pijama-store-backend\src\routes\cliente.routes.js" root@177.7.47.211:/home/pijama-store/pijama-store-backend/src/routes/
# ... etc para cada arquivo novo/modificado
```

### 3. Atualizar .env no VPS

```bash
# SSH para VPS
ssh root@177.7.47.211

# Editar .env
nano /home/pijama-store/pijama-store-backend/.env

# Garantir que tem:
CLIENTE_SESSION_SECRET=pluma-cliente-session-2025
GOOGLE_SHEETS_ID=seu_id_aqui
# ... resto das variáveis

# Salvar: Ctrl+O, Enter, Ctrl+X
```

### 4. Instalar Dependências no VPS

```bash
cd /home/pijama-store/pijama-store-backend
npm install --production
```

### 5. Reiniciar Servidor

**Se usando PM2:**
```bash
pm2 restart pijama-store
pm2 logs pijama-store  # Ver logs
```

**Se usando systemd:**
```bash
sudo systemctl restart pijama-store
sudo journalctl -u pijama-store -f  # Ver logs
```

**Se rodando manualmente:**
```bash
npm start
```

### 6. Verificar Saúde

```bash
# No VPS
curl -X GET http://localhost:3000/health

# Esperado:
# {"status":"ok","timestamp":"2026-05-20T...","environment":"production"}

# Acessar portal
curl -X GET http://localhost:3000/portal
```

### 7. Atualizar DNS/Proxy Reverso (Nginx)

**Se usar Nginx:**
```bash
sudo nano /etc/nginx/sites-enabled/default
```

Adicionar (ou atualizar):
```nginx
location /portal {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}

location /api/cliente {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

**Testar:**
```bash
sudo nginx -t  # Verificar sintaxe
sudo systemctl reload nginx  # Aplicar
```

---

## 🔒 Segurança em Produção

### 1. HTTPS (Obrigatório)

**Com Let's Encrypt:**
```bash
sudo certbot certonly --nginx -d seu-dominio.com -d www.seu-dominio.com
```

**Nginx redirect HTTP → HTTPS:**
```nginx
server {
  listen 80;
  server_name seu-dominio.com;
  return 301 https://$server_name$request_uri;
}
```

### 2. Rate Limiting

**Adicionar no Nginx:**
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=5r/s;

location /api/cliente/autenticar {
  limit_req zone=api_limit burst=10;
  proxy_pass http://localhost:3000;
}
```

### 3. Variáveis Sensíveis

**Garantir no .env (VPS):**
```bash
NODE_ENV=production
LOG_LEVEL=info  # Não usar debug em produção
CLIENTE_SESSION_SECRET=<chave-longa-e-aleatória>
```

**Gerar SECRET aleatório:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. CORS (se necessário)

**Se front-end estiver em domínio diferente, adicionar em app.js:**
```javascript
import cors from 'cors';

app.use(cors({
  origin: ['https://seu-dominio.com', 'https://www.seu-dominio.com'],
  methods: ['GET', 'POST'],
  credentials: true
}));
```

### 5. Headers de Segurança

**Adicionar no Nginx:**
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(),microphone=(),camera=()" always;
```

---

## 📊 Monitoramento em Produção

### 1. PM2 Monitor

```bash
# Ver status
pm2 status

# Ver logs em tempo real
pm2 logs pijama-store

# Ver métricas
pm2 monit
```

### 2. Verificar Espaço em Disco

```bash
# Tamanho do projeto
du -sh /home/pijama-store/

# Espaço livre
df -h /

# Logs grandes?
find /home/pijama-store -name "*.log" -exec ls -lh {} \;
```

### 3. Verificar Performance

```bash
# CPU/Memória
top -n 1 | grep node

# Conexões ativas
netstat -an | grep ESTABLISHED | wc -l
```

---

## 🔄 Atualizar Portal em Produção

### Quando houver atualizações:

```bash
# No seu PC local
git add public/portal src/routes/cliente.routes.js src/middleware/clienteAuth.js ...
git commit -m "Update portal features"
git push origin main

# No VPS
cd /home/pijama-store/pijama-store-backend
git pull origin main
npm install  # Se houver novas dependências
pm2 restart pijama-store

# Verificar
curl http://localhost:3000/portal
```

---

## 🆘 Troubleshooting Produção

### Portal retorna 404

**Causa**: Arquivos não estão no lugar certo

**Solução:**
```bash
# Verificar estrutura
ls -la /home/pijama-store/pijama-store-backend/public/portal/

# Deve ter: index.html, css/, js/
```

---

### Erro "Google Sheets não conecta"

**Causa**: GOOGLE_SHEETS_ID ou credenciais inválidas

**Solução:**
```bash
# Verificar .env
cat /home/pijama-store/pijama-store-backend/.env | grep GOOGLE

# Testar endpoint
curl http://localhost:3000/health

# Ver logs
pm2 logs pijama-store | grep -i "sheets"
```

---

### Login lento

**Causa**: IA (Gemini/Claude) demorando para responder

**Solução**:
1. Recomendações não são críticas — é OK demorar 3-5 segundos
2. Se demorar > 10s, verificar logs
3. Considerar cache de recomendações por 1 dia

---

### SessionStorage não funciona em Produção

**Causa**: HTTPS não está ativado ou cookies bloqueados

**Solução**:
1. Garantir HTTPS em produção
2. Testar em navegador private/incognito
3. Verificar console do navegador (F12)

---

## ✅ Checklist de Deploy

- [ ] Código local testado completamente
- [ ] Todos os arquivos copiados para VPS
- [ ] .env no VPS com variáveis corretas
- [ ] npm install rodou com sucesso
- [ ] Servidor inicia sem erros: `pm2 start`
- [ ] Health check passa: `/health`
- [ ] Portal carrega: `/portal`
- [ ] Login funciona com CPF de teste
- [ ] Dashboard mostra dados
- [ ] HTTPS está ativado
- [ ] Rate limiting está configurado
- [ ] PM2 está monitorando processo
- [ ] Logs estão sendo registrados
- [ ] Backup do Google Sheets feito

---

## 📞 Contato e Suporte

**Se algo der errado em produção:**

1. Verificar logs: `pm2 logs pijama-store`
2. Verificar console do navegador: `F12` → Console
3. Verificar rede: `F12` → Network tab
4. Reiniciar servidor: `pm2 restart pijama-store`
5. Se continuar, rollback: `git revert HEAD~1 && pm2 restart pijama-store`

---

## 🎉 Próximos Passos

Após deploy bem-sucedido:

1. ✅ Adicionar CPF a todos os clientes no Google Sheets
2. ✅ Divulgar link do portal para clientes (WhatsApp/Email)
3. ✅ Monitorar logs por 24h em produção
4. ✅ Coletar feedback dos clientes
5. ✅ Planejar melhorias (editar perfil, imprimir pedido, etc.)

