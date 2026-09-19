@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   AR Tour Guide Demo  -  Phone / LAN Launcher (HTTPS)
echo ==========================================================
echo.
echo  AR camera mode needs a SECURE context. On a real phone,
echo  http://LAN-IP is NOT secure, so this launcher uses HTTPS
echo  with a self-signed certificate.
echo.
echo  Steps on the phone:
echo    1. Connect the phone to the SAME Wi-Fi as this PC
echo    2. Open the "Network:" URL printed by the frontend window
echo    3. Tap "Advanced" - "Proceed" to accept the certificate
echo    4. Allow camera access, then start AR mode
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

echo [3/3] Starting frontend on port 5173 (HTTPS) ...
start "AR-Guide-Frontend" cmd /k "cd frontend && set AR_HTTPS=1&& set AR_PORT=5173&& node node_modules\vite\bin\vite.js"

echo.
echo  Look at the "AR-Guide-Frontend" window for the Network URL,
echo  e.g.  https://192.168.x.x:5173/guide-demo
echo.
echo  Tip: to expose it to the internet instead, run:
echo       dev-share --proxy 5173
echo.
endlocal
