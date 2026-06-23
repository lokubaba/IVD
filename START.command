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
