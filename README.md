# 🐢 Torya

> Browser to terminal: catch errors and let your coding agent fix them.

Torya is a Chrome extension + native messaging bridge. It captures console / network / DOM errors during local development and lets your coding agent (`claude`, `codex`, `gemini`, or via `cmux`) fix the source code in your project folder — without leaving the browser.

📚 **Specs**: [PRD](./docs/PRD.md) · [SPEC](./docs/SPEC.md) · [EXTENSION](./docs/EXTENSION.md) · [BRIDGE](./docs/BRIDGE.md)

---

## Quick start (development)

```bash
# 1) Install bridge (Go)
make -C bridge build
./installer/install.sh    # registers Native Messaging host

# 2) Run extension
pnpm install
pnpm dev:ext              # then load extension/dist in chrome://extensions
```

## Repo layout

```
torya/
├── docs/         Specs (PRD / SPEC / EXTENSION / BRIDGE)
├── extension/    Chrome MV3 extension (Vite + CRXJS + React)
├── bridge/       Native Messaging host (Go)
└── installer/    Cross-platform installers (sh / ps1)
```

---

Hackathon submission · cmux × AIM Intelligence · 2026-04-26
