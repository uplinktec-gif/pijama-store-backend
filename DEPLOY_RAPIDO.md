# 🚀 DEPLOY RÁPIDO - 10 PASSOS

## ⏱️ Tempo: ~15 minutos

---

### PASSO 1: Obter Credenciais
```
Você precisa de:
☐ Google Sheets ID (seu sheet)
☐ service-account.json (Google Cloud)
☐ WhatsApp Phone Number ID
☐ WhatsApp Access Token
☐ WhatsApp Verify Token
☐ Anthropic API Key (Claude)
```

---

### PASSO 2: Criar arquivo .env
```bash
cp .env.example .env
nano .env
```

Preencher:
```
GOOGLE_SHEETS_ID=seu_id_aqui
GOOGLE_SHEETS_CREDENTIALS_PATH=./service-account.json
WHATSAPP_PHONE_NUMBER_ID=seu_id
WHATSAPP_ACCESS_TOKEN=seu_token
WHATSAPP_VERIFY_TOKEN=seu_token
ANTHROPIC_API_KEY=sk-ant-v0-xxxxx
AUTHORIZED_WHATSAPP_NUMBERS=5595988123456,5595987654321
```

---

### PASSO 3: Colocar service-account.json
```bash
# Copiar arquivo do Google Cloud para raiz do projeto
cp ~/Downloads/service-account.json ./service-account.json
```

---

### PASSO 4: Instalar dependências
```bash
npm ci
```

---

### PASSO 5: Testar localmente
```bash
npm run dev
```

Você deve ver:
```
✓ Servidor rodando em http://localhost:3000
✓ Google Sheets conectado
```

---

### PASSO 6: Instalar PM2 (manter 24/7)
```bash
npm install -g pm2
```

---

### PASSO 7: Iniciar com PM2
```bash
pm2 start ecosystem.config.js
```

---

### PASSO 8: Fazer startup automático
```bash
pm2 startup
pm2 save
```

---

### PASSO 9: Verificar status
```bash
pm2 status
pm2 logs pijama-store
```

---

### PASSO 10: Testar integração
```bash
# Terminal 1: Ver logs em tempo real
tail -f logs/combined-$(date +%Y-%m-%d).log

# Terminal 2: Enviar mensagem WhatsApp
# (De seu celular, enviar para número da loja)
"2 zara g bordo 150 pra joão"

# Sistema deve responder em < 10 segundos
```

---

## ✅ CHECKLIST FINAL

- [ ] .env preenchido com valores REAIS
- [ ] service-account.json no lugar
- [ ] npm ci rodado com sucesso
- [ ] npm run dev funciona localmente
- [ ] PM2 instalado
- [ ] pm2 start ecosystem.config.js rodou
- [ ] pm2 startup e pm2 save executados
- [ ] pm2 status mostra processo rodando
- [ ] Mensagem WhatsApp recebe resposta
- [ ] Logs aparecem em logs/combined-*.log

---

## 🆘 SE DER ERRO

### Porta 3000 já em uso
```bash
# Mudar PORT em .env
PORT=3001
```

### Módulo não encontrado
```bash
npm ci
```

### Google Sheets 401
```bash
# Verificar:
1. service-account.json existe e é válido
2. GOOGLE_SHEETS_ID está correto
3. Service Account tem permissão no Sheet
```

### Claude API erro
```bash
# Verificar ANTHROPIC_API_KEY
echo $ANTHROPIC_API_KEY
# Deve começar com: sk-ant-v0-
```

### Mais ajuda: Ver TROUBLESHOOTING.md

---

## 📞 MONITORAMENTO

Ver logs em tempo real:
```bash
pm2 logs pijama-store
```

Ver uso de CPU/RAM:
```bash
pm2 monit
```

Reiniciar se travado:
```bash
pm2 restart pijama-store
```

---

**Data**: 18 de Maio de 2026  
**Status**: Production-Ready  
**Tempo estimado**: 15 minutos
