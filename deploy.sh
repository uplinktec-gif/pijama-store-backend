#!/bin/bash

# ============================================================
# deploy.sh — Sincroniza código local → VPS e reinicia servidor
# Uso: bash deploy.sh
# ============================================================

VPS_IP="177.7.47.211"
VPS_USER="root"
VPS_DIR="/opt/pijama-store"
SSH_KEY="$HOME/.ssh/id_rsa"
# NODE e LOG são resolvidos NA VPS (não expande localmente)
VPS_NODE='/root/.nvm/versions/node/v24.15.0/bin/node'

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
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$VPS_USER@$VPS_IP" "echo ok" > /dev/null 2>&1 \
  || err "Não conseguiu conectar na VPS. Verifique a chave SSH e o IP."
ok "Conexão OK"

# 2. Envia src/ completo
info "Enviando src/..."
scp -r -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  src \
  "$VPS_USER@$VPS_IP:$VPS_DIR/" > /dev/null 2>&1 \
  || err "Falha ao enviar src/"
ok "src/ enviado"

# 3. Envia server.js
info "Enviando server.js..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  server.js \
  "$VPS_USER@$VPS_IP:$VPS_DIR/server.js" > /dev/null 2>&1 \
  || err "Falha ao enviar server.js"
ok "server.js enviado"

# 4. Envia .env (se existir localmente)
if [ -f ".env" ]; then
  info "Enviando .env..."
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    .env \
    "$VPS_USER@$VPS_IP:$VPS_DIR/.env" > /dev/null 2>&1 \
    && ok ".env enviado" || echo "  (aviso: falha ao enviar .env, ignorado)"
fi

# 5. Reinicia o servidor na VPS
info "Reiniciando servidor na VPS..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" '
  # Mata qualquer processo usando a porta 3000
  fuser -k 3000/tcp 2>/dev/null
  pkill -f "node /opt/pijama-store/server.js" 2>/dev/null
  sleep 3
  # Inicia novo servidor
  LOG="/opt/pijama-store/logs/combined-$(date +%Y-%m-%d).log"
  cd /opt/pijama-store
  nohup /root/.nvm/versions/node/v24.15.0/bin/node server.js >> "$LOG" 2>&1 &
  echo $! > /tmp/pijama-store.pid
' > /dev/null 2>&1
sleep 6

# 6. Confirma que está rodando
info "Verificando servidor..."
STATUS=$(curl -s --max-time 5 "http://$VPS_IP:3000/health" 2>/dev/null)
if echo "$STATUS" | grep -q '"status":"ok"'; then
  ok "Servidor rodando em http://$VPS_IP:3000"
else
  err "Servidor não respondeu ao health check. Verifique os logs na VPS."
fi

# 7. Mostra últimas linhas do log
echo ""
echo "📋  Últimas linhas do log:"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" \
  'tail -8 /opt/pijama-store/logs/combined-$(date +%Y-%m-%d).log 2>/dev/null' 2>/dev/null

echo ""
echo "========================================"
ok "Deploy concluído!"
echo ""
