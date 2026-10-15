@echo off
chcp 65001 >nul
title Inkbox
cd /d "%~dp0"
setlocal

rem ============================================================
rem  Inkbox launcher shell.
rem
rem  !!  KEEP THIS FILE PURE ASCII  !!
rem  cmd.exe re-reads a batch file by BYTE OFFSET while executing it.
rem  Chinese text in a UTF-8 file, combined with `chcp 65001`, makes the
rem  parser lose alignment: `if errorlevel 1 ( ... )` blocks then start
rem  running garbage as commands and the script never reaches `node`.
rem  (That is exactly how the previous version of this file was broken.)
rem  All Chinese UI lives in scripts/inkbox-launch.mjs, which is UTF-8 safe.
rem
rem  Usage
rem    double-click              -> menu (printed by the Node launcher)
rem    this.bat 3                -> 3D sandbox + Strata boundary experiment
rem    this.bat 2 4181           -> 3D sandbox on another port
rem ============================================================

set "MODE=%~1"
set "PORT=%~2"
if "%PORT%"=="" set "PORT=4180"

where node >nul 2>nul
if errorlevel 1 goto :no_node

if "%MODE%"=="" goto :run_menu
node scripts/inkbox-launch.mjs --mode=%MODE% --port=%PORT%
goto :done

:run_menu
node scripts/inkbox-launch.mjs --port=%PORT%

:done
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo.
  echo   [ERROR] launcher exited with code %CODE%.
  echo   Common causes:
  echo     - port %PORT% is already used by another program
  echo       try: this.bat %MODE% 4181
  echo     - Node.js older than 18
)
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
