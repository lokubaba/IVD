#!/bin/bash
cd "$(dirname "$0")"

clear
echo "=================================================="
echo "          YTV_Downloader Installer & Launcher"
echo "=================================================="
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please download and install Node.js from https://nodejs.org/"
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

# 2. Check for Git updates
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

# 3. Check and install dependencies
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

# 4. Prompt for Background Service Installation
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
            echo "  Downloader will launch on startup and run in the background!"
            echo ""
            ;;
        * )
            echo "Skipping startup setup."
            echo ""
            ;;
    esac
fi

# 5. Check if already running on any port (3001-3005)
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

# 6. Clean up any stale .port file
rm -f .port

# 7. Launch server in background
echo "🚀 Launching YTV_Downloader server..."
npm start &
SERVER_PID=$!

# Wait for server to bind and write the port file
for i in {1..30}; do
  if [ -f .port ]; then
    break
  fi
  sleep 0.1
done

# Read the dynamically allocated port
PORT=3001
if [ -f .port ]; then
  PORT=$(cat .port)
fi

# 8. Open browser to the UI
echo "🚀 Opening web interface at http://localhost:$PORT..."
open "http://localhost:$PORT"

# Wait for background process to keep script alive
wait $SERVER_PID
