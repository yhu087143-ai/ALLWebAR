@echo off
chcp 936 >nul
title 停止 AR 平台

echo 正在停止占用 5180（前端）/ 3001（后端）端口的进程...
for %%p in (5180 3001) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING"') do (
    echo   结束 PID %%a （端口 %%p）
    taskkill /f /pid %%a >nul 2>nul
  )
)

echo.
echo 完成。若那两个命令行窗口还开着，直接关掉即可。
pause
