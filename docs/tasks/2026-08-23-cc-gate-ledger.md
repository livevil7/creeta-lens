---
id: cc-gate-ledger
type: plan
version: 2
grade: deep
created: 2026-08-23
updated: 2026-08-23
status: in_progress
generator: lens/plan
language: ko
branch: feat/cc-gate-ledger
parent: null
refs: [docs/rules/harness-rules.md, skills/cc/SKILL.md, hooks/stop.js]
---

# Work Plan / 게이트 원장 — 「완료했다는 주장」을 「증명된 완료」로 바꾼다

> Lens v3.34.0 → v3.35.0
> 출처: 사용자 지시 (2026-08-23). unlazy(Leonxlnx/unlazy) 메커니즘 이식 검토 요청.

---

## 🎯 Goal — 미충족 목표가 남은 채로 턴이 끝나지 않게 한다

**산출물:**

1. `lib/gate-ledger.js` — 결의된 게이트 원장의 판정 로직 (parse · state · block 판정)
2. `lib/gate-ledger.test.js` — 위 로직의 단위 테스트 (`node lib/gate-ledger.test.js` → exit 0)
3. `hooks/stop.js` — 미충족 게이트가 있으면 `decision: block` 으로 턴 종료를 거부
4. `skills/cc/SKILL.md` — Phase 0.5(원장 생성) · Phase 6(증거 기록) · Phase 7(원장 종료) 배선
5. `lens.config.json` — `gateEnforcement` 킬스위치

**성공 기준:**

- [ ] G1: 원장이 없는 세션은 종전과 **바이트 단위로 동일하게** 동작한다 (회귀 0)
- [ ] G2: 미충족 게이트가 있는 원장이 있으면 Stop 이 실제로 차단된다
- [ ] G3: `status: met` 인데 증거가 없거나 `pending` 이면 **미충족**으로 판정된다
- [ ] G4: 사유 없는 `abandoned` 는 완료가 아니라 오류로 판정된다
- [ ] G5: 같은 원장으로 3회 연속 차단되면 경고와 함께 자동 해제된다 (무한루프 없음)
- [ ] G6: 훅이 어떤 이유로든 던지면 **통과**시킨다 (fail-open — 세션을 절대 가두지 않는다)

**Done 정의:**

> `node lib/gate-ledger.test.js` 가 전 항목 통과하고, 실제 `.lens/gates/` 원장을 만든 상태에서
> `hooks/stop.js` 에 Stop 페이로드를 주입했을 때 `{"decision":"block"}` 이 stdout 으로 나온다.
> 그리고 원장을 지운 상태에서 같은 훅이 `{}` 를 낸다.

---

## ❓ Why — 규칙은 이미 다 있는데 지켜지지 않는다

`/cc` 는 이미 unlazy 가 요구하는 **규칙을 전부** 갖고 있다: 핵심원칙 1 「SUCCESS_CRITERIA 하나라도
미달이면 done 보고 금지」, Phase 6 「텍스트 검토 금지 — 실제 증명」, Phase 2 「최상위 항목은 QA
통과 시에만 closed」. 문제는 그 전부가 **모델이 스스로 채점하는 산문**이라는 것이다.

그 결과 실제로 벌어지는 일 — 사용자 보고(2026-08-23): *"목표를 줘도 딴 데로 새고, 지시한 목표를
완수 안 하고 중간에 멈춰버린다."*

`hooks/stop.js` 는 **이미 등록돼 매 턴 끝마다 실행되고 있다**(hooks.json Stop). 그런데 하는 일이
대시보드 기록과 2분 시계 스탬프뿐이고, 성공 경로·예외 경로 **양쪽 모두 `writeJson({})`** 을 낸다 —
즉 이 훅은 차단할 수 있는 자리에 앉아 단 한 번도 차단한 적이 없다. 벽이 될 자리에 계측기가 있다.

안 하면 생기는 비용: 규칙을 더 써도 준수율은 안 오른다. v3.34 감사가 측정한 법칙이 그것이다 —
**눈에 보이는 산출물은 산문 지시로도 이행되고, 눈에 안 보이는 자기절제만 코드가 필요하다.**
「끝까지 한다」는 정확히 후자다.

---

## 📋 작업 인벤토리

<!-- 조사에서 나온 항목 전수. unlazy 메커니즘 5개 + /cc 실측에서 나온 공백 전부가 여기서 결론난다. -->

| # | 작업 항목 | 출처 | 반영 위치 | 상태 |
|---|---|---|---|---|
| 1 | 결의된 게이트 원장 (CHECK/EXPECT/EVIDENCE) | unlazy gates 메커니즘 | `lib/gate-ledger.js` · Plan A 1단계 | 포함 |
| 2 | Stop 훅 차단 (`decision: block`) | unlazy `scripts/stop-hook.mjs` | `hooks/stop.js` · Plan A 3단계 | 포함 |
| 3 | 증거 = exit code + EXPECT 매칭 | unlazy 증거 규칙 | `gateState()` · G3 | 포함 |
| 4 | pending 증거 = 미충족(빈칸보다 나쁨) | unlazy 자기채점 방지 | `gateState()` · G3 | 포함 |
| 5 | `ABANDON: <id> <사유>` 정직 이탈 | unlazy 이탈 규칙 | 원장 `abandonReason` · G4 | 포함 |
| 6 | MAX_BLOCKS 자동 해제 | unlazy `MAX_BLOCKS=6` | `decideBlock()` · G5 (**3 으로 낮춤**) | 포함 |
| 7 | 콘텐츠 해시로 진전 감지 → 카운터 리셋 | unlazy `contentHash` | `evaluate()` · Plan A 1단계 | 포함 |
| 8 | fail-open (훅이 세션을 가두지 않음) | unlazy `allow()` 전 경로 | `hooks/stop.js` · G6 | 포함 |
| 9 | Depth Tree (`tree N`) | unlazy 핵심 메커니즘 | — | **제외** — 🚧 비목표 1항 (팬아웃 중복 · 모델 배분 규칙 충돌) |
| 10 | 4-pass leaf 폴리싱 | unlazy leaf 완료 절차 | — | **제외** — 🚧 비목표 2항 (Supervisor+Codex 중복) |
| 11 | `OWNS:` 글로브 선언 | unlazy leaf 파일 소유 | — | **제외** — Phase 1.5 `건드릴 파일` 칸이 이미 같은 일을 한다 |
| 12 | 일반 턴 자동 무장 | 사용자 고통의 실제 발생 지점 | — | **제외** — 🚧 비목표 3항 (오탐 시 모든 대화가 막힘) |
| 13 | 게이트 명령을 훅이 직접 실행 | unlazy `--approve` 경로 | — | **제외** — 🚧 비목표 4항 (매 턴 부작용) |
| 14 | stale 원장 24h 만료 | 실측: 죽은 실행이 원장을 남긴다 | `decideBlock()` · R2 | 포함 |
| 15 | `gateEnforcement` 킬스위치 | R5 완화 | `lens.config.json` · Plan A 5단계 | 포함 |

## 🚫 DO NOT CHANGE

이번 작업 범위 **밖**. 더 나아 보여도 건드리지 않는다:

- `hooks/stop.js` 의 기존 동작 — `endSession()` 대시보드 기록과 `resetProgressReportClock()`.
  게이트 판정은 그 **뒤에 덧붙인다**. 2분 시계 로직은 harness-rules §4.4 가 SoT 다.
- `lib/agent-tracker.js` — 원장은 별도 파일이다. 대시보드 스키마를 확장하지 않는다.
- `lib/plan-manager.js` · `lib/git-branch.js` — 다른 게이트의 코드. 이번 원장과 무관하다.
- `skills/cp/SKILL.md` — 계획 작성은 이번 범위가 아니다. `/cc` 실행 경로만 바꾼다.
- `hooks/post-tool-progress.js` — 2분 보고 강제. 차단 사유 문구로만 협조하고 코드는 안 건드린다.

## 🚧 비목표 (이번에 하지 않는 것)

- **Depth Tree (`tree N`) 이식 안 함** — `/cc` 는 이미 Leader→Worker 병렬 팬아웃이다. unlazy 의
  트리는 리뷰에서 순차 실행으로 수 시간을 태운다는 결함이 보고됐고, 대표님의 **난이도 기반 모델
  배분**(v3.24) 과 정면 충돌한다.
- **4-pass leaf 폴리싱 이식 안 함** — Supervisor + Codex 더블 게이트가 이미 그 역할이다.
  Simplicity First 위반.
- **일반 턴 자동 무장 안 함** — 원장은 `/cc` 만 만든다. 프롬프트를 보고 "목표성" 을 추론해
  자동으로 게이트를 세우는 것은 오탐 지옥이고, 대표님이 아무 대화나 할 때마다 턴이 막힌다.
- **게이트 명령 자동 실행 안 함** — 훅은 **읽기만** 한다. 명령 실행은 Phase 6 QA 의 일이다.
  훅에서 임의 명령을 돌리면 매 턴 끝마다 부작용이 생긴다.

---

## 🔀 검토된 대안

| 대안 | 기각 사유 |
|---|---|
| unlazy 를 그대로 설치 | 규칙 계층이 이중이 된다(4규칙 + /cc + unlazy). Stop 훅 2개가 각자 차단하면 해제 조건이 서로를 모른다 |
| 원장을 Markdown(`GATES.md`)으로 | 훅에서 매 턴 마크다운 파싱은 취약하다. **작성 SoT 는 계획서의 `VERIFICATION` 표(md)로 두고**, 훅이 읽는 것은 결의된 JSON 으로 분리 — `plan-manager`(md) ↔ `agent-dashboard.json`(런타임) 과 같은 기존 분리 |
| TodoWrite 미완 항목으로 차단 | 디스크에 없다. 실측: `~/.claude/todos` 0건. 트랜스크립트 jsonl 을 매 턴 역파싱하는 것은 500KB 스캔 + 포맷 의존 |
| `exit 2` 로 차단 | 문서상 동작하지만 사유 전달 경로가 stderr 뿐이다. `{"decision":"block","reason":...}` 이 사유를 모델에게 돌려주는 정본 |
| MAX_BLOCKS 6 (unlazy 기본값) | 차단된 턴은 사용자에게 메시지가 안 간다 = 침묵. 대표님 **2분 보고 규칙**과 정면 충돌하므로 **3** 으로 낮춘다 |

---

## 🛠 How — Plan A

### 근거

원장은 **런타임 상태**다. `.lens/` 는 이미 gitignore 돼 있고(`agent-dashboard.json`,
`progress-report-state.json` 선례), 훅이 읽는 상태는 전부 거기 있다. 새 아키텍처를 만들지 않는다.

### 단계

1. `lib/gate-ledger.js` — 순수 함수로 판정 로직 작성 (I/O 최소, 테스트 가능)
   - `loadLedgers(projectRoot)` — `.lens/gates/*.json` 수집, 파싱 실패는 `invalid` 로 수거
   - `gateState(gate)` — `met` / `unmet` / `unmet-no-evidence` / `abandoned` / `invalid`
   - `evaluate(ledgers)` — 미충족 목록 + 콘텐츠 해시
   - `decideBlock(evaluation, state, opts)` — 차단 여부 + 사유 문자열 + 갱신된 카운터
2. `lib/gate-ledger.test.js` — G1~G6 을 그대로 테스트로 옮긴다
3. `hooks/stop.js` — 기존 동작(대시보드·시계) **뒤에** 게이트 판정을 붙인다. 판정 결과가 block 이면
   `{"decision":"block","reason":...}`, 아니면 종전대로 `{}`
4. `skills/cc/SKILL.md` — Phase 0.5 신설(원장 생성), Phase 6 QA 출력 → 원장 기록, Phase 7 원장 종료
5. `lens.config.json` — `"gateEnforcement": true` 추가 (+ env `LENS_GATE_ENFORCEMENT=0` 우회)
6. 검증: 테스트 실행 + 훅 실입력 주입 2케이스(원장 있음/없음)

### 막힐 수 있는 지점

- Stop 훅의 block 필드 형식이 현재 Claude Code 빌드와 다를 수 있다 → **실입력 주입으로 실측 확인**.
  형식이 틀리면 훅은 그냥 통과시키므로(fail-open) 피해는 없고, 확인은 stdout 문자열로 한다.
- `.lens/` 가 gitignore 라 원장이 머신 간 이동하지 않는다 → **의도된 동작**. 원장은 실행 상태다.

## Plan B

### Trigger

`decision: block` 이 현재 빌드에서 무시되는 것이 실측되면.

### 트레이드오프

`exit 2` 폴백으로 전환한다 — 차단은 되지만 사유가 stderr 로만 간다. 사유 손실을 감수하고 차단력을
얻는다. 원장·판정 로직(`lib/gate-ledger.js`)은 그대로 재사용되므로 폐기되는 작업은 없다.

---

## ⚠️ 리스크 레지스터

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | 훅 버그로 세션이 영구히 갇힌다 | 치명 — 모든 머신·cron | fail-open 3중: `installFailSoftHandlers` 유지 · 모든 판정을 try/catch · MAX_BLOCKS 3 자동 해제 |
| R2 | 죽은 `/cc` 실행이 남긴 원장이 이후 모든 턴을 막는다 | 높음 | 24시간 지난 원장은 차단하지 않고 경고만(stale). Phase 7 이 원장을 종료 |
| R3 | 차단된 턴 = 사용자에게 메시지 없음(침묵) | 중 — 2분 보고 규칙 위반 | MAX_BLOCKS 3 + 차단 사유 첫 줄에 "진행보고 1줄 먼저" 를 넣는다 |
| R4 | cron(`LENS_NONINTERACTIVE=1`) 무인 실행이 차단에 걸려 돈다 | 중 | 같은 MAX_BLOCKS 가 적용된다. 무인일수록 「중간에 멈춤」이 더 위험하므로 차단 자체는 유지 |
| R5 | 원장이 있는 레포에서 무관한 대화까지 막힌다 | 중 | 원장은 `/cc` 만 만들고 Phase 7 이 닫는다. `gateEnforcement: false` 킬스위치 |

---

## ✅ Review — 검증 방법

| 목표가 됐다는 신호 | 확인 방법 | 통과 판정 | 종류 |
|---|---|---|---|
| 판정 로직이 정확하다 | `node lib/gate-ledger.test.js` | exit 0, `failed 0` | auto |
| 원장 없으면 종전 동작 | 원장 없는 상태로 `hooks/stop.js` 에 Stop 페이로드 주입 | stdout 에 `decision` 없음 | auto |
| 원장 있으면 차단 | 미충족 게이트 원장 생성 후 같은 주입 | stdout 에 `"decision":"block"` | auto |
| 무한루프 없음 | 같은 원장으로 4회 연속 주입 | 4회째는 차단 안 됨 | auto |
| 훅이 죽어도 통과 | 깨진 JSON 원장으로 주입 | exit 0, 차단 없음 | auto |

## 진행상황

- **작업 브랜치**: `feat/cc-gate-ledger` — 2026-08-23 이 계획의 실행이 `origin/master` 위에서 생성. 시작 SHA `cbe217d`.
- **마지막 업데이트**: 2026-08-23
- **현재 경로**: Plan A (Plan B 미사용 — `decision: block` 이 현재 빌드에서 실제로 동작함을 실측)
- **Goal 달성**: 6/6 ✓
- **재개 포인트**: 완료 — 릴리즈(태그·GitHub Release·`/lens-upgrade`) 후 `/cd` 로 history 전환

### 검증 증거 (실측)

| 기준 | 확인 방법 | 결과 |
|---|---|---|
| G1 원장 없으면 종전 동작 | 빈 프로젝트에 Stop 페이로드 주입 | `{}` · exit 0 ✓ |
| G2 미충족이면 차단 | 게이트 1건 원장 생성 후 주입 | `{"decision":"block","reason":"…미충족 1건…(1/3)"}` ✓ |
| G3 증거 없는 met = 미충족 | `gate-ledger.test.js` 6케이스 (evidence null · `"pending"` · exit≠0 · EXPECT 불일치 · manual note only · confirmedBy only) | 전부 `unmet-no-evidence` ✓ |
| G4 사유 없는 abandoned = 오류 | 같은 테스트 + `abandonGate('   ')` | `invalid` · `ok:false` ✓ |
| G5 3회 후 자동 해제 | 같은 원장으로 훅 4회 연속 주입 | 1·2·3회 차단, 4회째 `systemMessage: 자동 해제` ✓ |
| G6 fail-open | 깨진 JSON 원장 주입 · 깨진 state 6종 | exit 0, 던지지 않음. PARSE 항목으로 수거 ✓ |
| 전체 테스트 | `node lib/gate-ledger.test.js` | **passed 34, failed 0** ✓ |
| 회귀 없음 | 기존 4개 스위트 (git-branch-entry · plan-coverage · install-sync · session-start) | 전부 PASS ✓ |
| 킬스위치 | `LENS_GATE_ENFORCEMENT=0` 로 주입 | `{}` ✓ |

### 편차 기록 (계획 ↔ 실제)

- 계획: `sanitizeScope('../../etc/passwd')` → `etc-passwd` → 실제: 선행 점이 남아 `..-..-etc-passwd` 였다
  (이유: 점이 파일명 허용문자라서. 경로 구분자는 이미 제거돼 traversal 은 불가능했으므로 **보안 결함이
  아니라 가독성 문제**였다. 선행 점 제거 한 줄 추가하고, 테스트를 「구분자 없음 + 점으로 시작 안 함」
  이라는 실제 성질 검사로 바꿨다)
- 계획: 릴리즈 가이드대로 코드 커밋과 버전 범프 커밋 분리 → 실제: `skills/cc/SKILL.md` 는 내용 변경과
  버전 문자열이 같은 파일에 겹쳐 코드 커밋에 함께 들어간다 (이유: 파일 단위로만 분리 가능)
- 그 외 편차 없음

### 실행 지표

- **추가 질문 수**: 0 (실행 중 사용자에게 되물은 횟수)
- **편차 건수**: 2
- **게이트**: 통과 (계획서 자체가 Lens 계획 게이트 통과 — 인벤토리 15건 → 포함 10 / 제외 5)

## Status

**Status**: done
