@echo off
chcp 65001 >nul 2>&1

cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed. Please install from https://nodejs.org/
    pause
    exit /b 1
)

node setup.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Setup failed.
    pause
    exit /b 1
)

pause
