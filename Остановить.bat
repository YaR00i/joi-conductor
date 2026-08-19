@echo off
setlocal
cd /d "%~dp0"

echo.
echo Stopping JOI Conductor...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js not found.
  pause
  exit /b 1
)

node scripts\stop-server.mjs
timeout /t 1 /nobreak >nul
node scripts\stop-server.mjs

echo.
echo Done. Start again with Zapusk.bat
echo.
pause
