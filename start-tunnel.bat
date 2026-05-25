@echo off
chcp 65001 > nul
cd /d C:\Users\Felipe\pijama-store-backend
echo =====================================================
echo Iniciando LocalTunnel para localhost:7003...
echo =====================================================
lt --port 7003 --print-requests
pause
