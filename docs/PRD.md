# Torya — Product Requirements Document (PRD)

> **Repo**: https://github.com/su-record/torya
> **One-liner**: 브라우저에서 본 에러를, 보고 있는 그 자리에서 코딩 에이전트가 고친다.
> **트랙**: 🛠 Developer Tooling (cmux × AIM Hackathon)

---

## 1. 문제 정의

로컬 개발 중 브라우저에서 에러를 발견했을 때, 개발자는 다음 단계를 매번 반복한다:

1. DevTools 열어 콘솔/네트워크/DOM 에러 확인
2. 에러 메시지 복사
3. 터미널/IDE로 컨텍스트 전환
4. 코딩 에이전트(Claude / Codex / Gemini CLI)에 붙여넣고 프롬프트 작성
5. 작업 폴더 확인 후 실행
6. 결과 적용 후 다시 브라우저로 복귀 → 재현 → 반복

**페인 포인트**: 컨텍스트 스위칭 비용. 보고 있는 곳(브라우저)과 고치는 곳(터미널)이 분리되어 있다.

---

## 2. 솔루션

**Torya = Chrome Extension + Native Messaging Bridge.**

브라우저에서 에러를 자동 캡처 → 사이드패널에 카드로 노출 → 한 번의 클릭으로 작업 폴더에서 코딩 에이전트가 실행되어 소스코드를 수정한다.

```
[브라우저 탭]                [Extension]              [Bridge]                [터미널/cmux]
   콘솔 에러     ──capture──▶  Side Panel  ──NM─▶  Native Host  ──spawn──▶  claude -p "..."
   네트워크 4xx                "🐛 Fix this"                                    │
   DOM 깨짐                    [Run]                                            ▼
                                                                          소스코드 수정
```

NM = Chrome Native Messaging (stdin/stdout JSON, HTTP/포트 없음)

---

## 3. 핵심 사용자 시나리오

### 시나리오 A — 시그니처 데모 (Agent 모드)

1. 사용자가 `localhost:5173`에서 프론트 개발 중
2. 브라우저 콘솔에 `Uncaught ReferenceError: useRouter is not defined` 발생
3. Torya 사이드패널에 즉시 **DevErrorCard** 표시
   - 에러 메시지 / 스택 / 발생 파일 / 작업 폴더 매핑 결과
4. 카드의 [🌉 Fix with Claude] 클릭
5. 브릿지가 cmux의 `torya` 워크스페이스에 명령 입력:
   ```
   cd /Users/su/workspace/myapp && claude -p "Fix: Uncaught ReferenceError: useRouter is not defined at src/pages/Home.tsx:12"
   ```
6. cmux 패널에서 Claude가 진행 → 파일 수정 → HMR 반영 → 에러 사라짐

### 시나리오 B — Direct 모드 (LLM 키 등록 시)

1. 사용자가 옵션 페이지에서 Claude API 키 등록
2. 작은 단발성 에러는 터미널 안 띄우고 익스텐션이 직접 API 호출
3. 브릿지가 패치만 파일에 적용 (조용한 모드)
4. 사이드패널에 diff 미리보기 → [Apply] / [Revert]

### 시나리오 C — 네트워크 에러

1. `POST /api/users → 500`
2. 사이드패널에 요청/응답/페이로드 표시
3. [Fix server] → 작업 폴더의 백엔드 서버 코드를 에이전트가 분석/수정

### 시나리오 D — 첫 설치 (온보딩)

1. 크롬 웹스토어에서 설치
2. 사이드패널 자동 오픈 → 4단계 위저드:
   - **Step 1**: 브릿지 설치 (`curl ... | sh` 한 줄 복사 / 또는 OS별 인스톨러 다운로드)
   - **Step 2**: 작업 폴더 매핑 (origin → 로컬 경로)
   - **Step 3**: 에이전트 자동 감지 결과 확인 (claude / codex / gemini / cmux)
   - **Step 4**: (선택) LLM API 키 등록 → Direct 모드 활성화

---

## 4. 두 가지 실행 모드

| 모드 | 동작 | 장점 | 단점 | 우선순위 |
|---|---|---|---|---|
| **Agent 모드** | 브릿지가 터미널 열어 `claude -p "..."` 실행 | 사용자가 작업 과정 시청, cmux 메타 점수, 투명성 | 터미널 화면 점유 | **MVP 메인** |
| **Direct 모드** | 익스텐션이 LLM API 직접 호출 → 브릿지가 파일에 패치 적용 | 빠름, 조용함, 단발성 작업 적합 | 작업 과정 비가시, API 비용 사용자 부담 | MVP 포함 (간단 케이스) |

**모드 선택 로직**:
- 기본값: Agent 모드
- 옵션에서 "단발성 에러 ≤ 3줄 변경 추정 시 Direct" 토글 가능
- LLM 키 미등록 시 Direct 메뉴 비활성

---

## 5. 지원 코딩 에이전트

설치 즉시 자동 감지(`PATH` + 휴리스틱):

| 에이전트 | 명령 예시 | 비고 |
|---|---|---|
| **claude** | `claude -p "<bug>"` | Anthropic 공식 CLI |
| **codex** | `codex exec "<bug>"` | OpenAI Codex CLI |
| **gemini** | `gemini -p "<bug>"` | Google Gemini CLI |
| **cmux** | RPC로 워크스페이스에 입력 | **터미널 1순위** |

브릿지 스폰 우선순위: **cmux RPC > 사용자 지정 기본 에이전트 > 자동 감지 결과 중 첫 번째**.

---

## 6. 지원 OS

크로스 플랫폼:
- **macOS**: Terminal / iTerm / cmux
- **Linux**: gnome-terminal / konsole / xterm / cmux
- **Windows**: Windows Terminal (`wt.exe`) / PowerShell / cmd / cmux

브릿지 바이너리는 OS별로 빌드 후 단일 인스톨러 스크립트가 분기.

---

## 7. 차별화 포인트

| 경쟁 | 한계 | Torya |
|---|---|---|
| DevTools만 사용 | 복붙·컨텍스트 스위칭 | 자동 캡처 + 원클릭 |
| Cursor / Copilot | 에디터 안에서만 동작, 브라우저 에러 미감지 | 브라우저 ↔ 터미널 양방향 다리 |
| AI 브라우저 (Aside 등) | 새 브라우저 강요 | 기존 Chrome 그대로 + 익스텐션 |
| 터미널 전용 에이전트 | 브라우저 컨텍스트 없음 | 콘솔/네트워크/DOM 실시간 컨텍스트 |

핵심: **"보는 곳"과 "고치는 곳"을 한 흐름으로 연결한 유일한 도구.**

---

## 8. MVP 범위 (해커톤 9시간)

### 필수 (P0)
- [ ] Manifest v3 익스텐션 골격 (background / sidepanel / options / content)
- [ ] 콘솔 `error`/`unhandledrejection` 캡처 → 사이드패널 카드
- [ ] 네트워크 4xx/5xx 캡처 (`chrome.webRequest`)
- [ ] Native Messaging 양방향 통신
- [ ] 브릿지: macOS 빌드 + `install.sh`
- [ ] 작업 폴더 매핑 (origin ↔ 절대경로)
- [ ] 에이전트 감지 (`which claude/codex/gemini`)
- [ ] cmux RPC 호출 1순위 + 폴백으로 macOS Terminal 띄우기
- [ ] Agent 모드 종단 흐름 1개 ("Fix with Claude")

### 데모 폴리시 (P1)
- [ ] 온보딩 위저드 (4단계)
- [ ] DOM 에러 감지 (404 이미지 / hydration warning 등)
- [ ] Direct 모드 (Claude API 호출 → 패치 → 사이드패널 diff)
- [ ] Linux 빌드

### 데모 후 (P2)
- [ ] Windows 빌드
- [ ] 멀티 워크스페이스
- [ ] 에러 룰 커스터마이징
- [ ] PR 생성 통합

---

## 9. 성공 지표

| 항목 | 기준 |
|---|---|
| **시그니처 시연 성공** | 데모 영상에서 콘솔 에러 → cmux 실행까지 30초 이내 |
| **설치 마찰** | `install.sh` 한 줄 + 익스텐션 클릭 한 번, 5분 안에 동작 |
| **첫 가치 체감** | LLM 키 없이도 에이전트 모드로 즉시 동작 |
| **차별화 한 줄** | "브라우저 + 터미널 한몸" 청중 기억률 |

---

## 10. 비범위 (Non-goals)

- 브라우저 자동화 / E2E 테스트 러너 대체
- 프로덕션 에러 모니터링 (Sentry 대체 아님)
- 코드 리뷰 / PR 자동 생성 (P2)
- 채팅 / 번역 / 회의 같은 일반 LLM 기능

---

## 11. 의존성 / 리스크

| 리스크 | 완화 |
|---|---|
| cmux RPC 미동작 | OS 터미널 폴백 항상 준비, 데모 전 cmux 워크스페이스 사전 검증 |
| Native Messaging 매니페스트 경로 OS 차이 | 인스톨러가 분기 처리 + 자동 검증 단계 |
| Chrome 웹스토어 심사 지연 | unpublished/listed 링크 또는 GitHub Releases `.crx` 폴백 |
| 에이전트 미설치 사용자 | Direct 모드 폴백 + 온보딩에서 설치 가이드 링크 |

---

**Document End** · 2026-04-26
