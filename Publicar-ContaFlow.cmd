@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0" || goto erro
set "CONTAFLOW_APP=6ae7c2d5ff47db9e2bde7c3e"
echo Publicando o ContaFlow em contabilidade-1.base44.app
if /i "%~1"=="--retomar" if exist "node_modules\.bin\vite.cmd" goto vincular
call npm.cmd ci || goto erro

:vincular
if not exist "base44\.app.jsonc" (
  echo Escolha "Link an existing project" e depois "ContaFlow".
  call npx.cmd --yes base44 link || goto erro
)
node -e "const fs=require('node:fs'); const cfg=fs.readFileSync('base44/.app.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''); if (JSON.parse(cfg).id !== process.env.CONTAFLOW_APP) { console.error('A pasta esta vinculada a outro aplicativo. Publicacao cancelada.'); process.exit(1); }" || goto erro
call npx.cmd --yes base44 functions deploy authCpf createCompany manageCompany listCompanies enterCompany companyDashboard createEmployeeAccess listEmployees employeeCatalog employeePortal provisionMaster || goto erro
call npx.cmd --yes base44 site deploy --build || goto erro
echo Publicacao concluida. Abra https://contabilidade-1.base44.app/login
pause
exit /b 0

:erro
echo A publicacao parou. Confira a mensagem acima.
pause
exit /b 1
