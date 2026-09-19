@echo off
rem ===========================================================================
rem  AllWebAR - stop every service
rem ---------------------------------------------------------------------------
rem  ASCII-only on purpose (see the note in 一键启动所有.bat).
rem  The port list lives in _launcher.mjs, so stopping always matches starting.
rem ===========================================================================

setlocal
cd /d "%~dp0"
title AllWebAR - stop all
chcp 65001 >nul 2>nul

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  pause
  exit /b 1
)

node "%~dp0_launcher.mjs" --stop

echo.
echo Done. You can close any leftover console windows manually.
pause >nul
exit /b 0
