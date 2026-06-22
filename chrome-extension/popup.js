let APP_URL = 'http://localhost:3001';

let currentTab = null;
let currentUrl = null;
let serverOnline = false;
const metadataCache = {};
let detectedVideosGlobal = [];

// ── Auto-discovery scanning ──
async function discoverServer() {
  const ports = [3000, 3001, 3002, 3003, 3004, 3005];
  let foundUrl = null;
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
          // Prioritize the server running the new VEX code
          if (data.vex) {
            APP_URL = url;
            if (chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ APP_URL });
            }
            return true;
          }
          if (!foundUrl) {
            foundUrl = url;
          }
        }
      }
    } catch (e) { }
  }
  if (foundUrl) {
    APP_URL = foundUrl;
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ APP_URL });
    }
    return true;
  }
  return false;
}

async function isVexServer(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const r = await fetch(`${url}/check`, { signal: controller.signal });
    clearTimeout(timer);
    if (r.ok) {
      const data = await r.json();
      return !!data.vex;
    }
  } catch { }
  return false;
}

// ── Boot ──────────────────────────────────────────────────────────────
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    // Retrieve APP_URL from local storage if available
    if (chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get('APP_URL');
      if (stored && stored.APP_URL) {
        APP_URL = stored.APP_URL;
      }
    }

    // Check server: verify if the current APP_URL is online and runs VEX
    serverOnline = await checkServer();
    const isVex = serverOnline && (await isVexServer(APP_URL));

    if (!isVex) {
      // Scan all ports to find a VEX server
      const foundVex = await discoverServer();
      if (foundVex) {
        serverOnline = true;
      } else if (!serverOnline) {
        serverOnline = false;
      }
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
    detectedVideosGlobal = await detectVideosInTab(tab.id);

    // If no videos detected via DOM, fallback to current tab URL
    if (detectedVideosGlobal.length === 0 && tab.url) {
      detectedVideosGlobal = [{ url: tab.url, title: tab.title || 'Page Video' }];
    }

    setupVideoSelector(detectedVideosGlobal);
  } catch (err) {
    console.error("Boot execution failed:", err);
    serverOnline = false;
    updateServerIndicator(serverOnline);
    show('state-offline');
  }
})();

// ── Helpers ───────────────────────────────────────────────────────────
function show(id) {
  ['state-offline', 'state-sent', 'panel-ready'].forEach(s => {
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
  const dot = document.getElementById('serverDot');
  const status = document.getElementById('serverStatus');
  dot.className = 'server-dot ' + (online ? 'online' : 'offline');
  status.textContent = online ? 'App is running ✓' : 'App not running';
}

async function detectVideosInTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "detect_videos" });
    return response && response.videos ? response.videos : [];
  } catch (e) {
    console.warn("Failed to communicate with content script. Falling back to tab URL.", e);
    return [];
  }
}

function setupVideoSelector(videos) {
  show('panel-ready');
  const wrapper = document.getElementById('dropdown-wrapper');
  const select = document.getElementById('videoSelect');

  if (videos.length >= 1) {
    wrapper.style.display = 'block';
    select.innerHTML = '';

    // Instantly populate select elements with scraped video titles
    videos.forEach((video, index) => {
      const option = document.createElement('option');
      option.value = video.url;
      const title = video.title || 'Video';
      const displayTitle = title.length > 40 ? title.slice(0, 40) + '...' : title;
      option.textContent = `Video ${index + 1}: ${displayTitle}`;
      select.appendChild(option);
    });

    // Handle dropdown selection change
    select.onchange = () => {
      currentUrl = select.value;
      renderOrFetchDetails(currentUrl);
    };

    currentUrl = videos[0].url;
    renderOrFetchDetails(currentUrl);

    // Fetch details/sizes sequentially in background to avoid blocking connection sockets
    (async () => {
      for (let i = 0; i < videos.length; i++) {
        await fetchMetadataForOption(videos[i].url, i);
      }
    })();
  } else {
    showNoVideoPanel('No video found', 'Could not detect any videos on this page.');
  }
}

async function fetchMetadataForOption(url, index) {
  try {
    const resp = await fetch(`${APP_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
    });
    if (resp.ok) {
      const text = await resp.text();
      const info = JSON.parse(text.trim());
      if (!info.error) {
        metadataCache[url] = info;

        // Update dropdown option label to include file size
        const select = document.getElementById('videoSelect');
        const option = select.options[index];
        if (option) {
          const title = info.title || option.textContent.replace(/^Video \d+: /, '');
          const size = info.filesize && info.filesize !== 'unknown' ? info.filesize : '';
          const displayTitle = title.length > 30 ? title.slice(0, 30) + '...' : title;
          const displaySize = size ? ` [${size}]` : '';
          option.textContent = `Video ${index + 1}: ${displayTitle}${displaySize}`;
        }

        // If currently viewed video, update layout details in real-time
        if (currentUrl === url) {
          renderVideoCard(info);
        }
      }
    }
  } catch (e) {
    console.error(`Failed to fetch metadata for Option ${index + 1}`, e);
  }
}

function renderOrFetchDetails(url) {
  if (metadataCache[url]) {
    renderVideoCard(metadataCache[url]);
  } else {
    loadVideoDetails(url);
  }
}

function renderVideoCard(info) {
  document.getElementById('videoTitle').textContent = info.title || 'Video File';

  // Format subtitle: size | duration | resolution
  const parts = [];
  if (info.filesize && info.filesize !== 'unknown') parts.push(info.filesize);
  if (info.duration && info.duration !== 'unknown') parts.push(info.duration);
  if (info.resolution && info.resolution !== 'unknown') parts.push(info.resolution);

  const subtitle = parts.length > 0 ? parts.join(' • ') : info.url;
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
}

async function loadVideoDetails(url) {
  // Show loading state in the card
  document.getElementById('videoTitle').textContent = 'Loading video info…';
  document.getElementById('videoUrlShort').textContent = url;

  // Reset thumbnail placeholder
  const targetThumb = document.getElementById('thumbWrap') || document.querySelector('.video-card img.thumb');
  if (targetThumb) {
    targetThumb.replaceWith(createPlaceholder());
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

      metadataCache[url] = info;
      renderVideoCard(info);
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
  btn.disabled = true;
  btn.textContent = '⏳ Sending…';

  try {
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

    const resp = await fetch(`${APP_URL}/add-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl, title }),
    });

    if (resp.ok) {
      show('state-sent');
    } else {
      btn.disabled = false;
      btn.textContent = '⚡ Send to Extractor';
      btn.style.background = '#dc2626';
      btn.textContent = '✗ Failed — try again';
      setTimeout(() => {
        btn.style.background = '';
        btn.textContent = '⚡ Send to Extractor';
      }, 2000);
    }
  } catch (e) {
    btn.disabled = false;
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

// Bind button events dynamically to comply with Manifest V3 CSP
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sendBtn')?.addEventListener('click', sendToExtractor);
  document.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', openApp);
  });
});
