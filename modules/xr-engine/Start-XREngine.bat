@echo off
setlocal
title XR Engine - Local Dev
cd /d "%~dp0"
if not exist "node_modules\@pmndrs\assets" (
  echo Installing dependencies, please wait ...
  call npm install
)
echo Starting XR Engine dev server ...
start "XR Engine Dev" cmd /k "npm run dev -- --host 127.0.0.1 --port 5173"
echo Waiting for server ...
timeout /t 4 /nobreak >nul
echo Opening browser ...
start "" http://localhost:5173
pause
