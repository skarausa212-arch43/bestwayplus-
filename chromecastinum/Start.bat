@echo off
title Chromecastinum
cd /d "%~dp0"

if not exist "node_modules" (
  echo   Run "Install.bat" first - required files are not installed yet.
  echo.
  pause
  exit /b 1
)

call npm start
