# Multi-Option Installer and Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an interactive dual-mode launcher (Docker or Host Local) with automated dependency installation for macOS/Linux and Windows.

**Architecture:** Interactive CLI selector in the launcher shell scripts that prompts the user. If Docker is selected, verify daemon and optionally launch Docker Desktop. If Local is selected, verify Node.js and FFmpeg, auto-installing via Homebrew (Mac) or Winget (Windows) if missing.

**Tech Stack:** Bash, Windows Command Prompt (Batch), Docker, Homebrew, Winget.

---

### Task 1: Refactor START.command (macOS/Linux)

**Files:**
- Modify: `START.command`

- [ ] **Step 1: Replace implementation of START.command to include mode selection, Docker checks, and Local installation fallback.**

Modify code in `START.command` to have the following structure:
```bash
#!/bin/bash
cd "$(dirname "$0")"

clear
echo "=================================================="
echo "          YTV_Downloader Installer & Launcher"
echo "=================================================="
echo ""

# Function to run the local server setup
run_locally() {
    echo "💻 Checking Local Host dependencies..."
    
    # Check/install Node.js
    if ! command -v node &> /dev/null; then
        echo "⚠️ Node.js is missing!"
        if command -v brew &> /dev/null; then
            echo "Installing Node.js via Homebrew..."
            brew install node
        else
            echo "Homebrew is missing. Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null
            brew install node
        fi
    fi

    # Check/install FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        echo "⚠️ FFmpeg is missing!"
        if command -v brew &> /dev/null; then
            echo "Installing FFmpeg via Homebrew..."
            brew install ffmpeg
        else
            echo "Installing Homebrew to get FFmpeg..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null
            brew install ffmpeg
        fi
    fi

    # Check for Git updates
    if [ -d .git ] && command -v git &> /dev/null; then
        echo "Checking for repository updates..."
        git fetch origin &>/dev/null
        LOCAL=$(git rev-parse HEAD)
        REMOTE=$(git rev-parse @{u} 2>/dev/null)
        
        if [ $? -eq 0 ] && [ "$LOCAL" != "$REMOTE" ]; then
            echo "📢 A new update is available on GitHub!"
            read -p "Would you like to pull the latest changes? (y/n): " choice
            case "$choice" in 
                y|Y ) 
                    git pull
                    echo "Successfully updated to the latest version!"
                    ;;
                * ) 
                    echo "Skipping update."
                    ;;
            esac
        else
            echo "✓ Repository is up to date."
        fi
    fi
    echo ""

    # Check and install Node dependencies
    if [ ! -d "node_modules" ]; then
        echo "📦 node_modules folder missing. Installing dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "ERROR: Failed to install node dependencies."
            exit 1
        fi
        echo "✓ Dependencies installed."
        echo ""
    fi

    # Startup plist Setup (macOS only)
    if [ "$(uname)" = "Darwin" ]; then
        PLIST_PATH="$HOME/Library/LaunchAgents/com.lokubaba.downloader.plist"
        if [ ! -f "$PLIST_PATH" ]; then
            read -p "⚙️ Would you like to run YTV_Downloader in the background automatically on startup? (y/n): " run_startup
            case "$run_startup" in
                y|Y )
                    NODE_PATH=$(which node)
                    REPO_PATH=$(pwd)
                    
                    cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lokubaba.downloader</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$REPO_PATH</string>
    <key>StandardOutPath</key>
    <string>/tmp/ytv-downloader.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ytv-downloader.err</string>
</dict>
</plist>
EOF
                    launchctl unload "$PLIST_PATH" 2>/dev/null
                    launchctl load "$PLIST_PATH"
                    echo "✓ Background launch agent installed at $PLIST_PATH"
                    echo ""
                    ;;
                * )
                    echo "Skipping startup setup."
                    echo ""
                    ;;
            esac
        fi
    fi

    # Check if already running on port (3001-3005)
    ALREADY_RUNNING=0
    RUNNING_PORT=3001
    for port in {3001..3005}; do
      RESPONSE=$(curl -s --max-time 1 http://localhost:$port/check 2>/dev/null)
      if [[ "$RESPONSE" == *"installed"* ]]; then
        ALREADY_RUNNING=1
        RUNNING_PORT=$port
        break
      fi
    done

    if [ $ALREADY_RUNNING -eq 1 ]; then
      PID=$(lsof -t -i :$RUNNING_PORT 2>/dev/null)
      RUN_CONTEXT="in another active terminal session"
      if [ -n "$PID" ]; then
        TTY_VAL=$(ps -o tty= -p $PID 2>/dev/null | tr -d ' ')
        if [ "$TTY_VAL" = "??" ] || [ -z "$TTY_VAL" ]; then
          RUN_CONTEXT="in the background as a system service"
        fi
      fi

      echo "🚀 YTV_Downloader is already running $RUN_CONTEXT on port $RUNNING_PORT!"
      echo ""
      echo "What do you want to do?"
      echo "  [r] Reload / Restart (stops existing process and launches with latest changes)"
      echo "  [s] Stop the process and exit"
      echo "  [k] Keep it running and open the web interface (default)"
      echo ""
      read -p "Enter choice (r/s/k): " choice
      case "$choice" in
        r|R )
          echo "Stopping existing downloader on port $RUNNING_PORT..."
          if [ -n "$PID" ]; then
            kill -9 $PID
            sleep 1
            echo "✓ Stopped."
          fi
          ;;
        s|S )
          echo "Stopping existing downloader on port $RUNNING_PORT..."
          if [ -n "$PID" ]; then
            kill -9 $PID
            echo "✓ Stopped. Exiting."
          fi
          exit 0
          ;;
        * )
          echo "Opening web interface at http://localhost:$RUNNING_PORT..."
          open "http://localhost:$RUNNING_PORT"
          exit 0
          ;;
      esac
    fi

    rm -f .port
    echo "🚀 Launching YTV_Downloader server..."
    npm start &
    SERVER_PID=$!

    for i in {1..30}; do
      if [ -f .port ]; then
        break
      fi
      sleep 0.1
    done

    PORT=3001
    if [ -f .port ]; then
      PORT=$(cat .port)
    fi

    echo "🚀 Opening web interface at http://localhost:$PORT..."
    open "http://localhost:$PORT"
    wait $SERVER_PID
}

run_docker() {
    echo "🐳 Checking Docker setup..."
    if ! command -v docker &> /dev/null; then
        echo "⚠️ Docker command-line tool is not installed!"
        read -p "Would you like to run locally on your host machine instead? (y/n): " local_fb
        if [[ "$local_fb" =~ ^[yY]$ ]]; then
            run_locally
            return
        else
            echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop/"
            exit 1
        fi
    fi

    # Check if Docker Daemon is running
    if ! docker info &> /dev/null; then
        echo "⚠️ Docker Daemon is not running!"
        if [ -d "/Applications/Docker.app" ]; then
            read -p "Docker Desktop is installed. Would you like to launch it automatically? (y/n): " launch_dd
            if [[ "$launch_dd" =~ ^[yY]$ ]]; then
                echo "Launching Docker Desktop..."
                open -a Docker
                echo "Waiting for Docker Daemon to start (up to 30s)..."
                for i in {1..30}; do
                    if docker info &> /dev/null; then
                        echo "✓ Docker Daemon is now running."
                        break
                    fi
                    sleep 1
                done
            fi
        fi
    fi

    # Re-verify daemon
    if ! docker info &> /dev/null; then
        echo "❌ Docker Daemon is still not running."
        read -p "Would you like to fallback and run locally on your host machine instead? (y/n): " local_fb
        if [[ "$local_fb" =~ ^[yY]$ ]]; then
            run_locally
            return
        else
            echo "Exiting."
            exit 1
        fi
    fi

    echo "🚀 Starting YTV_Downloader inside Docker container..."
    docker compose up --build
}

# Prompt user for mode choice
echo "How would you like to run YTV_Downloader?"
echo "  [1] Run via Docker (Highly Recommended - Isolated and clean)"
echo "  [2] Run Locally on Host Machine (Will install Node, FFmpeg, etc. if missing)"
echo ""
read -p "Enter choice (1/2) [Default: 1]: " choice

if [ -z "$choice" ] || [ "$choice" = "1" ]; then
    run_docker
elif [ "$choice" = "2" ]; then
    run_locally
else
    echo "Invalid option. Defaulting to Docker..."
    run_docker
fi
```

- [ ] **Step 2: Commit changes to START.command**

```bash
git add START.command
git commit -m "feat: add dual-mode launcher (Docker / Local) with auto-installation to START.command"
```

---

### Task 2: Refactor START.bat (Windows)

**Files:**
- Modify: `START.bat`

- [ ] **Step 1: Replace implementation of START.bat to support mode selection, winget auto-installs, and Docker launch fallback.**

Modify code in `START.bat` to have the following structure:
```cmd
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
```

- [ ] **Step 2: Commit changes to START.bat**

```bash
git add START.bat
git commit -m "feat: add dual-mode launcher (Docker / Local) with auto-installation to START.bat"
```
