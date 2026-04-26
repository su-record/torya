# Torya — Extension Specification

> **Repo**: https://github.com/su-record/torya
> **상위 문서**: [SPEC.md](./SPEC.md), [PRD.md](./PRD.md)
> **연관 문서**: [BRIDGE.md](./BRIDGE.md)

---

## 1. 개요

Chrome Extension (Manifest V3) — 브라우저에서 발생하는 에러를 캡처하고, 사이드패널 UI를 통해 사용자에게 노출하며, Native Messaging Bridge에 명령을 전달한다.

**구성 요소**:
- Background Service Worker
- Content Scripts (3종: console, network, dom)
- **Side Panel** (메인 UI, React)
- **Options Page** (설정, React)
- **Popup** (툴바 빠른 작업)
- **Onboarding** (Side Panel 내 위저드)

---

## 2. Manifest

```jsonc
{
  "manifest_version": 3,
  "name": "Torya",
  "version": "0.1.0",
  "description": "Browser to terminal: catch errors and let your coding agent fix them.",
  "minimum_chrome_version": "116",
  "permissions": [
    "storage",
    "sidePanel",
    "scripting",
    "tabs",
    "activeTab",
    "webRequest",
    "nativeMessaging",
    "notifications"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_popup": "popup.html", "default_icon": "icons/16.png" },
  "options_page": "options.html",
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["src/content/index.ts"],
    "run_at": "document_start",
    "world": "ISOLATED"
  }],
  "web_accessible_resources": [{
    "resources": ["src/content/inject.js"],
    "matches": ["<all_urls>"]
  }],
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

**권한 근거**:
- `storage`: workspace, settings, error history
- `sidePanel`: 메인 UI
- `scripting` + `webRequest`: 네트워크 캡처
- `nativeMessaging`: 브릿지 연결
- `notifications`: 백그라운드 작업 완료 알림

---

## 3. Side Panel (메인 UI)

### 3.1 라우트

```
sidepanel.html
 ├─ /                  ErrorList (메인)
 ├─ /onboarding        4단계 위저드 (첫 실행 / 미완료 시 강제)
 ├─ /error/:id         DevErrorCard 상세
 ├─ /workspace/:id     워크스페이스 상세 (작업 중)
 └─ /history           해결된 에러 기록
```

라우터는 zustand 상태 + 단순 switch (해커톤 시간 절약).

### 3.2 ErrorList 화면

```
┌─────────────────────────────────────────┐
│  🐶 Torya                          ⚙ ⓘ  │  ← 헤더 (옵션, 정보)
├─────────────────────────────────────────┤
│  📁 Workspace: myapp                    │  ← 현재 매핑 표시
│  🤖 Agents: claude ✓ codex ✓ cmux ✓     │
├─────────────────────────────────────────┤
│  Live errors (3)                  Clear │
│  ┌───────────────────────────────────┐  │
│  │ 🔴 ReferenceError: useRouter ...   │  │
│  │ src/pages/Home.tsx:12              │  │
│  │ [🌉 Fix with Claude] [⚡ Quick]   │  │  ← Agent / Direct 모드
│  │ [Dismiss]                          │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ 🟠 POST /api/users → 500           │  │
│  │ ...                                │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**상호작용**:
- `[🌉 Fix with Claude]` — Agent 모드. 브릿지에 `run-agent` 호출 → cmux/터미널 띄움
- `[⚡ Quick]` — Direct 모드 (LLM 키 등록 시에만 활성화). 패치 미리보기 → Apply
- `[Dismiss]` — 카드 숨김 (스토리지에서 status='dismissed')

### 3.3 DevErrorCard 컴포넌트

표시 정보:
- 심각도 / 소스 아이콘
- 에러 메시지 (1줄, 클릭 시 펼침)
- 발생 위치 (`file:line:col`) — 매핑된 워크스페이스의 절대 경로 prefix 자동 적용
- 발생 시각
- 액션 버튼

상태 머신:
```
new → running → fixed
       ↓
     failed (재시도 버튼)
new → dismissed
```

---

## 4. Options Page (설정)

```
┌─ Settings ──────────────────────────────┐
│                                         │
│  🌉 Bridge                              │
│  Status: ✅ Connected (v0.1.0)          │
│  [Reinstall bridge] [Test connection]   │
│                                         │
│  📁 Workspaces                          │
│  ┌─────────────────────────────────┐    │
│  │ myapp                           │    │
│  │ origin: https://localhost:5173  │    │
│  │ path:   /Users/su/...           │    │
│  │ agent:  claude  terminal: cmux  │    │
│  │                  [Edit] [×]      │    │
│  └─────────────────────────────────┘    │
│  [+ Add workspace]                      │
│                                         │
│  🤖 Coding Agents                       │
│  ✅ claude   /usr/local/bin/claude      │
│  ✅ codex    /opt/homebrew/bin/codex    │
│  ✅ gemini   /usr/local/bin/gemini      │
│  ✅ cmux     RPC: ws://127.0.0.1:7878   │
│  [Re-detect]                            │
│                                         │
│  🔑 LLM API Keys (Direct mode)          │
│  Claude API Key:  [●●●●●●●●] [Save]     │
│  ☐ Auto-use Direct mode for ≤3 line     │
│                                         │
│  ⚙️ Capture Rules                       │
│  ☑ Console errors                       │
│  ☑ Unhandled promise rejections          │
│  ☑ Network 4xx/5xx                       │
│  ☐ DOM 404 (images, scripts)            │
│  ☐ React/Vue hydration warnings         │
│                                         │
│  Origins to ignore (regex, one per line)│
│  [textarea]                             │
└─────────────────────────────────────────┘
```

저장 시 `chrome.storage.local`에 즉시 반영, background.js에 broadcast.

---

## 5. Popup (툴바)

```
┌─────────────────────────┐
│  🐶 Torya               │
│  📁 myapp              │
│  Bridge: ✅            │
│  Live errors: 2        │
│                         │
│  [Open side panel]     │
│  [Pause capture]       │
│  [Settings]            │
└─────────────────────────┘
```

작은 빠른 액션. 첫 설치 시 사이드패널이 자동 오픈되므로 부차적.

---

## 6. Onboarding 위저드 (Side Panel 내)

설치 직후 `/onboarding`으로 강제 이동. 미완료면 다른 화면 진입 차단.

### Step 1 — 브릿지 설치

```
┌──────────────────────────────────────────┐
│  Step 1 of 4 — Install Torya Bridge      │
│                                          │
│  Torya needs a small native helper to   │
│  talk to your terminal and project files.│
│                                          │
│  Run this in your terminal:              │
│  ┌────────────────────────────────────┐  │
│  │ curl -fsSL                         │📋│
│  │ https://raw.githubusercontent.com/ │  │
│  │ su-record/torya/main/installer/    │  │
│  │ install.sh | sh                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Or [Download installer for your OS ▼]  │
│  • macOS (.pkg)                          │
│  • Linux (.sh)                           │
│  • Windows (.ps1)                        │
│                                          │
│  Status: ⏳ Waiting for bridge…          │
│  (auto-detects every 2s)                 │
│                                          │
│                          [Skip for now]  │
└──────────────────────────────────────────┘
```

검증: background.js가 2초마다 `chrome.runtime.connectNative('com.torya.bridge')` 시도 → `ping` 성공 시 다음 단계로 자동 이동.

### Step 2 — 작업 폴더 매핑

```
┌──────────────────────────────────────────┐
│  Step 2 of 4 — Map your project          │
│                                          │
│  Torya needs to know where your project  │
│  lives on disk so the agent edits the    │
│  right files.                            │
│                                          │
│  Browser origin                          │
│  [https://localhost:5173        ▼]      │
│  (current tab pre-filled)                │
│                                          │
│  Project folder                          │
│  [/Users/su/workspace/myapp     📂]     │
│  (Browse opens native picker via bridge) │
│                                          │
│              [Add another later] [Next]  │
└──────────────────────────────────────────┘
```

폴더 선택은 브릿지의 `pick-folder` 명령 호출 (OS 네이티브 다이얼로그).

### Step 3 — 에이전트 감지

```
┌──────────────────────────────────────────┐
│  Step 3 of 4 — Detect coding agents      │
│                                          │
│  We scanned your PATH:                   │
│                                          │
│  ✅ claude   v0.5.2                      │
│  ✅ codex    v1.0.0                      │
│  ❌ gemini   not found  [Install guide ↗]│
│  ✅ cmux     running on port 7878        │
│                                          │
│  Default agent for new errors:           │
│  ( ) claude  ( ) codex                   │
│                                          │
│  Terminal preference:                    │
│  (•) cmux  ( ) System terminal           │
│                                          │
│                            [Re-scan] [Next] │
└──────────────────────────────────────────┘
```

### Step 4 — (선택) LLM 키

```
┌──────────────────────────────────────────┐
│  Step 4 of 4 — Direct mode (optional)    │
│                                          │
│  Skip this if you only use Agent mode.   │
│  Direct mode applies small fixes without │
│  opening a terminal — uses your API key. │
│                                          │
│  Claude API key                          │
│  [sk-ant-...                          ]  │
│                                          │
│  ☐ Use Direct mode for fixes ≤ 3 lines   │
│                                          │
│                       [Skip]   [Finish]  │
└──────────────────────────────────────────┘
```

완료 시 onboarding 플래그 저장 + 메인 화면으로.

---

## 7. Background Service Worker

### 7.1 책임

| 책임 | 메모 |
|---|---|
| 네트워크 캡처 | `chrome.webRequest.onCompleted` / `onErrorOccurred` |
| 룰 매칭 | settings 기반 필터링 |
| Native Messaging 연결 관리 | 영구 포트 1개 유지, 끊기면 재연결 |
| 사이드패널 push | `chrome.runtime.sendMessage` |
| 에러 영구화 | `chrome.storage.local`에 최근 50개 |
| Direct 모드 LLM 호출 | `@anthropic-ai/sdk` (background에서만) |

### 7.2 NativeBridge 클래스 (개요)

```typescript
class NativeBridge {
  private port: chrome.runtime.Port | null = null;
  private pending = new Map<string, (msg: BridgeMsg) => void>();

  async connect(): Promise<void> { /* connectNative + onMessage handler */ }
  async send<T>(cmd: string, args: unknown): Promise<T> { /* req-id 매칭 */ }
  stream(cmd: string, args: unknown, onMsg: (m: BridgeMsg) => void): () => void;
}
```

연결 끊김 시 backoff 재연결 (1s → 2s → 4s, max 8s).

---

## 8. Content Scripts

### 8.1 콘솔 캡처 (`content/console.ts`)

`document_start`에 `world: ISOLATED`로 주입 + `inject.js`를 페이지 월드에 주입 (window 객체에 접근하려면).

캡처 대상:
- `window.addEventListener('error', ...)`
- `window.addEventListener('unhandledrejection', ...)`
- `console.error` monkey-patch (옵션)

페이로드:
```typescript
{ message, filename, lineno, colno, stack, ts: Date.now() }
```

content script로 forward → `chrome.runtime.sendMessage({type: 'capture/console', payload})`.

### 8.2 네트워크 캡처

**1순위**: `chrome.webRequest` (background) — 모든 요청 가시.
**2순위 (보강)**: content에서 `fetch` / `XHR` monkey-patch — 요청 본문/응답 본문 접근.

### 8.3 DOM 옵저버 (선택, P1)

`MutationObserver`로:
- `<img>` 로드 실패 → 404
- React 에러 바운더리 텍스트 패턴 (`"Error: Hydration failed"`)

룰 기반, LLM 무관.

---

## 9. 저장소 (chrome.storage.local)

```typescript
interface StorageSchema {
  schemaVersion: 1;
  onboarding: { completed: boolean; step: 1|2|3|4 };
  bridge: { lastSeenAt?: number; version?: string };
  workspaces: Workspace[];
  agents: AgentInfo[];
  settings: {
    defaultAgent: 'claude' | 'codex' | 'gemini';
    terminalPreference: 'cmux' | 'system';
    autoDirectMode: boolean;
    captureRules: { console: boolean; network: boolean; dom: boolean; rejection: boolean };
    ignoreOrigins: string[];   // regex
  };
  secrets: {
    claudeApiKey?: string;     // chrome.storage.local 만 사용 (sync 금지)
  };
  errors: DevError[];          // 최근 50개
}
```

`secrets`는 절대 `chrome.storage.sync`에 넣지 않음.

---

## 10. 메시지 타입 (Extension 내부)

```typescript
type ExtMsg =
  | { type: 'capture/console'; payload: ConsoleErrorPayload }
  | { type: 'capture/network'; payload: NetworkErrorPayload }
  | { type: 'capture/dom';     payload: DomErrorPayload }
  | { type: 'error/dismiss';   id: string }
  | { type: 'error/run-agent'; id: string; agent: AgentName }
  | { type: 'error/quick-fix'; id: string }
  | { type: 'bridge/status' }
  | { type: 'workspace/upsert'; workspace: Workspace }
  | { type: 'agents/redetect' };
```

---

## 11. UI 디자인 시스템

- Tailwind + shadcn/ui (Card, Button, Dialog, Tabs, Switch, Input)
- 다크/라이트 자동 (prefers-color-scheme)
- 컬러 토큰: error=`red-500`, warn=`amber-500`, ok=`emerald-500`
- 폰트: 시스템 (San Francisco / Segoe UI)
- 사이드패널 폭: 360–400px 가정

---

## 12. 접근성 / i18n

- 한국어 1순위 (해커톤 한국 행사) + 영어 백업
- 키보드: 카드 간 Tab, Enter로 [Fix with Claude] 트리거
- `aria-live="polite"`로 새 에러 알림

---

## 13. 빌드

`extension/package.json`:

```jsonc
{
  "name": "torya-extension",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "type-check": "tsc --noEmit",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2",
    "vite": "^5",
    "typescript": "^5",
    "react": "^18",
    "react-dom": "^18",
    "tailwindcss": "^3",
    "zustand": "^4"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30"
  }
}
```

빌드 결과: `extension/dist/` → `chrome://extensions` → "Load unpacked".

---

## 14. 미해결 / 결정 필요

- [ ] cmux 워크스페이스 매핑을 옵션에서 별도로 선택 가능하게 할 것인가? (MVP: workspace.terminalPreference에 묶어둠)
- [ ] 에러 카드의 "관련 소스 미리보기"는 P1 (브릿지의 `read-file` 이용)
- [ ] 옵션의 "Re-detect"가 백그라운드 자동 주기 감지를 어떻게 트리거할지

---

**Document End** · 2026-04-26
