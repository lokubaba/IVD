# Design Document: Port Conflict, PATH Detection, and WebApp Opening Port

This document outlines the design for resolving port occupancy conflicts and PATH detection issues on macOS and Windows, ensuring the `YTV_Downloader` background daemon and interactive launchers run robustly. It also updates the browser opening URL to target port 3000.

---

## 1. Background & Problem Statement

1. **PATH Detection on macOS (LaunchAgent Context)**
   * When `YTV_Downloader` is configured to run in the background on startup, it uses macOS `launchd` via `com.lokubaba.downloader.plist`.
   * `launchd` executes processes with a restricted default `PATH` (typically `/usr/bin:/bin:/usr/sbin:/sbin`).
   * Tools like `yt-dlp` and `ffmpeg` installed via Homebrew live under `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel Mac), which are missing from `launchd`'s environment. This causes download/metadata extraction operations to fail with command-not-found errors.

2. **Port Conflict on Startup**
   * The server defaults to port `3001`. If port `3001` is occupied by another application, the background process crashes due to binding errors.
   * Interactive launchers (`START.command` and `START.bat`) prompt users to choose alternative ports, but this mechanism is not available when starting automatically in the background on system boot.

3. **Opening WebApp at Port 3000**
   * Even though the backend server runs on a dynamically allocated port (e.g. `3001-3005`), the web app UI should be opened at `http://localhost:3000` (which could be the main React app port, proxy port, or mapped port).
   * The Chrome extension should send API calls to the discovered dynamic port (`APP_URL`), but the "Open Extractor App" buttons should open `http://localhost:3000`.

---

## 2. Design Solutions

### Section 1: Self-Healing PATH Augmentation in `server.js`
Rather than relying on the caller's environment, the server will check for and prepend standard installation folders to `process.env.PATH` during startup:

```javascript
const fs = require('fs');

if (process.platform === 'darwin' || process.platform === 'linux') {
  const commonPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];
  const currentPath = process.env.PATH || '';
  const paths = currentPath.split(':');
  const addedPaths = commonPaths.filter(p => !paths.includes(p) && fs.existsSync(p));
  
  if (addedPaths.length > 0) {
    process.env.PATH = [...addedPaths, currentPath].join(':');
    console.log(`[Startup] Pre-emptively added to PATH: ${addedPaths.join(':')}`);
  }
}
```

### Section 2: Graceful Server-Side Port Allocation & State Persistence
Instead of crashing or prompting interactively, the server will recursively check for binding conflicts and step through ports `3001-3005`. Once bound, it writes the active port to a `.port` file in the root directory.

```javascript
const http = require('http');
const path = require('path');

function startServer(targetPort) {
  const server = http.createServer(app);
  let port = targetPort;
  const MAX_PORT = 3005;

  function listen() {
    server.listen(port);
  }

  server.on('listening', () => {
    console.log(`\n  ✅  Server running at http://localhost:${port}`);
    try {
      fs.writeFileSync(path.resolve(__dirname, '.port'), String(port), 'utf8');
    } catch (err) {
      console.error('Failed to write .port file:', err);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < MAX_PORT) {
      console.warn(`⚠️  Port ${port} is in use, retrying on port ${port + 1}...`);
      port++;
      listen();
    } else {
      console.error('❌  Server startup error:', err);
      process.exit(1);
    }
  });

  listen();
}
```

### Section 3: Chrome Extension URL Redirect
The Chrome Extension will communicate with the detected dynamic port backend via API fetches (using `/add-url` and `/extract`), but clicking "Open Extractor App" will redirect the user to port `3000`:

```javascript
function openApp() {
  chrome.tabs.create({ url: 'http://localhost:3000' });
}
```

### Section 4: Simplified Launch Scripts
Launchers will run the server, wait for the `.port` file to be generated, and then open the user's default browser to `http://localhost:3000`.

#### macOS (`START.command`)
```bash
# Start server in background
npm start &
SERVER_PID=$!

# Wait for .port file to be generated
for i in {1..30}; do
  if [ -f .port ]; then
    break
  fi
  sleep 0.1
done

echo "🚀 Launching web interface at http://localhost:3000..."
open "http://localhost:3000"
```

#### Windows (`START.bat`)
```batch
:: Start server
start /b npm start

:: Wait for .port file to be generated
timeout /t 2 >nul

echo 🚀 Launching web interface at http://localhost:3000...
start http://localhost:3000
```
