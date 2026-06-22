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
for port in {3001..3005}; do
  RESPONSE=$(curl -s --max-time 1 http://localhost:$port/check 2>/dev/null)
  if [[ "$RESPONSE" == *"installed"* ]]; then
    ALREADY_RUNNING=1
    break
  fi
done

if [ $ALREADY_RUNNING -eq 1 ]; then
  echo "🚀 YTV_Downloader is already running!"
  echo "Opening web interface at http://localhost:3000..."
  open "http://localhost:3000"
  exit 0
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

# 8. Open browser to the UI (port 3000)
echo "🚀 Opening web interface at http://localhost:3000..."
open "http://localhost:3000"

# Wait for background process to keep script alive
wait $SERVER_PID
