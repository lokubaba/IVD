# Port and PATH Detection Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Resolve macOS LaunchAgent PATH environment limitations, prevent port binding conflicts on startup via dynamic port scanning, and redirect browser opening to port 3000.

**Architecture:** Augment `process.env.PATH` at server startup with standard search paths. Implement recursive binding logic for ports 3001-3005 in `server.js` and write the active port to a `.port` file. Update the startup scripts and the Chrome Extension to open the web UI at `http://localhost:3000`.

**Tech Stack:** Node.js, Express, Shell Script (Bash), Batch Script.

---

### Task 1: Self-Healing PATH Augmentation in `server.js`

**Files:**
- Modify: `/Users/lokesh/App Developement/YTV_Downloader/server.js:1-12`

**Step 1: Write path augmentation logic at the top of server.js**

Add the following code block immediately after the `require` statements:
```javascript
// Pre-emptively augment PATH for LaunchAgent execution contexts
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
    console.log(`[Startup] PATH augmented with: ${addedPaths.join(':')}`);
  }
}
```

**Step 2: Verify PATH logic**
- Run: `node server.js` from a clean terminal environment or LaunchAgent emulation and call the `/check` endpoint.
- Expected: Response returns `{ installed: true }` and detects `yt-dlp` version successfully.

**Step 3: Commit**
```bash
git add server.js
git commit -m "feat: add path augmentation to server.js for launchd contexts"
```

---

### Task 2: Graceful Server-Side Port Allocation & State Persistence

**Files:**
- Modify: `/Users/lokesh/App Developement/YTV_Downloader/server.js:10, 625-629`

**Step 1: Replace app.listen with custom server wrapper**
Replace:
```javascript
app.listen(PORT, () => {
  console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
  console.log(`  📁  Serving files from: ${PUBLIC_DIR}\n`);
});
```
with:
```javascript
const http = require('http');

function startServer(targetPort) {
  const server = http.createServer(app);
  let port = targetPort;
  const MAX_PORT = 3005;

  function listen() {
    server.listen(port);
  }

  server.on('listening', () => {
    console.log(`\n  ✅  Server running at http://localhost:${port}`);
    console.log(`  📁  Serving files from: ${PUBLIC_DIR}\n`);
    
    // Write active port to a state file
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

const startPort = parseInt(process.env.PORT, 10) || 3001;
startServer(startPort);
```

**Step 2: Verify port scanner**
- Start one process on port 3001 using `nc -l 3001`.
- In a separate shell, start the server: `node server.js`.
- Expected: Warning logged that port 3001 is in use, successfully binds to port 3002, and writes `3002` to `.port` file in root.

**Step 3: Commit**
```bash
git add server.js
git commit -m "feat: implement dynamic port scanner and persistent .port state file"
```

---

### Task 3: Chrome Extension URL Redirection

**Files:**
- Modify: `/Users/lokesh/App Developement/YTV_Downloader/chrome-extension/popup.js:377-380`

**Step 1: Redirect popup buttons to port 3000**
Replace:
```javascript
function openApp() {
  chrome.tabs.create({ url: APP_URL });
}
```
with:
```javascript
function openApp() {
  chrome.tabs.create({ url: 'http://localhost:3000' });
}
```

**Step 2: Verify Extension popup action**
- Click on the "Open Extractor App ↗" button in the Chrome extension popup.
- Expected: Opens a browser tab to `http://localhost:3000`.

**Step 3: Commit**
```bash
git add chrome-extension/popup.js
git commit -m "feat: configure chrome extension to open webapp on port 3000"
```

---

### Task 4: Simplified Launch Scripts

**Files:**
- Modify: `/Users/lokesh/App Developement/YTV_Downloader/START.command`
- Modify: `/Users/lokesh/App Developement/YTV_Downloader/START.bat`

**Step 1: Simplify START.command (macOS)**
Replace lines 103-131 of `START.command` with:
```bash
# 5. Clean up any stale .port file
rm -f .port

# 6. Launch server in background
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

# 7. Open browser to the UI (port 3000)
echo "🚀 Opening web interface at http://localhost:3000..."
open "http://localhost:3000"

# Wait for background process to keep script alive
wait $SERVER_PID
```

**Step 2: Simplify START.bat (Windows)**
Replace lines 80-115 of `START.bat` with:
```batch
:: 5. Clean up any stale .port file
if exist .port del /q .port

:: 6. Launch server in background
echo 🚀 Launching YTV_Downloader server...
start /b npm start

:: Wait for server to bind and write the port file
timeout /t 2 >nul

:: 7. Open browser to the UI (port 3000)
echo 🚀 Opening web interface at http://localhost:3000...
start http://localhost:3000
```

**Step 3: Verify scripts**
- Run `./START.command`.
- Expected: Starts server in the background, writes `.port` with the active backend port, and opens the default browser directly to `http://localhost:3000`.

**Step 4: Commit**
```bash
git add START.command START.bat
git commit -m "feat: update launch scripts to simplify port handling and launch UI at port 3000"
```
