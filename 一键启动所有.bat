@echo off
rem ===========================================================================
rem  AllWebAR - start everything in ONE console window
rem ---------------------------------------------------------------------------
rem  This file is intentionally ASCII-only. cmd.exe renders .bat files using the
rem  active code page, so non-ASCII text saved as UTF-8 gets garbled. All the
rem  human-readable (Chinese) output lives in _launcher.mjs instead, which Node
rem  writes correctly through WriteConsoleW.
rem
rem  All the real work is in _launcher.mjs:
rem    - kills stale ports
rem    - checks node_modules / builds ar-engine when missing
rem    - spawns every service as a child process (no extra windows)
rem    - tees logs to _logs\<service>.log
rem    - waits for ports, prints a status table + phone URLs
rem    - Ctrl+C or closing this window stops everything
rem ===========================================================================

setlocal
cd /d "%~dp0"
title AllWebAR - one console for every service
chcp 65001 >nul 2>nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js not found. Install Node.js 18+ first: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node "%~dp0_launcher.mjs" %*
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] launcher exited with code %EXITCODE%
  echo         check the log files under _logs\
)
echo All services stopped. Press any key to close this window.
pause >nul
exit /b %EXITCODE%
