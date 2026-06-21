# Design Document: Generic Video Extractor Extension & Server Support

This document outlines the design for updating the Chrome extension and local download server to support extracting and downloading videos from any website (such as Instagram, Facebook, LinkedIn, etc.), utilizing `yt-dlp`'s native multi-site capabilities.

## Goals
* **Generic Website Support:** Allow video extraction on any website that `yt-dlp` supports.
* **Multi-Video Detection:** Detect multiple video/post links on feed-heavy sites like Instagram and LinkedIn.
* **Dropdown Selection:** Present a clean dropdown in the Chrome extension popup when multiple videos are detected.
* **Metadata Extraction:** Fetch the title, duration, and approximate file size from the backend for the selected video before sending it to the downloader.

---

## 1. Page Video Detection (Content Script)
The content script (`content.js`) will run on all URLs (matches: `<all_urls>`). It will contain site-specific detection functions alongside a generic fallback.

### Detection Strategies
* **YouTube:**
  * Checks `window.location.href` for watch/shorts pages.
  * If on feed/playlist, scrapes links starting with `/watch` or `/shorts`.
* **Instagram:**
  * Scrapes all `a` elements with hrefs containing `/p/` or `/reel/`.
  * Normalizes them to absolute URLs.
* **LinkedIn:**
  * Scrapes all update/post containers and extracts links containing `/feed/update/urn:li:activity:` or `/posts/`.
* **Generic Fallback:**
  * Scrapes all `<video>` tags on the page. If the `<video>` tag is inside an anchor or has a parent anchor link, it grabs that link. Otherwise, it defaults to the active tab's URL.

### Messaging
When the popup opens, it sends a message (`{ action: "detect_videos" }`) to the content script. The content script runs the detectors, returns an array of unique URLs, and stops.

---

## 2. Extension Popup UI & Logic
The popup (`popup.html` and `popup.js`) will be updated to handle a dynamic list of detected videos:

* **Header:** Title changes from "yt-stream extractor" to a generic "Video Stream Extractor".
* **Dropdown Element:** A `<select>` element is added to the HTML, hidden by default. If multiple URLs are returned, the dropdown is populated and shown.
* **Selected Video Card:** Shows details for the currently selected video.
* **State Flow:**
  1. **Scanning:** Displays "Scanning page for videos...".
  2. **Single Video Found:** Automatically selects it, fetches metadata, and displays the card.
  3. **Multiple Videos Found:** Shows the dropdown. When the user changes selection, a loading state appears, and the popup fetches metadata for the new URL.
  4. **No Videos Found:** Falls back to using the current tab's URL as the primary target.

### Metadata Fetching
Instead of relying on browser-side extraction, the popup sends a POST request to `${APP_URL}/extract` with the selected URL. The response returns:
* Title
* Resolution
* Approximated File Size
* Duration

---

## 3. Backend Server Updates (`server.js`)
We will remove the YouTube-specific validation and improve `yt-dlp` info parsing for generic sites.

### Validation Removal
* Update `/add-url` to accept any valid HTTP/HTTPS URL, rather than strictly checking for `youtube.com` or `youtu.be`.

### Universal Metadata Extraction
Instead of parsing YouTube-specific URL search parameters like `clen` and `itag` for metadata, the server will call `yt-dlp` to get generic fields:
```bash
yt-dlp --print "%(title)s" --print "%(filesize_approx,filesize)s" --print "%(duration)s" --print "%(resolution)s" --no-playlist --no-warnings "<URL>"
```
* **Title:** `%(title)s`
* **File Size:** We'll print `%(filesize_approx,filesize)s` which outputs the size in bytes (approximate or exact). We will convert these bytes to a human-readable format (MB/GB).
* **Duration:** `%(duration)s` (returns duration in seconds, which we'll convert to MM:SS or HH:MM:SS format).
* **Resolution:** `%(resolution)s` (e.g. `1080x1920` or `720p`).
