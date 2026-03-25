@echo off
title ISP System - First Time Setup
color 0B
echo.
echo =====================================================
echo   ISP MANAGEMENT SYSTEM - FIRST TIME SETUP
echo =====================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo.
    echo Please install Node.js first:
    echo 1. Go to: https://nodejs.org
    echo 2. Download the LTS version
    echo 3. Install it, then run this setup again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found!
echo.
echo [1/3] Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo [2/3] Creating your .env configuration file...
if not exist .env (
    copy .env.example .env
    echo [OK] .env file created from template.
    echo.
    echo ===================================================
    echo   IMPORTANT: Open .env and fill in your details:
    echo   - MIKROTIK_HOST = your router IP
    echo   - MIKROTIK_USER = your router username
    echo   - MIKROTIK_PASSWORD = your router password
    echo ===================================================
    echo.
    notepad .env
) else (
    echo [OK] .env already exists, skipping.
)

echo.
echo [3/3] Setup complete!
echo.
echo To start the system, double-click: START_PUBLIC.bat
echo.
pause
