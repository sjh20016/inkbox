@echo off
chcp 65001 >nul
title 水墨沙盒 · 坐天观井
cd /d "%~dp0"

echo.
echo   水墨沙盒 · 世界盒子
echo   ------------------------------------
echo   正在启动本地服务器...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 没有找到 Node.js，请先安装 Node.js 18 或更高版本。
  echo.
  pause
  exit /b 1
)

rem 先起服务、再开浏览器——否则冷启动时第一个页面会因为服务还没监听而连接被拒。
rem 这里用一条独立的延迟命令去开浏览器，本窗口则留在前台跑服务器。
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:4180/inkbox.html"
node scripts/inkbox-server.mjs --port=4180

pause
