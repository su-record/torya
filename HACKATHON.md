# 🏆 cmux × AIM Intelligence Hackathon — 참가 가이드 (한글 정리)

> 원본 문서: [CMUX x AIM Hackathon Guide](https://docs.google.com/document/d/1FY9_Vvd_B4Q3n-2MISBBUD0SvyMMrtjr5F3DKBvwPK8/)
>
> 본 문서는 참가 필수 정보만 추렸습니다. 심사위원 약력 등 부수 정보는 원본 참고.

---

## 📅 일정 (당일 10시간 해커톤)

| 시각 | 내용 |
|------|------|
| 08:00 | 입장 · 조식 |
| 08:30 | 오프닝 |
| 09:00 | **해킹 시작** |
| 13:00 | 점심 |
| **18:00** | **🚨 제출 마감** · 석식 · Round 1 심사 시작 |
| 19:25 | 결승 진출 6팀 발표 |
| 19:30 | 결승 발표 |
| 20:00 | 최종 수상자 발표 |

**총 해킹 시간: 9시간 (09:00–18:00).**

---

## 📍 장소

[모나코스페이스](https://maps.app.goo.gl/St3J8Xf4n5KWvzxbA) (서울)

**Wi-Fi**:
- `monacospace_main_5G` / `main1234`
- `Hack` / `1234567!`

---

## 🎯 트랙 (3개 — 1개만 선택해 제출)

### 🛠 Developer Tooling
**CLI-first 개발자 도구.** 터미널 워크플로우, 에이전트 오케스트레이션, 코드 생성, 디버깅.
> cmux의 본진 — Manaflow(cmux 제작사)가 후원하는 트랙.

### 💡 Business & Applications
**하루 만에 배포까지 마치는 AI 제품.**
> 가장 범용적인 트랙. 응용 제품 전부 해당.

### 🔴 AI Safety & Security
**AI 취약점 발견·노출·방어.** Red teaming CLI, 가드레일, 탈옥 탐지, 프롬프트 인젝션 스캐너, LLM 퍼징.
> AIM Intelligence 엔지니어들이 현장 멘토링·심사.

> ⚠️ **트랙별 세부 채점 기준은 가이드 문서에 명시되지 않음** — 트랙 설명 자체가 곧 기준.
> 심사위원은 트랙 설명에 부합하는 정도 + 완성도 + 데모 임팩트를 종합 판단.

---

## 💰 상금

| 상 | 금액 |
|---|---|
| 🥇 **Grand Prize** | **3,000,000원** |
| 🥇 Developer Tooling 1위 | 1,000,000원 |
| 🥇 Business & Applications 1위 | 1,000,000원 |
| 🥇 AI Safety & Security 1위 | 1,000,000원 |
| 🎓 Student Special | $5,000 Azure 크레딧 |

각 트랙 1위가 결승에 진출 → 그중 한 팀이 Grand Prize 추가 수상 (즉, Grand 우승 팀은 트랙상 + 그랜드 합산).

---

## 📤 제출 (마감 18:00 sharp)

**제출 폼**: <https://docs.google.com/forms/d/e/1FAIpQLSeOBwkyvS2aaVz4KwVhviHp30wue4ADqmT6SMUls10tsWwing/viewform>

### 제출 전 반드시 준비

- ✅ **배포된 데모 URL** ⚠️ **localhost는 무효!**
- ✅ **GitHub 리포 URL** (public)
- ✅ **팀원 전원 이름 + 이메일**
- ✅ 한 팀당 한 명만 제출 (중복 제출 시 실격)

### 누락 시 실격
- 모든 필드 작성 필수, 특히 데모 링크
- 늦은 제출은 받지 않을 수 있음

---

## 🎤 심사 형식

```
1단계 — 트랙 라운드 (비공개)
  ├─ 트랙별로 심사위원 앞에서 발표
  ├─ 발표 3분 + 채점 2분
  └─ 트랙별 1위·2위 → 결승 진출 (총 6팀)

2단계 — 결승 라운드 (공개)
  ├─ 6팀이 전체 청중 앞에서 발표
  └─ 시간 3분 / 팀

3단계 — 최종 시상
  └─ Grand Prize + 3개 트랙 1위
```

**핵심: 발표 3분 안에 끝내야 함.** torya PRD의 3분 시연 시나리오 그대로 활용 가능.

---

## 📜 규칙

1. **최대 4명 / 팀** (1인 참가 OK)
2. ⚠️ **개인 프로젝트 재활용 금지** — 해커톤 기간 동안 새로 만든 것만
3. **18:00 전에 제출**
4. 부정행위 = 즉시 실격
5. 행사 정신에 위배되면 운영진 재량으로 실격
6. 시상식에 참석해야 상금 수령
7. (이하 잘림 — 원본 확인 필요)

---

## 🎁 후원사 크레딧

| 도구 | 크레딧 | 코드 / 키 |
|---|---|---|
| Vercel v0 | $30 | `V0-MANAFLOW` (https://v0.app/) |
| Claude | $25 | [발급 링크](https://claude.com/offers?offer_code=5bd9a20b-2b47-47ba-9e64-b82db0cc01cf) |
| Gemini | API key 4개 | 가이드 원본 §Credits 참조 (현장 공유 키) |

---

## 🏢 후원사 (배경)

| 후원사 | 정체 |
|---|---|
| **Manaflow** (cmux 제작사) | 오픈소스 AI lab. cmux = 코딩 에이전트용 터미널 |
| **AIM Intelligence** | 엔터프라이즈 AI 보안. Stinger(red teaming), Starfort(가드레일). OpenAI/MS/Anthropic/대형 한국은행 고객. $7M Series A |
| **AI Nexus** | 5,000+ 빌더 글로벌 커뮤니티 + 6개 도시 해커톤 운영 |
| **AttentionX** | 서울 기반 AI 연구·창업 그룹. NeurIPS/ICML/ACL 발표, YC/a16z 백킹 스타트업 보유 |

---

## 👥 결승 심사위원 (Final Judges) ⭐

| 이름 | 직책 | 비고 |
|---|---|---|
| **Austin Wang** | Manaflow CEO ([cmux 창업자](https://austinywang.com)) | **cmux 친화 = 큰 가산점** |
| **Haon Park** | AIM Intelligence CEO | Safety & Security 트랙 본진 |
| **Sukone Hong** | AttentionX 공동대표 / Bluebrown VC GP | 투자자 시각 (사업성) |

**트랙 라운드 심사위원** (총 13명, 트랙별 분산 — 가이드 §Track Judges):

대표적으로:
- **Jun Kim** (Aside YC F25 CEO) — *AI 브라우저* 만드는 분 ⚠️ torya와 겹침
- Sejun Kim (E Corp CEO, MCP Player 10)
- Sangguen Chang (E Corp Co-Founder, 9+ 제품)
- Suho Park (AIM PM)
- Pia Park (보안/암호화 엔지니어, Rust)
- Kyungsoo Kim (KT Agentic AI Lab Designer, iF Award)
- Vadim Choi (Leviosa AI CTO)
- Seonmin Lee (defytheodd CEO, Polysona harness)
- Taeung Kang (프론트엔드 / 디자인 시스템 전문)

---

# 🎯 torya 트랙 추천 분석

## 트랙별 적합도 평가

### 🛠 Developer Tooling — **★★★★★ 추천**

**적합한 이유**
| 근거 | 설명 |
|---|---|
| **호스트 제품과 깊은 통합** | Terminal Bridge × cmux는 이 해커톤을 위해 설계된 듯한 시그니처. **Austin Wang(결승 심사위원, cmux 창업자)** 이 가장 좋아할 데모 |
| **차별화** | 다른 Dev Tooling 참가자 = CLI 도구. **torya는 유일하게 "브라우저 ↔ cmux 다리"** — 즉시 기억됨 |
| **데모 임팩트 적합** | "브라우저에서 클릭 → cmux 패널에서 명령 실행" — 3분 데모에 정확히 맞는 wow 모먼트 |
| **트랙 정의에 부합** | "Terminal workflows, agent orchestration, debugging" — 우리 시그니처가 모두 해당 |
| **2위 자리 경쟁 완화** | CLI 도구 빌더 풀이 작아 결승 진출 확률 ↑ |

**리스크**
- ⚠️ "Chrome 익스텐션은 CLI가 아니다" 반론 가능 → **데모 첫 30초를 cmux 패널 화면으로 시작**해 정체성 못 박기
- ⚠️ 채팅·번역·회의 같은 일반 기능은 부각 X → "그건 부산물, 본질은 cmux 확장" 톤으로
- ⚠️ Bridge가 시연일 기준 동작해야 함 (Native Messaging + cmux RPC 둘 다)

**Grand Prize 가능성**: 트랙 1위 → 결승 진출 → cmux 본진 후원 + 메타 스토리("호스트 플랫폼을 200% 활용") → Austin Wang의 표 + 메타 어필로 Grand Prize도 노릴 수 있음

---

### 💡 Business & Applications — ★★★☆☆ 무난

**적합한 이유**
- 응용 제품이라는 가장 폭넓은 트랙. torya의 시나리오 다수가 이 트랙에 적합 (Gmail, Sheets, 회의, 번역)
- 응용 제품이라는 가장 폭넓은 트랙
- Sukone Hong(투자자) 이 결승 심사 → 사업성 점수 잘 받을 수 있음

**리스크**
- ⚠️ **가장 경쟁 치열한 트랙** — 모든 "AI agent for X" 응용이 여기 몰림
- ⚠️ **Jun Kim(Aside CEO) = AI 브라우저 만드는 사람** 트랙 심사 가능. 동종 제품을 어떻게 보일지가 변수 — 호의적이면 강력 아군, 비판적이면 큰 약점
- ⚠️ cmux 통합이 메인 셀링이 아닌 "여러 기능 중 하나"로 약화됨 → 호스트 제품 활용 가산점 상실

**Grand Prize 가능성**: 트랙 결승 진출까지는 가능하나, **메타 스토리가 약해 Grand 경쟁에서 불리**

---

### 🔴 AI Safety & Security — ★☆☆☆☆ 부적합

- torya는 보안 제품이 아님
- 추가로 보안 기능을 끼워넣어도 시간 부족 + 본질 흐림
- ❌ **선택 비추천**

---

## 🎯 최종 권고: **🛠 Developer Tooling 트랙**

### 결정 이유 요약

```
1. cmux 통합 = 이 해커톤의 시그니처 모먼트
   → 호스트 제품을 가장 깊이 활용하는 팀이 메타 점수 가산
   → Austin Wang(결승 심사) 최고의 우호 표

2. 차별화가 압도적
   → 다른 CLI 빌더들과 비교 불가능한 카테고리
   → "브라우저 + 터미널 한몸"은 한 줄로 기억됨

3. Grand Prize 노림수
   → 트랙 1위는 보장 가능선
   → 결승에서 메타 스토리로 그랜드까지 도달 가능

4. Business 트랙은 이미 포화
   → AI 응용 제품 = 디폴트 → 차별화 어려움
   → Aside(AI 브라우저)와 직접 비교 위험
```

### 데모 재구성 권고 (3분, Dev Tooling 트랙용)

```
[0:00–0:20] 오프닝 — 페인 포인트
 "브라우저에서 본 GitHub PR을 테스트하려고
  명령어 검색하고, 복붙하고, 터미널 가는 짜증.
  익스텐션 하나로 cmux 패널이 알아서 합니다."

[0:20–1:30] 🌉 시그니처 시연 — Terminal Bridge × cmux
 → GitHub PR 페이지 방문
 → 사이드 패널에 "🌉 PR 받아서 테스트" 자동 제안
 → [실행] 클릭
 → cmux 'torya' 워크스페이스에서 명령이 *눈앞에서* 입력됨
 → 사이드바 알림 + 사이드 패널 미리보기 양쪽 동기화
 → ✅ 12 tests passed
 → "양쪽 통제 — 사용자 주도권 유지"

[1:30–2:10] 🐛 Dev Error Detector — LLM 없이도 동작
 → localhost 콘솔: "Cannot find module 'react-router-dom'"
 → DevErrorCard 즉시 노출 (룰 기반, LLM 키 무관)
 → [실행] → cmux에서 pnpm add 실행
 → HMR 자동 반영
 → "설치 직후 LLM 키 등록 전에도 첫 가치 체감"

[2:10–2:40] 아키텍처 한 슬라이드
 → Native Messaging (HTTP/포트/토큰 없음, Chrome 표준만)
 → cmux 백엔드 1순위 + DirectSpawn fallback
 → "익스텐션 + curl … | sh + 끝"

[2:40–3:00] 클로저
 "torya = cmux의 브라우저 손.
  당신이 보는 곳, cmux가 실행하는 곳, 한 흐름.
  오늘 크롬 웹스토어 + 한 줄 install.sh 동시 제출."
```

### PRD 업데이트 필요 사항

현재 `docs/torya/PRD.md`는 **💡 Business & Applications** 트랙으로 적혀 있습니다 (§12.1, Document Meta). 트랙 변경 시:

```diff
- | **선택 트랙** | 💡 Business & Applications |
+ | **선택 트랙** | 🛠 Developer Tooling |

- ### 12.1 트랙
- **💡 Business & Applications**
+ ### 12.1 트랙
+ **🛠 Developer Tooling**
```

§12.2 자체평가 표도 Dev Tooling 기준으로 재작성 필요.

---

## ⚠️ 사전 점검 (제출 직전 체크리스트)

```
배포
□ Chrome 웹스토어 unpublished/listed 링크 확보
   (또는 GitHub Releases의 .crx 다운로드 페이지)
   ⚠️ "localhost는 무효" — 사이트 또는 배포 패키지 URL 필수
□ 랜딩 페이지 torya.app (또는 GitHub Pages) 준비
□ Bridge: GitHub Releases 단일 바이너리 + install.sh 게시 + curl … | sh 동작 검증
□ cmux 시연용 torya 워크스페이스 미리 셋업

GitHub
□ 리포 public 전환
□ README에 1분 설치 가이드
□ 라이선스 명시

폼 제출 (한 명만!)
□ 데모 URL (배포된 형태)
□ GitHub 리포 URL
□ 팀원 이름·이메일 (1인 팀이라도 본인)

발표
□ 3분 슬라이드 (위 데모 시나리오)
□ cmux 띄워둔 화면, torya Side Panel 띄워둔 화면 사전 분할

기타
□ 18:00 sharp 마감 — 17:30에는 폼 작성 완료 권장
□ 시상식까지 자리 지키기 (수상 시 본인 수령 필수)
□ 개인 프로젝트 재활용 금지 — 해커톤 시작 후 작성한 코드만
   ⚠️ docs/ 폴더 PRD/SPEC은 사전 작성된 *설계 문서* — 운영진에 사전 확인 권장
```

---

**Document End** · 작성일: 2026-04-26
