@echo off
setlocal
pushd "%~dp0" || goto fail
set "PY=python"
python --version >nul 2>&1 || set "PY=py -3"
%PY% --version || goto fail
where npm.cmd >nul 2>&1
if not errorlevel 1 (
  call npm.cmd ls --depth=0 >nul 2>&1
  if errorlevel 1 (
    call npm.cmd install --no-audit --no-fund || goto fail
  )
  call npm.cmd run build || goto fail
) else (
  if not exist "static\app.js" goto fail
  if not exist "static\geometry.js" goto fail
  if not exist "static\physics.js" goto fail
)
%PY% server.py
if errorlevel 1 goto fail
popd
exit /b 0
:fail
echo Startup failed. Check Python 3.11+, Node.js and the output above.
pause
exit /b 1
