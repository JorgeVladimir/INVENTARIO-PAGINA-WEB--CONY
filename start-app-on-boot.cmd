@echo off
setlocal

cd /d "%~dp0"

echo [CONY] Iniciando aplicacion...

where npm >nul 2>nul
if errorlevel 1 (
  echo [CONY][ERROR] npm no esta disponible en PATH. Instala Node.js y reinicia.
  timeout /t 8 >nul
  exit /b 1
)

if not exist "node_modules" (
  echo [CONY] Instalando dependencias frontend...
  call npm install
  if errorlevel 1 (
    echo [CONY][ERROR] Fallo instalando dependencias frontend.
    timeout /t 8 >nul
    exit /b 1
  )
)

if not exist "backend\node_modules" (
  echo [CONY] Instalando dependencias backend...
  call npm --prefix backend install
  if errorlevel 1 (
    echo [CONY][ERROR] Fallo instalando dependencias backend.
    timeout /t 8 >nul
    exit /b 1
  )
)

echo [CONY] Levantando frontend (7000) y backend (7002)...
call npm run dev:full

endlocal