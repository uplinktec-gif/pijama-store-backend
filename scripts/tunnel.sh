#!/bin/bash

# Script para iniciar túnel ngrok e salvar URL pública

echo "🚀 Iniciando túnel ngrok..."
echo ""

# Verificar se ngrok está instalado
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok não está instalado"
    echo ""
    echo "Para instalar ngrok:"
    echo "  1. Visite: https://ngrok.com/download"
    echo "  2. Baixe para Windows"
    echo "  3. Extraia em C:\\ngrok\\"
    echo "  4. Adicione ao PATH do Windows"
    exit 1
fi

# Iniciar ngrok
echo "⏳ Aguarde o túnel ser criado..."
ngrok_output=$(ngrok http 3000 --log=stdout 2>&1)

# Extrair URL pública (pode levar alguns segundos)
sleep 2
tunnel_url=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$tunnel_url" ]; then
    echo "❌ Não consegui obter URL do ngrok"
    echo "⚠️  Verifique se ngrok está rodando"
    exit 1
fi

echo ""
echo "✅ Túnel criado com sucesso!"
echo ""
echo "📍 URL PÚBLICA:"
echo ""
echo "   $tunnel_url"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚙️  PRÓXIMO PASSO:"
echo ""
echo "1. Copie a URL acima"
echo ""
echo "2. Acesse: https://business.facebook.com"
echo ""
echo "3. Vá para: WhatsApp > API Setup > Webhook"
echo ""
echo "4. Cole a URL com o path:"
echo ""
echo "   $tunnel_url/api/webhook/whatsapp"
echo ""
echo "5. Defina o Verify Token como:"
echo ""
echo "   seu_verify_token_arbitrario"
echo "   (ou o valor do seu .env)"
echo ""
echo "6. Clique: Verify and Save"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 O túnel ficará ativo enquanto este terminal estiver aberto"
echo "📝 Para parar: Pressione Ctrl+C"
echo ""

# Manter o túnel rodando
wait
