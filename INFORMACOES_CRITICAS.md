# 📍 INFORMAÇÕES CRÍTICAS — LOCALIZAÇÃO E ESTRUTURA

**⚠️ GUARDAR ESTE ARQUIVO PERMANENTEMENTE**

---

## 🖥️ LOCALIZAÇÃO DOS SISTEMAS

### 📁 Servidor Local (seu computador)
```
Caminho: C:\Users\Felipe\pijama-store-backend\
Banco de dados: C:\Users\Felipe\pijama-store-backend\data\pijama-store.db
Porta: 3000 (padrão)
URL local: http://localhost:3000
```

**Para iniciar localmente:**
```bash
cd C:\Users\Felipe\pijama-store-backend
npm start
```

---

### 🌐 Servidor VPS (Produção)
```
IP: 177.7.47.211
Usuário: root
Caminho: /opt/pijama-store/
Banco de dados: /opt/pijama-store/data/pijama-store.db
Porta: 3000
URL pública: http://177.7.47.211:3000
```

**Para acessar VPS:**
```bash
ssh root@177.7.47.211
cd /opt/pijama-store
npm start  # Se servidor não estiver rodando
```

**Para copiar arquivos (Local → VPS):**
```bash
# Arquivo único
scp seu_arquivo.js root@177.7.47.211:/opt/pijama-store/src/...

# Diretório inteiro
scp -r /caminho/local root@177.7.47.211:/opt/pijama-store/
```

---

## 📊 ESTRUTURA DE DIRETÓRIOS

### Local
```
C:\Users\Felipe\pijama-store-backend\
├── src/
│   ├── config/          ← Configurações (database.js, env.js, etc)
│   ├── routes/          ← Rotas da API (store.routes.js, dashboard.routes.js)
│   ├── services/
│   │   ├── sqlite/      ← Serviços SQLite (estoque, pedidos, clientes, etc)
│   │   ├── business/    ← Lógica de negócio
│   │   ├── nlp/         ← Processamento de linguagem natural
│   │   └── whatsapp/    ← Integração WhatsApp
│   └── ...
├── data/
│   └── pijama-store.db  ← Banco de dados SQLite (160KB)
├── scripts/
│   └── migrate-sheets-to-sqlite.js  ← Script de migração (pode deletar após usar)
├── public/              ← Arquivos estáticos (HTML, CSS, JS)
├── server.js            ← Arquivo principal
├── package.json         ← Dependências Node.js
└── .env                 ← Variáveis de ambiente (⚠️ NUNCA fazer push)
```

### VPS (idêntica)
```
/opt/pijama-store/
├── src/                 ← Idêntico ao local
├── data/
│   └── pijama-store.db  ← Sincronizado com local
├── scripts/             ← Idêntico ao local
├── public/              ← Idêntico ao local
└── ...
```

---

## 🔑 INFORMAÇÕES IMPORTANTES

### Banco de Dados
- **Tipo**: SQLite (arquivo único)
- **Local**: `data/pijama-store.db`
- **Tamanho**: 160KB
- **Tabelas**: estoque, pedidos, clientes, conversas, leads, fotos, suporte
- **Dados**: 26 itens, 52 unidades, 6 pedidos, 12 clientes

### Dados de Estoque
- **Total de unidades**: 52
- **Total de SKUs**: 26
- **Modelos**: Anne, Lia, Lívia, Mia, Núbia, Zara
- **Preço unitário**: R$ 79,90
- **Quantidade reservada**: 0 (sempre)

### API Endpoints
```
GET /api/estoque         → Lista estoque (26 itens, 52 unidades)
GET /api/pedidos         → Lista pedidos
GET /api/clientes        → Lista clientes
POST /webhook/whatsapp   → Recebe mensagens do bot
```

### Portas
- **Local**: 3000 (Node.js)
- **VPS**: 3000 (Node.js)
- **Evolution API (WhatsApp)**: 32775 (na VPS)

---

## 🔒 Credenciais e Variáveis

### .env (Local - NÃO fazer push)
```
WHATSAPP_VERIFY_TOKEN=seu_token
ANTHROPIC_API_KEY=sua_api_key
EVOLUTION_API_KEY=sua_chave
EVOLUTION_INSTANCE=pijama-store
ADMIN_TOKEN=seu_token_admin
```

### No servidor (SSH)
```bash
# Ver variáveis de ambiente
cat /opt/pijama-store/.env

# Editar
nano /opt/pijama-store/.env
```

---

## 📋 Checklist de Sincronização

Quando sincronizar local → VPS:

- [ ] Deletar diretório `src/services/sheets/` (se existir)
- [ ] Verificar que todos os imports usam `sqlite/` não `sheets/`
- [ ] Sincronizar banco: `scp data/pijama-store.db root@177.7.47.211:/opt/pijama-store/data/`
- [ ] Sincronizar código: `scp -r src/ root@177.7.47.211:/opt/pijama-store/`
- [ ] Reiniciar servidor: `ssh root@177.7.47.211 'pkill -f "node /opt/pijama-store" && cd /opt/pijama-store && npm start'`
- [ ] Testar: `curl http://177.7.47.211:3000/api/estoque`

---

## 🚨 Problemas Comuns

### Servidor não responde na VPS
```bash
ssh root@177.7.47.211
ps aux | grep node
# Se não estiver rodando:
cd /opt/pijama-store && npm start
```

### Banco desincronizado
```bash
# Copiar banco do local para VPS
scp data/pijama-store.db root@177.7.47.211:/opt/pijama-store/data/
```

### Import error: Cannot find module 'sheets/'
```bash
# Procurar por referências legadas
grep -r "from.*sheets/" /opt/pijama-store/src/
# Se encontrou, corrigir manualmente ou sincronizar arquivos corretos
```

---

## 📞 Contatos Importantes

- **Felipe (você)**: 95981188675
- **Jully**: 95981225668
- **Pluma (loja)**: 95991268494
- **VPS IP**: 177.7.47.211

---

## ✅ GUARDAR ESTE ARQUIVO

Este arquivo contém informações críticas que você vai precisar constantemente:
- Caminhos locais e remotos
- IP da VPS
- Estrutura de diretórios
- Como sincronizar
- Como resolver problemas comuns

**Não deletar!** 🎯

---

*Última atualização: 2026-05-24 01:55 UTC*
