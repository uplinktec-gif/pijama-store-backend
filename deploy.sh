#!/bin/bash

# ============================================================
# deploy.sh — Sincroniza código local → VPS e reinicia servidor
# Uso: bash deploy.sh
# ============================================================

VPS_IP="177.7.47.211"
VPS_USER="root"
VPS_DIR="/opt/pijama-store"
SSH_KEY="$HOME/.ssh/id_rsa"
VPS_NODE='/root/.nvm/versions/node/v24.15.0/bin/node'
VPS_NPM='/root/.nvm/versions/node/v24.15.0/bin/npm'
VPS_NODE_DIR='/root/.nvm/versions/node/v24.15.0/bin'

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

echo ""
echo "🚀  Deploy Pijama Store → VPS $VPS_IP"
echo "========================================"

# 1. Verifica conexão SSH
info "Verificando conexão com a VPS..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=8 "$VPS_USER@$VPS_IP" "echo ok" > /dev/null 2>&1 \
  || err "Não conseguiu conectar na VPS. Verifique a chave SSH e o IP."
ok "Conexão OK"

# 2. Cria diretórios necessários na VPS
info "Criando diretórios..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" \
  "mkdir -p $VPS_DIR/data/backups $VPS_DIR/logs $VPS_DIR/public/admin" > /dev/null 2>&1
ok "Diretórios criados"

# 3. Envia src/ completo
info "Enviando src/..."
scp -r -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  src \
  "$VPS_USER@$VPS_IP:$VPS_DIR/" > /dev/null 2>&1 \
  || err "Falha ao enviar src/"
ok "src/ enviado"

# 4. Envia public/ (loja + portal + admin)
info "Enviando public/..."
scp -r -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  public \
  "$VPS_USER@$VPS_IP:$VPS_DIR/" > /dev/null 2>&1 \
  || err "Falha ao enviar public/"
ok "public/ enviado (inclui painel admin)"

# 5. Envia scripts/ (migração)
info "Enviando scripts/..."
scp -r -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  scripts \
  "$VPS_USER@$VPS_IP:$VPS_DIR/" > /dev/null 2>&1 \
  || err "Falha ao enviar scripts/"
ok "scripts/ enviado"

# 6. Envia server.js, package.json e ecosystem.config.cjs (PM2)
info "Enviando server.js e package.json..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  server.js package.json ecosystem.config.cjs \
  "$VPS_USER@$VPS_IP:$VPS_DIR/" > /dev/null 2>&1 \
  || err "Falha ao enviar server.js/package.json"
ok "server.js, package.json e ecosystem.config.cjs enviados"

# 7. Envia .env
if [ -f ".env" ]; then
  info "Enviando .env..."
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    .env \
    "$VPS_USER@$VPS_IP:$VPS_DIR/.env" > /dev/null 2>&1 \
    && ok ".env enviado" || echo "  (aviso: falha ao enviar .env, usando o existente)"
fi

# 8. Instala dependências na VPS (usa nvm)
info "Instalando dependências na VPS (pode levar ~30s)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" \
  'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd '"$VPS_DIR"' && npm install --omit=dev --silent 2>&1 | tail -3' \
  || err "Falha no npm install"
ok "Dependências instaladas"

# 9. Executar migração na VPS (se banco não existir)
info "Verificando banco de dados..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" \
  "cd $VPS_DIR && if [ ! -f data/pijama-store.db ]; then
    echo 'Banco não encontrado, executando migração...'
    $VPS_NODE scripts/migrate-sheets-to-sqlite.js 2>&1 | tail -15
  else
    SIZE=\$(du -sh data/pijama-store.db | cut -f1)
    echo \"Banco já existe (\$SIZE), pulando migração\"
  fi"
ok "Banco de dados verificado"

# 10. Reinicia via PM2 (garante 1 processo único — sem acúmulo)
VPS_PM2="$VPS_NODE_DIR/pm2"
info "Reiniciando servidor na VPS via PM2..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" \
  "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
   PM2=\"$VPS_PM2\"
   cd $VPS_DIR

   # Parar e remover instância antiga (se existir)
   \$PM2 delete pijama-store 2>/dev/null || true

   # Matar qualquer processo zumbi restante (segurança extra)
   pkill -9 -f \"pijama-store/server.js\" 2>/dev/null || true
   for port in 3000 3001 3002 3003 3004 3005; do
     fuser -k \"\${port}/tcp\" 2>/dev/null || true
   done
   sleep 2

   # Subir com PM2 (instances:1 no ecosystem.config.cjs garante processo único)
   \$PM2 start ecosystem.config.cjs
   \$PM2 save

   echo \"Processos node rodando: \$(pgrep -c -f pijama-store 2>/dev/null || echo 0)\"" 2>/dev/null
sleep 8

# 11. Health check
info "Verificando servidor..."
STATUS=$(curl -s --max-time 8 "http://$VPS_IP:3000/health" 2>/dev/null)
if echo "$STATUS" | grep -q '"status":"ok"'; then
  ok "Servidor rodando em http://$VPS_IP:3000"
else
  echo "  Health check: $STATUS"
  err "Servidor não respondeu. Verifique os logs."
fi

# 12. Testar painel admin
info "Verificando painel admin..."
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$VPS_IP:3000/admin/" 2>/dev/null)
if [ "$ADMIN_STATUS" = "200" ]; then
  ok "Painel admin acessível: http://$VPS_IP:3000/admin"
else
  echo "  (Admin retornou HTTP $ADMIN_STATUS)"
fi

# 13. Log final
echo ""
echo "📋  Últimas linhas do log:"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" \
  "tail -10 $VPS_DIR/logs/combined-\$(date +%Y-%m-%d).log 2>/dev/null" 2>/dev/null

echo ""
echo "========================================"
ok "Deploy concluído!"
echo ""
echo "  🌐 Site:   http://$VPS_IP:3000"
echo "  🔧 Admin:  http://$VPS_IP:3000/admin"
echo "  👤 Portal: http://$VPS_IP:3000/portal"
echo ""
