@echo off
setlocal

rem Always run from this script's own folder, wherever it's double-clicked from.
cd /d "%~dp0"

echo Game Companion - starting up...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js was not found on this computer.
  echo.
  echo     This app needs Node.js to run. Please install the LTS version from:
  echo         https://nodejs.org
  echo     Then double-click this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [!] npm was not found on this computer.
  echo.
  echo     npm normally comes with Node.js. Try reinstalling Node.js from:
  echo         https://nodejs.org
  echo     Then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First-time setup: installing dependencies. This needs an internet
  echo connection and can take a few minutes - please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [!] Setup failed - see the messages above for details.
    echo     If this keeps happening, check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
  echo.
  echo Setup complete.
  echo.
)

echo Starting Game Companion at http://localhost:5174 ...
echo (Close this window to stop the app.)
echo.

start "" "http://localhost:5174"
call npm run dev

echo.
echo Game Companion has stopped.
pause
