#!/bin/bash

echo "🧪 TESTE DE INTEGRACAO - Pijama Store"
echo "======================================"
echo ""

BASE_URL="http://localhost:3000"
ADMIN_WHATSAPP="5595988123456"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Verificar se servidor está rodando
echo "1️⃣  Verificando se servidor está rodando..."
if ! curl -s $BASE_URL/api/estoque > /dev/null 2>&1; then
    echo -e "${RED}✗ Servidor não está respondendo${NC}"
    echo "Inicie com: npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Servidor respondendo${NC}"

# 2. Testar GET /api/estoque
echo ""
echo "2️⃣  Testando GET /api/estoque..."
ESTOQUE=$(curl -s $BASE_URL/api/estoque | grep -o '"success":true')
if [ ! -z "$ESTOQUE" ]; then
    echo -e "${GREEN}✓ Estoque endpoint funcionando${NC}"
else
    echo -e "${RED}✗ Erro ao acessar estoque${NC}"
fi

# 3. Testar GET /api/backup/latest
echo ""
echo "3️⃣  Testando GET /api/backup/latest..."
BACKUP=$(curl -s "$BASE_URL/api/backup/latest?whatsapp=$ADMIN_WHATSAPP")
if echo "$BACKUP" | grep -q "success"; then
    echo -e "${GREEN}✓ Backup endpoint funcionando${NC}"
else
    echo -e "${YELLOW}⚠️  Backup pode não estar pronto ainda${NC}"
fi

# 4. Testar GET /api/logs
echo ""
echo "4️⃣  Testando GET /api/logs..."
LOGS=$(curl -s "$BASE_URL/api/logs?whatsapp=$ADMIN_WHATSAPP&limit=5")
if echo "$LOGS" | grep -q "success"; then
    echo -e "${GREEN}✓ Logs endpoint funcionando${NC}"
else
    echo -e "${RED}✗ Erro ao acessar logs${NC}"
fi

# 5. Verificar logs do arquivo
echo ""
echo "5️⃣  Verificando arquivo de logs..."
LOG_FILE="logs/combined-$(date +%Y-%m-%d).log"
if [ -f "$LOG_FILE" ]; then
    LINES=$(wc -l < "$LOG_FILE")
    echo -e "${GREEN}✓ Arquivo de logs existe ($LINES linhas)${NC}"
else
    echo -e "${YELLOW}⚠️  Arquivo de logs ainda não criado${NC}"
fi

# 6. Verificar diretório de backup
echo ""
echo "6️⃣  Verificando backups..."
if [ -d "backups" ]; then
    BACKUP_COUNT=$(ls -1 backups/*.json 2>/dev/null | wc -l)
    if [ $BACKUP_COUNT -gt 0 ]; then
        LATEST_BACKUP=$(ls -1t backups/*.json 2>/dev/null | head -1)
        echo -e "${GREEN}✓ Backups encontrados ($BACKUP_COUNT arquivos)${NC}"
        echo "   Mais recente: $(basename $LATEST_BACKUP)"
    else
        echo -e "${YELLOW}⚠️  Nenhum backup criado ainda (próximo às 02:00)${NC}"
    fi
else
    echo -e "${RED}✗ Diretório backups não existe${NC}"
fi

# 7. Resumo
echo ""
echo "======================================"
echo -e "${GREEN}✅ TESTES CONCLUIDOS${NC}"
echo "======================================"
echo ""
echo "📊 Próximas verificações:"
echo "  1. Enviar mensagem WhatsApp para testar fluxo completo"
echo "  2. Verificar resposta em < 10 segundos"
echo "  3. Monitorar logs: tail -f logs/combined-$(date +%Y-%m-%d).log"
echo "  4. Ver status PM2: pm2 status"
echo ""
