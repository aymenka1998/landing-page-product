@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Repair the Node.js installation and try again.
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Install it from https://git-scm.com/ then run setup again.
  pause
  exit /b 1
)
if not exist "%~dp0..\product-landing\package.json" (
  echo Keep product-dashboard and product-landing as sibling folders.
  pause
  exit /b 1
)
echo Installing dashboard dependencies...
npm install
if errorlevel 1 goto failed
pushd "%~dp0..\product-landing"
echo Installing landing page dependencies...
npm install
if errorlevel 1 (
  popd
  goto failed
)
popd
echo Setup is complete. Double-click start-product.bat to open the dashboard.
pause
exit /b 0
:failed
echo Setup failed. Check your internet connection and Node.js installation.
pause
exit /b 1