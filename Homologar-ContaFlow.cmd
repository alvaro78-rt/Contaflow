@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto :node_required
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 24 ? 1 : 0)"
if errorlevel 1 goto :node_required

echo Preparando o ContaFlow com dados ficticios.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :failed

node scripts\homologar-independente.mjs
if errorlevel 1 goto :failed
exit /b 0

:node_required
echo Instale o Node.js 24 ou mais recente e abra este arquivo de novo.
pause
exit /b 1

:failed
echo A homologacao nao iniciou. Confira a mensagem acima.
pause
exit /b 1
