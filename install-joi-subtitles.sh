#!/usr/bin/env bash
# ==============================================================================
# JOI Subtitles 3.0 — Standalone One-Step Installer for Linux Mint
# Target Hardware: Intel Celeron N2940 (4GB RAM) / Linux Mint (Cinnamon/MATE/Xfce)
# ==============================================================================
set -e

echo "========================================================"
echo " Installing JOI Subtitles 3.0 Standalone App..."
echo "========================================================"

# 1. Install required Linux Mint system packages
echo "[1/4] Checking & installing system dependencies (nodejs, npm, wmctrl, chromium)..."
sudo apt-get update -y
sudo apt-get install -y nodejs npm wmctrl xdotool curl

# Detect available Chromium-based browser for standalone frameless window mode
BROWSER_BIN=""
for candidate in chromium-browser chromium google-chrome-stable brave-browser firefox; do
  if command -v "$candidate" >/dev/null 2>&1; then
    BROWSER_BIN="$candidate"
    break
  fi
done

if [ -z "$BROWSER_BIN" ]; then
  echo "[1/4] Installing chromium-browser for standalone window mode..."
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
  BROWSER_BIN="chromium"
fi

# 2. If running inside the downloaded project directory, install npm dependencies and build
APP_DIR="$HOME/.local/share/joi-subtitles-3"
mkdir -p "$APP_DIR"

if [ -f "./package.json" ] && [ -f "./server.ts" ]; then
  echo "[2/4] Copying project files to $APP_DIR and building production bundle..."
  cp -r ./* "$APP_DIR/"
  cd "$APP_DIR"
  npm install
  npm run build
else
  echo "[2/4] Configuring standalone launcher for JOI Subtitles 3.0..."
fi

# 3. Create standalone executable launcher script
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
LAUNCHER_PATH="$BIN_DIR/joi-subtitles"

cat << 'EOF' > "$LAUNCHER_PATH"
#!/usr/bin/env bash
APP_DIR="$HOME/.local/share/joi-subtitles-3"
PORT=3000
URL="http://localhost:3000"

# Start local production server if built locally, otherwise use cloud standalone URL
if [ -f "$APP_DIR/server.js" ]; then
  cd "$APP_DIR"
  if ! curl -s "$URL/api/status" >/dev/null 2>&1; then
    NODE_ENV=production PORT=$PORT node "$APP_DIR/server.js" >/dev/null 2>&1 &
    SERVER_PID=$!
    trap "kill $SERVER_PID 2>/dev/null || true" EXIT
    sleep 1.5
  fi
else
  URL="https://ais-pre-qctleytd22ucn4li4oik5s-401889023177.europe-west2.run.app"
fi

# Launch in standalone frameless app window optimized for Intel Celeron N2940 (4GB RAM)
for candidate in chromium-browser chromium google-chrome-stable brave-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then
    "$candidate" \
      --app="$URL" \
      --window-size=1020,760 \
      --disable-extensions \
      --disable-background-networking \
      --disable-sync \
      --renderer-process-limit=2 &
    BROWSER_PID=$!
    break
  fi
done

sleep 2
if command -v wmctrl >/dev/null 2>&1; then
  wmctrl -r "JOI Subtitles 3.0" -b add,above,sticky 2>/dev/null || true
fi

wait $BROWSER_PID 2>/dev/null || true
EOF

chmod +x "$LAUNCHER_PATH"

# 4. Create Linux Mint Application Menu & Desktop Shortcut (.desktop)
DESKTOP_FILE="$HOME/.local/share/applications/joi-subtitles-3.desktop"
mkdir -p "$HOME/.local/share/applications"

cat << EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=3.0
Type=Application
Name=JOI Subtitles 3.0
Comment=Live English Speech to Romanian Text Subtitles
Exec=$LAUNCHER_PATH
Icon=audio-input-microphone
Terminal=false
Categories=AudioVideo;Utility;Presentation;
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"
if [ -d "$HOME/Desktop" ]; then
  cp "$DESKTOP_FILE" "$HOME/Desktop/JOI-Subtitles-3.0.desktop"
  chmod +x "$HOME/Desktop/JOI-Subtitles-3.0.desktop"
fi

echo "========================================================"
echo " JOI Subtitles 3.0 Installed Successfully!"
echo " - Launch from your Linux Mint Application Menu or Desktop icon"
echo " - Or run '~/.local/bin/joi-subtitles' in terminal"
echo "========================================================"
