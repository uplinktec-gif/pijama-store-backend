# ✅ Checklist de Sincronização de Estoque

## 📋 Objetivo

Garantir que **todas as 3 consumidoras** (Site, Bot WhatsApp, Admin Panel) acessam **dados de estoque idênticos** do banco SQLite centralizado na VPS.

**Nenhuma sincronização manual necessária** — todas as operações compartilham a mesma database.

---

## ✅ TESTE 1: Verificar Dados Base

### No VPS

```bash
ssh root@177.7.47.211
cd /opt/pijama-store
node -e "
const sql = require('sql.js');
const fs = require('fs');
const db = new sql.Database(fs.readFileSync('data/pijama-store.db'));
const result = db.exec('SELECT COUNT(*) as qtd, SUM(quantidade_total) as total FROM estoque;');
console.log('Itens:', result[0].values[0][0]);
console.log('Unidades:', result[0].values[0][1]);
"
```

**Esperado: 26 itens, 52 unidades**

---

## ✅ TESTE 2: Validar 3 Consumidoras

### Site /portal
```bash
curl http://177.7.47.211:5000/api/estoque | jq '.estoque | length'
```

### Bot WhatsApp
```bash
# Enviar: "@estoque"
# Bot responde com 26 itens
```

### Admin Panel
```bash
curl http://177.7.47.211:5000/admin/api/dashboard/stats | jq '.'
```

---

## 🔄 Atualizar Estoque (Quando Necessário)

1. Recontar itens manualmente
2. Atualizar banco VPS com novo script
3. Validar sincronização nos 3 consumidores
4. Registrar no log abaixo

---

## 📝 Log de Atualizações

| Data | Operação | Antes | Depois | Status |
|------|----------|-------|--------|--------|
| 2026-05-24 | Recontagem inicial | N/A | 26 itens, 52 un | ✅ OK |

---

**Última atualização**: 2026-05-25 00:40 UTC
