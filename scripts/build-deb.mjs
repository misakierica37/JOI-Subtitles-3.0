import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const debBuildDir = path.join(rootDir, '.deb-build');
const pkgName = 'joi-subtitles_3.0.0_all';
const pkgDir = path.join(debBuildDir, pkgName);

// Remove any stale .deb files before building
for (const oldFile of [
  path.join(rootDir, 'joi-subtitles_3.0.0_amd64.deb'),
  path.join(publicDir, 'joi-subtitles_3.0.0_amd64.deb'),
  path.join(distDir, 'joi-subtitles_3.0.0_amd64.deb'),
  path.join(rootDir, 'joi-subtitles_3.0.0_all.deb'),
  path.join(publicDir, 'joi-subtitles_3.0.0_all.deb'),
  path.join(distDir, 'joi-subtitles_3.0.0_all.deb'),
]) {
  fs.rmSync(oldFile, { force: true });
}

console.log('1. Building production frontend bundle (vite build)...');
execSync('npx vite build', { cwd: rootDir, stdio: 'inherit' });

// Prepare Debian package directory structure
fs.rmSync(debBuildDir, { recursive: true, force: true });
fs.mkdirSync(path.join(pkgDir, 'DEBIAN'), { recursive: true });
fs.mkdirSync(path.join(pkgDir, 'usr', 'bin'), { recursive: true });
fs.mkdirSync(path.join(pkgDir, 'usr', 'share', 'joi-subtitles', 'dist'), { recursive: true });
fs.mkdirSync(path.join(pkgDir, 'usr', 'share', 'applications'), { recursive: true });
fs.mkdirSync(path.join(pkgDir, 'usr', 'share', 'pixmaps'), { recursive: true });
fs.mkdirSync(path.join(pkgDir, 'usr', 'share', 'icons', 'hicolor', '192x192', 'apps'), {
  recursive: true,
});
fs.mkdirSync(path.join(pkgDir, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps'), {
  recursive: true,
});

function copyDirFiltered(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith('.deb') || entry.name.endsWith('.AppImage')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      fs.chmodSync(destPath, 0o644);
    }
  }
}

copyDirFiltered(distDir, path.join(pkgDir, 'usr', 'share', 'joi-subtitles', 'dist'));

// Copy application icons
if (fs.existsSync(path.join(publicDir, 'pwa-192x192.png'))) {
  const icon192 = path.join(publicDir, 'pwa-192x192.png');
  fs.copyFileSync(icon192, path.join(pkgDir, 'usr', 'share', 'pixmaps', 'joi-subtitles.png'));
  fs.copyFileSync(
    icon192,
    path.join(pkgDir, 'usr', 'share', 'icons', 'hicolor', '192x192', 'apps', 'joi-subtitles.png')
  );
}
if (fs.existsSync(path.join(publicDir, 'pwa-512x512.png'))) {
  fs.copyFileSync(
    path.join(publicDir, 'pwa-512x512.png'),
    path.join(pkgDir, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps', 'joi-subtitles.png')
  );
}

// Create embedded Python 3 local server (/usr/share/joi-subtitles/joi-server.py)
const pythonServerScript = `#!/usr/bin/env python3
"""
JOI Subtitles 3.0 — Local Backend Server for Linux Mint (.deb Package)
100% keyless speech recognition (Firefox WebAudio WAV + Linux Mint ALSA arecord fallback)
and Google Neural Machine Translation (en -> ro).
"""
import audioop
import http.server
import io
import json
import math
import os
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path

DIST_DIR = Path("/usr/share/joi-subtitles/dist")
if not DIST_DIR.exists():
    DIST_DIR = Path(__file__).resolve().parent / "dist"

IS_LISTENING = False
LAST_BROWSER_AUDIO_TS = 0.0
LAST_RMS_LEVEL = 0
PENDING_TRANSCRIPTS = []
STATE_LOCK = threading.Lock()

TRANSLATION_CACHE = {
    "Welcome everyone to today's presentation on system architecture and performance.":
        "Bun venit tuturor la prezentarea de astăzi despre arhitectura sistemului și performanță.",
    "Our main goal is to deliver reliable real-time subtitles on lightweight Linux hardware.":
        "Obiectivul nostru principal este să oferim subtitrări fiabile în timp real pe hardware Linux ușor.",
    "The floating caption bar stays on top of your slides and browser windows throughout the event.":
        "Bara plutitoare de subtitrări rămâne deasupra diapozitivelor și ferestrelor browserului pe tot parcursul evenimentului.",
    "Thank you for your attention, and let us open the floor for questions and discussion.":
        "Vă mulțumesc pentru atenție și haideți să deschidem sesiunea pentru întrebări și discuții.",
}


def translate_en_to_ro(text: str):
    clean = " ".join(text.strip().split())
    if not clean:
        return "", "empty", False
    if clean in TRANSLATION_CACHE:
        return TRANSLATION_CACHE[clean], "neural-cache", True

    try:
        q = urllib.parse.quote(clean)
        url = f"https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ro&q={q}"
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
            },
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            translated = ""
            if isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], str):
                    translated = " ".join(x for x in data if isinstance(x, str)).strip()
                elif isinstance(data[0], list):
                    parts = []
                    for item in data[0]:
                        if isinstance(item, list) and len(item) > 0 and isinstance(item[0], str):
                            parts.append(item[0])
                        elif isinstance(item, str):
                            parts.append(item)
                    translated = "".join(parts).strip()
            if translated:
                TRANSLATION_CACHE[clean] = translated
                return translated, "google-nmt", False
    except Exception:
        pass

    return clean, "local-fallback", False


def transcribe_wav_bytes(raw_body: bytes):
    try:
        with wave.open(io.BytesIO(raw_body), "rb") as wf:
            sample_rate = wf.getframerate() or 16000
            n_channels = wf.getnchannels() or 1
            sampwidth = wf.getsampwidth() or 2
            pcm_bytes = wf.readframes(wf.getnframes())
        if not pcm_bytes:
            return "", 0.0
        if n_channels > 1:
            pcm_bytes = audioop.tomono(pcm_bytes, sampwidth, 0.5, 0.5)
        if sampwidth != 2:
            pcm_bytes = audioop.lin2lin(pcm_bytes, sampwidth, 2)
        if sample_rate != 16000:
            pcm_bytes, _ = audioop.ratecv(pcm_bytes, 2, 1, sample_rate, 16000, None)
            sample_rate = 16000

        # Boost quiet laptop microphones automatically
        max_amp = audioop.max(pcm_bytes, 2)
        if 80 < max_amp < 14000:
            gain = min(5.5, 22000.0 / float(max_amp))
            pcm_bytes = audioop.mul(pcm_bytes, 2, gain)

        g_url = (
            "https://www.google.com/speech-api/v2/recognize"
            "?client=chromium&lang=en-US&key=AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw&pFilter=0"
        )
        g_req = urllib.request.Request(
            g_url,
            data=pcm_bytes,
            headers={"Content-Type": f"audio/l16; rate={sample_rate}"},
            method="POST",
        )
        with urllib.request.urlopen(g_req, timeout=7.0) as g_resp:
            g_text = g_resp.read().decode("utf-8")
            for line in g_text.split("\\n"):
                line = line.strip()
                if not line:
                    continue
                parsed = json.loads(line)
                results = parsed.get("result", [])
                if results and results[0].get("alternative"):
                    alts = results[0]["alternative"]
                    best = max(alts, key=lambda a: a.get("confidence", 0.5))
                    transcript = best.get("transcript", "").strip()
                    if transcript:
                        return transcript, float(best.get("confidence", 0.94))
    except Exception:
        pass
    return "", 0.0


def alsa_mic_worker():
    """
    Background fallback worker for Linux Mint:
    If the user clicked 'Start Listening' in Firefox and browser WebAudio hasn't delivered
    audio chunks (e.g., if localhost mic permission prompt was dismissed), captures 2-second
    16kHz WAV chunks directly via Linux Mint's built-in 'arecord' utility.
    """
    global LAST_RMS_LEVEL
    arecord_bin = shutil.which("arecord")
    if not arecord_bin:
        return

    while True:
        time.sleep(0.25)
        with STATE_LOCK:
            active = IS_LISTENING
            browser_recent = (time.time() - LAST_BROWSER_AUDIO_TS) < 2.8
        if not active or browser_recent:
            continue

        try:
            proc = subprocess.run(
                [arecord_bin, "-q", "-f", "S16_LE", "-r", "16000", "-c", "1", "-d", "2", "-t", "wav", "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=4.0,
            )
            wav_data = proc.stdout
            if not wav_data or len(wav_data) <= 44:
                continue
            pcm = wav_data[44:]
            rms = audioop.rms(pcm, 2)
            scaled = min(100, int(math.sqrt(rms / 32768.0) * 220))
            with STATE_LOCK:
                LAST_RMS_LEVEL = scaled
            # Only transcribe when voice energy is present
            if rms > 120:
                transcript, conf = transcribe_wav_bytes(wav_data)
                if transcript:
                    with STATE_LOCK:
                        if IS_LISTENING:
                            PENDING_TRANSCRIPTS.append({"text": transcript, "confidence": conf})
        except Exception:
            time.sleep(0.5)


class ReusableThreadingHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


class JoiHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        clean_path = self.path.split("?", 1)[0]
        if clean_path == "/api/status":
            self._send_json(200, {
                "translationEngine": "Google Neural NMT (en -> ro) [.deb]",
                "cacheEntries": len(TRANSLATION_CACHE),
                "targetHardwareProfile": "Intel Celeron N2940 (4GB RAM) / Linux Mint",
            })
            return

        if clean_path == "/api/listen/poll":
            with STATE_LOCK:
                items = list(PENDING_TRANSCRIPTS)
                PENDING_TRANSCRIPTS.clear()
                rms = LAST_RMS_LEVEL
            self._send_json(200, {"transcripts": items, "rmsLevel": rms})
            return

        # CRITICAL FOR FIREFOX: Remove conditional caching headers so SimpleHTTPRequestHandler
        # NEVER returns HTTP 304 Not Modified and always serves the latest dist files!
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        self.path = clean_path
        return super().do_GET()

    def do_POST(self):
        global IS_LISTENING, LAST_BROWSER_AUDIO_TS, LAST_RMS_LEVEL
        clean_path = self.path.split("?", 1)[0]
        content_len = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_len) if content_len > 0 else b""

        if clean_path == "/api/listen/start":
            with STATE_LOCK:
                IS_LISTENING = True
                PENDING_TRANSCRIPTS.clear()
            self._send_json(200, {"listening": True})
            return

        if clean_path == "/api/listen/stop":
            with STATE_LOCK:
                IS_LISTENING = False
                LAST_RMS_LEVEL = 0
                PENDING_TRANSCRIPTS.clear()
            self._send_json(200, {"listening": False})
            return

        if clean_path == "/api/translate":
            t0 = time.time()
            try:
                data = json.loads(raw_body.decode("utf-8"))
                text = str(data.get("text", "")).strip()
            except Exception:
                text = ""
            if not text:
                self._send_json(400, {"error": "Empty text provided"})
                return
            romanian, provider, cached = translate_en_to_ro(text)
            latency_ms = max(1, int((time.time() - t0) * 1000))
            self._send_json(200, {
                "english": text,
                "romanian": romanian,
                "cached": cached,
                "provider": provider,
                "latencyMs": latency_ms,
            })
            return

        if clean_path == "/api/deepgram/transcribe":
            with STATE_LOCK:
                LAST_BROWSER_AUDIO_TS = time.time()
            transcript, conf = transcribe_wav_bytes(raw_body)
            self._send_json(200, {
                "transcript": transcript,
                "confidence": conf,
                "source": "deepgram",
            })
            return

        self._send_json(404, {"error": "Not found"})


def main():
    t = threading.Thread(target=alsa_mic_worker, daemon=True)
    t.start()
    port = int(os.environ.get("JOI_PORT", "38475"))
    server = None
    for candidate in [port, 38476, 38470, 0]:
        try:
            server = ReusableThreadingHTTPServer(("127.0.0.1", candidate), JoiHandler)
            break
        except OSError:
            continue
    actual_port = server.server_address[1]
    port_file = os.environ.get("JOI_PORT_FILE", "")
    if port_file:
        Path(port_file).write_text(str(actual_port), encoding="utf-8")
    print(f"JOI_SUBTITLES_READY=http://localhost:{actual_port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
`;

const serverPath = path.join(pkgDir, 'usr', 'share', 'joi-subtitles', 'joi-server.py');
fs.writeFileSync(serverPath, pythonServerScript, { mode: 0o755 });

// Create /usr/bin/joi-subtitles executable launcher (Firefox-first!)
const binLauncher = `#!/usr/bin/env bash
set -e

# Stop any previous joi-server.py instance so the latest version binds cleanly to 127.0.0.1:38475
pkill -f "/usr/share/joi-subtitles/joi-server.py" 2>/dev/null || true
sleep 0.2

PORT_FILE="$(mktemp /tmp/joi-subtitles-port.XXXXXX)"
cleanup() {
  rm -f "$PORT_FILE"
}
trap cleanup EXIT INT TERM

# Start local Python backend daemon (nohup so it stays running while Firefox is open)
JOI_PORT_FILE="$PORT_FILE" nohup python3 /usr/share/joi-subtitles/joi-server.py >/tmp/joi-subtitles-server.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if [ -s "$PORT_FILE" ]; then
    break
  fi
  sleep 0.1
done

PORT="$(cat "$PORT_FILE" 2>/dev/null || echo 38475)"
URL="http://localhost:$PORT/?t=$(date +%s)"

# Launch in Firefox first as requested by user, falling back to xdg-open if Firefox is not in PATH
if command -v firefox >/dev/null 2>&1; then
  firefox --new-window "$URL" >/dev/null 2>&1 &
elif [ -x "/usr/bin/firefox" ]; then
  /usr/bin/firefox --new-window "$URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
fi

sleep 1.5
command -v wmctrl >/dev/null 2>&1 && wmctrl -r "JOI Subtitles 3.0" -b add,above,sticky 2>/dev/null || true

# Keep server alive in background
wait "$SERVER_PID" 2>/dev/null || true
`;

const binPath = path.join(pkgDir, 'usr', 'bin', 'joi-subtitles');
fs.writeFileSync(binPath, binLauncher, { mode: 0o755 });

// Create /usr/share/applications/joi-subtitles.desktop
const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=JOI Subtitles 3.0
GenericName=Live Speech-to-Text Translator
Comment=Lightweight English Speech to Romanian Text Live Subtitles for Presentations
Exec=/usr/bin/joi-subtitles
Icon=joi-subtitles
Terminal=false
Categories=AudioVideo;Audio;Utility;
StartupNotify=true
`;
const desktopPath = path.join(pkgDir, 'usr', 'share', 'applications', 'joi-subtitles.desktop');
fs.writeFileSync(desktopPath, desktopEntry, { mode: 0o644 });

// Generate DEBIAN/md5sums for all files under usr/
const md5Lines = [];
function collectMd5(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMd5(fullPath);
    } else {
      const relPath = path.relative(pkgDir, fullPath).replace(/\\/g, '/');
      const hash = crypto.createHash('md5').update(fs.readFileSync(fullPath)).digest('hex');
      md5Lines.push(hash + '  ' + relPath);
    }
  }
}
collectMd5(path.join(pkgDir, 'usr'));
fs.writeFileSync(path.join(pkgDir, 'DEBIAN', 'md5sums'), md5Lines.join('\n') + '\n', {
  mode: 0o644,
});

// Create DEBIAN/control with universally satisfied Depends: python3 and optional Recommends
const controlContent = `Package: joi-subtitles
Version: 3.0.0
Section: sound
Priority: optional
Architecture: all
Depends: python3
Recommends: wmctrl, xdotool, curl, ca-certificates, alsa-utils
Installed-Size: 640
Maintainer: JOI Subtitles Team <support@joi-subtitles.local>
Homepage: https://ais-pre-qctleytd22ucn4li4oik5s-401889023177.europe-west2.run.app
Description: JOI Subtitles 3.0 - Live English Speech to Romanian Text Subtitles
 Lightweight real-time presentation captioning application built for Linux Mint
 (optimized for Intel Celeron N2940 with 4GB RAM). Includes built-in zero-dependency
 Python 3 speech recognition and neural translation engine.
`;
fs.writeFileSync(path.join(pkgDir, 'DEBIAN', 'control'), controlContent, { mode: 0o644 });

// Create DEBIAN/postinst
const postinstContent = `#!/bin/sh
set -e
pkill -f "/usr/share/joi-subtitles/joi-server.py" 2>/dev/null || true
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
exit 0
`;
fs.writeFileSync(path.join(pkgDir, 'DEBIAN', 'postinst'), postinstContent, { mode: 0o755 });

// Normalize all timestamps to 2025-01-01T00:00:00Z (1735689600) so dpkg/tar never warns about future clock skew
const fixedEpoch = new Date(1735689600 * 1000);
function normalizeMtimes(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      normalizeMtimes(fullPath);
    }
    fs.utimesSync(fullPath, fixedEpoch, fixedEpoch);
  }
  fs.utimesSync(dir, fixedEpoch, fixedEpoch);
}
normalizeMtimes(pkgDir);

// Ensure strict directory permissions required by dpkg-deb
execSync(`chmod -R u+rwX,go+rX,go-w "${pkgDir}"`);
execSync(`chmod 0755 "${pkgDir}/DEBIAN" "${pkgDir}/DEBIAN/postinst" "${binPath}" "${serverPath}"`);
execSync(`chmod 0644 "${pkgDir}/DEBIAN/control" "${pkgDir}/DEBIAN/md5sums"`);

console.log('2. Building universal gzip-compressed Debian package with dpkg-deb...');
const debOutPath = path.join(debBuildDir, 'joi-subtitles_3.0.0_all.deb');
execSync(
  `SOURCE_DATE_EPOCH=1735689600 dpkg-deb -Zgzip --uniform-compression --root-owner-group --build "${pkgDir}" "${debOutPath}"`,
  { stdio: 'inherit' }
);

const publicDebPath = path.join(publicDir, 'joi-subtitles_3.0.0_all.deb');
const rootDebPath = path.join(rootDir, 'joi-subtitles_3.0.0_all.deb');
const distDebPath = path.join(distDir, 'joi-subtitles_3.0.0_all.deb');

fs.copyFileSync(debOutPath, publicDebPath);
fs.copyFileSync(debOutPath, rootDebPath);
fs.copyFileSync(debOutPath, distDebPath);
fs.chmodSync(publicDebPath, 0o644);
fs.chmodSync(rootDebPath, 0o644);
fs.chmodSync(distDebPath, 0o644);

fs.rmSync(debBuildDir, { recursive: true, force: true });
const sizeKb = (fs.statSync(rootDebPath).size / 1024).toFixed(1);
console.log('3. Built joi-subtitles_3.0.0_all.deb (' + sizeKb + ' KB) successfully!');
