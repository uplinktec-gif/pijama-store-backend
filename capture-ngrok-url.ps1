# Script PowerShell para capturar URL do ngrok
$process = Start-Process -FilePath "ngrok.exe" -ArgumentList "http 7003" -NoNewWindow -PassThru

Start-Sleep -Seconds 5

# Tentar capturar URL via API
$attempts = 0
while ($attempts -lt 10) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4040/api/tunnels" -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $json = $response.Content | ConvertFrom-Json
            $url = $json.tunnels[0].public_url
            Write-Host "✓ URL NGROK ENCONTRADA: $url"
            $url | Out-File -FilePath "ngrok_url.txt" -Encoding UTF8
            Write-Host "✓ URL salva em ngrok_url.txt"
            break
        }
    } catch {
        $attempts++
        Start-Sleep -Seconds 2
    }
}

if ($attempts -eq 10) {
    Write-Host "✗ Timeout ao conectar ngrok"
}

Write-Host "Pressione qualquer tecla para continuar..."
$null = Read-Host
