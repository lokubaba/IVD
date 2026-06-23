@echo off
setlocal enabledelayedexpansion
cls
echo ==================================================
echo           YTV_Downloader Installer ^& Launcher
echo ==================================================
echo.

:: Prompt user for mode choice
echo How would you like to run YTV_Downloader?
echo   [1] Run via Docker (Highly Recommended - Isolated and clean)
echo   [2] Run Locally on Host Machine (Will install Node, FFmpeg, etc. if missing)
echo.
set /p choice="Enter choice (1/2) [Default: 1]: "

if "%choice%"=="" set choice=1
if "%choice%"=="1" goto run_docker
if "%choice%"=="2" goto run_locally
goto run_docker

:run_locally
echo.
echo 💻 Checking Local Host dependencies...

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ Node.js is missing!
    where winget >nul 2>nul
    if !errorlevel! eq 0 (
        echo Installing Node.js via winget...
        winget install OpenJS.NodeJS --silent --accept-source-agreements --accept-package-agreements
        echo Please restart this script after the installation finishes.
        pause
        exit /b 0
    ) else (
        echo winget is missing. Please download and install Node.js manually from https://nodejs.org/
        pause
        exit /b 1
    )
)

:: Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ FFmpeg is missing!
    where winget >nul 2>nul
    if !errorlevel! eq 0 (
        echo Installing FFmpeg via winget...
        winget install Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements
        echo Please restart this script after the installation finishes.
        pause
        exit /b 0
    ) else (
        echo winget is missing. Please download and install FFmpeg manually.
        pause
        exit /b 1
    )
)

:: Check for Git updates
if exist .git (
    where git >nul 2>nul
    if !errorlevel! eq 0 (
        echo Checking for repository updates...
        git fetch origin >nul 2>nul
        for /f "tokens=*" %%i in ('git rev-parse HEAD') do set LOCAL=%%i
        for /f "tokens=*" %%i in ('git rev-parse @{u} 2^>nul') do set REMOTE=%%i
        
        if defined REMOTE (
            if "!LOCAL!" neq "!REMOTE!" (
                echo 📢 A new update is available on GitHub!
                set /p choice="Would you like to pull the latest changes? (y/n): "
                if "!choice!"=="y" (
                    git pull
                    echo Successfully updated to the latest version!
                ) else if "!choice!"=="Y" (
                    git pull
                    echo Successfully updated to the latest version!
                ) else (
                    echo Skipping update.
                )
            ) else (
                echo ✓ Repository is up to date.
            )
        )
    )
)
echo.

:: Check and install dependencies
if not exist node_modules (
    echo 📦 node_modules folder missing. Installing dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: Failed to install node dependencies.
        pause
        exit /b 1
    )
    echo ✓ Dependencies installed.
    echo.
)

:: Prompt for Background Service Installation on Startup
set STARTUP_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YTV_Downloader.lnk
if not exist "%STARTUP_LNK%" (
    set /p run_startup="⚙️ Would you like to run YTV_Downloader in the background automatically on startup? (y/n): "
    if "!run_startup!"=="y" set SET_STARTUP=1
    if "!run_startup!"=="Y" set SET_STARTUP=1
    
    if defined SET_STARTUP (
        powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_LNK%'); $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.TargetPath = '%~dp0start-invisible.vbs'; $Shortcut.Save()"
        echo ✓ Background startup shortcut created.
        echo.
    )
)

:: Check if already running on any port (3001-3005)
set ALREADY_RUNNING=0
set RUNNING_PORT=3001
for %%p in (3001 3002 3003 3004 3005) do (
    netstat -ano | findstr :%%p >nul 2>nul
    if !errorlevel! eq 0 (
        powershell -Command "$resp = Invoke-RestMethod -Uri 'http://localhost:%%p/check' -TimeoutSec 1 -ErrorAction SilentlyContinue; if ($resp -and $resp.installed -ne $null) { exit 0 } else { exit 1 }"
        if !errorlevel! eq 0 (
            set ALREADY_RUNNING=1
            set RUNNING_PORT=%%p
        )
    )
)

if !ALREADY_RUNNING! eq 1 (
    set RUN_CONTEXT=in another active terminal session
    powershell -Command "$owner = (Get-NetTCPConnection -LocalPort !RUNNING_PORT! -ErrorAction SilentlyContinue).OwningProcess[0]; if ($owner) { $pName = (Get-Process -Id $owner).Parent.Name; if ($pName -match 'wscript' -or $pName -match 'explorer' -or $pName -match 'svchost') { exit 0 } else { exit 1 } } else { exit 1 }"
    if !errorlevel! eq 0 (
        set RUN_CONTEXT=in the background as a system service
    )

    echo 🚀 YTV_Downloader is already running !RUN_CONTEXT! on port !RUNNING_PORT!!
    echo.
    echo What do you want to do?
    echo   [r] Reload / Restart (stops existing process and launches with latest changes)
    echo   [s] Stop the process and exit
    echo   [k] Keep it running and open the web interface (default)
    echo.
    set /p choice="Enter choice (r/s/k): "
    if "!choice!"=="r" set RELOAD_PROC=1
    if "!choice!"=="R" set RELOAD_PROC=1
    if "!choice!"=="s" set STOP_PROC=1
    if "!choice!"=="S" set STOP_PROC=1

    if defined RELOAD_PROC (
        echo Stopping existing downloader on port !RUNNING_PORT!...
        for /f "tokens=5" %%a in ('netstat -aon ^| findstr :!RUNNING_PORT! ^| findstr LISTENING') do (
            taskkill /f /pid %%a >nul 2>nul
        )
        timeout /t 1 >nul
        echo ✓ Stopped.
    ) else if defined STOP_PROC (
        echo Stopping existing downloader on port !RUNNING_PORT!...
        for /f "tokens=5" %%a in ('netstat -aon ^| findstr :!RUNNING_PORT! ^| findstr LISTENING') do (
            taskkill /f /pid %%a >nul 2>nul
        )
        echo ✓ Stopped. Exiting.
        timeout /t 2 >nul
        exit /b 0
    ) else (
        echo Opening web interface at http://localhost:!RUNNING_PORT!...
        start http://localhost:!RUNNING_PORT!
        timeout /t 3 >nul
        exit /b 0
    )
)

if exist .port del /q .port
echo 🚀 Launching YTV_Downloader server...
start /b npm start
timeout /t 2 >nul

set PORT=3001
if exist .port (
    set /p PORT=<.port
)

echo 🚀 Opening web interface at http://localhost:!PORT!...
start http://localhost:!PORT!
exit /b 0

:run_docker
echo.
echo 🐳 Checking Docker setup...
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ Docker CLI tool is not installed!
    set /p local_fb="Would you like to run locally on your host machine instead? (y/n): "
    if "!local_fb!"=="y" goto run_locally
    if "!local_fb!"=="Y" goto run_locally
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

:: Check if Docker daemon is active
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ Docker Daemon is not running!
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        set /p launch_dd="Docker Desktop is installed. Would you like to launch it automatically? (y/n): "
        if "!launch_dd!"=="y" set START_DD=1
        if "!launch_dd!"=="Y" set START_DD=1
        
        if defined START_DD (
            echo Launching Docker Desktop...
            start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
            echo Waiting for Docker Daemon to start (up to 30s)...
            for /l %%i in (1,1,30) do (
                docker info >nul 2>nul
                if !errorlevel! eq 0 (
                    echo ✓ Docker Daemon is now running.
                    goto docker_ready
                )
                timeout /t 1 >nul
            )
        )
    )
) else (
    goto docker_ready
)

:: Re-verify daemon
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Docker Daemon is still not running.
    set /p local_fb="Would you like to fallback and run locally on your host machine instead? (y/n): "
    if "!local_fb!"=="y" goto run_locally
    if "!local_fb!"=="Y" goto run_locally
    echo Exiting.
    pause
    exit /b 1
)

:docker_ready
echo 🚀 Starting YTV_Downloader inside Docker container...
docker compose up --build
exit /b 0
