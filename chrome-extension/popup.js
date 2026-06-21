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

  const isYT = tab.url && (
    tab.url.includes('youtube.com/watch') ||
    tab.url.includes('youtu.be/')
  );

  // Check server (try default 3000 first, fallback to scanner)
  serverOnline = await checkServer();
  if (!serverOnline) {
    serverOnline = await discoverServer();
  }
  updateServerIndicator(serverOnline);

  if (!isYT) {
    show('state-noyt');
    return;
  }

  if (!serverOnline) {
    show('state-offline');
    return;
  }

  // On a YouTube video — get details from the page
  currentUrl = normalizeYouTubeUrl(tab.url);
  showReadyPanel(tab);
})();

// ── Helpers ───────────────────────────────────────────────────────────
function show(id) {
  ['state-noyt','state-offline','state-sent','panel-ready'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? (s.startsWith('state') ? 'block' : 'block') : 'none';
    if (el && s.startsWith('state')) el.classList.toggle('visible', s === id);
  });
}

function normalizeYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    return v ? `https://www.youtube.com/watch?v=${v}` : url;
  } catch { return url; }
}

function videoIdFrom(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') || url.split('/').pop().split('?')[0];
  } catch { return null; }
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

function showReadyPanel(tab) {
  show('panel-ready');

  // Video title from tab
  const title = tab.title ? tab.title.replace(' - YouTube','').trim() : 'YouTube Video';
  document.getElementById('videoTitle').textContent    = title;
  document.getElementById('videoUrlShort').textContent = currentUrl;

  // Thumbnail
  const vid = videoIdFrom(currentUrl);
  if (vid) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
    img.onerror = () => {}; // keep placeholder on error
    document.getElementById('thumbWrap').replaceWith(img);
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
