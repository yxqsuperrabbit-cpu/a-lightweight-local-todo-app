@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
set electron_config_cache=%~dp0.electron-cache
if exist "%~dp0dist\Daynote-win32-x64\Daynote.exe" (
  start "" /d "%~dp0dist\Daynote-win32-x64" "%~dp0dist\Daynote-win32-x64\Daynote.exe"
  exit /b 0
)
if not exist "node_modules\electron\package.json" (
  echo Please run npm install first. See README.md.
  pause
  exit /b 1
)
call npm.cmd start
if errorlevel 1 pause
