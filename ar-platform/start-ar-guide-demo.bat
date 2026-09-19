@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   AR Tour Guide Demo  -  Local Launcher (http://localhost)
echo ==========================================================
echo.
echo  Frontend : http://localhost:5180/guide-demo
echo  Backend  : http://localhost:3001
echo.

if not exist "ar-engine\dist\index.js" (
  echo [1/3] Building AR engine ^(first run^) ...
  pushd ar-engine
  call npx vite build
  call npx tsc --emitDeclarationOnly
  popd
) else (
  echo [1/3] AR engine build found - skip
)

echo [2/3] Starting backend API on port 3001 ...
start "AR-Guide-Backend" cmd /k "node backend\src\index.js"

echo [3/3] Starting frontend on port 5180 (HTTP, no cert warning) ...
start "AR-Guide-Frontend" cmd /k "cd frontend && set AR_HTTPS=0&& set AR_PORT=5180&& node node_modules\vite\bin\vite.js"

timeout /t 8 /nobreak >nul
start "" "http://localhost:5180/guide-demo"

echo.
echo  Ready. Open in browser:
echo    Built-in demo       http://localhost:5180/guide-demo
echo    Published guide     http://localhost:5180/guide/^<id^>
echo    Editor              http://localhost:5180/create-guide
echo.
echo  Close the two console windows to stop the servers.
endlocal
