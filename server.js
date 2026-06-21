const express  = require('express');
const { exec, spawn } = require('child_process');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;

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
  '18':  { res:'360p',    note:'MP4 video+audio'  },
  '22':  { res:'720p',    note:'MP4 video+audio'  },
  '37':  { res:'1080p',   note:'MP4 video+audio'  },
  '134': { res:'360p',    note:'MP4 video only'   },
  '135': { res:'480p',    note:'MP4 video only'   },
  '136': { res:'720p',    note:'MP4 video only'   },
  '137': { res:'1080p',   note:'MP4 video only'   },
  '138': { res:'2160p',   note:'MP4 video only'   },
  '160': { res:'144p',    note:'MP4 video only'   },
  '264': { res:'1440p',   note:'MP4 video only'   },
  '266': { res:'2160p',   note:'MP4 video only'   },
  '298': { res:'720p60',  note:'MP4 60fps'        },
  '299': { res:'1080p60', note:'MP4 60fps'        },
  '242': { res:'360p',    note:'WebM video only'  },
  '243': { res:'480p',    note:'WebM video only'  },
  '247': { res:'720p',    note:'WebM video only'  },
  '248': { res:'1080p',   note:'WebM video only'  },
  '271': { res:'1440p',   note:'WebM video only'  },
  '272': { res:'2160p',   note:'WebM video only'  },
  '278': { res:'144p',    note:'WebM video only'  },
  '313': { res:'2160p',   note:'WebM video only'  },
  '394': { res:'144p',    note:'AV1 video only'   },
  '395': { res:'240p',    note:'AV1 video only'   },
  '396': { res:'360p',    note:'AV1 video only'   },
  '397': { res:'480p',    note:'AV1 video only'   },
  '398': { res:'720p',    note:'AV1 video only'   },
  '399': { res:'1080p',   note:'AV1 video only'   },
  '400': { res:'1440p',   note:'AV1 video only'   },
  '401': { res:'2160p',   note:'AV1 video only'   },
  '139': { res:'audio',   note:'M4A 48kbps'       },
  '140': { res:'audio',   note:'M4A 128kbps'      },
  '251': { res:'audio',   note:'Opus 160kbps'     },
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
    if (clen > 1e9) return (clen/1e9).toFixed(2)+' GB';
    if (clen > 1e6) return (clen/1e6).toFixed(1)+' MB';
    return (clen/1e3).toFixed(0)+' KB';
  } catch { return null; }
}
function durationFromUrl(url) {
  try {
    const dur = parseFloat(new URL(url).searchParams.get('dur'));
    if (!dur) return null;
    const h=Math.floor(dur/3600), m=Math.floor((dur%3600)/60), s=Math.floor(dur%60);
    return h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  } catch { return null; }
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

function getStreamInfo(youtubeUrl) {
  const cookieArgs = getYtDlpCookiesArgs();
  let cookieStr = "";
  if (cookieArgs.length === 2) {
    if (cookieArgs[0] === "--cookies") {
      cookieStr = `--cookies "${cookieArgs[1].replace(/"/g, '\\"')}"`;
    } else {
      cookieStr = `${cookieArgs[0]} ${cookieArgs[1]}`;
    }
  }

  return new Promise((resolve) => {
    const cmd = `yt-dlp ${cookieStr} --print "%(title)s" --print "%(filesize_approx,filesize)s" --print "%(duration)s" --print "%(resolution)s" --print "%(thumbnail)s" --print "%(urls)s" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b" --no-playlist --no-warnings "${youtubeUrl.replace(/"/g, '\\"')}"`;
    exec(
      cmd,
      { timeout: 60000 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ url:youtubeUrl, stream_url:null, title:null, resolution:null,
                    filesize:null, duration:null, format:null, itag:null,
                    error: stderr.trim() || error.message });
          return;
        }
        const lines      = stdout.trim().split('\n').filter(Boolean);
        const title      = lines[0] || '—';
        const rawSize    = lines[1] || null;
        const rawDuration = lines[2] || null;
        const resolution  = lines[3] || 'unknown';
        const thumbnail   = lines[4] || null;
        const streamUrl   = lines[5] || null;

        // Convert filesize to human-readable
        let filesize = 'unknown';
        if (rawSize && !isNaN(rawSize) && rawSize !== 'NA') {
          const clen = parseInt(rawSize, 10);
          if (clen > 1e9) filesize = (clen/1e9).toFixed(2)+' GB';
          else if (clen > 1e6) filesize = (clen/1e6).toFixed(1)+' MB';
          else filesize = (clen/1e3).toFixed(0)+' KB';
        }

        // Convert duration to MM:SS or HH:MM:SS
        let duration = 'unknown';
        if (rawDuration && !isNaN(rawDuration) && rawDuration !== 'NA') {
          const dur = parseFloat(rawDuration);
          const h = Math.floor(dur/3600);
          const m = Math.floor((dur%3600)/60);
          const s = Math.floor(dur%60);
          duration = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
        }

        resolve({ url:youtubeUrl, stream_url:streamUrl, title, resolution, filesize, duration, format:'MP4', thumbnail, error:null });
      }
    );
  });
}

// ── Extract stream URLs ───────────────────────────────────────────────────
app.post('/extract', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error:'No URLs' });
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
    const folder    = fs.existsSync(downloads) ? downloads : os.homedir();
    res.json({ folder });
  }
});

// ── Download with real-time SSE progress ─────────────────────────────────
app.get('/download-progress', (req, res) => {
  const { url, title, folder } = req.query;
  if (!url) return res.status(400).send('Missing url');

  const ytUrl    = decodeURIComponent(url);
  const safeName = (title && title !== '—')
    ? decodeURIComponent(title).replace(/[^\w\s\-]/g,'').trim().slice(0,80) || 'video'
    : 'video';

  // Resolve destination folder — use provided folder or default to ~/Downloads
  let destFolder = folder ? decodeURIComponent(folder) : path.join(os.homedir(), 'Downloads');

  // If running in Docker, validate and redirect invalid host paths
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    const lowerFolder = destFolder.toLowerCase();
    // Redirect if it points to a typical host downloads directory or uses tilde
    if (lowerFolder.includes('downloads') || lowerFolder.includes('download') || destFolder.startsWith('~')) {
      destFolder = '/app/downloads';
    } else if (!fs.existsSync(destFolder)) {
      // Redirect if it's a macOS/Linux/Windows home path or volume mount that doesn't exist inside the container
      if (destFolder.startsWith('/Users') || destFolder.startsWith('/home') || destFolder.startsWith('/Volumes') || /^[a-zA-Z]:\\/.test(destFolder)) {
        console.log(`[Docker] Redirecting inaccessible host path "${destFolder}" to "/app/downloads"`);
        destFolder = '/app/downloads';
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
  send({ type:'start', filename: safeName+'.mp4', destFolder, destFile });

  const cookieArgs = getYtDlpCookiesArgs();
  const spawnArgs = [
    ...cookieArgs,
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    '--no-playlist', '--newline',
    '--concurrent-fragments', '5',
    '-o', destFile,
    ytUrl
  ];

  const ytdlp = spawn('yt-dlp', spawnArgs);

  const progressRe = /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\s*\S+)\s+at\s+([\d.]+\s*\S+\/s)/;

  ytdlp.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    for (const line of text.split('\n')) {
      const m = line.match(progressRe);
      if (m) send({ type:'progress', percent:parseFloat(m[1]), total:m[2].trim(), speed:m[3].trim() });
    }
  });
  ytdlp.stderr.on('data', (chunk) => process.stdout.write(chunk.toString()));

  ytdlp.on('error', (err) => { send({ type:'error', message:err.message }); res.end(); });

  ytdlp.on('close', async (code) => {
    if (code !== 0) { send({ type:'error', message:`yt-dlp exited with code ${code}` }); res.end(); return; }

    const numParts = parseInt(req.query.parts, 10) || 1;
    if (numParts <= 1) {
      send({ type:'done', filename:safeName+'.mp4', destFile, destFolder });
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
          ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` 
          : `${m}:${String(s).padStart(2,'0')}`;

        let sizeStr = '—';
        try {
          const stats = fs.statSync(partPath);
          const bytes = stats.size;
          if (bytes > 1e9) sizeStr = (bytes / 1e9).toFixed(2) + ' GB';
          else if (bytes > 1e6) sizeStr = (bytes / 1e6).toFixed(1) + ' MB';
          else sizeStr = (bytes / 1e3).toFixed(0) + ' KB';
        } catch {}

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

// ── Open folder in Finder ─────────────────────────────────────────────────
app.post('/open-folder', (req, res) => {
  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error:'No folder' });
  // macOS: "open" opens Finder; Linux: "xdg-open"
  const cmd = process.platform === 'darwin' ? `open "${folder}"` : `xdg-open "${folder}"`;
  exec(cmd, (err) => {
    res.json(err ? { ok:false, error:err.message } : { ok:true });
  });
});

// ── Add URL from Chrome extension ────────────────────────────────────────
app.post('/add-url', (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  // Store pending URLs in memory so the UI can pick them up via polling
  pendingUrls.push(url);
  console.log(`  🔗  Extension sent URL: ${url}`);
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
    res.json(err ? { installed:false } : { installed:true, version:stdout.trim() });
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

app.listen(PORT, () => {
  console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
  console.log(`  📁  Serving files from: ${PUBLIC_DIR}\n`);
});
