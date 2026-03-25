@echo off
title ISP Management System
color 0A
echo.
echo =====================================================
echo   ISP MANAGEMENT SYSTEM - STARTING...
echo =====================================================
echo.

REM Change to this script's directory first
cd /d "%~dp0"

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo Please download and install it from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js is installed.

REM Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [INFO] Installing dependencies for the first time, please wait...
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed.
)

REM Check .env config
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [OK] Created .env from template - please edit with your MikroTik details.
        notepad ".env"
        echo After editing .env, run this file again.
        pause
        exit /b 0
    ) else (
        echo [ERROR] .env file not found! Please create it manually.
        pause
        exit /b 1
    )
)
echo [OK] .env configuration found.

REM Kill any existing node process on port 3000
echo [INFO] Stopping any existing server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo [1/1] Starting ISP System (Local Network Only)...
echo.
echo =====================================================
echo   SYSTEM IS NOW RUNNING
echo   Admin Portal:    http://localhost:3000/admin/
echo   Customer Portal: http://localhost:3000/customer/
echo =====================================================
echo.
node server.js
pause
