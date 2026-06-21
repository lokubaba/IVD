// Background service worker
// Handles messages from content script and popup

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_URL') {
    // Read APP_URL from local storage to handle the dynamic port configuration
    chrome.storage.local.get('APP_URL', (data) => {
      const appUrl = (data && data.APP_URL) ? data.APP_URL : 'http://localhost:3001';
      fetch(`${appUrl}/add-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: msg.url, title: msg.title }),
      })
        .then(r => sendResponse({ ok: r.ok }))
        .catch((err) => {
          console.error("Background fetch failed:", err);
          sendResponse({ ok: false });
        });
    });
    return true; // keep channel open for async
  }
});
