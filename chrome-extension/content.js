// Injected on all pages
// If on YouTube, adds a small "⚡ Extract" button next to the video title
const APP_URL_DEFAULT = 'http://localhost:3001';
let APP_URL = APP_URL_DEFAULT;
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '18px',
    padding: '0 14px',
    height: '36px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'inherit',
    cursor: 'pointer',
    marginLeft: '8px',
    transition: 'background .15s, transform .1s',
    flexShrink: '0',
  });

  btn.onmouseenter = () => btn.style.background = '#1d4ed8';
  btn.onmouseleave = () => btn.style.background = '#2563eb';
  btn.onmousedown = () => btn.style.transform = 'scale(.97)';
  btn.onmouseup = () => btn.style.transform = 'scale(1)';

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

// Helper to extract direct download link or fallback to post page URL
function getBestVideoUrl(video, platform) {
  // If the video tag has a direct HTTP/HTTPS source, that is the direct download link!
  if (video.src && !video.src.startsWith('blob:') && !video.src.startsWith('mediasource:')) {
    return video.src;
  }

  // Check <source> tags inside the video tag
  const sourceTag = video.querySelector('source');
  if (sourceTag && sourceTag.src && !sourceTag.src.startsWith('blob:') && !sourceTag.src.startsWith('mediasource:')) {
    return sourceTag.src;
  }

  // Fallback: resolve the page post URL so yt-dlp can attempt extraction on the backend
  let postUrl = null;

  if (platform === 'instagram') {
    const article = video.closest('article') || video.closest('div[role="dialog"]');
    if (article) {
      const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (postLink) postUrl = postLink.href;
    }
    if (!postUrl) {
      const nearestLink = video.closest('a') || video.parentElement?.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (nearestLink) postUrl = nearestLink.href;
    }
    if (!postUrl && (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/'))) {
      postUrl = window.location.href;
    }
  }

  else if (platform === 'linkedin') {
    const card = video.closest('.feed-shared-update-v2, article, [data-urn]');
    if (card) {
      const postLink = card.querySelector('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
      if (postLink) postUrl = postLink.href;
    }
    if (!postUrl) {
      const nearestLink = video.closest('a') || video.parentElement?.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
      if (nearestLink) postUrl = nearestLink.href;
    }
  }

  else if (platform === 'facebook') {
    const card = video.closest('[role="article"], .userContentWrapper, article');
    if (card) {
      const postLink = card.querySelector('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
      if (postLink) postUrl = postLink.href;
    }
    if (!postUrl) {
      const nearestLink = video.closest('a') || video.parentElement?.querySelector('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
      if (nearestLink) postUrl = nearestLink.href;
    }
  }

  if (postUrl) {
    try {
      const u = new URL(postUrl, window.location.origin);
      return u.origin + u.pathname;
    } catch { }
  }

  return window.location.href;
}

// ── Multi-video extraction detection listener ──────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "detect_videos") {
    const list = [];

    // 1. YouTube specific
    if (window.location.host.includes('youtube.com')) {
      const v = new URLSearchParams(window.location.search).get('v');
      if (v) {
        let mainTitle = document.querySelector('h1.ytd-watch-metadata, yt-formatted-string.ytd-video-primary-info-renderer')?.textContent || document.title;
        mainTitle = mainTitle.replace(' - YouTube', '').trim();
        list.push({ url: `https://www.youtube.com/watch?v=${v}`, title: mainTitle });
      }

      document.querySelectorAll('a[href*="/watch?v="]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          const val = u.searchParams.get('v');
          if (val) {
            let t = a.title || a.querySelector('#video-title, .video-title, yt-formatted-string')?.textContent || a.innerText || '';
            t = t.replace(/\n/g, '').trim();
            list.push({ url: `https://www.youtube.com/watch?v=${val}`, title: t || `YouTube Video` });
          }
        } catch { }
      });

      document.querySelectorAll('a[href*="/shorts/"]').forEach(a => {
        try {
          const u = new URL(a.href, window.location.origin);
          const parts = u.pathname.split('/');
          const val = parts[parts.indexOf('shorts') + 1];
          if (val) {
            let t = a.title || a.querySelector('#video-title, .video-title, yt-formatted-string')?.textContent || a.innerText || '';
            t = t.replace(/\n/g, '').trim();
            list.push({ url: `https://www.youtube.com/shorts/${val}`, title: t || `YouTube Shorts` });
          }
        } catch { }
      });
    }

    // 2. Instagram specific
    if (window.location.host.includes('instagram.com')) {
      document.querySelectorAll('video').forEach(video => {
        const downloadUrl = getBestVideoUrl(video, 'instagram');
        let titleText = '';

        const article = video.closest('article') || video.closest('div[role="dialog"]');
        if (article) {
          // Scrape username and caption
          const username = article.querySelector('header a, [role="link"], h2 a')?.textContent || '';
          const caption = article.querySelector('span._ap3a, span._ap3b, div._ap3a')?.textContent || '';
          titleText = username ? `${username}: ${caption}` : caption;
        }

        if (!titleText && (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/'))) {
          titleText = document.title.replace(' • Instagram photos and videos', '').replace('Instagram:', '').trim();
        }

        titleText = titleText.replace(/\n/g, ' ').trim();
        if (titleText.length > 80) titleText = titleText.slice(0, 80) + '...';
        list.push({ url: downloadUrl, title: titleText || 'Instagram Post' });
      });
    }

    // 3. LinkedIn specific
    if (window.location.host.includes('linkedin.com')) {
      document.querySelectorAll('video').forEach(video => {
        const downloadUrl = getBestVideoUrl(video, 'linkedin');
        let titleText = '';

        const card = video.closest('.feed-shared-update-v2, article, [data-urn]');
        if (card) {
          const actor = card.querySelector('.feed-shared-actor__name')?.textContent || '';
          const text = card.querySelector('.feed-shared-update-v2__description')?.textContent || '';
          titleText = actor ? `${actor}: ${text}` : text;
        }

        titleText = titleText.replace(/\n/g, ' ').trim();
        if (titleText.length > 80) titleText = titleText.slice(0, 80) + '...';
        list.push({ url: downloadUrl, title: titleText || 'LinkedIn Post' });
      });
    }

    // 4. Facebook specific
    if (window.location.host.includes('facebook.com')) {
      document.querySelectorAll('video').forEach(video => {
        const downloadUrl = getBestVideoUrl(video, 'facebook');
        let titleText = '';

        const card = video.closest('[role="article"], .userContentWrapper, article');
        if (card) {
          titleText = card.querySelector('.userContent, [data-ad-preview="message"]')?.textContent || '';
        }

        titleText = titleText.replace(/\n/g, ' ').trim();
        if (titleText.length > 80) titleText = titleText.slice(0, 80) + '...';
        list.push({ url: downloadUrl, title: titleText || 'Facebook Video' });
      });
    }

    // 5. Generic fallback (any video tags)
    document.querySelectorAll('video').forEach(vid => {
      const parentAnchor = vid.closest('a');
      if (parentAnchor && parentAnchor.href) {
        try {
          const u = new URL(parentAnchor.href, window.location.origin);
          const cleanUrl = u.origin + u.pathname + u.search;
          let t = parentAnchor.title || parentAnchor.innerText || document.title || '';
          t = t.replace(/\n/g, ' ').trim();
          list.push({ url: cleanUrl, title: t || 'Video Player' });
        } catch { }
      } else if (vid.src && !vid.src.startsWith('blob:') && !vid.src.startsWith('mediasource:')) {
        let t = document.title || '';
        t = t.replace(/\n/g, ' ').trim();
        if (t.length > 80) t = t.slice(0, 80) + '...';
        list.push({ url: vid.src, title: t || 'Direct Video Stream' });
      }
    });

    // Filter duplicates by URL
    const seen = new Set();
    const uniqueList = [];
    list.forEach(item => {
      if (item.url && !seen.has(item.url)) {
        seen.add(item.url);
        uniqueList.push(item);
      }
    });

    sendResponse({ videos: uniqueList });
  }
  return true;
});

// ── In-page Floating Buttons Overlay ──────────────────────────────────────
APP_URL = APP_URL_DEFAULT;

// Retrieve APP_URL from local storage
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('APP_URL', (data) => {
    if (data && data.APP_URL) APP_URL = data.APP_URL;
  });

  // Listen for storage updates
  chrome.storage.onChanged.addListener((changes) => {
    if (changes && changes.APP_URL) {
      APP_URL = changes.APP_URL.newValue;
    }
  });
}

function injectVideoOverlays() {
  // Skip YouTube (already has custom action bar button)
  if (window.location.host.includes('youtube.com')) return;

  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    // Avoid double injection
    if (video.dataset.vexInjected) return;
    video.dataset.vexInjected = 'true';

    // Find a suitable container for the absolute button
    const container = video.parentElement;
    if (!container) return;

    // Ensure parent container is positioned relative/absolute
    const originalPos = window.getComputedStyle(container).position;
    if (originalPos === 'static') {
      container.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'vex-float-btn';
    btn.innerHTML = '⚡';
    Object.assign(btn.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      zIndex: '99999',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      background: 'rgba(37, 99, 235, 0.9)',
      color: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      backdropFilter: 'blur(4px)',
      webkitBackdropFilter: 'blur(4px)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      fontWeight: 'bold',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      transition: 'transform 0.15s, background 0.15s',
    });

    btn.onmouseenter = () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.background = 'rgba(29, 78, 216, 0.95)';
    };
    btn.onmouseleave = () => {
      btn.style.transform = 'scale(1)';
      btn.style.background = 'rgba(37, 99, 235, 0.9)';
    };

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.innerHTML = '⏳';
      btn.disabled = true;

      let platform = 'generic';
      if (window.location.host.includes('instagram.com')) platform = 'instagram';
      else if (window.location.host.includes('linkedin.com')) platform = 'linkedin';
      else if (window.location.host.includes('facebook.com')) platform = 'facebook';

      const targetUrl = getBestVideoUrl(video, platform);

      let titleText = '';
      const card = video.closest('.feed-shared-update-v2, article, [data-urn], [role="article"], .userContentWrapper');
      if (card) {
        if (platform === 'linkedin') {
          const actor = card.querySelector('.feed-shared-actor__name')?.textContent || '';
          const text = card.querySelector('.feed-shared-update-v2__description')?.textContent || '';
          titleText = actor ? `${actor}: ${text}` : text;
        } else if (platform === 'facebook') {
          titleText = card.querySelector('.userContent, [data-ad-preview="message"]')?.textContent || '';
        }
      }
      if (!titleText && platform === 'instagram') {
        if (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/')) {
          titleText = document.title.replace(' • Instagram photos and videos', '').replace('Instagram:', '').trim();
        }
      }
      if (!titleText) {
        titleText = document.title || '';
      }
      titleText = titleText.replace(/\n/g, ' ').trim();
      if (titleText.length > 80) titleText = titleText.slice(0, 80) + '...';

      const defaultTitle = platform === 'linkedin' ? 'LinkedIn Post' : platform === 'instagram' ? 'Instagram Post' : platform === 'facebook' ? 'Facebook Video' : 'Video Stream';
      const videoTitle = titleText || defaultTitle;

      // Send extraction request via background script to bypass CORS / CSP
      chrome.runtime.sendMessage({ type: 'SEND_URL', url: targetUrl, title: videoTitle }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Extension runtime error:", chrome.runtime.lastError);
          btn.innerHTML = '🔌';
          btn.style.background = 'rgba(220, 38, 38, 0.95)';
        } else if (response && response.ok) {
          btn.innerHTML = '✅';
          btn.style.background = 'rgba(22, 163, 74, 0.95)';
        } else {
          btn.innerHTML = '❌';
          btn.style.background = 'rgba(220, 38, 38, 0.95)';
        }
      });

      setTimeout(() => {
        btn.innerHTML = '⚡';
        btn.disabled = false;
        btn.style.background = 'rgba(37, 99, 235, 0.9)';
      }, 2500);
    };

    container.appendChild(btn);
  });
}

// Periodically check for new video elements
setInterval(injectVideoOverlays, 2000);

