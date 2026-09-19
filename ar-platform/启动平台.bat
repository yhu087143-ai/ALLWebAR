@echo off
chcp 936 >nul
cd /d "%~dp0"

rem 这是旧版启动脚本：原来会把浏览器打开成 http://localhost:5180（而服务实际是 https），
rem 是「手机扫码后提示：当前页面不是安全上下文」的诱因之一。
rem 现在统一转发到新脚本，启动逻辑只维护一份。
echo 启动脚本已升级，正在调用 启动AR平台.bat ...
echo.
call "%~dp0启动AR平台.bat"
