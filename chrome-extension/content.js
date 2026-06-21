// Injected on all pages
// If on YouTube, adds a small "⚡ Extract" button next to the video title
const APP_URL = 'http://localhost:3000';
let injected = false;

function getCurrentVideoUrl() {
  if (!window.location.host.includes('youtube.com')) return null;
  const v = new URLSearchParams(window.location.search).get('v');
  return v ? `https://www.youtube.com/watch?v=${v}` : null;
}

function injectButton() {
  if (injected) return;
  const url = getCurrentVideoUrl();
  if (!url) return;

  // Wait for the actions bar (like/share buttons area) to exist
  const actionsBar = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer.ytd-watch-metadata');
  if (!actionsBar) return;

  // Don't inject twice
  if (document.getElementById('yt-stream-btn')) return;

  injected = true;

  const btn = document.createElement('button');
  btn.id = 'yt-stream-btn';
  btn.innerHTML = `
    <span style="font-size:13px">⚡</span>
    <span>Extract</span>
  `;
  Object.assign(btn.style, {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            '5px',
    background:     '#2563eb',
    color:          '#fff',
    border:         'none',
    borderRadius:   '18px',
    padding:        '0 14px',
    height:         '36px',
    fontSize:       '13px',
    fontWeight:     '600',
    fontFamily:     'inherit',
    cursor:         'pointer',
    marginLeft:     '8px',
    transition:     'background .15s, transform .1s',
    flexShrink:     '0',
  });

  btn.onmouseenter = () => btn.style.background = '#1d4ed8';
  btn.onmouseleave = () => btn.style.background = '#2563eb';
  btn.onmousedown  = () => btn.style.transform  = 'scale(.97)';
  btn.onmouseup    = () => btn.style.transform  = 'scale(1)';

  btn.onclick = async () => {
    const videoUrl = getCurrentVideoUrl();
    if (!videoUrl) return;

    btn.innerHTML = `<span>⏳</span><span>Sending…</span>`;
    btn.style.background = '#2563eb';
    btn.disabled = true;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${APP_URL}/add-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        btn.innerHTML = `<span>✅</span><span>Sent!</span>`;
        btn.style.background = '#16a34a';
        setTimeout(() => {
          btn.innerHTML = `<span>⚡</span><span>Extract</span>`;
          btn.style.background = '#2563eb';
          btn.disabled = false;
        }, 2500);
      } else {
        throw new Error('Server error');
      }
    } catch {
      btn.innerHTML = `<span>✗</span><span>App not running</span>`;
      btn.style.background = '#dc2626';
      setTimeout(() => {
        btn.innerHTML = `<span>⚡</span><span>Extract</span>`;
        btn.style.background = '#2563eb';
        btn.disabled = false;
      }, 2500);
    }
  };

  actionsBar.appendChild(btn);
}

// YouTube is a SPA — watch for navigation and re-inject
function onNavigate() {
  injected = false;
  document.getElementById('yt-stream-btn')?.remove();
  // Wait for DOM to settle after navigation
  setTimeout(() => tryInject(), 1500);
}

function tryInject(attempts = 0) {
  if (getCurrentVideoUrl()) {
    injectButton();
    if (!injected && attempts < 10) {
      setTimeout(() => tryInject(attempts + 1), 500);
    }
  }
}

// Only initialize YouTube-specific DOM injection if we are on YouTube
if (window.location.host.includes('youtube.com')) {
  const observer = new MutationObserver(() => {
    if (window.location.href !== observer._lastUrl) {
      observer._lastUrl = window.location.href;
      onNavigate();
    }
  });
  observer._lastUrl = window.location.href;
  observer.observe(document.body, { subtree: true, childList: true });

  // Initial inject
  tryInject();
}

// ── Multi-video extraction detection listener ──────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "detect_videos") {
    const urls = [];

    // 1. YouTube specific
    if (window.location.host.includes('youtube.com')) {
      const v = new URLSearchParams(window.location.search).get('v');
      if (v) urls.push(`https://www.youtube.com/watch?v=${v}`);
      
      document.querySelectorAll('a[href*="/watch?v="]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          const val = u.searchParams.get('v');
          if (val) urls.push(`https://www.youtube.com/watch?v=${val}`);
        } catch {}
      });
    }

    // 2. Instagram specific
    if (window.location.host.includes('instagram.com')) {
      document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          const cleanUrl = u.origin + u.pathname;
          if (cleanUrl) urls.push(cleanUrl);
        } catch {}
      });
    }

    // 3. LinkedIn specific
    if (window.location.host.includes('linkedin.com')) {
      document.querySelectorAll('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          const cleanUrl = u.origin + u.pathname;
          if (cleanUrl) urls.push(cleanUrl);
        } catch {}
      });
    }

    // 4. Facebook specific
    if (window.location.host.includes('facebook.com')) {
      document.querySelectorAll('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          const cleanUrl = u.origin + u.pathname;
          if (cleanUrl) urls.push(cleanUrl);
        } catch {}
      });
    }

    // 5. Generic fallback (any video tags)
    document.querySelectorAll('video').forEach(vid => {
      const parentAnchor = vid.closest('a');
      if (parentAnchor && parentAnchor.href) {
        try {
          const u = new URL(parentAnchor.href, window.location.origin);
          urls.push(u.origin + u.pathname + u.search);
        } catch {}
      } else if (vid.src && !vid.src.startsWith('blob:') && !vid.src.startsWith('mediasource:')) {
        urls.push(vid.src);
      }
    });

    // Filter duplicates and empty values
    const uniqueUrls = [...new Set(urls)].filter(Boolean);
    sendResponse({ urls: uniqueUrls });
  }
  return true;
});
