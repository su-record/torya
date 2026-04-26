# Torya — Bridge Specification

> **Repo**: https://github.com/su-record/torya
> **상위 문서**: [SPEC.md](./SPEC.md), [PRD.md](./PRD.md)
> **연관 문서**: [EXTENSION.md](./EXTENSION.md)

---

## 1. 개요

`torya-bridge` — Chrome Native Messaging Host 사양에 따른 단일 바이너리. 익스텐션이 `chrome.runtime.connectNative('com.torya.bridge')` 호출 시 OS가 spawn하여 stdin/stdout JSON으로 통신한다.

**책임**:
1. 코딩 에이전트 자동 감지 (`claude`, `codex`, `gemini`, `cmux`)
2. 에이전트 실행 (cmux RPC > OS 터미널 spawn)
3. 작업 폴더 화이트리스트 내 파일 read/write (Direct 모드)
4. 폴더 선택 다이얼로그 (온보딩)
5. 자기 헬스 정보 (`ping`, version)

**비책임**:
- LLM API 직접 호출 X (Direct 모드의 LLM 호출은 익스텐션 background에서)
- 백그라운드 데몬 X (Chrome이 spawn할 때만 살아있음)

---

## 2. Native Messaging 기본

### 2.1 통신 형식

- 프레이밍: `[uint32 LE length][JSON bytes]`
- 인코딩: UTF-8
- 단일 메시지 최대 1MB (Chrome 제약)
- 양방향: stdin (Chrome → Bridge), stdout (Bridge → Chrome)
- stderr는 로그 파일로 (Chrome이 무시)

### 2.2 매니페스트

`com.torya.bridge.json`:

```json
{
  "name": "com.torya.bridge",
  "description": "Torya Native Messaging Host",
  "path": "/usr/local/bin/torya-bridge",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<EXTENSION_ID>/"
  ]
}
```

배치 경로(OS별):

| OS | 경로 |
|---|---|
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.torya.bridge.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/com.torya.bridge.json` |
| Windows | 레지스트리 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.torya.bridge` → 매니페스트 파일 경로 |

(Brave / Edge / Chromium 별도 경로 추가 지원은 P2)

`<EXTENSION_ID>`는 인스톨러가 환경변수 또는 인자로 받아 치환.

---

## 3. 메시지 프로토콜

### 3.1 공통

```typescript
interface Request {
  v: 1;
  id: string;          // uuid
  cmd: string;
  args?: unknown;
}

interface Response {
  v: 1;
  id: string;          // request id 동일
  kind: 'ok' | 'err' | 'stdout' | 'stderr' | 'progress' | 'exit';
  data?: unknown;
  error?: { code: string; message: string };
}
```

`kind: 'ok'` 또는 `'err'`이면 단발성 응답. `'stdout' | 'stderr' | 'progress'`는 스트리밍 → 마지막에 `'exit'`.

---

### 3.2 명령 카탈로그

#### `ping`
```jsonc
// req
{ "v": 1, "id": "1", "cmd": "ping" }
// res
{ "v": 1, "id": "1", "kind": "ok",
  "data": { "version": "0.1.0", "os": "darwin", "arch": "arm64" } }
```

#### `detect-agents`
```jsonc
// req
{ "v": 1, "id": "2", "cmd": "detect-agents" }
// res
{ "v": 1, "id": "2", "kind": "ok",
  "data": [
    { "name": "claude", "available": true,  "path": "/usr/local/bin/claude", "version": "0.5.2" },
    { "name": "codex",  "available": true,  "path": "/opt/homebrew/bin/codex" },
    { "name": "gemini", "available": false },
    { "name": "cmux",   "available": true,  "rpc": "ws://127.0.0.1:7878" }
  ] }
```

탐지 로직:
- `claude` / `codex` / `gemini`: `exec.LookPath` + 알려진 설치 경로 휴리스틱 (`~/.local/bin`, `/opt/homebrew/bin`, `~/.bun/bin`, `~/.nvm/versions/.../bin`)
- 가능하면 `--version`으로 버전 확인 (타임아웃 2초)
- `cmux`: 알려진 포트 핑 또는 `cmux --rpc-info`

#### `run-agent` (스트리밍)

```jsonc
// req
{ "v": 1, "id": "3", "cmd": "run-agent",
  "args": {
    "agent": "claude",
    "prompt": "Fix: ReferenceError: useRouter at src/pages/Home.tsx:12",
    "cwd": "/Users/su/workspace/myapp",
    "terminal": "cmux"     // "cmux" | "system" | "auto"
  } }

// res (stream)
{ "v":1, "id":"3", "kind":"progress", "data": { "stage": "spawn", "via": "cmux" } }
{ "v":1, "id":"3", "kind":"stdout",   "data": "Reading src/pages/Home.tsx...\n" }
{ "v":1, "id":"3", "kind":"stdout",   "data": "Applying patch...\n" }
{ "v":1, "id":"3", "kind":"exit",     "data": { "code": 0, "durationMs": 12450 } }
```

실행 우선순위 결정:
1. `terminal: "cmux"` 또는 `"auto"` + cmux RPC 가용 → cmux 워크스페이스에 명령 입력 (RPC)
2. 그 외 → OS 터미널 spawn (§4)

브릿지는 사용자가 등록한 워크스페이스 화이트리스트에 `cwd`가 포함되는지 검증 후 거부 가능.

#### `read-file`
```jsonc
// req
{ "v":1, "id":"4", "cmd":"read-file",
  "args": { "path": "/Users/su/workspace/myapp/src/pages/Home.tsx", "maxBytes": 524288 } }
// res
{ "v":1, "id":"4", "kind":"ok",
  "data": { "content": "...", "encoding": "utf-8", "size": 1234 } }
```

`path`는 등록된 Workspace.rootPath의 하위여야 함.

#### `write-file`
```jsonc
// req
{ "v":1, "id":"5", "cmd":"write-file",
  "args": {
    "path": "/Users/su/workspace/myapp/src/pages/Home.tsx",
    "content": "...",
    "createDirs": false,
    "expectSha256": "abc..."   // 옵션: 동시수정 보호
  } }
// res
{ "v":1, "id":"5", "kind":"ok", "data": { "bytesWritten": 1234 } }
```

#### `list-files`
```jsonc
// req
{ "v":1, "id":"6", "cmd":"list-files",
  "args": { "root": "/Users/su/workspace/myapp", "depth": 3,
            "ignore": ["node_modules",".git",".next","dist"] } }
// res
{ "v":1, "id":"6", "kind":"ok", "data": { "tree": [...] } }
```

#### `pick-folder`
```jsonc
// req
{ "v":1, "id":"7", "cmd":"pick-folder", "args": { "title": "Select project folder" } }
// res
{ "v":1, "id":"7", "kind":"ok", "data": { "path": "/Users/su/workspace/myapp" } }
```

OS별 구현:
- macOS: `osascript -e 'POSIX path of (choose folder ...)'`
- Linux: `zenity --file-selection --directory` (대안: `kdialog`)
- Windows: PowerShell `[System.Windows.Forms.FolderBrowserDialog]`

#### `open-terminal`
```jsonc
// req
{ "v":1, "id":"8", "cmd":"open-terminal",
  "args": { "cwd": "/Users/su/workspace/myapp", "terminal": "auto" } }
// res
{ "v":1, "id":"8", "kind":"ok", "data": { "via": "iterm" } }
```

---

## 4. 터미널 호출 전략

### 4.1 우선순위

1. **cmux RPC** (가능하면)
2. **사용자 지정 시스템 터미널** (옵션 페이지에서 변경 가능)
3. **OS 디폴트 자동 감지**

### 4.2 cmux RPC

cmux는 로컬 RPC 인터페이스를 제공. 브릿지가 클라이언트로 동작:

```go
// pseudo
client := cmux.Connect("ws://127.0.0.1:7878")
ws := client.GetOrCreateWorkspace("torya", cwd)
client.SendCommand(ws.ID, fmt.Sprintf("claude -p %q", prompt))
streamLogs(ws.ID, onStdout)
```

(실제 cmux RPC 스펙은 cmux 문서 확인 후 어댑터 구현. MVP에서는 워크스페이스에 명령 입력 + 로그 스트림 두 개만 필요.)

### 4.3 OS 터미널 spawn

| OS | 방식 |
|---|---|
| macOS Terminal | `osascript -e 'tell app "Terminal" to do script "cd \"...\" && claude -p \"...\""'` |
| macOS iTerm2 | iTerm AppleScript API |
| Linux | `gnome-terminal -- bash -c "cd ...; claude -p '...'; exec bash"` (또는 `konsole -e`, `xterm -e`) |
| Windows | `wt.exe -d "<cwd>" cmd /K "claude -p \"...\""` (폴백: `cmd /K`) |

명령 인자는 OS별 escape 함수로 안전하게 직렬화. **shell 문자열을 직접 조립하지 말고**, 가능한 한 `exec.Command` 인자 배열 사용.

### 4.4 폴백 체인

```
cmux RPC 시도
  ├─ 성공 → 끝
  └─ 실패 (RPC 미응답 / 워크스페이스 생성 실패)
       └─ user-configured terminal
            ├─ 성공 → 끝
            └─ 실패
                 └─ auto-detect (per-OS list)
                      ├─ 성공 → 끝
                      └─ 모두 실패 → kind:'err' 응답
```

---

## 5. 보안 모델

### 5.1 신뢰 경계

| 호출자 | 신뢰 |
|---|---|
| 매니페스트 `allowed_origins`의 익스텐션 | 신뢰 (Chrome이 검증) |
| 그 외 | spawn 자체가 안 일어남 |

### 5.2 파일 시스템 접근

- 모든 `read-file`/`write-file`/`list-files`/`run-agent`의 `cwd`는 등록된 Workspace.rootPath의 **하위**여야 한다 (path traversal 방지: `filepath.Clean` 후 prefix 검사 + `..` 차단).
- 브릿지는 자체적으로 워크스페이스 목록을 알지 못한다 → **요청마다 익스텐션이 함께 보내거나**, 첫 연결 시 `set-workspaces`로 동기화.

```jsonc
// 첫 연결 직후 익스텐션이 호출
{ "v":1, "id":"sync-1", "cmd":"set-workspaces",
  "args": { "workspaces": [
    { "id":"w1", "rootPath":"/Users/su/workspace/myapp" }
  ] } }
```

브릿지는 요청별 `cwd`/`path`가 동기화된 rootPath 중 하나의 하위인지 검증.

### 5.3 명령 인젝션 방지

- 절대 `bash -c "claude -p $PROMPT"` 같은 문자열 결합 X
- `exec.Command("claude", "-p", prompt)` 형태로 인자 배열 사용
- 터미널 spawn 시 osascript/wt에 전달할 때만 escape 적용

### 5.4 권한

- 사용자 권한으로만 동작, sudo 절대 사용 X
- 매니페스트 등록은 인스톨러가 사용자 홈 디렉토리에만 (전역 위치 X)

---

## 6. 구현 (Go)

### 6.1 디렉토리

```
bridge/
├── cmd/torya-bridge/main.go
├── internal/
│   ├── nm/
│   │   ├── frame.go      # uint32 LE 프레이밍
│   │   ├── reader.go
│   │   └── writer.go
│   ├── proto/
│   │   └── messages.go   # Request/Response 구조체
│   ├── handler/
│   │   ├── ping.go
│   │   ├── detect.go
│   │   ├── run.go
│   │   ├── files.go
│   │   └── pickfolder.go
│   ├── agents/
│   │   ├── detect.go
│   │   └── known_paths.go
│   ├── terminal/
│   │   ├── cmux.go       # RPC client
│   │   ├── darwin.go
│   │   ├── linux.go
│   │   └── windows.go
│   ├── safefs/
│   │   └── safefs.go     # workspace 검증 + 경로 정규화
│   └── log/
│       └── log.go        # 파일로만 기록
├── go.mod
└── Makefile
```

### 6.2 main 흐름

```go
func main() {
    log.SetupFile()
    in  := nm.NewReader(os.Stdin)
    out := nm.NewWriter(os.Stdout)
    h   := handler.New(out)

    for {
        req, err := in.Read()
        if err == io.EOF { return }
        if err != nil { log.Errorf("read: %v", err); return }
        go h.Dispatch(req)   // 동시 처리 + 응답마다 lock으로 직렬화 write
    }
}
```

### 6.3 응답 직렬화

stdout은 단일 라이터이므로 mutex로 직렬화. 스트리밍 명령은 chunk마다 mutex 획득.

---

## 7. 인스톨러

### 7.1 macOS / Linux — `installer/install.sh`

흐름:
1. OS / 아키텍처 감지 (`uname -s`, `uname -m`)
2. 최신 Release에서 `torya-bridge-<os>-<arch>` 다운로드 → 검증 (SHA256)
3. `~/.local/bin/torya-bridge`로 배치 (또는 `/usr/local/bin`은 sudo 필요해서 회피)
4. NM 매니페스트 생성:
   - `<EXTENSION_ID>`를 환경변수 `TORYA_EXTENSION_ID` 또는 알려진 웹스토어 ID 기본값으로 치환
   - `path`를 절대경로로 작성
5. 매니페스트를 OS별 NativeMessagingHosts 디렉토리에 배치
6. 검증: `torya-bridge ping` (CLI 진입점에서 한 번만 사용)

스켈레톤:
```bash
#!/usr/bin/env sh
set -eu
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH=amd64; [ "$ARCH" = "arm64" ] && ARCH=arm64
EXT_ID="${TORYA_EXTENSION_ID:-<webstore-id>}"
BIN="$HOME/.local/bin/torya-bridge"
mkdir -p "$(dirname "$BIN")"
URL="https://github.com/su-record/torya/releases/latest/download/torya-bridge-${OS}-${ARCH}"
curl -fsSL "$URL" -o "$BIN"; chmod +x "$BIN"
case "$OS" in
  darwin) MDIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
  linux)  MDIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
esac
mkdir -p "$MDIR"
cat > "$MDIR/com.torya.bridge.json" <<EOF
{ "name":"com.torya.bridge","description":"Torya Bridge","path":"$BIN",
  "type":"stdio","allowed_origins":["chrome-extension://$EXT_ID/"] }
EOF
echo "✅ Bridge installed at $BIN"
```

### 7.2 Windows — `installer/install.ps1`

```powershell
$ErrorActionPreference = "Stop"
$ExtId = $env:TORYA_EXTENSION_ID
$Bin   = "$env:LOCALAPPDATA\Torya\torya-bridge.exe"
New-Item -ItemType Directory -Force -Path (Split-Path $Bin) | Out-Null
Invoke-WebRequest "https://github.com/su-record/torya/releases/latest/download/torya-bridge-windows-amd64.exe" -OutFile $Bin
$Manifest = "$env:LOCALAPPDATA\Torya\com.torya.bridge.json"
@"
{ "name":"com.torya.bridge","description":"Torya Bridge","path":"$($Bin -replace '\\','\\\\')",
  "type":"stdio","allowed_origins":["chrome-extension://$ExtId/"] }
"@ | Set-Content $Manifest
New-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.torya.bridge" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.torya.bridge" -Name "(default)" -Value $Manifest
Write-Host "Bridge installed."
```

### 7.3 설치 검증

익스텐션이 2초 주기로 `connectNative` 시도 → 성공 시 온보딩 Step 1 자동 통과.

### 7.4 업데이트

브릿지 자체에 `--upgrade` 플래그: 최신 Release 다운로드 후 자기 자신 교체. P1.

---

## 8. 로깅

- 위치: macOS/Linux `~/.cache/torya/bridge.log`, Windows `%LOCALAPPDATA%\Torya\bridge.log`
- 레벨: info / error 만
- 회전: 5MB × 3개

stdout은 NM 채널이므로 절대 로그 출력 X. `fmt.Println` 금지, 전용 `log.Info` 함수만.

---

## 9. 테스트

### 9.1 유닛
- `nm.frame` round-trip
- `safefs` path traversal 케이스
- agent 감지 휴리스틱

### 9.2 통합
- mock Chrome으로 stdin/stdout 시뮬레이션
- `ping` / `detect-agents` / `run-agent (echo)` 종단

### 9.3 수동
- macOS Terminal/iTerm/cmux 각각 spawn 검증
- Linux gnome-terminal 검증 (해커톤 기준 1개 OS만 충분)

---

## 10. 빌드 / 릴리즈

### 10.1 Makefile

```makefile
BIN := torya-bridge
PLATFORMS := darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64

build:
	go build -o dist/$(BIN) ./cmd/torya-bridge

release:
	@for p in $(PLATFORMS); do \
	  os=$${p%/*}; arch=$${p#*/}; \
	  ext=$$( [ $$os = windows ] && echo .exe ); \
	  GOOS=$$os GOARCH=$$arch go build -ldflags="-s -w" -o dist/$(BIN)-$$os-$$arch$$ext ./cmd/torya-bridge; \
	done

dev:
	go run ./cmd/torya-bridge
```

### 10.2 GitHub Actions

`release.yml` — 태그 `v*` push 시:
1. Go matrix 빌드
2. SHA256 생성
3. `softprops/action-gh-release`로 업로드
4. `installer/install.sh`, `installer/install.ps1`도 함께 업로드

---

## 11. 미해결

- [ ] cmux RPC 정확한 메시지 스펙 (cmux 리포 확인 필요 — 데모 머신 셋업 시점에 검증)
- [ ] Brave / Edge 매니페스트 경로 (P2)
- [ ] 자동 업데이트 (P1)
- [ ] 익스텐션 ID 핀: 웹스토어 배포 ID와 unpacked ID 둘 다 허용

---

**Document End** · 2026-04-26
