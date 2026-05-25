#!/bin/bash

# Script de monitoramento da Evolution API na VPS
# Uso: ./scripts/monitor-evolution-vps.sh
# Ou no cron: */5 * * * * /opt/pijama-store/scripts/monitor-evolution-vps.sh

API_URL="http://localhost:32775"
API_KEY="BcbhIilDGsbmMhSVC0rsY55WW6uetpas"
INSTANCE="pijama-store"
LOG_FILE="/opt/pijama-store/logs/evolution-monitor.log"
STATUS_FILE="/tmp/evolution-api-status"

# Criar diretório de logs se não existir
mkdir -p "$(dirname "$LOG_FILE")"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Tentar conexão com timeout de 5 segundos
RESPONSE=$(curl -s -H "apikey: $API_KEY" \
  --max-time 5 \
  -w "\n%{http_code}" \
  "$API_URL/instance/$INSTANCE" 2>/dev/null)

# Extrair HTTP status (última linha)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Determinar status
if [ "$HTTP_CODE" = "200" ]; then
  STATUS="ONLINE"
  STATUS_CODE=0
  MESSAGE="Evolution API respondendo normalmente"
else
  STATUS="OFFLINE"
  STATUS_CODE=1
  MESSAGE="Evolution API não respondendo (HTTP $HTTP_CODE)"
fi

# Ler status anterior
PREV_STATUS=$(cat "$STATUS_FILE" 2>/dev/null || echo "DESCONHECIDO")

# Registrar em log
echo "[$TIMESTAMP] STATUS=$STATUS - $MESSAGE" >> "$LOG_FILE"

# Se mudança de status → enviar alerta
if [ "$PREV_STATUS" != "$STATUS" ] && [ "$STATUS" = "OFFLINE" ]; then
  echo "[$TIMESTAMP] ALERTA! Evolution API ficou OFFLINE" >> "$LOG_FILE"

  # Tentar enviar alerta via webhook local
  curl -s -X POST http://localhost:7000/api/webhook/alerta-interno \
    -H "Content-Type: application/json" \
    -d "{\"tipo\":\"evolution-offline\",\"mensagem\":\"Evolution API está offline\",\"timestamp\":\"$TIMESTAMP\"}" \
    2>/dev/null || true

elif [ "$PREV_STATUS" != "$STATUS" ] && [ "$STATUS" = "ONLINE" ]; then
  echo "[$TIMESTAMP] RECUPERAÇÃO! Evolution API voltou ONLINE" >> "$LOG_FILE"

  # Tentar enviar notificação via webhook local
  curl -s -X POST http://localhost:7000/api/webhook/alerta-interno \
    -H "Content-Type: application/json" \
    -d "{\"tipo\":\"evolution-online\",\"mensagem\":\"Evolution API voltou online\",\"timestamp\":\"$TIMESTAMP\"}" \
    2>/dev/null || true
fi

# Salvar status atual
echo "$STATUS" > "$STATUS_FILE"

exit $STATUS_CODE
