#!/usr/bin/env sh
# Torya Bridge installer (macOS / Linux).
#
# - Downloads the latest bridge binary from GitHub Releases (or copies from
#   ./bridge/dist for local development).
# - Registers the Chrome Native Messaging manifest under the user's profile.
#
# Env:
#   TORYA_EXTENSION_ID   Chrome extension ID to allowlist. Required.
#   TORYA_LOCAL_DEV=1    Use local ./bridge/dist binary instead of downloading.
#   TORYA_VERSION        Pin a specific release (default: latest).

set -eu

REPO="su-record/torya"
APP_NAME="com.torya.bridge"

err() { printf "✗ %s\n" "$*" >&2; exit 1; }
ok()  { printf "✓ %s\n" "$*"; }
info(){ printf "→ %s\n" "$*"; }

EXT_ID="${TORYA_EXTENSION_ID:-}"
[ -n "$EXT_ID" ] || err "TORYA_EXTENSION_ID is required (Chrome extension ID)."

OS_RAW="$(uname -s)"
case "$OS_RAW" in
  Darwin) OS=darwin ;;
  Linux)  OS=linux  ;;
  *) err "Unsupported OS: $OS_RAW" ;;
esac

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) err "Unsupported arch: $ARCH_RAW" ;;
esac

BIN_DIR="$HOME/.local/bin"
BIN_PATH="$BIN_DIR/torya-bridge"
mkdir -p "$BIN_DIR"

if [ "${TORYA_LOCAL_DEV:-}" = "1" ]; then
  SRC="./bridge/dist/torya-bridge"
  [ -f "$SRC" ] || err "Local dev mode but $SRC not built. Run: make -C bridge build"
  cp "$SRC" "$BIN_PATH"
  ok "Copied local dev binary to $BIN_PATH"
else
  VERSION="${TORYA_VERSION:-latest}"
  if [ "$VERSION" = "latest" ]; then
    URL="https://github.com/$REPO/releases/latest/download/torya-bridge-${OS}-${ARCH}"
  else
    URL="https://github.com/$REPO/releases/download/${VERSION}/torya-bridge-${OS}-${ARCH}"
  fi
  info "Downloading bridge from $URL"
  curl -fL --progress-bar "$URL" -o "$BIN_PATH" \
    || err "Download failed. (Tip: TORYA_LOCAL_DEV=1 for development.)"
  ok "Downloaded bridge to $BIN_PATH"
fi
chmod +x "$BIN_PATH"

case "$OS" in
  darwin)
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  linux)
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
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
ok "Registered Native Messaging manifest at $MANIFEST_PATH"

info "Smoke testing bridge..."
if "$BIN_PATH" ping >/dev/null 2>&1; then
  ok "Bridge OK"
else
  err "Bridge smoke test failed."
fi

cat <<EOM

🐢 Torya Bridge installed.

Next:
  1. Reload the Torya extension in chrome://extensions
  2. Open the side panel — it should auto-detect the bridge

EOM
