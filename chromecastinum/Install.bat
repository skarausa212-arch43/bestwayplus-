@echo off
title Chromecastinum - Install
cd /d "%~dp0"

echo.
echo   Installing Chromecastinum...
echo   (downloading required files, may take a few minutes)
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo   ERROR: Node.js not found.
  echo   Install it first from https://nodejs.org  ^(LTS button^),
  echo   then run this file again.
  echo.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo.
  echo   ERROR: install failed. Check your internet and run again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Done! Now start the browser with "Start.bat".
echo.
pause
