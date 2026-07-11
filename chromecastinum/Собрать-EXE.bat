@echo off
chcp 65001 >nul
title Chromecastinum — сборка EXE
cd /d "%~dp0"

if not exist "node_modules" (
  echo   Сначала запустите "Установить.bat".
  echo.
  pause
  exit /b 1
)

echo.
echo   Собираю Chromecastinum.exe ...
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo   [ОШИБКА] Сборка не удалась. Проверьте интернет и запустите снова.
  echo.
  pause
  exit /b 1
)

echo.
echo   Готово! Файл здесь:  dist\Chromecastinum.exe
echo.
pause
