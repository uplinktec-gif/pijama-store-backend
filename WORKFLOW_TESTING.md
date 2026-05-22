# 🧪 Workflow de Testes - Pijama Store

## ⚠️ IMPORTANTE - Processo de Testes

**Felipe testa APENAS no SITE (VPS), NUNCA localmente.**

### Regra Crítica:
- ❌ Quando Felipe relata um problema → é SEMPRE no site (http://177.7.47.211:3000)
- ❌ Nunca é problema no ambiente local (localhost:3005)
- ✅ Sempre fazer deploy para a VPS e testar lá antes de investigar

---

## 📋 Checklist ao Receber Relatório de Erro

1. **Verificar se código está atualizado**
   ```bash
   git status
   git log --oneline -5
   ```

2. **Se houver mudanças não commitadas**
   ```bash
   git add -A
   git commit -m "..."
   git push origin main
   ```

3. **Deploy imediato para VPS**
   ```bash
   bash deploy.sh
   ```

4. **Verificar VPS**
   - URL: http://177.7.47.211:3000
   - Admin: http://177.7.47.211:3000/admin
   - Portal: http://177.7.47.211:3000/portal

5. **Logs da VPS**
   ```bash
   ssh -i ~/.ssh/id_rsa root@177.7.47.211 "tail -50 /opt/pijama-store/logs/combined-$(date +%Y-%m-%d).log"
   ```

---

## 🚀 VPS Configuration

| Item | Valor |
|------|-------|
| IP | 177.7.47.211 |
| Usuário | root |
| Diretório | /opt/pijama-store |
| Porta | 3000 |
| Banco de dados | /opt/pijama-store/data/pijama-store.db |
| Node.js | v24.15.0 (via nvm) |

---

## 📝 Resumo de Problemas Passados

### Problema: "erro de conexao no site da vps"
- **Data**: 2026-05-21
- **Causa**: Código não commitado e desatualizado na VPS
- **Solução**: Commitou, push, deploy.sh ✅

### ⚠️ Problema: "relatórios duplicados / mensagens repetidas N vezes"
- **Data**: 2026-05-21 (recorrente — apareceu múltiplas vezes)
- **Causa Raiz**: Cada `bash deploy.sh` criava um novo processo `node server.js` sem matar o anterior corretamente. Com N deploys, havia N processos rodando em paralelo, cada um com seu próprio scheduler — disparando N mensagens ao mesmo tempo.
- **Por que o kill não funcionava**: O processo na VPS fica como `node /opt/pijama-store/server.js` (path absoluto), mas o pkill usava pattern errado. E a lógica de `tryListen` no server.js subia processos em porta 3001/3002/etc que nunca eram mortos pelo `lsof -ti :3000`.
- **Solução Definitiva (2026-05-21)**: **Migrado para PM2** — process manager que garante **sempre 1 única instância**. Deploy agora faz `pm2 delete pijama-store` antes de subir, impossibilitando acúmulo.
- **Verificar se voltou**: `ssh root@177.7.47.211 "pgrep -c -f pijama-store"` deve retornar **1**.

---

## 🔄 Fluxo Padrão de Fix

```
Felipe relata problema no site
    ↓
Verificar git status
    ↓
Commitar/Push mudanças (se houver)
    ↓
bash deploy.sh
    ↓
Testar em http://177.7.47.211:3000
    ↓
Confirmar com Felipe que está funcionando
```

---

---

## 🔧 Diagnóstico Rápido

### Verificar processos duplicados na VPS
```bash
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "pgrep -c -f pijama-store"
# deve retornar: 1
# se retornar 2+ → tem processo duplicado → bash deploy.sh resolve
```

### Ver logs de hoje
```bash
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "tail -50 /opt/pijama-store/logs/combined-$(date +%Y-%m-%d).log"
```

### Status do PM2
```bash
ssh -i ~/.ssh/id_rsa root@177.7.47.211 "~/.nvm/versions/node/v24.15.0/bin/pm2 status"
```

---

**Última atualização**: 2026-05-21
**Autor**: Claude
