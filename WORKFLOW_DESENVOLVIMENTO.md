# 🔄 Workflow de Desenvolvimento - Local → VPS

## 📍 Arquitetura

```
SEU PC (Local)                    VPS (Produção)
┌─────────────────────┐          ┌──────────────────────┐
│ C:\Users\Felipe\... │          │ 177.7.47.211         │
│                     │    →→→    │ /home/pijama-store/  │
│ npm run dev         │          │ pm2 restart          │
│ Teste/Desenvolvimento           │ https://seu-dominio  │
└─────────────────────┘          └──────────────────────┘
```

---

## 🎯 Processo de Desenvolvimento

### Fase 1: Desenvolver Localmente

**Local no seu PC:**
```bash
# 1. Navegue até o projeto
cd C:\Users\Felipe\pijama-store-backend

# 2. Faça as mudanças nos arquivos
# Exemplo: editar public/portal/index.html

# 3. Rode o servidor local
npm run dev

# 4. Teste em http://localhost:3000/portal
# - Abra o Chrome
# - Faça login
# - Teste todas as features
# - Verifique console (F12) para erros

# 5. Se tudo funcionar → próxima fase
# Se houver erros → corrija localmente e teste novamente
```

### Fase 2: Sincronizar para VPS (IMPORTANTE!)

**⚠️ SEMPRE que fizer mudanças localmente, IMEDIATAMENTE sincronize para VPS!**

#### Opção A: Git (Recomendado)

```bash
# No seu PC local:
cd C:\Users\Felipe\pijama-store-backend

# 1. Ver o que mudou
git status

# 2. Adicionar arquivos modificados
git add .

# 3. Fazer commit com mensagem descritiva
git commit -m "feat: adicionar favicon ao portal"
# Exemplos de mensagens:
# - "fix: corrigir bugs no login"
# - "feat: adicionar nova feature"
# - "style: melhorar CSS do dashboard"
# - "docs: atualizar README"

# 4. Enviar para repositório (GitHub/GitLab)
git push origin main
```

**Na VPS:**
```bash
# SSH para VPS
ssh root@177.7.47.211

# Navegar até o projeto
cd /home/pijama-store/pijama-store-backend

# Baixar as mudanças
git pull origin main

# Se houver novas dependências
npm install

# Reiniciar servidor
pm2 restart pijama-store

# Verificar logs
pm2 logs pijama-store
```

---

#### Opção B: SFTP Manual (Sem Git)

```bash
# No seu PC (PowerShell):

# Copiar arquivo único
scp "C:\Users\Felipe\pijama-store-backend\public\portal\favicon.svg" root@177.7.47.211:/home/pijama-store/pijama-store-backend/public/portal/

# Copiar pasta inteira
scp -r "C:\Users\Felipe\pijama-store-backend\public\portal" root@177.7.47.211:/home/pijama-store/pijama-store-backend/public/

# Na VPS, reiniciar
ssh root@177.7.47.211
cd /home/pijama-store/pijama-store-backend
pm2 restart pijama-store
```

---

## 📋 Checklist: Mudança Local → VPS

- [ ] Mudança desenvolvida localmente
- [ ] Testada em `http://localhost:3000`
- [ ] Sem erros no console (F12)
- [ ] Commit feito com mensagem clara
- [ ] `git push` executado (ou SFTP)
- [ ] VPS: `git pull` / arquivos copiados
- [ ] VPS: `pm2 restart pijama-store` executado
- [ ] VPS: `pm2 logs` verificado (sem erros)
- [ ] Testada em `https://seu-dominio.com`
- [ ] ✅ Pronto!

---

## 📝 Tipos de Mudanças

### 1. Mudanças Frontend (HTML/CSS/JavaScript)

**Arquivos que mudam:**
```
public/portal/
├── index.html
├── css/style.css
└── js/
    ├── utils.js
    ├── auth.js
    └── dashboard.js
```

**Sync simples:**
```bash
# Local: testar
npm run dev

# VPS: copiar e reiniciar
scp -r public/portal/ root@177.7.47.211:/home/pijama-store/pijama-store-backend/public/
ssh root@177.7.47.211 "cd /home/pijama-store/pijama-store-backend && pm2 restart pijama-store"
```

---

### 2. Mudanças Backend (Node.js)

**Arquivos que mudam:**
```
src/
├── controllers/
├── routes/
├── middleware/
├── services/
└── utils/

.env (se adicionar variáveis novas)
server.js
app.js
```

**Sync com dependências:**
```bash
# Local: testar
npm run dev

# Se instalou novo package:
npm install novo-package
git add package.json package-lock.json

# VPS:
git pull origin main
npm install  # Instalar novas dependências
pm2 restart pijama-store
```

---

### 3. Mudanças .env (Variáveis de Ambiente)

**⚠️ CUIDADO: Nunca fazer commit de .env com valores reais!**

```bash
# Local: copiar template
cp .env .env.local

# Editar .env.local com valores locais
# Nunca fazer commit deste arquivo!

# Na VPS: 
# .env deve estar lá com valores de produção
# Só fazer commit de .env.example com exemplos

# Se adicionar NOVA variável:
# 1. Adicionar em .env.example
# 2. Fazer commit de .env.example
# 3. Na VPS: adicionar valor em .env manualmente
```

**Exemplo:**
```bash
# Local: .env.example (fazer commit)
CLIENTE_SESSION_SECRET=seu-valor-aqui

# Local: .env.local (NÃO fazer commit)
CLIENTE_SESSION_SECRET=chave-local-para-testes

# VPS: .env (NÃO fazer commit, editar manualmente)
CLIENTE_SESSION_SECRET=chave-secreta-de-produção-muito-segura
```

---

## 🚨 Erros Comuns

### Erro: "Mudei localmente mas VPS não atualizou"

**Causa**: Não sincronizou para VPS

**Solução:**
```bash
# Verificar o que não foi sincronizado
git status

# Ou verificar em VPS
ssh root@177.7.47.211
cd /home/pijama-store/pijama-store-backend
git log -5  # Ver últimos commits
git status  # Ver mudanças não commitadas
```

---

### Erro: "Funciona local mas não na VPS"

**Causa possível**: Arquivo não foi copiado ou versão antiga

**Solução:**
```bash
# Verificar data/hora do arquivo na VPS
ssh root@177.7.47.211
ls -la /home/pijama-store/pijama-store-backend/public/portal/favicon.svg

# Deve ser recente. Se não, copiar novamente:
scp favicon.svg root@177.7.47.211:/home/pijama-store/pijama-store-backend/public/portal/

# Reiniciar
ssh root@177.7.47.211 "pm2 restart pijama-store"
```

---

### Erro: "npm install na VPS falha"

**Solução:**
```bash
# Na VPS
cd /home/pijama-store/pijama-store-backend

# Limpar node_modules
rm -rf node_modules package-lock.json

# Reinstalar
npm install

# Reiniciar
pm2 restart pijama-store
```

---

## 📊 Histórico de Sincronizações

Manter registro das mudanças:

```
Data       | O quê                          | Local OK? | VPS OK?
-----------|--------------------------------|-----------|----------
2026-05-20 | Adicionar favicon.svg         | ✅        | ✅
2026-05-20 | Corrigir dashboard.js         | ✅        | ✅
2026-05-21 | Atualizar style.css           | ✅        | ⏳ (em progresso)
```

---

## ✨ Dicas Pro

### 1. Use Git Sempre
```bash
# Muito mais fácil do que SFTP manual
git push  # 1 comando sincroniza tudo
```

### 2. Commit Frequente
```bash
# Não espere fazer 10 mudanças e depois 1 commit
# Melhor: 10 commits com 1 mudança cada

git add arquivo.js
git commit -m "fix: corrigir bug no CPF"
git push
```

### 3. Teste Antes de Sincronizar
```bash
# Sempre testar localmente antes de mandar para VPS!
npm run dev
# Testar...
# Se OK → git push
# Se erro → corrigir e testar novamente
```

### 4. Acompanhe os Logs
```bash
# Na VPS, depois de cada mudança:
ssh root@177.7.47.211
pm2 logs pijama-store

# Se houver erro, você vê imediatamente
# Ctrl+C para sair
```

### 5. Use .gitignore
```bash
# Não fazer commit de:
node_modules/
.env
.env.local
logs/
*.log
.DS_Store

# Esses arquivos já devem estar em .gitignore
cat .gitignore
```

---

## 🔄 Workflow Ideal (Dia a Dia)

**Manhã:**
```bash
# 1. Pegar tarefas do dia
# 2. Criar branch (opcional)
git checkout -b feature/minha-feature

# 3. Desenvolver
# Editar arquivos...

# 4. Testar
npm run dev
# Teste em http://localhost:3000

# 5. Se OK, commitar
git add .
git commit -m "feat: descrição da mudança"
git push origin feature/minha-feature
```

**Após testar:**
```bash
# Na VPS
git pull origin main
npm install  # só se necessário
pm2 restart pijama-store

# Verificar
pm2 logs pijama-store
```

---

## 📞 Dúvidas Rápidas

**P: Toda mudança precisa ir para VPS?**
R: Sim! Se mudou localmente, tem que sincronizar.

**P: Posso testar mudança só na VPS?**
R: Não recomendo. Sempre testar local primeiro.

**P: Quantas vezes por dia sincronizo?**
R: Sempre que terminar de testar uma mudança.

**P: Posso fazer 10 mudanças e 1 commit só?**
R: Tecnicamente sim, mas melhor fazer commit a cada mudança.

**P: E se der erro na VPS?**
R: Verificar logs (`pm2 logs`) e corrigir localmente.

---

## ✅ Checklist Setup Inicial

- [ ] Git configurado com credenciais
- [ ] SSH key para VPS configurada
- [ ] Pasta local: `C:\Users\Felipe\pijama-store-backend`
- [ ] VPS acessível: `ssh root@177.7.47.211`
- [ ] npm run dev funciona localmente
- [ ] PM2 rodando na VPS
- [ ] Domínio apontando para VPS

---

## 🎯 TL;DR (Resumo)

```bash
# Fluxo rápido:

# Local: Desenvolver e testar
cd C:\Users\Felipe\pijama-store-backend
npm run dev
# Teste em http://localhost:3000

# Local: Commitar
git add .
git commit -m "sua mensagem"
git push origin main

# VPS: Atualizar
ssh root@177.7.47.211
cd /home/pijama-store/pijama-store-backend
git pull origin main
npm install  # se necessário
pm2 restart pijama-store

# Pronto! 🎉
```

