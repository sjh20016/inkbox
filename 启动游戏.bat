@echo off
chcp 65001 >nul
title Inkbox
cd /d "%~dp0"

rem  KEEP THIS FILE PURE ASCII -- see the long note in the main launcher .bat.
rem  Alias of the main launcher (shows the same menu).

where node >nul 2>nul
if errorlevel 1 goto :no_node

node scripts/inkbox-launch.mjs --port=4180
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
