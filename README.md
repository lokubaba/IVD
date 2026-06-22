# YTV_Downloader

A standalone, lightweight tool to paste YouTube URLs, extract direct stream URLs, export CSV data, and download/split media files locally. Integrates with the companion Chrome Extension for one-click downloads.

## Features
- **One-click downloads** from YouTube using the companion Chrome Extension.
- **WASM / Native downloading & splitting** using `yt-dlp` and `ffmpeg`.
- **High-Speed Downloads** via `aria2c` multi-connection external downloader.
- **Responsive & Premium UI** matching modern developer consoles, adaptable to mobile.
- **Smart Scraper Fallbacks & Inline Titles** for cleaner, editable file names.
- **Self-Healing & Port Auto-Binding** ensures zero config clashes on launch.
- **System Tray/Background running** via simple OS launch scripts.
- **Dockerized setup** for quick running without local Node/Python/FFmpeg dependencies.

---

## Setup & Running

### Option 1: Native Setup (Node.js)

1. Ensure you have **Node.js**, **FFmpeg**, and **yt-dlp** installed on your system.
   - macOS: `brew install node ffmpeg yt-dlp`
   - Windows: Install Node.js from the official site. Install `yt-dlp` and `ffmpeg` and add them to your System PATH.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the server:
   ```bash
   npm start
   ```
   The app will run at `http://localhost:3000`.

### Option 2: Docker Setup (Recommended for any device)

Run the application instantly without installing local dependencies:
```bash
docker compose up -d --build
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Downloaded files are mapped to your host's `Downloads` folder.

---

## Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left).
4. Select the `chrome-extension/` directory inside this repository.
5. Click on the extension icon on any YouTube video page to send it to the downloader.

---

## Running in the Background on Startup

### macOS (LaunchAgent)
1. Copy `com.lokubaba.downloader.plist` to `~/Library/LaunchAgents/com.lokubaba.downloader.plist`.
2. Open the `.plist` file and update the paths to point to your exact `node` binary and this repo folder.
3. Load the daemon:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.lokubaba.downloader.plist
   ```

### Windows (Startup VBScript)
1. Press `Win + R`, type `shell:startup`, and press Enter to open your Startup folder.
2. Create a shortcut in that folder pointing to `start-invisible.vbs` located inside this repository.
