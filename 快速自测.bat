@echo off
chcp 65001 >nul
title Inkbox self-check
cd /d "%~dp0"

rem  KEEP THIS FILE PURE ASCII -- see the long note in the main launcher .bat.
rem  Runs the core gate and the current Render3D stage gate, then prints a verdict.

where node.exe >nul 2>nul
if errorlevel 1 goto :no_node

echo Inkbox 1.0.0 self-check
echo.
echo [1/2] core checks  (entry / HTTP / realms / save / ecology)
call npm.cmd run test:core
set "CORE=%ERRORLEVEL%"
echo.
echo [2/2] Render3D M2-B realm-window suite  (69 assertion groups)
call npm.cmd run test:render3d:m2b
set "M2B=%ERRORLEVEL%"
echo.
echo   ----------------------------------------------
echo    core gate  exit code %CORE%   (0 = pass)
echo    M2-B gate  exit code %M2B%   (0 = pass)
if "%CORE%%M2B%"=="00" goto :pass
echo    RESULT: failures above
echo   ----------------------------------------------
echo.
pause
exit /b 1

:pass
echo    RESULT: all passed
echo   ----------------------------------------------
echo.
echo To actually play: run the main launcher and pick 2 (3D sandbox) or 3 (Strata).
pause
exit /b 0

:no_node
echo.
echo   [ERROR] Node.js not found.
echo   Please install Node.js 18 or newer: https://nodejs.org/
echo.
pause
exit /b 1
