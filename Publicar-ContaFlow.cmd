@echo off
setlocal
cd /d "%~dp0" || goto erro
set "CONTAFLOW_APP=6ae7c2d5ff47db9e2bde7c3e"
echo Publicando o ContaFlow em contabilidade-1.base44.app
call npm.cmd ci || goto erro
if not exist "base44\.app.jsonc" (
  call npx.cmd --yes base44@0.3.6 link --app-id %CONTAFLOW_APP% || goto erro
)
call npx.cmd --yes base44@0.3.6 functions deploy authCpf listCompanies enterCompany companyDashboard createEmployeeAccess listEmployees employeeCatalog employeePortal provisionMaster --app-id %CONTAFLOW_APP% || goto erro
call npx.cmd --yes base44@0.3.6 site deploy --app-id %CONTAFLOW_APP% --build --yes || goto erro
echo Publicacao concluida. Abra https://contabilidade-1.base44.app/login
pause
exit /b 0

:erro
echo A publicacao parou. Confira a mensagem acima.
pause
exit /b 1
