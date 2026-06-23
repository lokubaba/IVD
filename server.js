const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

// Pre-emptively augment PATH for LaunchAgent execution contexts on macOS/Linux
if (process.platform === 'darwin' || process.platform === 'linux') {
  const commonPaths = [
    '/Library/Frameworks/Python.framework/Versions/3.13/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];
  const currentPath = process.env.PATH || '';
  const paths = currentPath.split(':');
  const addedPaths = commonPaths.filter(p => !paths.includes(p) && fs.existsSync(p));

  if (addedPaths.length > 0) {
    process.env.PATH = [...addedPaths, currentPath].join(':');
    console.log(`[Startup] PATH augmented with: ${addedPaths.join(':')}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

const PUBLIC_DIR = path.resolve(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('\n  ERROR: Cannot find public/ folder at: ' + PUBLIC_DIR);
  process.exit(1);
}

app.use(express.json());

// Allow Chrome extension and browser to reach localhost
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ── itag map ──────────────────────────────────────────────────────────────
const ITAG_MAP = {
  '18': { res: '360p', note: 'MP4 video+audio' },
  '22': { res: '720p', note: 'MP4 video+audio' },
  '37': { res: '1080p', note: 'MP4 video+audio' },
  '134': { res: '360p', note: 'MP4 video only' },
  '135': { res: '480p', note: 'MP4 video only' },
  '136': { res: '720p', note: 'MP4 video only' },
  '137': { res: '1080p', note: 'MP4 video only' },
  '138': { res: '2160p', note: 'MP4 video only' },
  '160': { res: '144p', note: 'MP4 video only' },
  '264': { res: '1440p', note: 'MP4 video only' },
  '266': { res: '2160p', note: 'MP4 video only' },
  '298': { res: '720p60', note: 'MP4 60fps' },
  '299': { res: '1080p60', note: 'MP4 60fps' },
  '242': { res: '360p', note: 'WebM video only' },
  '243': { res: '480p', note: 'WebM video only' },
  '247': { res: '720p', note: 'WebM video only' },
  '248': { res: '1080p', note: 'WebM video only' },
  '271': { res: '1440p', note: 'WebM video only' },
  '272': { res: '2160p', note: 'WebM video only' },
  '278': { res: '144p', note: 'WebM video only' },
  '313': { res: '2160p', note: 'WebM video only' },
  '394': { res: '144p', note: 'AV1 video only' },
  '395': { res: '240p', note: 'AV1 video only' },
  '396': { res: '360p', note: 'AV1 video only' },
  '397': { res: '480p', note: 'AV1 video only' },
  '398': { res: '720p', note: 'AV1 video only' },
  '399': { res: '1080p', note: 'AV1 video only' },
  '400': { res: '1440p', note: 'AV1 video only' },
  '401': { res: '2160p', note: 'AV1 video only' },
  '139': { res: 'audio', note: 'M4A 48kbps' },
  '140': { res: 'audio', note: 'M4A 128kbps' },
  '251': { res: 'audio', note: 'Opus 160kbps' },
};

function itagFromUrl(url) {
  try { return new URL(url).searchParams.get('itag'); } catch { return null; }
}
function resolutionFromUrl(url) {
  const itag = itagFromUrl(url);
  const info = itag && ITAG_MAP[itag];
  return { resolution: info ? info.res : (itag ? `itag ${itag}` : 'unknown'), itag, note: info ? info.note : '' };
}
function fileSizeFromUrl(url) {
  try {
    const clen = parseInt(new URL(url).searchParams.get('clen'));
    if (!clen) return null;
    if (clen > 1e9) return (clen / 1e9).toFixed(2) + ' GB';
    if (clen > 1e6) return (clen / 1e6).toFixed(1) + ' MB';
    return (clen / 1e3).toFixed(0) + ' KB';
  } catch { return null; }
}
function durationFromUrl(url) {
  try {
    const dur = parseFloat(new URL(url).searchParams.get('dur'));
    if (!dur) return null;
    const h = Math.floor(dur / 3600), m = Math.floor((dur % 3600) / 60), s = Math.floor(dur % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  } catch { return null; }
}

function getRemoteFileSize(url) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) return resolve(null);
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
        const len = res.headers['content-length'];
        resolve(len ? parseInt(len, 10) : null);
      });
      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}


function getSetting(key, fallbackEnvKey) {
  const settingsPath = path.resolve(__dirname, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const parts = key.split('.');
      let val = data;
      for (const part of parts) {
        if (val && typeof val === 'object') {
          val = val[part];
        } else {
          val = undefined;
          break;
        }
      }
      if (val !== undefined && val !== null && val !== "") {
        return String(val);
      }
    } catch (e) {
      // ignore
    }
  }

  const envKey = fallbackEnvKey || key;
  if (process.env[envKey]) {
    return process.env[envKey];
  }

  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join('=').trim();
          if (k === envKey) {
            return v;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return "";
}

function hasAria2c() {
  const exe = process.platform === 'win32' ? 'aria2c.exe' : 'aria2c';
  const paths = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  for (const p of paths) {
    try {
      if (fs.existsSync(path.join(p, exe))) {
        return true;
      }
    } catch { }
  }
  return false;
}

function getYtDlpCookiesArgs() {
  let defaultBrowser = "none";
  if (process.platform === 'darwin') {
    const chromePaths = [
      '/Applications/Google Chrome.app',
      path.join(os.homedir(), 'Applications/Google Chrome.app')
    ];
    if (chromePaths.some(p => fs.existsSync(p))) {
      defaultBrowser = 'chrome';
    }
  } else if (process.platform === 'win32') {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    if (chromePaths.some(p => fs.existsSync(p))) {
      defaultBrowser = 'chrome';
    }
  }

  const browser = getSetting("video.cookies_from_browser", "YT_DLP_COOKIES_FROM_BROWSER") || defaultBrowser;
  const cookiesFile = getSetting("video.cookies_file", "YT_DLP_COOKIES_FILE");

  if (cookiesFile && fs.existsSync(cookiesFile)) {
    return ["--cookies", cookiesFile];
  }
  if (browser && browser.toLowerCase() !== "none") {
    return ["--cookies-from-browser", browser];
  }
  return [];
}

function isDirectVideoStream(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname.toLowerCase();

    // Check extension
    if (pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.mkv') || pathname.endsWith('.m3u8') || pathname.endsWith('.mov')) {
      return true;
    }

    // Check if it's NOT a standard platform page
    const host = u.hostname.toLowerCase();
    const isPlatform = host.includes('youtube.com') || host.includes('youtu.be') ||
      host.includes('instagram.com') || host.includes('facebook.com') || host.includes('fb.watch') ||
      host.includes('linkedin.com') || host.includes('twitter.com') || host.includes('x.com') ||
      host.includes('tiktok.com') || host.includes('vimeo.com');

    // If it is not a platform page, and it's sent to us, it's highly likely to be a direct video stream URL
    if (!isPlatform) {
      return true;
    }
  } catch { }
  return false;
}

function probeDirectStream(url) {
  return new Promise((resolve) => {
    // Run ffprobe to get width, height, and duration
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of json "${url.replace(/"/g, '\\"')}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        return resolve({ resolution: 'unknown', duration: 'unknown' });
      }
      try {
        const data = JSON.parse(stdout);
        const stream = data.streams && data.streams[0];
        const format = data.format;

        let resolution = 'unknown';
        if (stream && stream.width && stream.height) {
          resolution = `${stream.width}x${stream.height}`;
        }

        let duration = 'unknown';
        if (format && format.duration && !isNaN(format.duration)) {
          const dur = parseFloat(format.duration);
          const h = Math.floor(dur / 3600);
          const m = Math.floor((dur % 3600) / 60);
          const s = Math.floor(dur % 60);
          duration = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
        }

        resolve({ resolution, duration });
      } catch {
        resolve({ resolution: 'unknown', duration: 'unknown' });
      }
    });
  });
}

async function getStreamInfo(youtubeUrl) {
  // If it's already a direct video stream URL, bypass yt-dlp completely
  if (isDirectVideoStream(youtubeUrl)) {
    const probedSize = await getRemoteFileSize(youtubeUrl);
    let filesize = 'unknown';
    if (probedSize) {
      if (probedSize > 1e9) filesize = (probedSize / 1e9).toFixed(2) + ' GB';
      else if (probedSize > 1e6) filesize = (probedSize / 1e6).toFixed(1) + ' MB';
      else filesize = (probedSize / 1e3).toFixed(0) + ' KB';
    }

    let title = urlTitles.get(youtubeUrl) || 'Direct Video Stream';
    if (title === 'Direct Video Stream') {
      try {
        const parts = new URL(youtubeUrl).pathname.split('/');
        const last = parts[parts.length - 1];
        if (last && last.includes('.')) {
          title = decodeURIComponent(last);
        }
      } catch { }
    }

    const probe = await probeDirectStream(youtubeUrl);

    return {
      url: youtubeUrl,
      stream_url: youtubeUrl,
      title: title,
      resolution: probe.resolution,
      filesize: filesize,
      duration: probe.duration,
      format: youtubeUrl.toLowerCase().endsWith('.webm') ? 'WEBM' : 'MP4',
      itag: null,
      error: null
    };
  }

  const isYouTube = youtubeUrl.includes('youtube.com') || youtubeUrl.includes('youtu.be');
  const cookieArgs = isYouTube ? [] : getYtDlpCookiesArgs();
  let cookieStr = "";
  if (cookieArgs.length === 2) {
    if (cookieArgs[0] === "--cookies") {
      cookieStr = `--cookies "${cookieArgs[1].replace(/"/g, '\\"')}"`;
    } else {
      cookieStr = `${cookieArgs[0]} ${cookieArgs[1]}`;
    }
  }

  return new Promise((resolve) => {
    const cmd = `yt-dlp ${cookieStr} --print "%(title)s" --print "%(filesize_approx,filesize)s" --print "%(duration)s" --print "%(resolution)s" --print "%(thumbnail)s" --print "%(urls)s" --no-playlist --no-warnings "${youtubeUrl.replace(/"/g, '\\"')}"`;
    exec(
      cmd,
      { timeout: 60000 },
      async (error, stdout, stderr) => {
        if (error) {
          resolve({
            url: youtubeUrl, stream_url: null, title: null, resolution: null,
            filesize: null, duration: null, format: null, itag: null,
            error: stderr.trim() || error.message
          });
          return;
        }
        const lines = stdout.trim().split('\n').filter(Boolean);
        const title = lines[0] || '—';
        const rawSize = lines[1] || null;
        const rawDuration = lines[2] || null;
        const resolution = lines[3] || 'unknown';
        const thumbnail = lines[4] || null;
        const streamUrl = lines[5] || null;

        // Convert filesize to human-readable
        let filesize = 'unknown';
        if (rawSize && !isNaN(rawSize) && rawSize !== 'NA') {
          const clen = parseInt(rawSize, 10);
          if (clen > 1e9) filesize = (clen / 1e9).toFixed(2) + ' GB';
          else if (clen > 1e6) filesize = (clen / 1e6).toFixed(1) + ' MB';
          else filesize = (clen / 1e3).toFixed(0) + ' KB';
        } else if (streamUrl && streamUrl.startsWith('http')) {
          // Probe remote file size
          const probedSize = await getRemoteFileSize(streamUrl);
          if (probedSize) {
            if (probedSize > 1e9) filesize = (probedSize / 1e9).toFixed(2) + ' GB';
            else if (probedSize > 1e6) filesize = (probedSize / 1e6).toFixed(1) + ' MB';
            else filesize = (probedSize / 1e3).toFixed(0) + ' KB';
          }
        }

        // Convert duration to MM:SS or HH:MM:SS
        let duration = 'unknown';
        if (rawDuration && !isNaN(rawDuration) && rawDuration !== 'NA') {
          const dur = parseFloat(rawDuration);
          const h = Math.floor(dur / 3600);
          const m = Math.floor((dur % 3600) / 60);
          const s = Math.floor(dur % 60);
          duration = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
        }

        resolve({ url: youtubeUrl, stream_url: streamUrl, title, resolution, filesize, duration, format: 'MP4', thumbnail, error: null });
      }
    );
  });
}

// ── Extract stream URLs ───────────────────────────────────────────────────
app.post('/extract', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'No URLs' });
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  for (const url of urls) res.write(JSON.stringify(await getStreamInfo(url)) + '\n');
  res.end();
});

// ── Get default download folder ───────────────────────────────────────────
app.get('/default-folder', (req, res) => {
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    res.json({ folder: '/app/downloads' });
  } else {
    const downloads = path.join(os.homedir(), 'Downloads');
    const folder = fs.existsSync(downloads) ? downloads : os.homedir();
    res.json({ folder });
  }
});

// ── Download with real-time SSE progress ─────────────────────────────────
app.get('/download-progress', (req, res) => {
  const { url, title, folder } = req.query;
  if (!url) return res.status(400).send('Missing url');

  const ytUrl = decodeURIComponent(url);
  const safeName = (title && title !== '—')
    ? decodeURIComponent(title).replace(/[^\w\s\-]/g, '').trim().slice(0, 80) || 'video'
    : 'video';

  // Resolve destination folder — use provided folder or default to ~/Downloads
  let destFolder = folder ? decodeURIComponent(folder) : path.join(os.homedir(), 'Downloads');

  // If running in Docker, validate and redirect invalid host paths
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    const hostHome = process.env.HOST_HOME;

    // Check if the folder is inside the host home (either starts with ~ or starts with hostHome path)
    if (destFolder.startsWith('~')) {
      const relativePart = destFolder.slice(1);
      // Map to downloads folder if relativePart matches downloads
      if (relativePart.toLowerCase().startsWith('/downloads') || relativePart.toLowerCase() === '/downloads') {
        destFolder = path.join('/app/downloads', relativePart.slice(10));
      } else {
        destFolder = path.join('/app/host-home', relativePart);
      }
      console.log(`[Docker] Translated "~" path to container-mounted folder: "${destFolder}"`);
    } else if (hostHome && destFolder.startsWith(hostHome)) {
      const relativePart = destFolder.slice(hostHome.length);
      if (relativePart.toLowerCase().startsWith('/downloads') || relativePart.toLowerCase() === '/downloads') {
        destFolder = path.join('/app/downloads', relativePart.slice(10));
      } else {
        destFolder = path.join('/app/host-home', relativePart);
      }
      console.log(`[Docker] Translated host path "${hostHome}" to container-mounted folder: "${destFolder}"`);
    } else {
      const lowerFolder = destFolder.toLowerCase();
      // Redirect if it points to a typical host downloads directory or uses tilde
      if (lowerFolder.includes('downloads') || lowerFolder.includes('download')) {
        destFolder = '/app/downloads';
      } else if (!fs.existsSync(destFolder)) {
        // Redirect if it's a macOS/Linux/Windows home path or volume mount that doesn't exist inside the container
        if (destFolder.startsWith('/Users') || destFolder.startsWith('/home') || destFolder.startsWith('/Volumes') || /^[a-zA-Z]:\\/.test(destFolder)) {
          console.log(`[Docker] Redirecting inaccessible host path "${destFolder}" to "/app/downloads"`);
          destFolder = '/app/downloads';
        }
      }
    }
  }

  if (!fs.existsSync(destFolder)) {
    try { fs.mkdirSync(destFolder, { recursive: true }); }
    catch { destFolder = os.homedir(); }
  }

  const destFile = path.join(destFolder, safeName + '.mp4');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'start', filename: safeName + '.mp4', destFolder, destFile });

  const isYouTube = ytUrl.includes('youtube.com') || ytUrl.includes('youtu.be');
  const cookieArgs = isYouTube ? [] : getYtDlpCookiesArgs();
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

  const ytdlp = spawn('yt-dlp', spawnArgs);

  ytdlp.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const lines = text.replace(/\r/g, '\n').split('\n');
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      // 1. Match standard download line, e.g.:
      // [download]  95.4% of ~ 196.46MiB at    3.84MiB/s ETA 00:03 (frag 381/399)
      // or [download]  24.1% of   14.40GiB at   10.03MiB/s ETA 18:36
      const m = cleanLine.match(/\[download\]\s+([\d.]+)%\s+of\s+(?:~\s*)?([^\s]+)\s+at\s+([^\s]+)/);
      if (m) {
        let speed = m[3].trim();
        let total = m[2].trim();

        // Match fragment count at the end if present, e.g. (frag 381/399)
        const fragMatch = cleanLine.match(/\(frag\s+(\d+)\/(\d+)\)/);
        if (fragMatch) {
          total = `${total} (frag ${fragMatch[1]}/${fragMatch[2]})`;
        }

        send({ type: 'progress', percent: parseFloat(m[1]), total: total, speed: speed });
        continue;
      }

      // 2. Match aria2c parallel segments progress:
      // [#76f18c 12.3MiB/45.6MiB(26%) CN:1 SPD:3.1MiB/s]
      const am = cleanLine.match(/\[#\w+\s+([^\s/]+)\/([^\s(]+)\(([\d.]+)%\)\s+.*SPD:([^\s]+)/);
      if (am) {
        send({ type: 'progress', percent: parseFloat(am[3]), total: am[2].trim(), speed: am[4].trim() });
        continue;
      }

      // 3. Match native fragment progress without percentages:
      // [download] Downloading video fragment 12 of 125
      const fm = cleanLine.match(/\[download\]\s+Downloading\s+(?:video\s+)?fragment\s+(\d+)\s+of\s+(\d+)/);
      if (fm) {
        const current = parseInt(fm[1], 10);
        const totalFrags = parseInt(fm[2], 10);
        if (totalFrags > 0) {
          const percent = parseFloat(((current / totalFrags) * 100).toFixed(1));
          send({ type: 'progress', percent, total: `Frag ${current}/${totalFrags}`, speed: 'Downloading' });
        }
        continue;
      }
    }
  });
  ytdlp.stderr.on('data', (chunk) => process.stdout.write(chunk.toString()));

  ytdlp.on('error', (err) => { send({ type: 'error', message: err.message }); res.end(); });

  ytdlp.on('close', async (code) => {
    if (code !== 0) { send({ type: 'error', message: `yt-dlp exited with code ${code}` }); res.end(); return; }

    const numParts = parseInt(req.query.parts, 10) || 1;
    if (numParts <= 1) {
      send({ type: 'done', filename: safeName + '.mp4', destFile, destFolder });
      res.end();
      return;
    }

    try {
      // 1. Get total duration of the downloaded file using ffprobe
      const duration = await new Promise((resolve, reject) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${destFile}"`, (err, stdout) => {
          if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
          const d = parseFloat(stdout.trim());
          if (isNaN(d) || d <= 0) return reject(new Error('Invalid duration from ffprobe'));
          resolve(d);
        });
      });

      send({ type: 'progress', percent: 100, total: 'Extracting parts…', speed: 'Analyzing pauses' });

      // 2. Find optimal split points
      const splitPoints = [0];
      const targetInterval = duration / numParts;

      for (let i = 1; i < numParts; i++) {
        const targetTime = i * targetInterval;
        const startWindow = Math.max(0, targetTime - 60);

        const silences = await new Promise((resolve) => {
          exec(`ffmpeg -ss ${startWindow} -t 120 -i "${destFile}" -vn -filter_complex silencedetect=noise=-30dB:d=0.5 -f null -`, (err, stdout, stderr) => {
            const lines = (stderr || '').split('\n');
            const found = [];
            let currentStart = null;

            for (const line of lines) {
              const mStart = line.match(/silence_start:\s*([\d.]+)/);
              if (mStart) {
                currentStart = parseFloat(mStart[1]);
              }
              const mEnd = line.match(/silence_end:\s*([\d.]+)/);
              if (mEnd && currentStart !== null) {
                const end = parseFloat(mEnd[1]);
                found.push({ start: startWindow + currentStart, end: startWindow + end });
                currentStart = null;
              }
            }
            resolve(found);
          });
        });

        let optimalCut = targetTime;
        if (silences.length > 0) {
          let minDiff = Infinity;
          for (const sil of silences) {
            const midpoint = (sil.start + sil.end) / 2;
            const diff = Math.abs(midpoint - targetTime);
            if (diff < minDiff) {
              minDiff = diff;
              optimalCut = midpoint;
            }
          }
        }
        splitPoints.push(optimalCut);
      }
      splitPoints.push(duration);

      // 3. Slice the video files using FFmpeg fast copy
      const partFiles = [];
      for (let j = 1; j <= numParts; j++) {
        const start = splitPoints[j - 1];
        const end = splitPoints[j];
        const partDur = end - start;
        const partName = `${j}_${safeName}`;
        const partPath = path.join(destFolder, `${partName}.mp4`);

        await new Promise((resolve, reject) => {
          exec(`ffmpeg -y -ss ${start} -t ${partDur} -i "${destFile}" -c copy "${partPath}"`, (err) => {
            if (err) return reject(new Error(`ffmpeg slice failed for Part ${j}: ${err.message}`));
            resolve();
          });
        });

        const h = Math.floor(partDur / 3600);
        const m = Math.floor((partDur % 3600) / 60);
        const s = Math.floor(partDur % 60);
        const durStr = h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`;

        let sizeStr = '—';
        try {
          const stats = fs.statSync(partPath);
          const bytes = stats.size;
          if (bytes > 1e9) sizeStr = (bytes / 1e9).toFixed(2) + ' GB';
          else if (bytes > 1e6) sizeStr = (bytes / 1e6).toFixed(1) + ' MB';
          else sizeStr = (bytes / 1e3).toFixed(0) + ' KB';
        } catch { }

        partFiles.push({
          title: partName,
          destFile: partPath,
          duration: durStr,
          filesize: sizeStr
        });
      }

      // 4. Delete the original full video file
      try {
        fs.unlinkSync(destFile);
      } catch (err) {
        console.error('Failed to clean up original full video:', err);
      }

      // 5. Send done event with all part files
      send({ type: 'done', filename: `${safeName}.mp4`, destFile, destFolder, parts: partFiles });
      res.end();

    } catch (err) {
      send({ type: 'error', message: err.message });
      res.end();
    }
  });

  req.on('close', () => ytdlp.kill());
});

// ── Open folder in Finder/Explorer ─────────────────────────────────────────
app.post('/open-folder', (req, res) => {
  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'No folder' });

  // If running in Docker, we cannot spawn a GUI window on the host
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    return res.json({
      ok: false,
      error: 'Cannot open folders directly from a Docker container. Please open your mapped host folder manually.'
    });
  }

  let cmd;
  if (process.platform === 'darwin') {
    cmd = `open "${folder}"`;
  } else if (process.platform === 'win32') {
    cmd = `explorer "${folder}"`;
  } else {
    cmd = `xdg-open "${folder}"`;
  }

  exec(cmd, (err) => {
    res.json(err ? { ok: false, error: err.message } : { ok: true });
  });
});

const urlTitles = new Map();

// ── Add URL from Chrome extension ────────────────────────────────────────
app.post('/add-url', (req, res) => {
  const { url, title } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (title) {
    urlTitles.set(url, title);
  }
  // Store pending URLs in memory so the UI can pick them up via polling
  pendingUrls.push({ url, title: title || '' });
  console.log(`  🔗  Extension sent URL: ${url}${title ? ` (Title: ${title})` : ''}`);
  res.json({ ok: true, url });
});

// ── Poll for pending URLs (extension → UI bridge) ─────────────────────────
const pendingUrls = [];
app.get('/pending-urls', (req, res) => {
  const urls = pendingUrls.splice(0); // return and clear
  res.json({ urls });
});

// ── Check yt-dlp ─────────────────────────────────────────────────────────
app.get('/check', (req, res) => {
  exec('yt-dlp --version', (err, stdout) => {
    res.json(err ? { installed: false } : { installed: true, version: stdout.trim(), vex: true });
  });
});

// ── Check if files exist ──────────────────────────────────────────────────
app.post('/check-exists', (req, res) => {
  const { paths } = req.body;
  if (!Array.isArray(paths)) return res.status(400).json({ error: 'Paths must be an array' });
  const results = paths.map(p => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  res.json({ results });
});

// ── Shutdown endpoint ─────────────────────────────────────────────────────
app.post('/shutdown', (req, res) => {
  res.json({ message: "Server shutting down..." });
  console.log("🛑 Shutdown requested via API");
  setTimeout(() => process.exit(0), 500);
});

// ── Downloader state persistence ──────────────────────────────────────────
const STATE_FILE = path.resolve(__dirname, 'yt_state.json');

app.get('/state', (req, res) => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return res.json(JSON.parse(data));
    }
  } catch (err) {
    console.error('Failed to read state file:', err);
  }
  res.json({ rows: [], folder: '' });
});

app.post('/state', (req, res) => {
  try {
    const { rows, folder } = req.body;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ rows, folder }, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to write state file:', err);
    res.status(500).json({ error: err.message });
  }
});

function startServer(targetPort) {
  const server = http.createServer(app);
  let port = targetPort;
  const MAX_PORT = 3005;

  function listen() {
    server.listen(port);
  }

  server.on('listening', () => {
    console.log(`\n  ✅  Server running at http://localhost:${port}`);
    console.log(`  📁  Serving files from: ${PUBLIC_DIR}\n`);

    // Write active port to a state file
    try {
      fs.writeFileSync(path.resolve(__dirname, '.port'), String(port), 'utf8');
    } catch (err) {
      console.error('Failed to write .port file:', err);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < MAX_PORT) {
      console.warn(`⚠️  Port ${port} is in use, retrying on port ${port + 1}...`);
      port++;
      listen();
    } else {
      console.error('❌  Server startup error:', err);
      process.exit(1);
    }
  });

  listen();
}

const startPort = parseInt(process.env.PORT, 10) || 3001;
startServer(startPort);
