@echo off
chcp 65001 >nul
title Chromecastinum — установка
cd /d "%~dp0"

echo.
echo   Устанавливаю Chromecastinum...
echo   (скачиваются нужные файлы, это займёт пару минут)
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo   [ОШИБКА] Не найден Node.js.
  echo   Сначала установите его с https://nodejs.org (кнопка LTS),
  echo   потом запустите этот файл снова.
  echo.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo.
  echo   [ОШИБКА] Установка не завершилась. Проверьте интернет и запустите снова.
  echo.
  pause
  exit /b 1
)

echo.
echo   Готово! Теперь запускайте браузер файлом "Запустить.bat".
echo.
pause
