let APP_URL = 'http://localhost:3000';

let currentTab  = null;
let currentUrl  = null;
let serverOnline = false;

// ── Auto-discovery scanning ──
async function discoverServer() {
  const ports = [3000, 3001, 3002, 3003, 3004, 3005];
  for (const port of ports) {
    const url = `http://localhost:${port}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);
      const r = await fetch(`${url}/check`, { signal: controller.signal });
      clearTimeout(timer);
      if (r.ok) {
        const data = await r.json();
        if (data.installed) {
          APP_URL = url;
          return true;
        }
      }
    } catch (e) {}
  }
  return false;
}

// ── Boot ──────────────────────────────────────────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Check server (try default 3000 first, fallback to scanner)
  serverOnline = await checkServer();
  if (!serverOnline) {
    serverOnline = await discoverServer();
  }
  updateServerIndicator(serverOnline);

  if (!serverOnline) {
    show('state-offline');
    return;
  }

  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    showNoVideoPanel('Invalid page', 'This page does not support video extraction.');
    return;
  }

  // Scan for videos on the page
  let detectedUrls = await detectVideosInTab(tab.id);
  
  // If no videos detected via DOM, fallback to current tab URL
  if (detectedUrls.length === 0 && tab.url) {
    detectedUrls = [tab.url];
  }

  setupVideoSelector(detectedUrls);
})();

// ── Helpers ───────────────────────────────────────────────────────────
function show(id) {
  ['state-offline','state-sent','panel-ready'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? 'block' : 'none';
    if (el && s.startsWith('state')) el.classList.toggle('visible', s === id);
  });
}

async function checkServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${APP_URL}/check`, { signal: controller.signal });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

function updateServerIndicator(online) {
  const dot    = document.getElementById('serverDot');
  const status = document.getElementById('serverStatus');
  dot.className    = 'server-dot ' + (online ? 'online' : 'offline');
  status.textContent = online ? 'App is running ✓' : 'App not running';
}

async function detectVideosInTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "detect_videos" });
    return response && response.urls ? response.urls : [];
  } catch (e) {
    console.warn("Failed to communicate with content script. Falling back to tab URL.", e);
    return [];
  }
}

function setupVideoSelector(urls) {
  show('panel-ready');
  const wrapper = document.getElementById('dropdown-wrapper');
  const select = document.getElementById('videoSelect');

  if (urls.length > 1) {
    wrapper.style.display = 'block';
    select.innerHTML = '';
    urls.forEach((url, index) => {
      const option = document.createElement('option');
      option.value = url;
      try {
        const u = new URL(url);
        const domain = u.hostname.replace('www.', '');
        const pathSnippet = u.pathname.length > 15 ? u.pathname.slice(0, 15) + '...' : u.pathname;
        option.textContent = `Video ${index + 1} (${domain}${pathSnippet})`;
      } catch {
        option.textContent = `Video ${index + 1} (${url.slice(0, 30)}...)`;
      }
      select.appendChild(option);
    });

    // Handle dropdown selection change
    select.onchange = () => {
      currentUrl = select.value;
      loadVideoDetails(currentUrl);
    };

    currentUrl = urls[0];
    loadVideoDetails(currentUrl);
  } else if (urls.length === 1) {
    wrapper.style.display = 'none';
    currentUrl = urls[0];
    loadVideoDetails(currentUrl);
  } else {
    showNoVideoPanel('No video found', 'Could not detect any videos on this page.');
  }
}

async function loadVideoDetails(url) {
  // Show loading state in the card
  document.getElementById('videoTitle').textContent = 'Loading video info…';
  document.getElementById('videoUrlShort').textContent = url;
  
  // Reset thumbnail placeholder
  const thumbWrap = document.getElementById('thumbWrap');
  if (!thumbWrap) {
    const img = document.querySelector('.video-card img.thumb');
    if (img) {
      img.replaceWith(createPlaceholder());
    }
  } else {
    thumbWrap.textContent = '🎬';
  }

  try {
    const resp = await fetch(`${APP_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
    });
    if (resp.ok) {
      const text = await resp.text();
      const info = JSON.parse(text.trim());
      if (info.error) {
        showMetadataError(url, info.error);
        return;
      }
      
      // Show video info
      document.getElementById('videoTitle').textContent = info.title || 'Video File';
      
      // Format subtitle: size | duration | resolution
      const parts = [];
      if (info.filesize && info.filesize !== 'unknown') parts.push(info.filesize);
      if (info.duration && info.duration !== 'unknown') parts.push(info.duration);
      if (info.resolution && info.resolution !== 'unknown') parts.push(info.resolution);
      
      const subtitle = parts.length > 0 ? parts.join(' • ') : url;
      document.getElementById('videoUrlShort').textContent = subtitle;

      // Render Thumbnail
      const targetThumb = document.getElementById('thumbWrap') || document.querySelector('.video-card img.thumb');
      if (targetThumb) {
        if (info.thumbnail) {
          const img = document.createElement('img');
          img.className = 'thumb';
          img.src = info.thumbnail;
          img.onerror = () => {
            img.replaceWith(createPlaceholder());
          };
          targetThumb.replaceWith(img);
        } else {
          targetThumb.replaceWith(createPlaceholder());
        }
      }
    } else {
      showMetadataError(url, 'Server returned error');
    }
  } catch (e) {
    showMetadataError(url, 'Could not fetch metadata');
  }
}

function createPlaceholder() {
  const d = document.createElement('div');
  d.id = 'thumbWrap';
  d.className = 'thumb-placeholder';
  d.textContent = '🎬';
  return d;
}

function showMetadataError(url, errMsg) {
  document.getElementById('videoTitle').textContent = 'Video Stream';
  document.getElementById('videoUrlShort').textContent = url.length > 40 ? url.slice(0, 40) + '...' : url;
  const targetThumb = document.getElementById('thumbWrap') || document.querySelector('.video-card img.thumb');
  if (targetThumb) {
    targetThumb.replaceWith(createPlaceholder());
  }
}

function showNoVideoPanel(title, description) {
  show('panel-ready');
  document.getElementById('dropdown-wrapper').style.display = 'none';
  document.getElementById('videoTitle').textContent = title;
  document.getElementById('videoUrlShort').textContent = description;
  const targetThumb = document.getElementById('thumbWrap') || document.querySelector('.video-card img.thumb');
  if (targetThumb) {
    targetThumb.replaceWith(createPlaceholder());
  }
}

// ── Send to extractor ─────────────────────────────────────────────────
async function sendToExtractor() {
  const btn = document.getElementById('sendBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Sending…';

  try {
    const resp = await fetch(`${APP_URL}/add-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl }),
    });

    if (resp.ok) {
      show('state-sent');
    } else {
      btn.disabled    = false;
      btn.textContent = '⚡ Send to Extractor';
      btn.style.background = '#dc2626';
      btn.textContent = '✗ Failed — try again';
      setTimeout(() => {
        btn.style.background = '';
        btn.textContent = '⚡ Send to Extractor';
      }, 2000);
    }
  } catch (e) {
    btn.disabled    = false;
    btn.style.background = '#dc2626';
    btn.textContent = '✗ App not reachable';
    setTimeout(() => {
      btn.style.background = '';
      btn.textContent = '⚡ Send to Extractor';
    }, 2000);
  }
}

// ── Open app ──────────────────────────────────────────────────────────
function openApp() {
  chrome.tabs.create({ url: APP_URL });
}
