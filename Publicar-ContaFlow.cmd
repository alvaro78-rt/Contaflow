@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0" || goto erro
set "CONTAFLOW_APP=6ae7c2d5ff47db9e2bde7c3e"
set "BASE44_APP_ID=%CONTAFLOW_APP%"
echo ================================================================
echo   ContaFlow - publicacao seletiva e segura do Base44
echo   Aplicativo de destino: %CONTAFLOW_APP%
echo ================================================================
echo.
echo Este processo NAO executa: base44 deploy, entities push,
echo functions deploy --force, exclusao ou migracao de dados.
echo Ele publica as funcoes existentes e o frontend deste checkout.
echo.
if not exist "package.json" (
  echo ERRO: extraia o ZIP COMPLETO e execute este arquivo na pasta raiz.
  goto erro
)
if not exist "base44\config.jsonc" (
  echo ERRO: nao encontrei base44\config.jsonc.
  goto erro
)
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  goto erro
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERRO: npm nao encontrado no PATH.
  goto erro
)
echo [1/7] Conferindo a versao local do Vite e o manifesto...
node -e "const p=require('./package.json');if(p.devDependencies?.vite!=='8.3.8'){console.error('ERRO: o Vite esperado nesta revisao e 8.3.8.');process.exit(1)};console.log('Vite do manifesto: '+p.devDependencies.vite);console.log('Zod como dependencia direta: '+(p.dependencies?.zod||p.devDependencies?.zod||'nao consta'));"
if errorlevel 1 goto erro
echo.
echo [2/7] Instalando as dependencias pelo lockfile corrigido...
call npm.cmd ci
if errorlevel 1 goto erro
echo.
echo [3/7] Executando os testes de interface e as verificacoes de qualidade...
node --test tests\payroll-preflight.test.js tests\payroll-release.test.js
if errorlevel 1 goto erro
call npm.cmd run lint
if errorlevel 1 goto erro
call npm.cmd run typecheck
if errorlevel 1 goto erro
call npm.cmd run build
if errorlevel 1 goto erro
echo.
echo [4/7] Validando acesso a sua propria conta Base44...
call npx.cmd --yes base44 whoami >nul 2>&1
if errorlevel 1 (
  echo O Base44 precisa confirmar seu acesso no navegador.
  call npx.cmd --yes base44 login
  if errorlevel 1 goto erro
)
call npx.cmd --yes base44 whoami
if errorlevel 1 goto erro
echo.
echo [5/7] Conferindo a vinculacao com o aplicativo correto...
if not exist "base44\.app.jsonc" (
  call npx.cmd --yes base44 link --app-id %CONTAFLOW_APP%
  if errorlevel 1 goto erro
)
node -e "const fs=require('node:fs');const raw=fs.readFileSync('base44/.app.jsonc','utf8').replace(/^\s*\/\/.*$/gm,'').replace(/,\s*([}\]])/g,'$1');const cfg=JSON.parse(raw);const id=cfg.id||cfg.appId||cfg.app_id;if(id!==process.env.CONTAFLOW_APP){console.error('ERRO: projeto vinculado ao app '+String(id)+' (esperado '+process.env.CONTAFLOW_APP+').');process.exit(1)};console.log('Destino validado: '+id);"
if errorlevel 1 goto erro
echo.
echo A proxima etapa publica funcoes e o site Base44 de producao.
echo Revise se voce ja tem um backup recuperavel e se o editor
echo Base44 nao possui outras alteracoes pendentes que precisem
echo de verificacao antes da publicacao.
echo.
set /p "CONFIRMA=Para publicar no app acima, digite PUBLICAR: "
if /i not "%CONFIRMA%"=="PUBLICAR" (
  echo Publicacao cancelada. Nenhuma alteracao remota foi enviada.
  exit /b 0
)
echo.
echo [6/7] Publicando apenas as 14 funcoes do ContaFlow...
call npx.cmd --yes base44 functions deploy authCpf companyDashboard createCompany createEmployeeAccess employeeCatalog employeePortal enterCompany listCompanies listEmployees manageCompany payrollService provisionMaster recoverMaster rhService --app-id %CONTAFLOW_APP%
if errorlevel 1 goto erro
echo.
echo [7/7] Publicando o frontend no mesmo app Base44...
call npx.cmd --yes base44 site deploy --build --app-id %CONTAFLOW_APP%
if errorlevel 1 goto erro
echo.
echo ================================================================
echo   Publicacao via CLI concluida.
echo   Abra https://contabilidade-1.base44.app/login
echo ================================================================
echo IMPORTANTE: a publicacao via CLI nao prova que o scanner
echo do editor usa o mesmo bundle. Confira Dashboard - Security,
echo execute Run Security Scan e revise as 2 funcoes publicas.
echo Login por CPF e provisionamento inicial podem precisar
echo de acesso antes do login; NAO use Corrigir tudo sem revisar.
echo.
pause
exit /b 0

:erro
echo.
echo Publicacao interrompida. Veja a etapa e a mensagem acima.
echo Nenhum comando de exclusao ou sincronizacao de entidades foi usado.
pause
exit /b 1
