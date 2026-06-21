@echo off
cd /d "%~dp0"
echo =========================================
echo  Starting YTV_Downloader Server
echo =========================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing Node dependencies...
    call npm install
)

echo Launching server...
call npm start
pause
