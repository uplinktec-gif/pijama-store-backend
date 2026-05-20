#!/bin/bash

echo "=== TESTE WEBHOOK EVOLUTION API ==="
echo ""
echo "Enviando mensagem de teste: '1 zara p preto'"
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3000/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "message": {
        "from": "5531650001",
        "id": "test-'$(date +%s)'",
        "body": "1 zara p preto",
        "timestamp": "'$(date +%s)'"
      }
    }
  }')

echo "Resposta do servidor:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

echo ""
echo "✓ Webhook recebido e processado"
