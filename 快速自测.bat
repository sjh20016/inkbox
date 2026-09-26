@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18 或更新版本。
  pause
  exit /b 1
)

echo 坐天观井 Inkbox 1.0.0 快速核心检查
call npm.cmd test
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo 检查结束。退出码 %EXIT_CODE%。
pause
exit /b %EXIT_CODE%
