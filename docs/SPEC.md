# Torya — Technical Specification (SPEC)

> **Repo**: https://github.com/su-record/torya
> **관련 문서**: [PRD.md](./PRD.md), [EXTENSION.md](./EXTENSION.md), [BRIDGE.md](./BRIDGE.md)

---

## 1. 시스템 아키텍처

```
┌──────────────────────────── User Machine ────────────────────────────┐
│                                                                      │
│  ┌────────── Chrome ──────────┐         ┌──── Native Host ────┐      │
│  │                            │         │                     │      │
│  │  ┌─ Content Script ─┐      │         │   torya-bridge      │      │
│  │  │  Console hook    │      │         │   (Go binary)       │      │
│  │  │  Network hook    │      │         │                     │      │
│  │  │  DOM observer    │      │         │   - Agent detect    │      │
│  │  └────────┬─────────┘      │         │   - Terminal spawn  │      │
│  │           │ runtime msg    │         │   - File ops        │      │
│  │  ┌────────▼─────────┐      │  stdio  │   - cmux RPC client │      │
│  │  │ Service Worker   │◀────────JSON───▶│                     │      │
│  │  │ (background)     │      │         │                     │      │
│  │  └────────┬─────────┘      │         └──────────┬──────────┘      │
│  │           │                │                    │                 │
│  │  ┌────────▼─────────┐      │         ┌──────────▼──────────┐      │
│  │  │  Side Panel UI   │      │         │  cmux / Terminal /  │      │
│  │  │  Options Page    │      │         │  iTerm / wt.exe     │      │
│  │  │  Popup           │      │         │                     │      │
│  │  └──────────────────┘      │         │  $ claude -p "..."  │      │
│  └────────────────────────────┘         └─────────────────────┘      │
│                                                    │                 │
│                                                    ▼                 │
│                                           ┌─────────────────┐        │
│                                           │ Project Folder  │        │
│                                           │ /Users/su/app   │        │
│                                           └─────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. 컴포넌트

| 컴포넌트 | 역할 | 기술 | 상세 |
|---|---|---|---|
| **Extension** | 에러 캡처, UI, 사용자 입력 | Manifest v3, TypeScript, React | [EXTENSION.md](./EXTENSION.md) |
| **Bridge** | 터미널/에이전트 호출, 파일 I/O, 디스커버리 | Go (단일 바이너리, cgo 없음) | [BRIDGE.md](./BRIDGE.md) |
| **Installer** | Native Messaging 매니페스트 등록, 바이너리 배치 | Shell + PowerShell | [BRIDGE.md §Installer](./BRIDGE.md) |

---

## 3. 데이터 흐름

### 3.1 Agent 모드 (메인)

```
1. content.js   : window.addEventListener('error', ...)
                  XHR/fetch monkey-patch
                  MutationObserver
                  → chrome.runtime.sendMessage({type: 'capture', payload})

2. background.js: 룰 매칭 → DevError 객체 생성 → chrome.storage 저장
                  → Side Panel에 push (chrome.runtime.sendMessage)

3. SidePanel    : DevErrorCard 렌더링, [Fix with X] 버튼

4. SidePanel    : 사용자 클릭 → background.js에 'run-agent' 요청

5. background.js: chrome.runtime.connectNative('com.torya.bridge')
                  → port.postMessage({cmd: 'run-agent', agent, prompt, cwd})

6. Bridge       : cmux RPC 시도 → 실패 시 OS 터미널 spawn
                  → 응답 stream을 background.js로 push

7. background.js: 응답을 SidePanel에 forward → 진행 상황 표시
```

### 3.2 Direct 모드 (LLM 키 등록 시)

```
1~3. 동일

4. SidePanel    : "Quick Fix" 버튼 클릭

5. background.js: 1) Bridge에 'read-file' 요청 → 관련 소스 가져옴
                  2) Anthropic SDK로 직접 호출 (background.js에서)
                  3) diff 생성 → SidePanel에 미리보기

6. SidePanel    : [Apply] 클릭 → background.js에 confirm

7. background.js: Bridge에 'write-file' 요청 → 패치 적용
```

---

## 4. 도메인 모델

### 4.1 DevError

```typescript
interface DevError {
  id: string;                    // uuid
  capturedAt: number;            // epoch ms
  source: 'console' | 'network' | 'dom';
  severity: 'error' | 'warn';
  origin: string;                // https://localhost:5173
  url: string;                   // current tab URL
  message: string;
  stack?: string;
  meta: {
    file?: string;               // src/pages/Home.tsx
    line?: number;
    col?: number;
    request?: { method, url, status, body };
    domSnippet?: string;
  };
  workspace?: Workspace;         // 매핑된 작업 폴더
  status: 'new' | 'running' | 'fixed' | 'dismissed';
}
```

### 4.2 Workspace

```typescript
interface Workspace {
  id: string;
  name: string;                  // "myapp"
  originPattern: string;         // "https://localhost:5173" or "*://localhost:*"
  rootPath: string;              // "/Users/su/workspace/myapp"
  defaultAgent: 'claude' | 'codex' | 'gemini';
  terminalPreference: 'cmux' | 'system';
}
```

### 4.3 AgentInfo

```typescript
interface AgentInfo {
  name: 'claude' | 'codex' | 'gemini' | 'cmux';
  available: boolean;
  path?: string;                 // /usr/local/bin/claude
  version?: string;
}
```

---

## 5. Native Messaging 프로토콜

상세는 [BRIDGE.md §Protocol](./BRIDGE.md). 핵심만:

**요청 (Extension → Bridge)**:
```json
{ "id": "req-1", "cmd": "run-agent",
  "args": { "agent": "claude", "prompt": "...", "cwd": "/Users/su/app" } }
```

**응답 (Bridge → Extension)**: 스트리밍 (여러 메시지)
```json
{ "id": "req-1", "kind": "stdout", "data": "..." }
{ "id": "req-1", "kind": "exit",   "code": 0 }
```

지원 명령:
- `ping` — 헬스체크
- `detect-agents` — 에이전트 감지
- `run-agent` — 에이전트 실행 (cmux RPC > 터미널)
- `read-file` / `write-file` — Direct 모드용
- `list-files` — 작업 폴더 트리
- `open-terminal` — cwd로 터미널만 열기

---

## 6. 보안 모델

| 위협 | 대응 |
|---|---|
| 임의 익스텐션이 브릿지 호출 | `allowed_origins`에 우리 익스텐션 ID만 등록 |
| 임의 폴더 쓰기 | `write-file`은 등록된 Workspace.rootPath 하위만 허용 |
| 명령 인젝션 | Bridge는 prompt를 인자로 전달, shell 구성 시 escape 필수 |
| LLM 키 유출 | `chrome.storage.local`에 저장, content script 접근 차단 |
| Bridge 권한 상승 | 사용자 권한으로만 실행, sudo 금지 |

---

## 7. 저장소 구조

```
torya/
├── docs/
│   ├── PRD.md
│   ├── SPEC.md
│   ├── EXTENSION.md
│   └── BRIDGE.md
├── extension/                    # Chrome Extension
│   ├── manifest.json
│   ├── src/
│   │   ├── background/           # service worker
│   │   ├── content/              # injected scripts
│   │   ├── sidepanel/            # main UI (React)
│   │   ├── options/              # settings page
│   │   ├── popup/                # toolbar popup
│   │   ├── lib/                  # shared (storage, native, types)
│   │   └── types.ts
│   ├── public/icons/
│   ├── package.json
│   └── vite.config.ts
├── bridge/                       # Native Messaging Host
│   ├── cmd/torya-bridge/main.go
│   ├── internal/
│   │   ├── nm/                   # native messaging framing
│   │   ├── agents/               # detect & run
│   │   ├── terminal/             # cmux + per-OS spawn
│   │   ├── fs/                   # safe read/write
│   │   └── rpc/                  # cmux client
│   ├── go.mod
│   └── Makefile
├── installer/
│   ├── install.sh                # macOS / Linux
│   ├── install.ps1               # Windows
│   └── manifests/                # NM manifest templates per OS
├── .github/workflows/
│   └── release.yml               # cross-compile + GitHub Releases
└── README.md
```

---

## 8. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| Extension build | **Vite + CRXJS** | MV3 HMR 지원, 빠른 빌드 |
| Extension UI | **React + Tailwind + shadcn/ui** | 사이드패널 빠른 조립 |
| Extension state | **zustand** | 가볍고 service worker 친화 |
| Bridge | **Go 1.22** | cgo 없는 단일 바이너리, 크로스 컴파일 쉬움 |
| Bridge tests | **testify** | 표준 |
| LLM SDK (Direct) | **@anthropic-ai/sdk** | Claude API 우선 |
| 패키지 매니저 | **pnpm** | 모노레포 워크스페이스 |

---

## 9. 빌드 / 릴리즈

### 9.1 로컬 개발

```bash
# Bridge
cd bridge && make dev          # go run + watch

# Extension
cd extension && pnpm dev       # Vite + CRXJS dev server
# Chrome: chrome://extensions → "Load unpacked" → extension/dist
```

### 9.2 릴리즈

GitHub Actions로 태그 push 시:
1. Bridge: `darwin/amd64`, `darwin/arm64`, `linux/amd64`, `linux/arm64`, `windows/amd64` 크로스 컴파일
2. 각 바이너리 + `install.sh` / `install.ps1`을 `dist/` 디렉토리로 묶기
3. GitHub Release에 첨부 + `install.sh`의 raw URL 고정
4. 사용자: `curl -fsSL https://raw.githubusercontent.com/su-record/torya/main/installer/install.sh | sh`

### 9.3 익스텐션 배포

- 1순위: Chrome 웹스토어 (unpublished/listed 링크)
- 폴백: GitHub Releases에 `.crx` + 수동 로드 가이드

---

## 10. MVP 작업 분할

타임라인 9시간 가정:

| Phase | 시간 | 결과물 | 담당 영역 |
|---|---|---|---|
| **0. Bootstrap** | 0:30 | 모노레포 + Vite + Go 골격 + manifest | 공통 |
| **1. Bridge 골격** | 1:00 | NM 프레이밍 + ping + detect-agents | Bridge |
| **2. Installer (macOS)** | 0:30 | install.sh + NM manifest 등록 | Bridge |
| **3. Extension 골격** | 1:00 | sidepanel/options/popup 라우팅 + 스토리지 | Extension |
| **4. 콘솔 캡처** | 0:45 | content.js error/unhandledrejection → 카드 | Extension |
| **5. NM 통합** | 0:45 | background ↔ bridge 핑퐁 + 에이전트 표시 | 양쪽 |
| **6. run-agent** | 1:00 | cmux RPC + Terminal 폴백, Agent 모드 종단 | Bridge |
| **7. 워크스페이스 매핑** | 0:30 | 옵션 페이지에서 origin → path 등록 | Extension |
| **8. 네트워크 캡처** | 0:30 | webRequest로 4xx/5xx 카드 | Extension |
| **9. 온보딩** | 0:45 | 4단계 위저드 | Extension |
| **10. Direct 모드** | 0:45 | API 호출 + diff 미리보기 + write-file | 양쪽 |
| **11. 폴리시 / 데모** | 0:30 | 슬라이드, 데모 영상, Linux 빌드 | 공통 |
| **버퍼** | 0:30 | 디버깅 | — |

**합계**: 9시간 0분.

---

## 11. 테스트 전략

| 레벨 | 도구 | 범위 |
|---|---|---|
| Bridge 유닛 | go test | NM 프레이밍, agent 감지, 안전 경로 |
| Extension 유닛 | vitest | 에러 파서, 룰 매칭, 매핑 로직 |
| 통합 | Playwright | 콘솔 에러 → 사이드패널 카드 표시 |
| E2E (수동) | 데모 시나리오 | 시그니처 흐름 30초 이내 |

해커톤 시간 제약상 **유닛은 핵심 로직만 + 수동 E2E 1회**로 한정.

---

## 12. 마이그레이션 / 호환성

해커톤 1.0이므로 마이그레이션 없음. 다만:

- NM 프로토콜은 v1로 명시 (`{"v": 1, ...}`) — 추후 호환성용
- Workspace 스키마에 `schemaVersion: 1`

---

**Document End** · 2026-04-26
