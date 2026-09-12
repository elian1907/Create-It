@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installez Node.js 24 ou plus depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 goto failure
call npm run build
if errorlevel 1 goto failure
echo Ouvrez http://127.0.0.1:4310 dans votre navigateur. Ctrl+C arrete le service.
call npm start
if errorlevel 1 goto failure
exit /b 0
:failure
echo Le lancement a echoue. Consultez le message ci-dessus et le README.
pause
exit /b 1
