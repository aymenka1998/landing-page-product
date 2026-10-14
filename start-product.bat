@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Run setup.bat first. Node.js is required.
  pause
  exit /b 1
)
if not exist "%~dp0node_modules" (
  echo Run setup.bat first to install the required components.
  pause
  exit /b 1
)
if not exist "%~dp0..\product-landing\node_modules" (
  echo Run setup.bat first to install the landing page components.
  pause
  exit /b 1
)
start "Product preview" /D "%~dp0..\product-landing" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
start "Product dashboard" "https://localhost:4000"
echo Starting the dashboard at http://localhost:4000 ...
npm start