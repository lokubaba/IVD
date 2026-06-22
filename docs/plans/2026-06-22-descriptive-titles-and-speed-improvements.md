# Descriptive Titles and Download Speed Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the fallback to "video.mp4" for direct stream extractions by utilizing webpage document titles and adding inline editable titles in the Web UI table. Optimize download speeds via robust integration with `aria2c` as an external parallel downloader if installed.

**Architecture:** Use `document.title` as a fallback in `content.js` and `popup.js` to ensure scraped links have appropriate titles. Implement inline editing (`contenteditable`) for the title cells in `public/index.html` to allow manual changes before downloads are sent. Add synchronous `aria2c` PATH detection in `server.js` to seamlessly activate 16-connection parallel downloads without breaking when it's absent.

**Tech Stack:** JavaScript (Chrome Extension APIs), HTML5, Node.js (Express, Child Process).

---

### Task 1: Scraper fallbacks in the Chrome Extension

Enhance the Chrome Extension content and popup scripts to capture and pass `document.title` as a fallback instead of generic stream placeholders.

**Files:**
- Modify: `chrome-extension/content.js:309-311`
- Modify: `chrome-extension/popup.js:336-345`

- [ ] **Step 1: Read and modify `chrome-extension/content.js` generic fallback block**
  Update the direct video scraper inside the content script's `"detect_videos"` message handler to scrape `document.title` as its title instead of using the hardcoded `"Direct Video Stream"` text.
  ```javascript
  // Change inside chrome-extension/content.js:
  // Old:
  } else if (vid.src && !vid.src.startsWith('blob:') && !vid.src.startsWith('mediasource:')) {
    list.push({ url: vid.src, title: 'Direct Video Stream' });
  }

  // New:
  } else if (vid.src && !vid.src.startsWith('blob:') && !vid.src.startsWith('mediasource:')) {
    let t = document.title || '';
    t = t.replace(/\n/g, ' ').trim();
    if (t.length > 80) t = t.slice(0, 80) + '...';
    list.push({ url: vid.src, title: t || 'Direct Video Stream' });
  }
  ```

- [ ] **Step 2: Read and modify `chrome-extension/popup.js` sendToExtractor logic**
  Ensure the active tab's title is supplied if neither the cached metadata nor the scraped items contain a title.
  ```javascript
  // Change inside chrome-extension/popup.js sendToExtractor:
  // Old:
    let title = '';
    const cached = metadataCache[currentUrl];
    if (cached && cached.title) {
      title = cached.title;
    } else {
      const found = detectedVideosGlobal.find(v => v.url === currentUrl);
      if (found) {
        title = found.title;
      }
    }

  // New:
    let title = '';
    const cached = metadataCache[currentUrl];
    if (cached && cached.title) {
      title = cached.title;
    } else {
      const found = detectedVideosGlobal.find(v => v.url === currentUrl);
      if (found) {
        title = found.title;
      }
    }
    if (!title && currentTab && currentTab.title) {
      title = currentTab.title.replace(' - YouTube', '').trim();
    }
  ```

---

### Task 2: Inline Editable Titles in the Webapp Table

Make the title cells in the downloads table inline-editable via `contenteditable` so users can modify file names before downloading.

**Files:**
- Modify: `public/index.html:512-517`, `960-965`, `1223`

- [ ] **Step 1: Add hover/focus styling for editable title cell**
  Inject styles to indicate the cell is interactive and focusable.
  ```css
  /* Modify inside public/index.html styles: */
  .c-title {
    color: var(--text);
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .c-title:hover {
    background: var(--surface-hover);
    outline: 1px dashed var(--border-focus);
    cursor: text;
  }
  .c-title:focus {
    background: var(--surface-light);
    outline: 1px solid var(--border-focus);
    text-overflow: clip;
    white-space: normal;
    word-break: break-all;
  }
  ```

- [ ] **Step 2: Add JS event handlers for editing titles**
  Implement the `updateTitle` and `handleTitleKey` functions to capture modifications and persist them.
  ```javascript
  // Inject right after saveCurrentState() function in public/index.html:
  function updateTitle(el, i) {
    const newTitle = el.textContent.trim() || '—';
    if (rows[i]) {
      rows[i].title = newTitle;
      saveCurrentState();
    }
  }

  function handleTitleKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  }
  ```

- [ ] **Step 3: Modify the Table Cell to be contenteditable**
  Make the title `<td>` editable. Keep the text untruncated inside the cell when editing so the user can see the entire name.
  ```html
  <!-- Change table render block inside public/index.html: -->
  <!-- Old: -->
  <td class="c-title ${r.title==='—'?'empty':''}" title="${esc(r.title)}">${esc(trunc(r.title,32))}</td>

  <!-- New: -->
  <td class="c-title ${r.title==='—'?'empty':''}" contenteditable="true" onblur="updateTitle(this, ${i})" onkeydown="handleTitleKey(event)" title="Click to edit title">${esc(r.title)}</td>
  ```

---

### Task 3: Multi-Connection Download Accelerator in Server

Implement dynamic `aria2c` binary detection and inject external downloader parameters when active to boost speed.

**Files:**
- Modify: `server.js` (add function near utility blocks, adapt `spawnArgs` in `/download-progress`)

- [ ] **Step 1: Add synchronous `hasAria2c` check to `server.js`**
  Scan the runtime environment PATH variables for the presence of `aria2c` (or `aria2c.exe` on Windows).
  ```javascript
  // Inject in server.js near standard helper blocks (e.g., around line 186):
  function hasAria2c() {
    const exe = process.platform === 'win32' ? 'aria2c.exe' : 'aria2c';
    const paths = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
    for (const p of paths) {
      try {
        if (fs.existsSync(path.join(p, exe))) {
          return true;
        }
      } catch {}
    }
    return false;
  }
  ```

- [ ] **Step 2: Inject `aria2c` downloader options into `yt-dlp` download process**
  Update the spawning parameters inside `/download-progress` to accelerate files dynamically using parallel connections.
  ```javascript
  // Change inside spawnArgs construction in server.js:
  // Old:
    const spawnArgs = [
      ...cookieArgs,
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--no-playlist', '--newline',
      '--concurrent-fragments', '5',
      '-o', destFile,
      ytUrl
    ];

  // New:
    const useAria2c = hasAria2c();
    if (useAria2c) {
      console.log(`[Download] Accelerating with aria2c multi-connection downloader...`);
    }
    const spawnArgs = [
      ...cookieArgs,
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--no-playlist', '--newline',
      '--concurrent-fragments', '5',
    ];
    if (useAria2c) {
      spawnArgs.push('--external-downloader', 'aria2c');
      spawnArgs.push('--external-downloader-args', '-x 16 -s 16 -k 1M');
    }
    spawnArgs.push('-o', destFile, ytUrl);
  ```
