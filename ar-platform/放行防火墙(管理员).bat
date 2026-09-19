@echo off
chcp 936 >nul
title 放行手机访问（防火墙）

net session >nul 2>nul
if errorlevel 1 (
  echo [提示] 需要管理员权限：
  echo        请右键本文件 -^> 以管理员身份运行
  echo.
  pause
  exit /b 1
)

echo 正在放行 TCP 端口 5180（前端）与 3001（后端）...
for %%p in (5180 3001) do (
  netsh advfirewall firewall delete rule name="AR平台-%%p" >nul 2>nul
  netsh advfirewall firewall add rule name="AR平台-%%p" dir=in action=allow protocol=TCP localport=%%p profile=private,domain >nul
  echo   端口 %%p 已放行
)

echo.
echo 完成。手机现在应与电脑连同一个 WiFi，再打开启动脚本里给出的 https://局域网IP:5180/
echo.
pause
