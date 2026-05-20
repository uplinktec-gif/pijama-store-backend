# Script para iniciar túnel para WhatsApp - Windows PowerShell
# Tenta ngrok primeiro, depois Cloudflare Tunnel como fallback

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   ATIVANDO TÚNEL PÚBLICO PARA WEBHOOK DO WHATSAPP             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar se ngrok está instalado
$ngrokExists = $null -ne (Get-Command ngrok -ErrorAction SilentlyContinue)

if ($ngrokExists) {
    Write-Host "✅ ngrok encontrado! Iniciando túnel..." -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ Aguarde a URL aparecer abaixo (pode levar alguns segundos)..." -ForegroundColor Yellow
    Write-Host ""
    ngrok http 3000
    exit
}

# Se ngrok não existe, tentar Cloudflare
$cloudflaredExists = $null -ne (Get-Command cloudflared -ErrorAction SilentlyContinue)

if ($cloudflaredExists) {
    Write-Host "✅ Cloudflare Tunnel encontrado! Iniciando..." -ForegroundColor Green
    Write-Host ""
    cloudflared tunnel run --url http://localhost:3000
    exit
}

# Se nenhum está instalado
Write-Host "❌ Nenhum túnel público encontrado." -ForegroundColor Red
Write-Host ""
Write-Host "OPÇÃO 1: Instalar ngrok (Recomendado)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "1. Visite: https://ngrok.com/download"
Write-Host "2. Baixe o arquivo para Windows"
Write-Host "3. Extraia ngrok.exe em C:\ngrok\"
Write-Host "4. Adicione C:\ngrok\ ao PATH do Windows"
Write-Host "5. Abra um novo PowerShell e rode este script novamente"
Write-Host ""

Write-Host "OPÇÃO 2: Instalar Cloudflare Tunnel (Gratuito e permanente)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "1. Abra PowerShell como Administrador"
Write-Host "2. Execute:"
Write-Host "   choco install cloudflared"
Write-Host "3. Após instalação, rode este script novamente"
Write-Host ""

Write-Host "💡 Dúvida?" -ForegroundColor Cyan
Write-Host "Veja: QUICK_START_WHATSAPP.md ou WEBHOOK_SETUP.md"
Write-Host ""
