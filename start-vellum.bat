@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)
echo Building Vellum...
call npm run build || exit /b 1
echo Serving on your network at http://localhost:4173 (LAN IP shown below)
ipconfig | findstr /i "IPv4"
start "" http://localhost:4173
call npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
