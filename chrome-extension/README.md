# yt-stream Chrome Extension

Adds a one-click **⚡ Extract** button directly on YouTube video pages, and an extension popup — both send the video URL straight to your local extractor app.

## How to install (Chrome)

1. Open Chrome and go to: `chrome://extensions`
2. Turn on **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder (this folder)
5. The extension is now installed ✓

## How to use

### Option A — Button on YouTube page
- Go to any YouTube video
- A blue **⚡ Extract** button appears next to the Like/Share buttons
- Click it — the URL is instantly sent to your extractor app

### Option B — Extension popup
- Click the **yt** icon in Chrome's toolbar (top-right)
- It shows the current video with a thumbnail
- Click **⚡ Send to Extractor**

## Requirements
- The **yt-stream extractor app must be running** (double-click `START.command`)
- The app runs at `http://localhost:3001` (or next available port up to `3005`)
- URLs sent from the extension appear automatically in the app's table

## Notes
- The extension only works on `youtube.com/watch` pages
- If the app isn't running, the button shows "App not running" in red
- The popup shows a green dot when the app is running, red when it's not
