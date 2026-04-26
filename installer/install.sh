#!/usr/bin/env sh
# Torya installer (macOS / Linux).
#
# Flow:
#   1. Install bridge binary  → ~/.local/bin/torya-bridge
#   2. Install extension dist → ~/.torya/extension
#   3. Open chrome://extensions for sideload (Developer mode → Load unpacked)
#   4. Read extension ID (prompt or $TORYA_EXTENSION_ID)
#   5. Register Chrome Native Messaging manifest
#   6. Smoke test the bridge
#
# Env:
#   TORYA_EXTENSION_ID   Skip the prompt; use this ID directly.
#   TORYA_LOCAL_DEV=1    Use local ./bridge/dist + ./extension/dist (no download).
#   TORYA_VERSION        Pin a specific release tag (default: latest).

set -eu

REPO="su-record/torya"
APP_NAME="com.torya.bridge"
EXT_DIR="$HOME/.torya/extension"

err()  { printf "✗ %s\n" "$*" >&2; exit 1; }
ok()   { printf "✓ %s\n" "$*"; }
info() { printf "→ %s\n" "$*"; }
warn() { printf "! %s\n" "$*" >&2; }

# ---- platform detection ----------------------------------------------------
OS_RAW="$(uname -s)"
case "$OS_RAW" in
  Darwin) OS=darwin ;;
  Linux)  OS=linux  ;;
  *) err "Unsupported OS: $OS_RAW (Windows: use installer/install.ps1)" ;;
esac

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64)  ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) err "Unsupported arch: $ARCH_RAW" ;;
esac

command -v unzip >/dev/null 2>&1 || err "'unzip' is required."
command -v curl  >/dev/null 2>&1 || err "'curl' is required."

VERSION="${TORYA_VERSION:-latest}"
release_url() {
  # $1 = asset filename
  if [ "$VERSION" = "latest" ]; then
    printf "https://github.com/%s/releases/latest/download/%s" "$REPO" "$1"
  else
    printf "https://github.com/%s/releases/download/%s/%s" "$REPO" "$VERSION" "$1"
  fi
}

# ---- 1. bridge binary ------------------------------------------------------
BIN_DIR="$HOME/.local/bin"
BIN_PATH="$BIN_DIR/torya-bridge"
mkdir -p "$BIN_DIR"

if [ "${TORYA_LOCAL_DEV:-}" = "1" ]; then
  SRC="./bridge/dist/torya-bridge"
  [ -f "$SRC" ] || err "Local dev: $SRC not built. Run: make -C bridge build"
  cp "$SRC" "$BIN_PATH"
  ok "Bridge: copied local dev binary → $BIN_PATH"
else
  URL="$(release_url "torya-bridge-${OS}-${ARCH}")"
  info "Downloading bridge: $URL"
  curl -fL --progress-bar "$URL" -o "$BIN_PATH" \
    || err "Bridge download failed. (Tip: TORYA_LOCAL_DEV=1 for development.)"
  ok "Bridge: downloaded → $BIN_PATH"
fi
chmod +x "$BIN_PATH"

# ---- 2. extension dist -----------------------------------------------------
if [ "${TORYA_LOCAL_DEV:-}" = "1" ]; then
  SRC_EXT="./extension/dist"
  [ -d "$SRC_EXT" ] || err "Local dev: $SRC_EXT not built. Run: pnpm --filter torya-extension build"
  rm -rf "$EXT_DIR"
  mkdir -p "$EXT_DIR"
  # copy contents (not the dist/ dir itself) so EXT_DIR holds manifest.json directly
  (cd "$SRC_EXT" && tar cf - .) | (cd "$EXT_DIR" && tar xf -)
  ok "Extension: copied local dist → $EXT_DIR"
else
  URL="$(release_url "torya-extension.zip")"
  TMP_ZIP="/tmp/torya-extension-$$.zip"
  info "Downloading extension: $URL"
  curl -fL --progress-bar "$URL" -o "$TMP_ZIP" \
    || { rm -f "$TMP_ZIP"; err "Extension download failed. (Tip: TORYA_LOCAL_DEV=1 for development.)"; }
  rm -rf "$EXT_DIR"
  mkdir -p "$EXT_DIR"
  unzip -oq "$TMP_ZIP" -d "$EXT_DIR" || { rm -f "$TMP_ZIP"; err "unzip failed"; }
  rm -f "$TMP_ZIP"
  ok "Extension: extracted → $EXT_DIR"
fi

[ -f "$EXT_DIR/manifest.json" ] \
  || err "manifest.json not found in $EXT_DIR — bad archive layout?"

# ---- 3. open chrome://extensions ------------------------------------------
cat <<EOM

Sideload the extension:
  1. chrome://extensions    (opening automatically)
  2. Toggle "Developer mode" (top-right)
  3. Click "Load unpacked"  → select:
       $EXT_DIR
  4. Copy the extension ID shown under "Torya"

EOM

case "$OS" in
  darwin) open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true ;;
  linux)
    if command -v google-chrome >/dev/null 2>&1; then
      google-chrome "chrome://extensions" >/dev/null 2>&1 &
    elif command -v chromium >/dev/null 2>&1; then
      chromium "chrome://extensions" >/dev/null 2>&1 &
    else
      xdg-open "chrome://extensions" >/dev/null 2>&1 || true
    fi
    ;;
esac

# ---- 4. extension ID -------------------------------------------------------
EXT_ID="${TORYA_EXTENSION_ID:-}"
if [ -z "$EXT_ID" ]; then
  if [ -t 0 ]; then
    printf "Paste extension ID: "
    read -r EXT_ID
  else
    err "TORYA_EXTENSION_ID is required (no TTY for prompt)."
  fi
fi
[ -n "$EXT_ID" ] || err "Extension ID is required."

if ! printf "%s" "$EXT_ID" | grep -Eq '^[a-p]{32}$'; then
  warn "Extension ID '$EXT_ID' doesn't look standard (expected 32 chars in a-p). Proceeding."
fi

# ---- 5. Native Messaging manifest -----------------------------------------
case "$OS" in
  darwin) MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
  linux)  MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
esac
mkdir -p "$MANIFEST_DIR"

MANIFEST_PATH="$MANIFEST_DIR/$APP_NAME.json"
cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$APP_NAME",
  "description": "Torya Native Messaging host",
  "path": "$BIN_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
ok "NM manifest registered → $MANIFEST_PATH"

# ---- 6. smoke test ---------------------------------------------------------
info "Smoke testing bridge..."
if "$BIN_PATH" ping >/dev/null 2>&1; then
  ok "Bridge OK"
else
  err "Bridge smoke test failed."
fi

cat <<EOM

🐶 Torya installed.

Final step:
  • Reload the Torya extension once in chrome://extensions (the round-arrow icon)
  • Click the Torya toolbar icon — the side panel auto-detects the bridge in 2s

EOM
