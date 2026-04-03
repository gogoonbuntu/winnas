@echo off
chcp 65001 >nul 2>&1
title WinNAS - 초기 설정

echo.
echo ╔══════════════════════════════════════════════╗
echo ║         WinNAS - 초기 설정 마법사            ║
echo ╚══════════════════════════════════════════════╝
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js가 설치되어 있지 않습니다.
    echo.
    echo Node.js를 먼저 설치해주세요:
    echo   https://nodejs.org/
    echo.
    echo Node.js 설치 후 이 설정을 다시 실행하세요.
    echo 설정 파일 위치: %~dp0run_setup.bat
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js 발견: 
node --version
echo.

:: Install dependencies
echo 📦 npm 패키지 설치 중... (처음 한 번만 필요)
echo    잠시만 기다려주세요...
echo.
cd /d "%~dp0"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ npm 패키지 설치에 실패했습니다.
    echo    인터넷 연결을 확인하고 다시 시도해주세요.
    pause
    exit /b 1
)

echo.
echo ✅ 패키지 설치 완료!
echo.

:: Run setup
echo ═══════════════════════════════════════════════
echo   이제 관리자 비밀번호와 드라이브를 설정합니다
echo ═══════════════════════════════════════════════
echo.
call node setup.js

echo.
echo ═══════════════════════════════════════════════
echo.
echo 🎉 설치가 완료되었습니다!
echo.
echo 서버를 시작하려면:
echo   1. 바탕화면의 "WinNAS 서버 시작" 바로가기를 실행하세요
echo   2. 또는 이 폴더에서 "start_server.bat"을 실행하세요
echo.
echo 브라우저에서 http://localhost:7943 으로 접속하세요.
echo.
echo 외부에서 접속하려면 Cloudflare Tunnel을 설정하세요:
echo   cloudflared tunnel --url http://localhost:7943
echo.
pause
