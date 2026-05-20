#!/bin/bash

echo "🚀 SETUP PRODUCAO - Pijama Store"
echo "=================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar Node.js
echo "1️⃣  Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js não instalado${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# 2. Verificar npm
echo ""
echo "2️⃣  Verificando npm..."
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm ${NPM_VERSION}${NC}"

# 3. Instalar dependencias
echo ""
echo "3️⃣  Instalando dependências..."
npm ci
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependências instaladas${NC}"
else
    echo -e "${RED}✗ Erro ao instalar dependências${NC}"
    exit 1
fi

# 4. Criar diretórios
echo ""
echo "4️⃣  Criando diretórios..."
mkdir -p logs backups
echo -e "${GREEN}✓ Diretórios criados${NC}"

# 5. Verificar .env
echo ""
echo "5️⃣  Verificando .env..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env não encontrado${NC}"
    echo "Copiando .env.example..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  IMPORTANTE: Editar .env com valores REAIS${NC}"
else
    echo -e "${GREEN}✓ .env encontrado${NC}"
fi

# 6. Verificar service-account.json
echo ""
echo "6️⃣  Verificando service-account.json..."
if [ ! -f "service-account.json" ]; then
    echo -e "${YELLOW}⚠️  service-account.json não encontrado${NC}"
    echo "IMPORTANTE: Copiar seu arquivo de credenciais do Google Cloud"
else
    echo -e "${GREEN}✓ service-account.json encontrado${NC}"
fi

# 7. Teste de startup
echo ""
echo "7️⃣  Testando startup..."
timeout 5 npm run dev > /tmp/startup.log 2>&1 &
sleep 3
if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Servidor inicia corretamente${NC}"
    pkill -f "npm run dev"
else
    echo -e "${RED}✗ Erro ao iniciar servidor${NC}"
    cat /tmp/startup.log
    exit 1
fi

# 8. PM2 Setup (opcional)
echo ""
echo "8️⃣  Setup PM2 (para manter rodando 24/7)..."
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✓ PM2 já instalado${NC}"
else
    echo "Instalando PM2..."
    npm install -g pm2
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PM2 instalado${NC}"
    fi
fi

# 9. Criar ecosystem.config.js
echo ""
echo "9️⃣  Criando ecosystem.config.js..."
cat > ecosystem.config.js << 'EOFCFG'
module.exports = {
  apps: [{
    name: 'pijama-store',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production'
    },
    autorestart: true,
    max_memory_restart: '500M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log'
  }]
};
EOFCFG
echo -e "${GREEN}✓ ecosystem.config.js criado${NC}"

# 10. Resumo
echo ""
echo "=================================="
echo -e "${GREEN}✅ SETUP CONCLUIDO!${NC}"
echo "=================================="
echo ""
echo "📋 Próximas etapas:"
echo "1. Editar .env com credenciais reais:"
echo "   - GOOGLE_SHEETS_ID"
echo "   - WHATSAPP_ACCESS_TOKEN"
echo "   - ANTHROPIC_API_KEY"
echo ""
echo "2. Colocar service-account.json na raiz do projeto"
echo ""
echo "3. Iniciar com PM2:"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "4. Ver logs:"
echo "   pm2 logs pijama-store"
echo ""
echo "5. Fazer startup automático:"
echo "   pm2 startup"
echo "   pm2 save"
echo ""
