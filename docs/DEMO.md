# Torya — 3-minute demo script

> **트랙**: Developer Tooling
> **포맷**: 3분 발표 + 2분 채점
> **심사 어필 포인트**: cmux 깊은 통합 (Austin Wang 표) · 차별화 메타 스토리 · 데모 임팩트

---

## 화면 사전 분할 (시작 전)

3개 창을 미리 띄워두고 단축키로 토글:

```
┌─────────────────┬──────────────────┐
│                 │                  │
│  Chrome         │  cmux            │
│  - localhost:5173│  - torya         │
│  - 사이드패널    │    workspace     │
│                 │                  │
└─────────────────┴──────────────────┘
```

상단 메뉴바에 토리 아이콘 보이게 노출. 사이드패널 헤더의 `🐶 Torya` 타이틀이
청중 한 줄에 들어옴.

---

## 0:00 – 0:25 · 오프닝 (페인 + 후크)

> 슬라이드 1장 또는 직접 멘트만.

**대사**:

> "프론트 개발하다 브라우저 콘솔에 에러 뜨면, 다들 똑같이 합니다.
> 메시지 복사 → 터미널 전환 → 에이전트 띄움 → 폴더 확인 → 붙여넣기.
> 그 5단계를 — **'토리야 가져와'** 한마디로 줄였습니다."

(이 시점에 사이드패널의 토리 아이콘 잠깐 클로즈업)

> "Torya는 크롬 익스텐션 + Native Messaging 브릿지입니다.
> 보고 있는 곳, 고치는 곳, 한 흐름."

---

## 0:25 – 1:50 · 시그니처 시연 (Auto-fix in cmux)

### 사전 셋업
- `examples/buggy-app` 또는 임의 vite 프로젝트가 `localhost:5173`에서 실행 중
- 워크스페이스 매핑은 미리 등록 (시연 전 옵션에서 처리)
- cmux는 `torya` 워크스페이스가 매핑된 폴더로 열려있음
- 사이드패널 열려있음, 에러 로그 비어있음

### 흐름

**(1) 0:25 — 사이드패널 정체성 클로즈업** (5초)

> "사이드패널이 켜져 있을 때나 닫혀 있을 때나, 백그라운드에서 항상 듣고 있어요."

**(2) 0:30 — localhost:5173 클릭, 에러 발생** (10초)

브라우저에서 의도된 버튼 클릭 → 콘솔에 `Uncaught ReferenceError: useRouter is not defined at Home.tsx:12`

**(3) 0:40 — 사이드패널에 라이브 로그 즉시 등장** (5초)

```
12:34:01  🔴 ReferenceError: useRouter is not defined
          src/pages/Home.tsx:12
```

> "1초 안에 캡처."

**(4) 0:45 — cmux 창 자동으로 활성화 + claude 명령 입력 시작** (15초)

```
$ cd /Users/su/workspace/myapp
$ claude -p "Fix this browser error from local development:
Uncaught ReferenceError: useRouter is not defined at src/pages/Home.tsx:12 ..."
```

> "Native Messaging으로 cmux에 직접 명령이 들어옵니다.
> HTTP 포트 없음, 토큰 없음, Chrome 표준 stdio 채널."

**(5) 1:00 — Claude가 파일 수정** (40초)

Claude가 `src/pages/Home.tsx`를 읽고 `useRouter` import 추가하는 동안 화면 보여줌.
완료되면 vite HMR로 페이지 자동 리로드, 에러 사라짐.

> "파일은 우리가 등록한 워크스페이스 안에서만 읽고 씁니다.
> path traversal 방지 가드 들어있어요."

**(6) 1:40 — 사이드패널 로그가 ✅ fixed로 업데이트** (10초)

```
12:34:01  ✅ ReferenceError: useRouter is not defined
12:34:48  · fixed (47s)
```

> "한 번의 클릭도 없었습니다."

---

## 1:50 – 2:25 · 차별화 한 컷

> 슬라이드 1장.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   "Browser sees, terminal fixes."                    │
│                                                      │
│   ┌──────────┐   Native      ┌──────────┐            │
│   │ Chrome   │  Messaging    │ cmux /   │            │
│   │ extension│ ◀───stdio───▶ │ terminal │            │
│   │  🐶      │  (no ports,   │   ▶_     │            │
│   └──────────┘   no tokens)  └──────────┘            │
│         │                          │                 │
│         ▼                          ▼                  │
│   capture errors          claude / codex / gemini    │
│                                                      │
│   • cmux-first spawn, OS terminal fallback           │
│   • Workspace-scoped file ops (path traversal safe)  │
│   • Auto-fix dedup (no render-loop spam)             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**대사**:

> "다른 코딩 에이전트는 에디터 안에서만 살고, 브라우저 컨텍스트를 못 봐요.
> AI 브라우저는 새 브라우저를 강요하죠.
> Torya는 기존 Chrome + cmux + 기존 CLI 에이전트를 그대로 둔 채
> '본 것'과 '고치는 곳'을 잇는 다리입니다."

---

## 2:25 – 2:50 · 설치 임팩트

> 터미널 1줄 + 새 탭 1개.

**대사**:

> "설치는 두 줄."

```bash
$ curl -fsSL .../installer/install.sh | sh
$ # Chrome 익스텐션 한 번 클릭
```

> "GitHub에 공개되어 있고, Bridge는 Go 단일 바이너리, 익스텐션은 MV3입니다."

화면에 `https://github.com/su-record/torya` 주소 띄움.

---

## 2:50 – 3:00 · 클로저

**대사**:

> "당신이 보는 곳, cmux가 실행하는 곳, 한 흐름.
> **토리야**, 가져와. 끝."

(토리 아이콘 풀 화면)

---

## 백업 / Q&A 대비

| 예상 질문 | 한 줄 답변 |
|---|---|
| LLM 키 안 등록해도 동작? | "네. 사용자 컴퓨터의 claude/codex/gemini CLI를 직접 호출합니다. 키는 그 CLI가 알아서." |
| Direct 모드는 뭐죠? | "API 키 등록 시 터미널 안 띄우고 패치만 적용. 시연은 Auto-fix 모드만 했습니다." |
| 보안? | "Native Messaging의 allowed_origins로 우리 익스텐션만 허용, 파일 쓰기는 등록된 워크스페이스 root 하위만." |
| Linux/Windows? | "Bridge는 cross-compile 끝, Linux gnome-terminal/konsole + Windows wt.exe 분기 구현. macOS만 시연했습니다." |
| 노이즈 너무 많으면? | "5초 dedup + 옵션에서 캡처 룰 토글. console.log는 안 잡고 실제 error/rejection만." |
| cmux 없이도? | "cmux RPC 미가용 시 OS 터미널로 자동 폴백." |

---

## 시연 직전 체크리스트

```
□ /Users/su/.local/bin/torya-bridge 존재 (TORYA_LOCAL_DEV=1로 설치됨)
□ NativeMessagingHosts/com.torya.bridge.json 존재 + 익스텐션 ID 일치
□ Chrome에 익스텐션 로드, 사이드패널에서 브릿지 v0.1.0 ✅ 표시
□ 워크스페이스 1개 등록 (origin: http://localhost:5173 → 데모 폴더)
□ 데모 폴더의 vite dev 서버 실행 중
□ cmux 켜져있고 워크스페이스 1개 있음 (선택, 없으면 osascript Terminal 폴백)
□ 의도된 에러 트리거 확인 (버튼 클릭 시 ReferenceError 발생)
□ 사이드패널 미리 켜둠
□ 화면 분할: 좌 Chrome, 우 cmux/Terminal
□ 발표 컴퓨터 알림 OFF (Slack/iMessage 등)
```

---

**Document End** · 2026-04-26
