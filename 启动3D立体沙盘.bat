@echo off
chcp 65001 >nul
title Inkbox 3D
cd /d "%~dp0"

rem  KEEP THIS FILE PURE ASCII -- see the long note in the main launcher .bat.
rem  One-click 3D sandbox, equivalent to `launcher 2`.
rem  It calls the Node launcher directly instead of `call`-ing the other .bat,
rem  so this file never has to spell a Chinese filename either.

where node >nul 2>nul
if errorlevel 1 goto :no_node

node scripts/inkbox-launch.mjs --mode=3d --port=4180
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" echo   [ERROR] launcher exited with code %CODE%.
echo.
pause
exit /b %CODE%

:no_node
echo.
echo   [ERROR] Node.js not found.
echo   Please install Node.js 18 or newer: https://nodejs.org/
echo.
pause
exit /b 1
