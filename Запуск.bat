@echo off
setlocal
cd /d "%~dp0"

rem Production preview: set JOI_CONDUCTOR_PROD=1 before run (after npm run build).
if not "%JOI_CONDUCTOR_PROD%"=="1" set JOI_CONDUCTOR_PROD=

echo.
echo JOI Conductor - start
echo --------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js not found. Install Node.js and retry.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install --registry https://registry.npmmirror.com
  if errorlevel 1 (
    echo Retrying with default registry...
    call npm install
    if errorlevel 1 (
      echo [Error] npm install failed.
      pause
      exit /b 1
    )
  )
)

if not exist "node_modules\vite\" (
  echo Vite missing - reinstalling deps...
  call npm install --registry https://registry.npmmirror.com
  if errorlevel 1 (
    echo [Error] npm install failed.
    pause
    exit /b 1
  )
)

echo Stopping old server if any...
node scripts\stop-server.mjs
timeout /t 1 /nobreak >nul

if "%JOI_CONDUCTOR_PROD%"=="1" (
  echo Building production...
  call npm run build
  if errorlevel 1 (
    echo [Error] Build failed.
    pause
    exit /b 1
  )
)

echo Opening app window...
if not exist "node_modules\electron\" (
  echo Installing Electron for custom window...
  call npm install electron@35 --save-dev --registry https://registry.npmmirror.com
  if errorlevel 1 (
    echo [Warn] Electron install failed — fallback to browser window.
  )
)

rem Refresh launch shortcuts so they keep the app icon
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-shortcut.ps1" >nul 2>nul

node scripts\launch-window.mjs
set EXITCODE=%ERRORLEVEL%

echo Stopping server...
node scripts\stop-server.mjs

if %EXITCODE% NEQ 0 (
  echo.
  echo [Error] App exited with code %EXITCODE%.
  pause
  exit /b %EXITCODE%
)

exit /b 0
