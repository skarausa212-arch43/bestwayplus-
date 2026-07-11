@echo off
chcp 65001 >nul
title Chromecastinum
cd /d "%~dp0"

if not exist "node_modules" (
  echo   Сначала запустите "Установить.bat" — нужные файлы ещё не установлены.
  echo.
  pause
  exit /b 1
)

call npm start
