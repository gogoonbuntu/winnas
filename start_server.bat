@echo off
chcp 65001 >nul 2>&1
title WinNAS Server

echo.
echo ╔══════════════════════════════════════════════╗
echo ║           WinNAS 서버 실행 중                ║
echo ╠══════════════════════════════════════════════╣
echo ║  브라우저에서 접속:                          ║
echo ║  http://localhost:7943                       ║
echo ║                                              ║
echo ║  서버를 종료하려면 이 창을 닫으세요          ║
echo ╚══════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Check if config exists
if not exist "config.json" (
    echo ⚠️  초기 설정이 필요합니다.
    echo    run_setup.bat을 먼저 실행해주세요.
    pause
    exit /b 1
)

node server/index.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ 서버가 종료되었습니다. 오류가 발생했을 수 있습니다.
    pause
)
