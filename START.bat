@echo off
setlocal enabledelayedexpansion
cls
echo ==================================================
echo           YTV_Downloader Installer ^& Launcher
echo ==================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check for Git updates
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

:: 3. Check and install dependencies
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

:: 4. Prompt for Background Service Installation on Startup
set STARTUP_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YTV_Downloader.lnk
if not exist "%STARTUP_LNK%" (
    set /p run_startup="⚙️ Would you like to run YTV_Downloader in the background automatically on startup? (y/n): "
    if "!run_startup!"=="y" (
        set SET_STARTUP=1
    )
    if "!run_startup!"=="Y" (
        set SET_STARTUP=1
    )
    
    if defined SET_STARTUP (
        powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_LNK%'); $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.TargetPath = '%~dp0start-invisible.vbs'; $Shortcut.Save()"
        echo ✓ Background startup shortcut created in your Startup folder.
        echo   Downloader will run invisibly in the background when you boot!
        echo.
    )
)

:: 5. Check if already running on any port (3001-3005)
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
    if "!choice!"=="r" (
        set RELOAD_PROC=1
    )
    if "!choice!"=="R" (
        set RELOAD_PROC=1
    )
    if "!choice!"=="s" (
        set STOP_PROC=1
    )
    if "!choice!"=="S" (
        set STOP_PROC=1
    )

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

:: 6. Clean up any stale .port file
if exist .port del /q .port

:: 7. Launch server
echo 🚀 Launching YTV_Downloader server...
start /b npm start

:: Wait for server to bind and write the port file
timeout /t 2 >nul

:: Read the dynamically allocated port
set PORT=3001
if exist .port (
    set /p PORT=<.port
)

:: 8. Open browser to the UI
echo 🚀 Opening web interface at http://localhost:!PORT!...
start http://localhost:!PORT!
