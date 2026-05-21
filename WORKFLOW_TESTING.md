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
- **Solução**: 
  - Commitou mudanças (database.js fix para CPF, auth-modal.js formatação)
  - Fez push ao GitHub
  - Executou deploy.sh
  - VPS atualizada com sucesso ✅

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

**Última atualização**: 2026-05-21
**Autor**: Claude
