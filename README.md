# 🐶 Torya

> **Torya, fetch!** — Browser to terminal: catch errors and let your coding agent fix them.

Torya is a Chrome extension + Native Messaging bridge. While you develop locally,
it captures **console / network / DOM errors** in the browser and routes them to
your installed coding agent (`claude`, `codex`, `gemini`, optionally via `cmux`)
running in your project folder. The agent fixes the source code — you never
leave the browser.

📚 **Specs**: [PRD](./docs/PRD.md) · [SPEC](./docs/SPEC.md) · [EXTENSION](./docs/EXTENSION.md) · [BRIDGE](./docs/BRIDGE.md)

---

## ⚡ 1-minute setup

> Tested on macOS. Linux / Windows builds ship via `make -C bridge release`.

```bash
# 1) clone
git clone https://github.com/su-record/torya.git && cd torya

# 2) build everything
pnpm install
make -C bridge build
pnpm --filter torya-extension build

# 3) load the extension (unpacked)
#    chrome://extensions → enable Developer mode → Load unpacked
#    select the `extension/dist` folder, copy the printed extension ID

# 4) register the bridge (needs the ID from step 3)
TORYA_LOCAL_DEV=1 TORYA_EXTENSION_ID=<your-extension-id> ./installer/install.sh

# 5) reload the extension once → click the toolbar icon → side panel opens
```

The side panel auto-detects the bridge in 2s. Add a workspace (Browse → pick
your local project folder), start your dev server, and any error in the page
will be captured and forwarded to the chosen coding agent in a fresh terminal.

---

## How it works

```
Browser tab            Extension                Bridge                Terminal / cmux
  console error  ──▶   side panel  ──NM──▶   torya-bridge  ──spawn──▶  $ claude -p "..."
  4xx/5xx                                      (Go binary)               │
  DOM hiccup                                                              ▼
                                                                    your project files
```

NM = Chrome Native Messaging (stdin/stdout JSON, no HTTP / no ports).

- **Auto-fix mode** (default): detected errors are sent to your default agent
  immediately, opening cmux or your system terminal in the project folder.
- **Direct mode** (optional): with a Claude API key, small fixes are applied as
  patches without spawning a terminal. (Roadmapped — see [SPEC §10](./docs/SPEC.md).)

Errors are deduplicated for 5s so a render loop won't spam your terminal.

---

## Repo layout

```
torya/
├── docs/                  Specifications (PRD, SPEC, EXTENSION, BRIDGE)
├── extension/             Chrome MV3 extension — Vite + CRXJS + React
│   ├── manifest.json
│   ├── public/icons/      Tori the Shih Tzu 🐶
│   └── src/
│       ├── background/    service worker — capture, dedup, run-agent
│       ├── content/       page-world error hook
│       ├── sidepanel/     live error log + in-panel settings
│       ├── lib/           native messaging client, storage helpers
│       └── types/         shared protocol types
├── bridge/                Native Messaging host — Go 1.23
│   ├── cmd/torya-bridge/
│   └── internal/{nm,proto,handler,agents,terminal,safefs,log}
└── installer/             install.sh (macOS/Linux) · install.ps1 (Windows)
```

---

## Built for the cmux × AIM Intelligence Hackathon

🛠 **Track**: Developer Tooling. Torya makes cmux the natural home for
browser-side debugging — every captured error lands in a cmux workspace as a
ready-to-run agent prompt.

📅 Submission: 2026-04-26.

---

## License

MIT.

## Core Setup (AI Coding)

This project uses [VIBE](https://github.com/su-record/vibe) AI coding framework.

### Collaborator Install

```bash
# Global install (recommended)
npm install -g @su-record/vibe
vibe update

# Or use vibe init to setup
vibe init
```

### Usage

Use slash commands in Claude Code:
- `/vibe.spec "feature"` - Create SPEC document
- `/vibe.run "feature"` - Execute implementation
