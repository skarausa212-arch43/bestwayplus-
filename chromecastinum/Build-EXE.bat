@echo off
title Chromecastinum - Build EXE
cd /d "%~dp0"

if not exist "node_modules" (
  echo   Run "Install.bat" first.
  echo.
  pause
  exit /b 1
)

echo.
echo   Building Chromecastinum.exe ...
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo   ERROR: build failed. Check your internet and run again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Done! File is here:  dist\Chromecastinum.exe
echo.
pause
