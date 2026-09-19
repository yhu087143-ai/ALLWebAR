@echo off
chcp 936 >nul
title AllWebAR 放行手机访问（防火墙）

net session >nul 2>nul
if errorlevel 1 (
  echo [提示] 需要管理员权限：请右键本文件 -^> 以管理员身份运行
  echo.
  pause
  exit /b 1
)

echo 正在放行 AR 相关端口（前端 5180/5173/3010/3011、后端 3001/3000、编辑器 5174、WebGL 8080）...
for %%p in (5180 5173 3010 3011 3002 3001 3000 5174 8080) do (
  netsh advfirewall firewall delete rule name="AllWebAR-%%p" >nul 2>nul
  netsh advfirewall firewall add rule name="AllWebAR-%%p" dir=in action=allow protocol=TCP localport=%%p profile=private,domain >nul
  echo   端口 %%p 已放行
)
echo.
echo 完成。手机与电脑连同一个 WiFi 后再打开 https://局域网IP:端口/
pause
