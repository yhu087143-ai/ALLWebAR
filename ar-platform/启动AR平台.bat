@echo off
chcp 936 >nul
setlocal
cd /d "%~dp0"
title AR 平台 一键启动

echo ============================================================
echo   AR 平台 一键启动
echo   后端 :3001      前端 https://localhost:5180
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js。请先安装 Node.js 18+ ：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/5] 首次运行，安装依赖（可能几分钟，请耐心等待）...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请把上面的报错发给开发者
    pause
    exit /b 1
  )
) else (
  echo [1/5] 依赖已就绪
)

if not exist "ar-engine\dist\index.js" (
  echo [2/5] 未发现 AR 引擎产物，正在构建（约 1 分钟）...
  call npm run dev:engine
  if errorlevel 1 (
    echo [错误] AR 引擎构建失败，请把上面的报错发给开发者
    pause
    exit /b 1
  )
) else (
  echo [2/5] AR 引擎产物已就绪
)

if not exist "frontend\public\xr-studio-static\index.html" (
  if exist "%~dp0modules\xr-engine\scripts\build-embedded.mjs" (
    echo [3/5] 构建 XR 引擎嵌入产物（1-2 分钟）...
    pushd "%~dp0modules\xr-engine"
    call node scripts\build-embedded.mjs
    popd
  ) else (
    echo [3/5] 未找到 %~dp0modules\xr-engine，/xr-studio 将回退到 5174 代理模式
  )
) else (
  echo [3/5] XR 引擎嵌入产物已就绪
)

echo [4/5] 清理上次残留进程（5180 / 3001）...
for %%p in (5180 3001) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
  )
)

echo      启动后端（新窗口，端口 3001）...
start "AR 后端 :3001" cmd /k "cd backend && npm run dev"
ping -n 4 127.0.0.1 >nul

echo      启动前端（新窗口，https://localhost:5180）...
start "AR 前端 https://localhost:5180" cmd /k "cd frontend && npm run dev"
ping -n 13 127.0.0.1 >nul

echo [5/5] 打开浏览器 https://localhost:5180/ ...
start "" "https://localhost:5180/"

echo.
echo ============================================================
echo  手机真机测试（必须走 HTTPS，否则摄像头会被浏览器拦截）
echo ------------------------------------------------------------
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "169.254"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo   手机浏览器打开： https://%%b:5180/
)
echo   （列出多个时，选跟电脑同一个 WiFi 的那个，通常是 192.168.x.x）
echo.
echo   首次访问提示"证书不受信任"-> 选"高级 / 继续访问"即可
echo   进页面后允许摄像头 -> 发布资产 -> 二维码一定是 https 链接
echo   若手机连不上：右键"放行防火墙(管理员).bat"以管理员身份运行一次
echo ============================================================
echo.
echo  关闭服务：直接关掉上面新开的两个窗口，或运行 停止AR平台.bat
echo  注意：不要设置 AR_HTTPS=0，那会让手机无法访问摄像头
echo.
pause
