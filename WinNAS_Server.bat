@echo off
chcp 65001 >nul 2>&1
title WinNAS Server

:: Request admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Requesting administrative privileges...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)

if not exist "config.json" (
    echo [!] Initial setup required. Running setup first...
    echo.
    node setup.js
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Setup failed.
        pause
        exit /b 1
    )
)

node server/index.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server exited with an error.
    pause
)
