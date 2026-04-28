# 🐶 Torya

> **Torya, fetch!** — Browser to terminal: catch errors and let your coding agent fix them.

Torya is a Chrome extension + Native Messaging bridge. While you develop locally,
it captures **console / network / DOM errors** in the browser and routes them to
your installed coding agent (`claude`, `codex`, `gemini`, optionally via `cmux`)
running in your project folder. The agent fixes the source code — you never
leave the browser.

📚 **Specs**: [PRD](./docs/PRD.md) · [SPEC](./docs/SPEC.md) · [EXTENSION](./docs/EXTENSION.md) · [BRIDGE](./docs/BRIDGE.md)

---

## ⚡ Install (60s)

> macOS / Linux. Tested on macOS. Windows: see `installer/install.ps1`.

```bash
curl -fsSL https://raw.githubusercontent.com/su-record/torya/main/installer/install.sh | sh
```

The installer:

1. Downloads the bridge binary  → `~/.local/bin/torya-bridge`
2. Downloads the extension dist → `~/.torya/extension`
3. Opens `chrome://extensions` — toggle **Developer mode**, click
   **Load unpacked**, and select `~/.torya/extension`
4. Paste the resulting extension ID back into the prompt
5. Registers the Chrome Native Messaging manifest and smoke-tests the bridge

Then reload the extension once and click the toolbar icon — the side panel
auto-detects the bridge in 2s. Add a workspace (Browse → pick your local
project folder), start your dev server, and any error in the page will be
captured and forwarded to the chosen coding agent in a fresh terminal.

<details>
<summary>From source (development)</summary>

```bash
git clone https://github.com/su-record/torya.git && cd torya
pnpm install
make -C bridge build
pnpm --filter torya-extension build

# uses local ./bridge/dist + ./extension/dist instead of downloading
TORYA_LOCAL_DEV=1 ./installer/install.sh
```

</details>

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

🏆 **1st Place — Developer Tooling Track** (cmux × AIM Intelligence Hackathon, 2026-04-26).

Torya makes cmux the natural home for browser-side debugging — every captured
error lands in a cmux workspace as a ready-to-run agent prompt.

---

## Roadmap

Things we wanted in the hackathon build but ran out of time for, plus the next
round of polish:

### 🚀 Coming next

- **Universal agent system prompt** — a vendor-agnostic prompt that drives
  `claude`, `codex`, `gemini` (and friends) to the same fix quality, instead of
  per-agent tweaking.
- **Prompt refinement layer** — today the bridge largely forwards captured
  errors as-is. Next pass: a small refinement step that shapes the payload
  before handoff — attaches the workspace tree, pulls in likely-related files
  via grep, summarizes the stack, dedupes noisy renders, and normalizes the
  prompt envelope across agents. Works for plain CLIs (stdout) as well as
  protocol-aware ones.
- **Direct mode (GA)** — finish and surface the currently-hidden API-key path so
  small fixes are applied as patches without spawning a terminal.
- **Broader error coverage** — capture and route a wider range of failure modes
  (unhandled promise rejections, worker errors, CSP violations, slow/cancelled
  requests, source-map-resolved stacks).
- **Screenshot context for DOM errors** — when a DOM/visual hiccup is caught,
  attach the current viewport screenshot so the agent can reason about the
  rendered state, not just the stack trace.

### 🔌 Agent Protocol (opt-in)

A small JSON-over-stdio protocol that any agent CLI can implement to unlock
richer side-panel UX. Plain CLIs keep working through stdout parsing — the
protocol just adds structured channels on top, opted into via a `--torya`
flag (or `TORYA_MODE=1`).

What the protocol carries:

- **Event stream out** — newline-delimited JSON over stdout:
  `thinking`, `tool_call`, `tool_result`, `file_diff`, `approval_request`,
  `done`. The panel renders these as a live activity feed instead of raw
  terminal output.
- **Structured context in** — error payload, DOM selector, viewport
  screenshot, workspace tree, selected text — fed to the CLI as JSON on
  stdin so the agent gets first-class typed context, not a flat string.
- **Session ID** — same workspace = same session, so the agent can resume
  yesterday's chat instead of starting cold every spawn.
- **Approval round-trip** — risky tools (`Bash`, `Write`, `Edit`) pause and
  emit `approval_request`; the panel renders it, the user clicks approve or
  deny, and the panel writes the decision back over stdin.
- **Diff preview** — `Write` / `Edit` tool calls emit before/after content
  so the panel can render an inline diff before HMR reloads the page.
- **Skill discovery** — `--list-skills` exposes the CLI's slash commands
  (e.g. `/vibe.spec`, `/code-review`) as command palette entries inside
  the panel.

CLIs that don't speak the protocol stay supported as today — torya falls
back to stdout parsing and the side panel renders a chat-style log without
the structured affordances.

Reference implementation: [`coco`](https://github.com/su-record/coco) is
expected to ship `--torya` and the JSON event stream as a first-party
client. The spec is intentionally small so any other agent CLI can adopt
it without bridge changes — full text will live in `docs/AGENT-PROTOCOL.md`.

### 🔍 To audit

- End-to-end matrix across the supported agents (`claude`, `codex`, `gemini`,
  with/without `cmux`) to confirm prompt → fix loop is reliable.
- Error dedup window + payload size limits under real-world spammy pages.
- Native Messaging reconnect behavior across Chrome restarts and bridge
  upgrades.

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
