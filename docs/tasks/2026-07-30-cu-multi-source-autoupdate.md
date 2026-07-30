---
planner: cp
grade: standard
date: 2026-07-30
slug: cu-multi-source-autoupdate
대상 버전: v3.26.0
---

# /cu 고도화 — 다중 소스 전수 스캔 + 무확인 자동 업데이트

## 🎯 What — 목표 (무엇이 가능해지는가)

**이 작업이 끝나면 가능해지는 것:**

- 사용자가 `/cu` 한 번을 치면, 이 컴퓨터에 깔린 **업데이트 가능한 것이 종류를 가리지 않고 한 목록에** 뜬다 — 명령줄 도구든, 설치된 프로그램이든, 편집기 확장이든, 클로드 플러그인이든.
- 사용자는 **항목을 하나하나 골라주지 않는다.** 되돌리기 쉬운 것은 묻지 않고 알아서 최신으로 올라가 있다.
- 되돌리기 어려운 것(데이터베이스·언어 런타임·시스템 구성요소·큰 버전 점프)은 **자동으로 건드리지 않고 따로 모아서** 보여주므로, 사용자가 그것만 판단하면 된다.
- 클로드 플러그인의 버전 표시가 **정확해진다** — 지금처럼 "버전 모름"으로 비거나, 최신인데 업데이트가 있다고 잘못 알리는 일이 없어진다.

**완료의 정의 (Done = ?):**

> `/cu`를 한 번 실행하면 이 컴퓨터의 업데이트 대기 항목이 소스별로 빠짐없이 표에 나오고, 사용자가 아무것도 선택하지 않았는데도 안전한 항목은 이미 최신으로 올라가 있으며, 손대지 않은 항목은 "왜 안 했는지"와 "직접 하려면 무엇을 치면 되는지"가 함께 적혀 있다.

## 🚧 비목표 (Non-Goals)

- **새 프로그램 설치** — `/cu`는 이미 깔린 것만 올린다. "이거 없으니 깔자"는 `/ci` 영역이다. 설치 판단은 업데이트 판단과 위험도가 다르다.
- **원격 머신(Mac Mini) 업데이트** — 이번엔 실행한 그 컴퓨터만 본다. 원격까지 넣으면 SSH·인증·머신별 패키지 매니저 차이가 붙어 범위가 배로 늘어난다.
- **패키지 매니저 자체 설치** — scoop/choco가 없는 머신에 깔지 않는다. 없으면 그 소스는 목록에서 빠질 뿐이다(현재의 per-machine 원칙 유지).
- **업데이트 후 동작 검증** — 올린 도구가 실제로 잘 도는지까지는 보지 않는다. 그건 `/ccp`의 일이다.
- **가상환경(venv)·프로젝트 로컬 의존성** — `package.json`/`requirements.txt`의 프로젝트 의존성은 손대지 않는다. 프로젝트 코드의 동작을 바꾸는 일이라 성격이 완전히 다르다.
- **버전 고정(pin) 관리** — "이 도구는 이 버전에 묶어둔다"는 정책 파일은 만들지 않는다. 지금 필요하다는 신호가 없다.

## ❓ Why — 왜 해야 하는가

- **푸는 문제 / 동기 (6하원칙)**
  - **무엇이 문제인가**: `/cu`가 이 컴퓨터에서 보고 있는 것은 명령줄 도구 3개(claude·codex·gh)와 클로드 플러그인 6개, 합쳐 9~10개뿐이다. 실제로는 winget으로 관리되는 프로그램이 143개 깔려 있고 그중 **19개가 업데이트 대기 중**이며, npm으로 깔린 명령줄 도구 8개 중 **6개가 낡았다**. `/cu`는 이 25건 중 **단 하나도 보고하지 못했다.**
  - **왜 못 보는가**: 못 찾는 게 아니라 **찾지 않는다.** `scripts/cu.py`는 도구 이름을 하나하나 손으로 적어둔 함수 3개를 부르는 구조다. 목록에 없는 도구는 아무리 낡아도 영원히 안 보인다.
  - **왜 지금인가**: 낡은 채로 방치되는 것들이 실제로 쌓였다 — Git 2.54(→2.55), Node.js 24.15(→24.18), Python 3.13.13(→3.13.14), AWS CLI, ripgrep, restic, Tailscale, PostgreSQL. 개발 환경의 토대에 해당하는 것들이고, 사용자가 자동 갱신을 기대했다가 안 되고 있던 부분이다.
  - **누구를 위해**: 여러 대(Windows·Mac Mini)를 혼자 관리하는 사용자. 컴퓨터마다 뭐가 낡았는지 손으로 확인할 시간이 없다.
  - **어떻게 불편한가**: 지금은 사용자가 `winget upgrade`, `npm outdated -g`를 따로따로 기억해서 쳐야 하고, 업데이트가 있으면 `/cu`가 매번 목록을 띄워 **하나하나 클릭을 요구**한다. 업데이트가 있다는 걸 이미 알고 다 올릴 생각으로 `/cu`를 쳤는데 다시 물어보는 것은 절차만 늘리는 일이다.
  - **어디가 틀렸나(정확성)**: 플러그인 표시가 신뢰할 수 없다. context7·playwright는 "버전 모름"으로 뜨고, agentmemory는 **최신인데 "업데이트 있음"으로 잘못 표시**됐다(실제 실행해 보니 이미 최신이었음). 잘못된 경고가 반복되면 사용자는 표 전체를 안 믿게 된다.

- **안 하면 생기는 비용**
  - 개발 토대(Git·Node·Python·ripgrep)가 계속 낡아, 나중에 한꺼번에 큰 버전을 점프하게 된다 — 그때가 훨씬 위험하다.
  - 보안 패치가 포함된 갱신(Edge·Tailscale·AWS CLI)이 무기한 지연된다.
  - `/cu`가 "믿을 수 없는 도구"로 굳어 사용자가 안 쓰게 되고, 결국 손으로 관리하던 상태로 되돌아간다.
  - 오탐이 남아 있으면 매 실행마다 없는 업데이트를 실행하려 시도해 시간이 새고, 진짜 업데이트가 오탐 사이에 묻힌다.

## 🧰 실행 전략 & 자원

- **난이도**: medium
  - 근거: 파일 2개(`scripts/cu.py`, `skills/cu/SKILL.md`)로 국한되고 새 의존성이 없다. 다만 외부 명령 5종(winget·npm·code·claude·git)의 출력 파싱과 위험도 정책 설계가 붙어 단순 수정은 아니다. 되돌리기는 git revert로 즉시 가능하다.
- **권장 모델**: `fable` (Task enum 최상위 = TOP)
  - 근거: 핵심 난점이 "무확인 자동 실행의 안전 경계 설계"다. 경계를 잘못 그으면 사용자 머신의 데이터베이스나 런타임이 예고 없이 올라간다. 판단 실수의 비용이 코드 작성량보다 훨씬 크므로 최상위 티어. 단, 아래 병렬 분할의 **T3(winget 파서)와 T5(문서 갱신)는 `sonnet`** — 출력 파싱과 문서 반영은 Medium 난이도다. (모델 배분은 난이도 기반 — 무차별 최상위 배정 금지)
- **병렬 실행**: 에이전트 3개
  - A: 소스 스캐너 골격 + 플러그인 버전 해석 수정 (cu.py 상반부)
  - B: winget/npm/vscode 스캐너 + 위험도 분류 정책 (cu.py 하반부)
  - C: SKILL.md 절차 재작성 + CHANGELOG/README
  - A와 B가 같은 파일을 만지므로 **직렬 의존**: A 완료 후 B 시작. C는 A·B와 병렬 가능(`[P]`).
- **활용 스킬 (설치된 것 기준)**
  - `context7` — 불필요. winget/npm CLI는 라이브러리가 아니라 명령줄 출력 계약이고, 실제 출력을 직접 떠서 맞추는 게 정확하다.
  - `playwright` — 불필요. 브라우저 UI가 없다.
  - Codex 병렬 조사 — 사용(Standard 등급 필수). 무확인 실행 설계는 이종 모델 교차검증 가치가 크다.
- **기존 자원·시스템 (재사용)**
  - `scripts/cu.py`의 뼈대를 유지한다: `run()` 헬퍼(타임아웃·UTF-8 처리), `_resolve()`(Windows `.cmd` shim 해결), `github_json()`, `_strip_v()`, scan/upgrade 2모드 구조, 종료코드 규약(0/1/2/3). 새로 쓰지 않고 확장한다.
  - `scripts/cu.sh` 래퍼 — 그대로 둔다.
  - `scripts/upgrade.sh` — lens 자체 업그레이드 위임 경로 유지(`/lens-upgrade`의 롤백 기능은 `claude plugin update`에 없다).
  - `~/.claude/plugins/installed_plugins.json` + `~/.claude/plugins/marketplaces/*` 클론 — 플러그인 버전의 실제 출처.
  - `scripts/bump-version.sh` — 릴리즈 시 14곳 버전 일괄 갱신에 사용.
  - `lib/install-sync.test.js` — **테스트 관행의 본보기.** 의존성 없는 단독 실행 + `assert` + exit 0 iff 전체 통과. `scripts/cu.test.py`를 같은 형태로 만든다(T0).
  - `lib/install-sync.js` — **참조만.** `/ci`가 같은 레지스트리를 파싱하며 161행 주석에 `cu.py fallback path`라고 적혀 있다. 다만 Node ↔ Python이라 코드 공유는 하지 않고 **버전 해석 규칙만 일치**시킨다(듀얼 합성 분기 4 참조).
  - `scripts/upgrade.py` — **패턴만 차용.** 백업·롤백 접근을 T5의 사전 스냅샷에 참고한다. 파일 자체는 DO NOT CHANGE.

## 🚫 DO NOT CHANGE

- `scripts/cu.sh` — bash 래퍼. 인터페이스(`cu.sh scan` / `cu.sh upgrade <id>`)가 SKILL.md와 hooks에 박혀 있다. 시그니처를 바꾸면 호출부가 조용히 깨진다.
- `scripts/upgrade.sh` / `scripts/upgrade.py` — `/lens-upgrade`의 자산. `/cu`는 이걸 **호출만** 한다. 여기에 손대면 lens 자체 업그레이드의 롤백 경로가 위험해진다.
- `scripts/git-sync-all.sh` — `/cs` 전용. 이번 작업과 무관하다.
- `cu.py`의 종료코드 규약 (0 성공 / 1 실패 / 2 미지의 id / 3 자동 불가) — SKILL.md가 이 값으로 분기한다. 새 상태가 필요하면 **기존 값의 의미를 바꾸지 말고 새 코드를 추가**한다.
- `cu.py`의 `run()` / `_resolve()` 구현 — Windows `.cmd` shim과 UTF-8 mojibake를 이미 해결해 둔 부분이다. 동작이 검증됐으므로 "정리" 금지.
- `~/.claude/plugins/installed_plugins.json` — **읽기 전용.** 클로드 코드가 소유하는 레지스트리다. `/cu`가 쓰면 플러그인 시스템이 깨진다.
- 다른 스킬(`c`, `cc`, `cp`, `cs`, `ci`)의 SKILL.md — 이번 변경 범위 밖이다.

## 🛠 How — 어떻게 (Plan A / Plan B)

### Plan A — 권장 경로: 소스 단위 스캐너 + 위험도 자동 분류

#### 왜 이게 1순위인가

1. **"CLI가 3개뿐"의 근본 해결**: 도구를 하나씩 등록하는 방식을 버리고 **패키지 매니저에게 물어본다.** winget이 143개를, npm이 8개를 이미 알고 있다. 도구 이름을 손으로 적을 필요가 사라지므로, 앞으로 새 도구를 깔아도 자동으로 목록에 들어온다. 사용자가 "왜 검색이 안 되지?"라고 물은 지점을 구조적으로 없앤다.
2. **"물어보지 않는다"를 정책으로 구현**: 매번 묻는 대신 **위험도를 미리 정해두고** 안전한 것은 그냥 실행한다. 질문이 사라지지만 판단은 남는다.
3. **기존 구조와 맞다**: `cu.py`는 이미 "항목 목록을 만들고 id로 하나씩 업그레이드"하는 모양이다. 항목을 만드는 부분만 소스별로 바꾸면 되고, 업그레이드 디스패처와 종료코드 규약은 그대로 쓴다(외과적 변경).
4. **per-machine 원칙 유지**: 없는 패키지 매니저는 그 소스가 빠질 뿐이다. Mac에서는 winget이 없고 brew가 잡히는 식으로 같은 코드가 동작한다.

#### 설계 1 — 스캐너를 "소스" 단위로 재편

현재 `cmd_scan()`은 함수 3개를 하드코딩으로 부른다(`cu.py:332`). 이를 소스 목록 순회로 바꾼다.

| 소스 | 열거 방법 | id 형식 |
|---|---|---|
| `winget` | `winget upgrade --include-unknown` 표 파싱 | `winget:Git.Git` |
| `npm-global` | `npm outdated -g --depth=0 --json` | `npm:wrangler` |
| `vscode-ext` | `code --list-extensions --show-versions` + 자동갱신 설정 확인 | `vscode:ms-python.python` |
| `claude-plugin` | `installed_plugins.json` + 마켓플레이스 클론 | `plugin:lens@CreetaCorp` |
| `cli-special` | 전용 업데이트 경로가 있는 것만 | `cli:claude` |
| `pip-global` | `pip list --outdated --format=json` | `pip:<name>` |
| `brew` (macOS) | `brew outdated --json` | `brew:<name>` |

- **`cli-special`에 남기는 것은 2개뿐**: `cli:claude`(자체 `claude update` 경로가 npm 재설치보다 안전) 와 `plugin:lens@CreetaCorp`(`/lens-upgrade` 위임). 기존 `scan_codex`·`scan_gh`는 **삭제**한다 — codex는 `npm-global`이, gh는 `winget`이 자동으로 잡는다. 손으로 적어둔 특수 케이스가 줄어드는 것이 이 설계의 요점이다.
- **중복 제거(dedup)가 필수**: `@anthropic-ai/claude-code`는 npm 목록에도 있고 `cli:claude`로도 있다. `@openai/codex`도 npm에 있다. Node.js는 winget에, npm 자체 버전과 겹칠 수 있다. **규칙: `cli-special` 항목이 있으면 같은 대상의 generic 항목(npm/winget)을 목록에서 제거한다.** 매칭 키는 npm 패키지명(`@anthropic-ai/claude-code`)과 winget id를 special 항목에 명시해 둔다. 이걸 빼면 같은 도구가 두 줄로 뜨고 두 번 업그레이드된다.
- 소스 열거가 실패하면(명령 없음·타임아웃) **그 소스만 빠지고 나머지는 진행**한다. 실패 사유는 스캔 결과에 `source_errors`로 담아 사용자에게 보고한다 — 조용히 빠지면 "다 최신"으로 오해된다.

#### 설계 2 — 위험도 분류: `auto` / `hold` / `never`

각 항목에 `risk: "auto" | "hold" | "never"` 와 `hold_reason`을 붙인다.

> **`never` 3단계는 Pre-mortem P1 대응으로 추가됐다.** 처음엔 2단계(`auto`/`hold`)에 `/cu all`이 hold를 전부 실행하는 설계였는데, 그러면 **`/cu all` 오타 한 번으로 PostgreSQL이 업그레이드된다.** DB 업그레이드는 데이터 디렉터리 마이그레이션을 유발할 수 있어 되돌릴 수 없다. "`all`을 타이핑했으니 승인"이라는 논리는 데이터 손실 위험을 정당화하지 못하므로, `/cu all`로도 실행되지 않는 층을 뒀다.

**`auto` (묻지 않고 즉시 실행)**
- 클로드 플러그인 전부 — git 기반이고 재시작으로 되돌아온다.
- npm 글로벌 중 **patch·minor 상승** — `npm install -g <pkg>@<이전버전>`으로 즉시 복구 가능.
- winget 중 **아래 hold 조건에 해당하지 않는 것 전부.**
- VS Code 확장 — 편집기가 자체적으로 하는 일이고 되돌리기가 쉽다.

**`hold` (기본 실행 안 함. `/cu all`로만 실행)**
1. **메이저 버전 점프** — `@railway/cli 4.65 → 5.30`, `@shopify/cli 3.94 → 4.5`. 파괴적 변경이 규격상 허용되는 구간이다.
2. **언어 런타임** — Node.js, Python, Java/JDK. 이 컴퓨터의 거의 모든 프로젝트가 여기에 의존한다. 하나 올리면 영향 범위가 머신 전체다.
3. **시스템 구성요소** — VC++ 재배포 패키지, Edge, Teams 등. 재부팅을 요구할 수 있다.
4. **승격 필요 + 현재 비승격** — 이 판정은 **실측 기반**이다. 이번 조사에서 현재 셸이 `NOT_ELEVATED`로 확인됐다. 머신 스코프 패키지를 비승격 셸에서 올리려 하면 실패하거나 UAC 대화상자가 떠서 멈춘다. **비승격일 때만** `winget list --scope user` 로 사용자 스코프 목록을 받아, 그 목록에 없는 항목을 hold로 돌린다. 승격 셸이면 이 조회 자체를 생략한다(P6 대응 — winget 호출 2회를 1회로).

**`never` (`/cu all`로도 실행 안 함. 명령만 제시)**
5. **데이터 디렉터리를 가진 소프트웨어** — PostgreSQL, MySQL/MariaDB, MongoDB, Redis. 업그레이드가 데이터 마이그레이션을 유발할 수 있고 되돌릴 수 없다.
6. **winget 자신(App Installer)** — winget이 자기를 업그레이드하는 중에는 이후 winget 호출이 불안정해진다.
7. **드라이버류** — 실패 시 하드웨어가 안 잡히는 상태가 될 수 있다.
8. **pip 글로벌** — 시스템 파이썬 패키지를 올리면 다른 도구의 의존성이 깨질 수 있다. **개별 열거하지 않고 집계 한 줄**(`pip 글로벌 outdated N건 — 자동 갱신 제외`)로만 보고한다(P4 대응 — 수십 건이 hold 목록을 도배해 진짜 결정 대상을 묻는 것을 막는다).

- **정책 위치**: `cu.py` 상단에 `HOLD_KEYWORDS`(런타임·시스템 키워드), `NEVER_KEYWORDS`(DB·드라이버), `NEVER_WINGET_IDS`(App Installer 등 정확 일치) 상수로 둔다. 표 하나만 보면 정책 전부가 보여야 한다 — 조건이 코드 곳곳에 흩어지면 나중에 왜 hold인지 추적이 안 된다.
- **메이저 점프 판정**: `installed`/`latest` 양쪽이 `숫자.숫자...` 로 파싱되면 첫 성분을 비교한다. 파싱 실패(날짜형·SHA·`unknown`)면 **hold로 보수 처리**한다. 판단 불가를 auto로 넘기면 그게 사고 경로다.

#### 설계 3 — 플러그인 버전 해석 수정 (오탐·미탐의 근본 원인)

이번 조사에서 원인이 확정됐다. `_marketplace_latest()`는 마켓플레이스 manifest의 `version` 필드만 본다. 그런데 **대부분의 마켓플레이스는 manifest에 `version`을 쓰지 않는다**(source가 로컬 상대경로). 그래서 fallback으로 마켓플레이스 저장소의 HEAD 커밋 해시를 "최신 버전"으로 반환하고, 이를 설치된 semver와 비교한다 → **성질이 다른 두 값을 비교하니 항상 불일치 = 무조건 "업데이트 있음"**.

**실측 증거 — 오탐 2건 (Codex 지적으로 1건 추가 확인)**

| 플러그인 | 표시된 installed | 표시된 latest | 표시 판정 | 실제 |
|---|---|---|---|---|
| agentmemory | 0.9.28 | `8c90741c633c` (SHA) | ⚠️ 업데이트 있음 | `claude plugin update` 결과 `already at the latest version (0.9.28)` → **오탐** |
| insane-search | 0.13.0 | `687824e6d5f3` (SHA) | ⚠️ 업데이트 있음 | 오늘 오전 0.13.0으로 갱신 완료 = 최신. **최신 상태에서 재현되는 오탐** |

insane-search는 오전 실행 시점엔 실제로 업데이트가 있었지만(0.9.2 → 0.13.0), 표시된 `latest` 값은 그때도 SHA였으므로 처음부터 무의미했고 방향만 우연히 맞았다. 갱신 후 다시 스캔하면 **최신인데 또 업데이트를 요구한다** — 이것이 semver ↔ SHA 비교가 만드는 실패 모드다.

**해석 순서를 다음으로 교체한다:**

1. 마켓플레이스 manifest의 항목 `version` — 지금도 동작(ui-ux-pro-max 2.11.0, lens 3.25.0).
2. **`marketplaces/<mp>/<source>/.claude-plugin/plugin.json` 의 `version`** ← **신규. 이게 핵심 수정.**
   검증 완료: `marketplaces/agentmemory/plugin/.claude-plugin/plugin.json` → `0.9.28`(설치본과 일치 → 정상적으로 최신 판정), `marketplaces/gptaku-plugins/plugins/insane-search/.claude-plugin/plugin.json` → `0.13.0`.
3. `source.ref` (github 태그에 고정된 경우).
4. HEAD 커밋 해시 — **단, 설치된 버전도 커밋 해시일 때만 비교한다.**
5. 위 어느 것도 안 되면 `latest = None` (❓ unknown) — **추측하지 않는다.**

**semver ↔ SHA 비교 금지 규칙을 명시적으로 넣는다**: 두 값의 형태가 다르면 `needs_update = None`(unknown)으로 두고, 절대 `True`로 만들지 않는다. 이 한 줄이 오탐 재발을 막는다.

**`version: 'unknown'` 처리(context7·playwright)**: 레지스트리의 `version`이 `'unknown'`인데 `gitCommitSha`는 존재한다. 확인 결과 이 두 플러그인은 마켓플레이스 클론의 `plugin.json`에도 `version` 필드가 없다 — 진짜로 버전이 없는 플러그인이다. 따라서 **`version`이 `'unknown'`이면 `gitCommitSha`를 설치 버전으로 대체**하고, 최신은 해당 마켓플레이스 클론의 HEAD와 비교한다(해시 대 해시 = 정당한 비교). 이렇게 하면 두 플러그인이 ❓에서 정상 항목으로 바뀐다.

#### 설계 4 — 확인 게이트 제거 (SKILL.md)

현재 SKILL.md는 Step 3에서 `AskUserQuestion` multiSelect를 강제하고 "Never run an upgrade the user didn't explicitly pick"을 절대 규칙으로 둔다. 이 규칙 자체를 교체한다.

**새 절차:**
1. `cu.sh scan` 실행.
2. 결과를 소스별로 묶어 표시(`auto` / `hold` / ✅최신 / ❓unknown).
3. **`auto` 항목 전부를 질문 없이 순차 실행.** (`AskUserQuestion` 호출 없음)
4. `hold` 항목은 실행하지 않고, **왜 보류인지 + 직접 실행할 정확한 명령**을 함께 보고.
5. 최종 보고: 올라간 것 / 실패한 것 / 보류된 것. 재시작 필요 여부 안내.

- **`/cu all`** — `auto` + `hold`를 전부 실행한다. 사용자가 `all`을 타이핑한 것이 곧 명시적 승인이므로 다시 묻지 않는다. **단 `never` 등급은 `/cu all`로도 실행되지 않는다**(Pre-mortem P1) — 명령만 제시한다.
- **`/cu scan`** — 스캔만 하고 아무것도 실행하지 않는다(지금의 "보기만" 용도).
- **하위호환**: `/cu`가 인자 없이 오면 새 기본 동작(auto 전량 실행). 기존의 "묻고 나서 실행"은 사라진다. 이건 사용자가 명시적으로 요청한 변경이므로 의도된 파괴적 변경이다.
- **집계 실패 정책**: `auto` 항목 하나가 실패해도 나머지는 계속한다(현행 fail-soft 유지). 실패는 마지막 보고에 모아 표시한다.

#### 단계 (Plan A 체크리스트)

- [ ] **T0 — fixture 기반 단위 테스트 먼저 작성** `[P]` (모델: `fable`) ← *Codex 분기 3 채택. TDD 우선 규칙*
      파일: `creeta-lens/scripts/cu.test.py` (신규)
      변경: 레포 관행(`lib/install-sync.test.js`)과 같은 형태 — **의존성 없는 단독 실행 스크립트, `assert`만, 전체 통과 시 exit 0**. 실행: `python scripts/cu.test.py`. 다음 4개 불변식을 fixture로 고정한다.
      ① **winget 표 파서**: fixture는 **실제 `winget upgrade --include-unknown` 출력을 그대로 캡처한 파일**을 쓴다 — **손으로 타이핑 금지**(Pre-mortem P2: 사람이 쓰면 컬럼 폭·공백 수가 실물과 어긋나 테스트는 통과하는데 실물에서 깨진다). 캡처 안에 이미 까다로운 행이 들어 있다: `Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.44.35211`(공백·괄호·하이픈), `Notion 7.23.0`(이름에 버전 포함), `WeChat`, 요약줄 `19 upgrades available.`, 구분선. **파싱은 id 컬럼만 신뢰한다**(P3: winget이 콘솔 폭에 맞춰 이름을 `…`로 자르므로 이름은 판정에 쓰지 않고 보고용으로만 쓴다). 단정 대상은 id/installed/latest.
      ② **버전 비교 가드**: `("0.9.28","8c90741c633c")` → `needs_update is None` (semver↔SHA 금지). `("0.13.0","687824e6d5f3")` → `None`. `("2.11.0","2.11.0")` → `False`. `("4.65.0","5.30.1")` → `True` **이고 risk=hold**(메이저).
      ③ **위험도 분류 3단계**: `PostgreSQL.PostgreSQL.18`·`Microsoft.AppInstaller` → `never`(`/cu all`로도 실행 안 됨). `OpenJS.NodeJS.LTS`·`Python.Python.3.13`·`Microsoft.VCRedist.2015+.x64` → `hold`. `BurntSushi.ripgrep.MSVC`·`restic.restic`·`Amazon.AWSCLI`·`Tailscale.Tailscale` → `auto`. 버전 파싱 불가(`unknown`) → `hold`(보수 처리). **`/cu all` 실행 대상 산출 함수가 `never`를 포함하지 않음을 별도 단정**한다 — P1이 코드로 막혔다는 증거.
      ④ **dedup**: special `cli:claude` 가 있을 때 `npm:@anthropic-ai/claude-code` 가 결과에서 제거됨. `cli:claude` 부재 시에는 npm 항목이 남음.
      검증: `python scripts/cu.test.py` → 전체 통과 시 exit 0. **구현 전에는 실패해야 한다**(아직 함수가 없으므로) — 실패를 확인한 뒤 T1로 넘어간다. 이 순서가 테스트가 실제로 무언가를 검사한다는 증거다.
      의존: 없음 (T1보다 먼저 시작)

- [ ] **T1 — 스캔 결과 계약 확장** (모델: `fable`)
      파일: `creeta-lens/scripts/cu.py`
      변경: 항목 스키마에 `source`(winget|npm|vscode|plugin|cli|pip|brew), `risk`(auto|hold), `hold_reason`(문자열 또는 null) 3개 필드 추가. 스캔 최상위 출력을 배열에서 `{"items":[...], "source_errors":[...]}` 객체로 변경하고, 파일 상단 docstring의 항목 스키마 설명을 함께 갱신. 종료코드 규약은 손대지 않는다.
      검증: `bash scripts/cu.sh scan | python -c "import json,sys; d=json.load(sys.stdin); assert 'items' in d and 'source_errors' in d; [print(i['id'], i['source'], i['risk']) for i in d['items']]"` → 모든 항목이 source·risk를 갖고 출력
      의존: 없음

- [ ] **T2 — 플러그인 버전 해석 수정** (모델: `fable`)
      파일: `creeta-lens/scripts/cu.py` (`_marketplace_latest`, `scan_plugins`)
      변경: 위 설계 3의 5단 해석 순서 구현. ① 마켓 manifest `version` ② **마켓 클론 `<source>/.claude-plugin/plugin.json` 의 `version`**(신규) ③ `source.ref` ④ HEAD SHA(설치본도 SHA일 때만) ⑤ None. `scan_plugins`에서 `version == 'unknown'`이면 `gitCommitSha`로 대체. `needs_update` 계산에 **형태 불일치(semver vs SHA) → None** 가드 추가.
      검증: `bash scripts/cu.sh scan | python -c "import json,sys; d=json.load(sys.stdin); [print(i['id'], i['installed'], '->', i['latest'], i['needs_update']) for i in d['items'] if i['source']=='plugin']"` → agentmemory가 `0.9.28 -> 0.9.28 False`(오탐 해소), context7·playwright가 SHA 대 SHA로 판정되어 `needs_update`가 `None`이 아님
      의존: T1

- [ ] **T3 — winget 스캐너** (모델: `sonnet`)
      파일: `creeta-lens/scripts/cu.py` (신규 `scan_winget`)
      변경: `winget upgrade --include-unknown` 출력 표를 파싱해 항목 생성. 컬럼이 공백 정렬이고 이름에 공백·한글이 섞이므로 **헤더 위치로 컬럼 경계를 잡는 방식**으로 파싱한다(단순 `split()`은 "Microsoft Visual C++ 2015-2022 Redistributable (x64)" 같은 이름에서 깨진다). 마지막 요약줄(`N upgrades available.`)과 구분선은 제외. `winget list --scope user` 결과로 사용자 스코프 집합을 만들고, 비승격(`net session` 실패)일 때 그 집합 밖 항목은 `risk=hold`, `hold_reason="관리자 권한 필요"`. 업그레이드 명령은 기존 `_upgrade_gh_winget()`의 플래그 조합(`--silent --accept-source-agreements --accept-package-agreements --disable-interactivity`)을 재사용.
      검증: `bash scripts/cu.sh scan | python -c "import json,sys; d=json.load(sys.stdin); w=[i for i in d['items'] if i['source']=='winget']; print(len(w)); [print(i['id'], i['installed'], '->', i['latest'], i['risk'], i['hold_reason']) for i in w]"` → 19개 근처가 잡히고, 이름에 공백이 든 VC++ Redist 항목의 `installed`/`latest`가 깨지지 않고, PostgreSQL·Node.js·Python·VCRedist·AppInstaller가 `hold`
      의존: T1

- [ ] **T4 — npm 글로벌 / VS Code / pip 스캐너** (모델: `fable`)
      파일: `creeta-lens/scripts/cu.py` (신규 `scan_npm_global`, `scan_vscode_ext`, `scan_pip_global`)
      변경:
      · npm: `npm outdated -g --depth=0 --json` 파싱(JSON이라 안정적). `current`/`latest`로 항목 생성. 메이저 점프면 `hold`. `@anthropic-ai/claude-code`·`@openai/codex`는 dedup 대상으로 표시.
      · VS Code (**Codex 분기 2 채택안**): `code` 실행 파일을 PATH → `%LOCALAPPDATA%/Programs/Microsoft VS Code/bin/code` 순으로 탐색(이 컴퓨터는 PATH에 없고 후자에 있음). 개별 확장의 최신 버전을 조회하는 수단은 CLI에 없지만 **일괄 갱신 명령 `code --update-extensions` 가 존재한다**(`code --help` 실측 확인). 따라서 마켓플레이스 API 호출은 하지 않는다. 항목은 **소스 전체를 대표하는 단일 집계 항목 하나**(`vscode:__all__`, `risk=auto`)로 낸다 — 확장 40여 개를 개별 행으로 내면 최신 여부를 모르는 채 목록만 불어난다. 업그레이드 실행은 `--update-extensions` 1회이고, **실행 전후로 `--list-extensions --show-versions` 를 떠서 diff로 무엇이 올라갔는지 사후 보고**한다(최신 조회 없이 결과를 알아내는 방법). 확장 자동 갱신이 이미 켜져 있으면 이 항목은 대개 no-op이 되며, 그때도 diff가 빈 것으로 정직하게 보고된다.
      · pip: `pip list --outdated --format=json`. **`risk=never`**, `hold_reason="시스템 파이썬 의존성 — 자동 갱신 제외"`. (초안에 `hold`로 적었던 것은 설계 2의 `never` 목록·아래 검증 서술과 모순 — `never`가 옳다. 시스템 파이썬 패키지를 `/cu all`로 올리면 다른 도구의 의존성이 깨진다.)
      검증: `bash scripts/cu.sh scan | python -c "import json,sys; d=json.load(sys.stdin); [print(i['source'], i['id'], i['installed'],'->',i['latest'], i['risk']) for i in d['items'] if i['source'] in ('npm','vscode','pip')]"` → npm 6건 중 `@railway/cli`·`@shopify/cli`가 `hold`(메이저), `mcporter`·`pyright`·`undici`·`wrangler`가 `auto`; pip는 개별 항목이 아니라 집계 1행이며 `risk=never`; vscode는 `vscode:__all__` 1행이며 `needs_update=None`. 또 `code --list-extensions` 실제 개수를 확인해 계획의 수치(디렉터리 40 / Codex 관측 34)를 실측으로 확정
      의존: T3 *(P5 대응 — T3·T4가 같은 `cu.py`를 만지므로 병렬 금지, 직렬화)*

- [ ] **T5 — dedup + 위험도 정책 상수화 + 업그레이드 디스패처 확장** (모델: `fable`)
      파일: `creeta-lens/scripts/cu.py`
      변경: 파일 상단에 `HOLD_KEYWORDS`·`HOLD_WINGET_IDS`·`SPECIAL_DEDUP`(special id → {npm 패키지명, winget id}) 상수 정의. `cmd_scan()`을 소스 순회 + dedup + 위험도 부여 순서로 재작성. `cmd_upgrade()`에 `winget:`/`npm:`/`vscode:` 접두어 분기 추가(각각 `winget upgrade --id`, `npm install -g <pkg>@latest`, `code --install-extension`). 기존 `scan_codex`·`scan_gh`·`_codex_install_kind`·`_gh_winget_source`·`_manual_hint` 중 소스 스캐너로 대체된 것 제거 — **단, 자기 변경이 만든 orphan만 제거**하고 무관한 코드는 손대지 않는다.
      **사전 스냅샷 (Codex 채택)**: 업그레이드 실행 직전의 스캔 결과 전체를 `~/.claude/lens/cu-last-scan.json` 에 그대로 쓴다. 무확인 실행이라 "무엇이 어떤 버전에서 어떤 버전으로 갔는지"를 사후에 재구성할 수단이 필요하다 — 실행 후에는 이전 버전을 알 방법이 없다. `scripts/upgrade.py` 의 백업 패턴에서 아이디어만 차용하며 그 파일은 수정하지 않는다. 스냅샷은 매 실행마다 덮어쓴다(이력 누적은 요청 범위 밖).
      검증: `bash scripts/cu.sh scan | python -c "import json,sys; d=json.load(sys.stdin); ids=[i['id'] for i in d['items']]; assert len(ids)==len(set(ids)), 'dup!'; assert not any(i.startswith('npm:@anthropic-ai/claude-code') for i in ids), 'claude dup'; print('ok', len(ids))"` → 중복 0, claude/codex가 두 줄로 나오지 않음. 그리고 `python scripts/cu.test.py` → exit 0 (T0의 4개 불변식 전부 통과). 업그레이드 1건 실행 후 `~/.claude/lens/cu-last-scan.json` 이 실행 전 버전을 담고 있음
      의존: T0, T2, T3, T4

- [ ] **T6 — SKILL.md 절차 재작성** `[P]` (모델: `sonnet`)
      파일: `creeta-lens/skills/cu/SKILL.md`
      변경: Step 3의 `AskUserQuestion` 강제를 삭제하고 "auto 전량 무확인 실행 → hold 보고" 절차로 교체. 절대 규칙 중 "Never run an upgrade the user didn't explicitly pick"을 "auto 등급은 확인 없이 실행. hold 등급은 절대 자동 실행하지 않음"으로 교체. `/cu` / `/cu all` / `/cu scan` 3모드 표 추가. 위험도 분류 기준표(auto/hold 6조건) 추가. 스캔 출력이 객체로 바뀐 것과 `source_errors` 보고 의무 반영. 종료코드 표 유지.
      **재스캔 규칙 교체 (Codex 분기 5 채택)**: 현행 `Don't re-scan after each upgrade` 를 **"항목별 재스캔은 하지 않는다. 단 전체 실행 완료 후 1회 전체 재스캔은 필수"** 로 교체. 무확인 실행으로 바뀌면 사용자가 "실제로 무엇이 올라갔나"를 확인할 유일한 수단이 사후 재스캔이기 때문이다.
      **실행 전 예고 의무 추가**: 업그레이드를 시작하기 **전에** "auto N건을 확인 없이 실행합니다 / hold M건은 건드리지 않습니다" 를 먼저 출력한다(R6 대응). 사후 보고만 있으면 사용자가 게이트 제거를 인지하지 못한 채 실행을 겪는다.
      검증: SKILL.md에 `AskUserQuestion` 문자열이 남아 있지 않음 — `grep -c AskUserQuestion skills/cu/SKILL.md` → 0. `/cu all`·`/cu scan`·auto/hold/never 3단계 표가 존재 — `grep -cE '/cu all|risk|hold|never' skills/cu/SKILL.md` → 3 이상. 재스캔 금지 문구가 교체됐음 — `grep -c "Don't re-scan after each upgrade" skills/cu/SKILL.md` → 0. **`source_errors` 보고 의무가 명시됐음** — `grep -c source_errors skills/cu/SKILL.md` ≥ 1 이고, 문서에 "비어있지 않으면 소스명과 사유를 최종 보고에 반드시 표시" 취지가 적혀 있음 (P7 대응 — 필드 존재만으로는 보고를 보장하지 못한다)
      의존: 없음 (T1~T5와 병렬 가능)

- [ ] **T7 — 실측 전수 검증** (모델: `fable`)
      파일: (실행 검증 — 파일 변경 없음)
      변경: 없음. 실제 이 컴퓨터에서 `/cu` 전체 흐름을 돌린다.
      검증: ① `python scripts/cu.test.py` exit 0 ② `bash scripts/cu.sh scan` 이 winget·npm·plugin·vscode 항목을 모두 담아 exit 0 ③ **오탐 2건 해소 확인** — agentmemory·insane-search가 각각 `needs_update=False`(설치본 = 마켓 클론 plugin.json 버전) ④ `auto` 항목을 실제 업그레이드해 exit 0 ⑤ 업그레이드 후 전체 재스캔 시 해당 항목이 ✅로 바뀜 ⑥ `hold` 항목은 건드려지지 않았음 — PostgreSQL·Node.js·Python·VCRedist 버전이 실행 전과 동일 ⑦ VS Code `--update-extensions` 전후 diff가 보고에 나옴
      **검증 순서 고정**: ③(hold 분류가 옳음)을 먼저 증명한 뒤에 ④(실제 업그레이드)로 넘어간다. 순서를 뒤집으면 분류 버그가 있을 때 검증 자체가 사고가 된다.
      의존: T5, T6

- [ ] **T8 — 릴리즈** (모델: `sonnet`)
      파일: `creeta-lens/CHANGELOG.md`, 버전 참조 14곳(스크립트가 처리)
      변경: `bash scripts/bump-version.sh 3.26.0` 실행(N/14 자가검증 확인) → CHANGELOG에 이번 변경 기록 → commit → tag `v3.26.0` → push → `git show`로 태그 ref 확인. 마켓플레이스 `source.ref`가 git 태그를 가리키므로 **태그를 안 올리면 옛 코드가 설치된다.**
      검증: `git show v3.26.0 --stat | head` 이 이번 커밋을 가리키고, `grep -c '3\.26\.0' .claude-plugin/marketplace.json` ≥ 1
      의존: T7

#### 막힐 수 있는 지점 (→ Plan B 트리거)

- **W1 — winget 출력 파싱 실패**: 이름·버전 컬럼이 로케일이나 긴 이름 때문에 어긋나 `installed`/`latest`가 깨진다. 증상: T3 검증에서 VC++ Redist 항목의 버전이 이름 조각으로 오염.
- **W2 — 비승격 winget 업그레이드가 UAC로 멈춤**: `--disable-interactivity`가 winget 내부 프롬프트는 막지만 OS 권한 상승 대화상자는 못 막는다. 증상: T7에서 업그레이드가 반환되지 않고 대기.
- **W3 — 항목 수 폭증으로 보고가 읽을 수 없어짐**: 25건 + 향후 증가. 증상: 표가 화면을 넘겨 사용자가 hold 목록을 못 찾는다.
- **W4 — `npm outdated -g --json` 이 비정상 종료코드 반환**: outdated가 있으면 npm이 exit 1을 낸다(정상 동작). 증상: `run()`이 실패로 간주해 소스 전체가 빠진다.

### Plan B — Fallback 경로

#### Trigger

- **W1 발생 시(winget 파싱 붕괴)** → winget 스캐너를 **표 파싱에서 `winget upgrade --include-unknown` 대신 다른 수단으로 전환**한다.
- **W2 발생 시(UAC 멈춤)** → winget 항목의 자동 실행을 **전면 hold로 강등**한다.

#### 왜 이 대안인가

Plan A보다 커버리지가 낮다(winget 자동 실행이 빠지거나, 표시 정보가 줄어든다). 그러나 **잘못 자동 실행해서 사용자 머신을 흔드는 것보다 낫다.** 자동화 범위를 줄이는 방향의 fallback이므로 실패 시에도 안전한 쪽으로 떨어진다.

#### 단계

- [ ] **B1 (W1 대응)**: winget 파싱을 `--include-unknown` 표 대신 **id 단위 조회로 전환**한다. `winget list` 로 id 목록만 확보하고(첫 컬럼이라 파싱이 안정적), 각 id에 대해 `winget upgrade --id <id> --dry-run` 성격의 확인을 돌려 업그레이드 유무만 판정. 느리지만(항목당 1회 호출) 파싱이 깨지지 않는다.
      검증: VC++ Redist·PostgreSQL 항목의 id가 정확히 나오고 버전 필드에 이름 조각이 섞이지 않음
- [ ] **B2 (W1 심화)**: 그래도 불안정하면 winget을 **보고 전용 소스**로 둔다 — 항목 수와 `winget upgrade` 명령 한 줄만 제시하고 개별 항목은 열거하지 않는다. 사용자가 직접 실행. "19개 대기 중"이라는 가시성만이라도 확보하면 현재 상태(0건 보고)보다는 낫다.
      검증: `/cu` 보고에 "winget 업그레이드 대기 N건 — `winget upgrade --all` 로 처리" 한 줄이 나옴
- [ ] **B3 (W2 대응)**: `net session` 판정에 의존하지 말고, **winget 항목 1개로 선행 시험 실행**을 한다. 타임아웃(30초) 내에 반환되지 않으면 그 소스 전체를 hold로 강등하고 사용자에게 "관리자 PowerShell에서 `winget upgrade --all`" 을 안내한다.
      검증: 선행 시험이 타임아웃될 때 winget 항목 전부가 `hold`로 표시되고 `/cu`가 멈추지 않고 종료
- [ ] **B4 (W3 대응)**: 보고를 **소스별 요약 + hold 상세**로 압축한다. auto는 "winget 12건 완료" 처럼 집계만, hold는 전체 열거(판단이 필요한 쪽이므로). 실패 항목은 항상 전체 열거.
      검증: 항목 25건일 때 보고가 화면 한 눈에 들어오고 hold·실패는 빠짐없이 보임
- [ ] **B5 (W4 대응)**: npm 호출을 종료코드 무시 + stdout JSON 유무로 판정하도록 바꾼다. `npm outdated`는 outdated 존재 시 exit 1이 정상이다.
      검증: npm 6건이 정상적으로 스캔 결과에 들어옴

## 🔀 검토된 대안 (Alternatives Considered)

**대안 A — `winget upgrade --all` 을 그대로 호출 (개별 항목 관리 없음)**
- *Good, because* 구현이 거의 공짜다. 한 줄이면 19건이 다 올라간다. 파싱 로직도, 위험도 표도 필요 없다.
- *Bad, because* **PostgreSQL·Node.js·Python·VC++ Redist가 같이 올라간다.** 사용자가 어떤 게 올라갔는지 사후에 알 수 없고, 되돌릴 대상을 특정할 수 없다. `/cu`가 보고 도구로서의 가치를 잃는다. 게다가 비승격에서는 일부만 성공하고 일부는 조용히 실패해, "다 됐다"는 잘못된 인상을 남긴다.
- **기각** — 사용자가 원한 것은 "묻지 마라"이지 "구분하지 마라"가 아니다. 되돌리기 어려운 것을 예고 없이 올리는 것은 요청 범위를 넘는 파괴적 동작이다.

**대안 B — 위험도를 사용자 설정 파일(`~/.claude/cu-policy.json`)로 뺀다**
- *Good, because* 사용자가 자기 판단으로 hold 목록을 조정할 수 있다. 머신마다 다른 정책도 가능하다.
- *Bad, because* 지금 그 요구가 없다. 요청은 "다 조회하고 다 올려라"였고 정책 편집 얘기는 없었다. 설정 파일이 생기면 파일이 없을 때·깨졌을 때·머신 간 동기화 처리가 붙고, 사용자가 파일을 만들어야 동작이 바뀌는 구조가 된다.
- **기각** — 요청하지 않은 "설정 가능성"이다(단순함 우선 원칙). 정책은 코드 상단 상수로 두고, 조정이 필요해지면 그때 파일로 뺀다.

**대안 C — 스캔 결과를 캐시해서 두 번째 실행부터 빠르게 한다**
- *Good, because* winget·npm·github 조회가 수십 초 걸린다. 캐시가 있으면 재실행이 즉시다.
- *Bad, because* 업데이트 확인 도구에서 캐시는 **오래된 정보를 최신이라고 보고할 위험**을 만든다. TTL·무효화·강제 갱신 플래그가 붙어 복잡도가 늘고, 실행 빈도는 하루 몇 번 수준이라 이득이 작다.
- **기각** — 정확성을 속도와 바꾸는 거래인데, 이 도구의 존재 이유가 정확성이다.

**대안 D — Codex/외부 LLM에게 "무엇이 안전한지" 판단을 맡긴다**
- *Good, because* 하드코딩 키워드 목록 없이도 새 패키지의 위험도를 유연하게 판정할 수 있다.
- *Bad, because* 업데이트 실행 여부가 모델 응답에 의존하게 된다 — 인증 만료·네트워크·모델 변경으로 정책이 흔들린다. 같은 입력에 다른 판정이 나올 수 있고, 사후에 "왜 이게 올라갔나"를 재현할 수 없다.
- **기각** — 실행 정책은 결정적(deterministic)이어야 한다. `/cs`가 PR 본문에 LLM 분석을 넣지 않는 것과 같은 이유다.

### 🔀 듀얼 합성 (Claude ‖ Codex)

Codex(`gpt-5.6-sol`, xhigh, 300초 상한 내 정상 완료)가 레포를 독립적으로 읽고 자기 안을 냈다. 아래는 합의/분기 분류와 분기의 해소 근거다.

**합의 (고신뢰 — 그대로 lock)**

- **패키지 매니저 열거로 CLI 하드코딩 제거** — Codex는 "Provider 레지스트리", 나는 "소스 단위 스캐너". 이름만 다르고 구조가 같다. 공통 인터페이스로 scan/upgrade를 두고 매니저가 전체 목록을 열거하게 한다는 점까지 동일.
- **같은 타입만 비교** — Codex의 `identity_type(semver/SHA)` 정규화 = 내 "형태 불일치 시 `needs_update=None`" 가드. 오탐의 근본 원인 진단이 독립적으로 일치했다.
- **source가 로컬 경로면 내부 `plugin.json` 버전을 읽는다** — 핵심 수정에 대해 두 모델이 같은 경로를 지목했다. 나는 실제 파일을 열어 값(0.9.28 / 0.13.0)까지 확인했다.
- **auto-safe 기본 + 질문 제거, 위험군 제외** — Codex의 제외 목록(관리자 권한·재부팅·드라이버·서비스·DB·런타임)이 내 hold 6조건과 실질 동일. 독립 도출된 같은 경계선이라 신뢰도가 높다.
- **순차 실행 + 실패 시 해당 소스 중단** — 병렬 업그레이드를 하지 않는다는 판단 일치.
- **리스크 3개** — Codex의 ①winget 일괄 실행이 런타임·DB·서비스를 건드림 ②메이저 업데이트가 호환성 파괴 ③semver/SHA 혼합·중복 감지로 이중 업데이트. 각각 아래 R1·R2, R1, R3·R4와 대응한다. 새로 추가할 리스크는 없었다.

**분기 → 해소 (전부 Codex 채택. 코드로 재확인 후 판정)**

- **분기 1 — 오탐이 몇 건인가.** Claude=agentmemory 1건 / Codex=agentmemory + **insane-search** 2건.
  → **Codex 채택.** 현재 스캔을 다시 떠서 확인: `insane-search installed=0.13.0 latest=687824e6d5f3 needs_update=True`. **오늘 오전에 0.13.0으로 올린 직후인데 또 "업데이트 있음"으로 나온다.** 최신 상태에서 재현되는 오탐이므로 Codex 지적이 정확하다. 오전 실행에서 실제 업데이트가 있었던 것은 사실이지만 표시된 `latest` 값(SHA)은 처음부터 무의미했고, 방향이 우연히 맞았을 뿐이다. 아래 설계 3과 검증 표에 insane-search를 추가한다.

- **분기 2 — VS Code 확장 갱신 수단.** Claude="CLI에 최신 조회 수단이 없으니 요약만" / Codex="`--update-extensions` 로 일괄 갱신 + 전후 diff".
  → **Codex 채택.** `code --help` 실측: `--update-extensions  Update the installed extensions.` **존재한다.** 개별 항목의 최신 버전을 조회할 수단은 여전히 없다는 내 판단은 맞지만, **개별 조회 없이 일괄 갱신이 가능**하므로 마켓플레이스 API가 애초에 필요 없다. 훨씬 단순한 경로이고 이쪽이 옳다. 설계를 "전후 `--list-extensions --show-versions` diff로 무엇이 올라갔는지 사후 확인" 으로 교체한다.

- **분기 3 — 테스트를 쓸 것인가.** Claude=실측 검증만(T7) / Codex="fixture 기반 단위 테스트를 **먼저** 작성".
  → **Codex 채택.** 근거 둘. ① 사용자 지침 4규칙 중 Rule 4가 코드 작업에 TDD 우선을 명시한다. ② 레포에 이미 관행이 있다 — `lib/install-sync.test.js`(의존성 없는 단독 node 스크립트, `assert`만, exit 0 iff 전체 통과). winget 표 파서는 특히 fixture가 정당하다: 로케일·긴 이름·비ASCII 케이스를 **실제 머신 상태에 의존하지 않고** 재현할 수 있고, 실측(T7)만으로는 이 컴퓨터의 현재 winget 출력에서 안 나타나는 케이스를 영원히 못 잡는다. 신규 태스크 T0으로 넣고 T3보다 앞에 둔다.

- **분기 4 — 재사용할 기존 자원.** Claude=`cu.py` 헬퍼·`upgrade.sh` / Codex=**`lib/install-sync.js`** 의 플러그인 열거 폴백, `scripts/upgrade.py` 의 백업·롤백 패턴.
  → **부분 채택 (Codex 지적은 옳고, 재사용 방식만 조정).** `lib/install-sync.js:161`에 `Parse installed_plugins.json (cu.py fallback path)` 라는 주석이 실제로 있다 — `/ci`가 이미 같은 레지스트리를 파싱하며 `cu.py`를 인지하고 있고, `claude plugin list` 텍스트 파싱 경로까지 갖췄다. **다만 그쪽은 Node, `cu.py`는 Python이다.** 코드를 물리적으로 공유하려면 Python이 node를 shell out 해야 하는데, 그건 스캔 한 번에 프로세스 계층을 하나 더 얹는 일이다(단순함 우선 위반). **판정: 코드 공유는 하지 않고, 버전 해석 규칙만 두 파일에서 일치시킨다.** `install-sync.js`가 나중에 같은 오탐을 갖지 않도록 아래 Side Effect에 일관성 요구로 명시한다. `upgrade.py`의 스냅샷 패턴은 아이디어만 차용한다(파일은 DO NOT CHANGE 유지).

- **분기 5 — 실행 후 재스캔.** Claude=검증 단계에서만 재스캔 / Codex="마지막에 전체 재스캔" + "SKILL.md의 재스캔 금지 규칙을 교체해야 한다".
  → **Codex 채택.** 현행 SKILL.md에 `Don't re-scan after each upgrade` 규칙이 실제로 있다. 항목마다 재스캔하지 말라는 취지는 타당하지만, **무확인 자동 실행으로 바뀌면 "무엇이 실제로 올라갔는지" 사용자가 확인할 유일한 수단이 사후 재스캔**이다. 규칙을 "항목별 재스캔 금지, 전체 실행 후 1회 재스캔 필수"로 교체한다. T6에 포함.

- **분기 6 — VS Code 확장 수.** Claude=40(디렉터리 수) / Codex=34(활성).
  → **Codex 쪽이 정확할 가능성이 높다.** 확장 디렉터리에는 이전 버전 잔재가 남으므로 디렉터리 수는 실제 활성 확장 수보다 크다. 계획의 수치를 `--list-extensions` 기준으로 재확인하도록 T4 검증에 반영한다. 판단에 영향은 없다(둘 다 "0건 탐지"라는 문제 규모는 동일).

**Codex가 지적한 제약 중 계획에 없던 것**

- **`cu` 전용 테스트가 현재 0개** — 분기 3에서 T0으로 해소.
- **`scripts/cu.sh`는 Python 무의존 래퍼** — 이미 DO NOT CHANGE로 지정돼 있어 추가 조치 불필요. 두 모델이 같은 결론.

### ⚠️ 사전 리스크 (Pre-mortem)

Codex는 Phase 0.5에서 독립 조사를 이미 수행했고 그 리스크 시각은 위 듀얼 합성에 통합됐다(규칙에 따라 Codex pre-mortem 중복 호출 생략). 아래는 **통합안에 대한 Claude 단독 pre-mortem** — 발견 항목당 한 줄.

**P1 — `/cu all`이 데이터베이스를 자동 업그레이드한다 (데이터 손실 우려 · 최고 심각도)**
`/cu all`이 hold를 전부 실행하도록 설계했는데, hold에는 PostgreSQL이 들어 있다. DB 업그레이드는 데이터 디렉터리 마이그레이션을 유발할 수 있고, 이건 되돌릴 수 없다. "사용자가 `all`을 타이핑했으니 승인"이라는 논리는 오타 한 번(`/cu all`)으로 DB가 올라가는 것을 정당화하지 못한다.
→ **계획 수정 반영**: `hold` 아래에 **`never` 3단계**를 추가한다. `never`는 `/cu all`로도 실행되지 않고 명령만 제시한다. 대상: 데이터 디렉터리를 가진 소프트웨어(PostgreSQL·MySQL·MongoDB·Redis), 드라이버, winget 자신(App Installer). 나머지 hold(메이저 점프·런타임·시스템 구성요소)는 `/cu all`로 실행 가능.

**P2 — fixture를 손으로 쓰면 실제 출력과 어긋나 테스트가 헛돈다**
T0의 winget fixture를 사람이 타이핑하면 실제 컬럼 폭·공백 수를 못 맞춘다. 테스트는 통과하는데 실물에서 깨진다 — 최악의 조합이다.
→ **계획 수정 반영**: fixture는 **실제 `winget upgrade --include-unknown` 출력을 그대로 파일로 캡처**해서 쓴다. 손으로 작성 금지를 T0에 명시.

**P3 — winget 출력 컬럼 폭이 콘솔 폭에 따라 변하고 긴 이름이 잘린다**
winget은 콘솔 폭에 맞춰 이름을 `…`로 자르고 컬럼 폭을 조정한다. 헤더 위치 기반 파싱도 폭이 매번 다르면 fixture 한 벌로는 못 막는다.
→ **계획 수정 반영**: **id 컬럼만 신뢰하고 표시 이름은 파싱에 쓰지 않는다.** id는 공백을 포함하지 않으므로(예: `Microsoft.VCRedist.2015+.x64`) 이름보다 훨씬 안전하다. 이름은 보고용으로만 쓰고, 깨져도 판정에 영향이 없게 한다.

**P4 — pip/winget 항목이 hold 목록을 도배해 진짜 판단할 항목이 묻힌다**
pip 글로벌 outdated가 수십 건이면 hold 목록이 pip으로 뒤덮여 PostgreSQL 같은 실제 결정 대상이 안 보인다. W3(보고 폭증)의 구체적 실현이다.
→ **계획 수정 반영**: pip는 **개별 열거하지 않고 집계 한 줄**(`pip 글로벌 outdated N건 — 자동 갱신 제외`)로 낸다. 개별 항목이 필요하면 사용자가 직접 `pip list --outdated`.

**P5 — T3와 T4가 같은 파일을 병렬로 수정해 충돌한다**
둘 다 `의존: T1`로 적혀 병렬 실행으로 읽히는데, 양쪽 모두 `cu.py`에 함수를 추가한다.
→ **계획 수정 반영**: T4의 의존을 `T3`으로 바꿔 직렬화한다. 병렬 가능한 것은 T0과 T6뿐이다.

**P6 — 스캔이 winget을 두 번 호출해 시간이 배로 든다**
`winget upgrade`(업그레이드 목록) + `winget list --scope user`(승격 판정용) = 각 수십 초.
→ **계획 수정 반영**: `--scope user` 조회는 **비승격일 때만** 한다. 승격 셸이면 전부 실행 가능하므로 그 조회가 불필요하다.

**P7 — `source_errors`가 있어도 최종 보고에서 누락되면 "다 최신"으로 오해된다**
검증 10번은 필드 *존재*만 본다. 필드가 채워져도 스킬이 보고를 빼먹으면 사용자는 소스가 통째로 빠진 걸 모른다.
→ **계획 수정 반영**: T6 검증에 "`source_errors`가 비어있지 않을 때 최종 보고에 소스명과 사유가 나타남"을 추가.

**P8 — VS Code 집계 항목은 최신 여부를 모르므로 매 실행 no-op 재설치가 돈다**
`needs_update`를 알 수 없어 항목이 늘 실행 대상으로 남는다. 확장 자동 갱신이 켜져 있으면 대개 무의미한 수 초~수십 초.
→ **판단: 수용.** diff가 빈 것으로 정직하게 보고되므로 오해는 없고, 비용은 수 초 수준이다. `needs_update=None`으로 두고 보고에 "결과 diff 0건"으로 표기한다. 별도 최적화는 요청 범위 밖(단순함 우선).

**P9 — Teams 같은 날짜형 빌드번호가 메이저 점프로 오분류돼 hold된다**
`26106.1911.4707.3286 → 26183.1903.4892.4448`은 첫 성분이 달라 "메이저 점프"로 판정된다.
→ **판단: 수용.** 과보수 방향의 오분류이므로 안전하다. GUI 앱이 hold로 남는 것은 실질 피해가 없다.

**P10 — 릴리즈 후 재시작 전까지 구 코드가 돈다**
플러그인 변경은 재시작이 필요하다.
→ **판단: 기존 대응으로 충분.** T8 보고에 재시작 안내를 포함(현행 `/cu`도 같은 안내를 한다).

**Trigger 매핑 (Pre-mortem → Plan B 전환점)**

- P3는 Plan A의 W1(winget 파싱 실패)과 매핑되며, 대응이 Plan B의 B1(id 단위 조회)·B2(보고 전용)로 이미 연결돼 있다. 새 Trigger 추가 불필요.
- P4는 W3(보고 폭증)과 매핑되며 B4(소스별 요약)로 연결된다.
- P6·P8은 W-트리거 없이 Plan A 내부 수정으로 해소됐다.
- **P1은 어느 기존 Trigger에도 매핑되지 않는 신규 약점**이었다 → `never` 등급 추가로 Plan A를 보강했다(Phase 2 회귀 후 반영 완료).

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**
  - `/cu`의 성격이 "아는 도구 3개 확인기"에서 **"이 머신의 업데이트 관제"** 로 바뀐다. 소스를 추가하는 것만으로 커버리지가 늘어나는 구조가 되므로, 앞으로 scoop·choco·cargo·go install 등을 붙이는 비용이 낮다.
  - `risk` 등급 개념이 생기면 `/ci`(플러그인 설치 동기화)와 `/lens-upgrade`도 같은 어휘를 쓸 수 있다. Lens 전체에 "되돌리기 쉬움/어려움"이라는 공통 축이 생긴다.
  - 이 컴퓨터에서 19+6건이 방치돼 있었다는 사실 자체가, **Mac Mini에도 같은 상태일 가능성**을 강하게 시사한다. 이번 작업 후 Mac Mini에서 한 번 돌려보는 것이 자연스러운 후속이다(brew 소스가 그때 필요해진다).
- **⚠️ 주의점**
  - **되돌리기 어려운 단계**: `auto` 실행은 실제 소프트웨어를 바꾼다. 코드는 git revert로 돌아오지만 **업그레이드된 패키지는 돌아오지 않는다.** 그래서 T7 실측 검증에서 auto 대상을 실제로 올릴 때, hold 분류가 먼저 옳게 동작하는지 확인한 뒤 진행해야 한다. 순서를 바꾸면 검증 중에 사고가 난다.
  - **VS Code 확장 자동 갱신과의 중복**: 편집기가 이미 갱신을 하고 있으므로 `/cu`가 같은 일을 또 하면 무의미한 재설치가 생긴다. 자동 갱신 상태를 먼저 읽고 분기하는 것이 필수다.
  - **winget 자신(App Installer) 업그레이드**: winget이 자기를 업그레이드하는 중에는 이후 winget 호출이 불안정해질 수 있다. hold 대상에 반드시 포함한다.
  - **npm 글로벌 재설치와 실행 중 프로세스**: `claude`가 npm 글로벌인데, 자기 자신을 업그레이드하는 중에 세션이 돌고 있다. 현행 `claude update` 전용 경로를 유지하는 이유이며, npm generic 경로로 대체하면 안 된다.
- **🔀 Side Effect (파급 = blast radius)**
  - **사용자 머신의 실제 소프트웨어** — 가장 큰 파급. 코드 변경 범위(파일 2개)보다 실행 결과의 범위가 훨씬 넓다.
  - **`/cu` 호출부** — `scripts/cu.sh`(시그니처 유지)와 SKILL.md. 스캔 출력 형태를 배열→객체로 바꾸므로, cu.sh를 부르는 다른 곳이 있으면 깨진다. (현재 확인된 호출부는 SKILL.md뿐)
  - **`/lens-upgrade` 경로** — `cu.py`가 `upgrade.sh`를 호출하는 연결은 유지한다. 이 연결을 건드리면 lens 자체 업그레이드의 롤백이 위험해진다.
  - **`/ci` (`lib/install-sync.js`)** — 같은 `installed_plugins.json`을 파싱하며 161행 주석이 `cu.py`를 명시적으로 언급한다. `/cu`는 읽기만 하므로 충돌은 없지만, **버전 해석 규칙이 어긋나면 두 스킬이 같은 플러그인에 다른 버전을 보고한다.** 이번에 고치는 규칙(로컬 경로 source → 내부 `plugin.json`, semver↔SHA 비교 금지)을 `install-sync.js`도 따르는지 확인해야 한다. 이번 범위에서 `install-sync.js`를 **수정하지는 않되**, 어긋난다면 후속 태스크로 분리해 남긴다(무관한 파일을 이번 변경에 끌어들이지 않는다).
  - **릴리즈 파이프라인** — 버전 14곳 + 마켓플레이스 태그. `bump-version.sh` 없이 손으로 고치면 일부만 올라가 설치본과 표시 버전이 어긋난다.

## ⚠️ 리스크 레지스터

| ID | 리스크 | 트리거 | 영향 | 대응 | 중단 조건 |
|---|---|---|---|---|---|
| R1 | 무확인 자동 실행이 되돌리기 어려운 소프트웨어를 올린다 (PostgreSQL 데이터 디렉터리 마이그레이션, Node.js 라인 이동) | `risk` 분류가 누락되거나 키워드가 새 패키지 이름을 못 잡음 | **높음** — 로컬 DB나 런타임이 예고 없이 바뀌어 프로젝트가 안 도는 상태가 될 수 있다 | 판정 불가는 무조건 `hold`로 보수 처리(fail-safe 방향 고정). DB·드라이버·winget자신은 `/cu all`로도 안 도는 `never` 등급(P1). `HOLD_KEYWORDS`/`NEVER_KEYWORDS`를 상수 한 곳에 모아 감사 가능하게. T0 불변식 ③이 `/cu all` 대상에 `never`가 없음을 단정하고, T7이 hold·never 항목의 버전 불변을 재스캔으로 증명 | hold/never로 분류돼야 할 항목이 auto로 넘어간 사례가 T0·T7에서 1건이라도 나오면 즉시 중단하고 분류 로직 재설계 |
| R2 | 비승격 winget 업그레이드가 UAC 대화상자로 멈춰 `/cu`가 응답 없이 대기 | 머신 스코프 패키지를 비승격 셸에서 업그레이드 시도 (**이 컴퓨터가 현재 비승격 상태로 확인됨**) | 중간 — 세션이 멈추고 사용자가 강제 중단해야 함 | `net session` 승격 판정 + `winget list --scope user` 교차 확인으로 사전 hold. 그래도 발생하면 Plan B의 B3(선행 시험 + 30초 타임아웃) 발동 | 선행 시험이 타임아웃되면 winget 소스 전체를 hold로 강등하고 자동 실행 포기 |
| R3 | winget 표 파싱이 긴 이름·로케일 때문에 어긋나 잘못된 버전으로 판정 | 이름에 공백·괄호·비ASCII가 있는 패키지 (예: VC++ Redistributable, WeChat) | 중간 — 오탐/미탐. 최신인데 업그레이드를 시도하거나 그 반대 | 헤더 위치 기반 컬럼 경계 파싱. T3 검증에서 VC++ Redist 항목을 명시적으로 확인 | 파싱 정확도가 T3에서 확보되지 않으면 Plan B의 B1(id 단위 조회) → B2(보고 전용)로 순차 강등 |
| R4 | semver ↔ SHA 비교 오탐이 다시 들어온다 | 새 마켓플레이스가 또 다른 버전 표기를 쓴다 | 낮음 — 잘못된 경고가 반복되면 사용자가 표를 안 믿게 됨 | 형태 불일치 시 `needs_update=None` 가드를 `needs_update` 계산부 **한 곳**에 둔다. 여러 곳에 흩어지면 새 소스에서 다시 새어나온다 | 오탐이 재발하면 플러그인 소스를 ❓ 표시 전용으로 두고 자동 실행에서 제외 |
| R5 | 스캔이 오래 걸려 `/cu`가 체감상 멈춘 것처럼 보인다 | winget(수십 초) + npm + github 조회 직렬 실행 | 낮음 — 사용자 불편, 기능 손상은 없음 | 소스별 타임아웃을 `run()`의 기존 120초 규약으로 통일하고, 스킬이 스캔 시작 시 "소스 N개 조회 중" 한 줄을 먼저 보고 | 단일 소스가 120초를 넘기면 그 소스를 `source_errors`에 넣고 나머지로 진행 |
| R6 | 기존 `/cu` 사용자가 확인 게이트가 사라진 것을 모르고 `/cu`를 쳐서 예상 밖 업그레이드가 실행된다 | 이번 릴리즈 직후 첫 실행 | 낮음 — 다만 auto 등급만 실행되므로 되돌릴 수 있는 범위 | CHANGELOG에 파괴적 변경으로 명시. `/cu` 실행 첫 줄에 "auto 등급 N건을 확인 없이 실행합니다 / hold M건은 건드리지 않습니다"를 **실행 전에** 표시 | 해당 없음 (의도된 변경) |

## ❓ 미해결 질문

**차단 (답이 없으면 실행 불가)**
- (없음)

**비차단 (가정을 두고 진행)**
- ~~VS Code 확장을 개별 항목으로 관리할 가치가 있는가?~~ → **해소 (2026-07-30, Codex 분기 2).** `code --update-extensions` 가 존재함을 실측 확인했으므로 마켓플레이스 API도, 개별 항목 열거도 필요 없다. 단일 집계 항목 + 전후 diff로 확정.
- `hold` 목록을 `/cu` 실행마다 계속 보여주면 소음이 되는가? — **가정**: 매번 전체 표시한다. 사용자가 판단해야 하는 유일한 부분이므로 숨기지 않는다. · **확인 시점**: 릴리즈 후 사용자 피드백. 소음이 되면 "지난 실행과 동일하면 접기" 를 검토(지금 만들지 않음).
- pip 글로벌을 아예 목록에서 뺄지, hold로 보여줄지 — **가정**: hold로 보여준다. 사용자가 "다 조회를 못하고 있는거 같은데"라고 했으므로 가시성 요구가 명확하다. · **확인 시점**: T4 검증에서 pip outdated 항목 수를 보고 판단(0건이면 실질 무의미).
- Mac Mini(brew) 소스를 이번에 함께 구현할지 — **가정**: 코드 구조에 `brew` 소스 자리를 만들되 이번 검증은 Windows에서만 한다. brew 스캐너 자체는 짧으므로 넣어두고, 실측은 Mac Mini에서 별도 확인. · **확인 시점**: T4 구현 시.

## ✅ Review — 검증

**검증 전략 (어디까지·어떻게·보고)**

- **수단**: 이 컴퓨터에서 `bash scripts/cu.sh scan` 과 `bash scripts/cu.sh upgrade <id>` 를 **실제로 실행**한다. 브라우저·DB가 없으므로 Playwright·SQL은 쓰지 않는다. 스캔 결과 JSON은 python으로 파싱해 필드 단위로 단정한다.
- **범위**: 스캔 정확성(소스 5종 전부 열거·중복 0·오탐 0), 위험도 분류 정확성(hold 대상이 실제로 hold), auto 실행 성공, hold 미실행 증명. **hold 항목은 검증 과정에서도 실행하지 않는다** — 검증이 사고가 되면 안 된다.
- **보고**: 소스별 항목 수 + auto 실행 결과(성공/실패) + hold 목록 + 재스캔 대조(before/after 버전)를 표로 대화에 남긴다. 각 검증 행의 명령 출력을 그대로 붙여 `/goal` 평가자가 판정할 수 있게 한다.

| # | 목표가 됐다는 신호 | 확인 방법 (명령/관측) | 통과 판정 | 종류 |
|---|---|---|---|---|
| 1 | 업데이트 가능한 것이 종류를 가리지 않고 한 목록에 뜬다 | `bash scripts/cu.sh scan \| python -c "import json,sys;d=json.load(sys.stdin);from collections import Counter;print(Counter(i['source'] for i in d['items']))"` | `winget`·`npm`·`plugin` 키가 모두 존재하고 winget ≥ 15, npm ≥ 5 | auto |
| 2 | winget 프로그램이 잡힌다 (이전엔 0건) | 위 스캔에서 `source=='winget'` 항목 수 | ≥ 15 (실측 대기 19건 기준) | auto |
| 3 | npm 글로벌 도구가 잡힌다 (이전엔 claude·codex만) | 위 스캔에서 `source=='npm'` 항목 id 목록 | `wrangler`·`pyright`·`mcporter`·`undici` 포함 | auto |
| 4 | 같은 도구가 두 줄로 뜨지 않는다 | `... assert len(ids)==len(set(ids))` + `npm:@anthropic-ai/claude-code` 부재 확인 | assert 통과, exit 0 | auto |
| 5 | 플러그인 오탐 2건이 사라진다 | 스캔에서 agentmemory·insane-search의 `installed`/`latest`/`needs_update` | agentmemory `0.9.28`/`0.9.28`/`False`, insane-search `0.13.0`/`0.13.0`/`False` | auto |
| 5b | semver↔SHA 오탐이 구조적으로 재발할 수 없다 | `python scripts/cu.test.py` (T0 불변식 ②) | exit 0 — `("0.9.28","8c90741c633c")` → `None` 단정 통과 | auto |
| 6 | 버전 모름 플러그인이 판정된다 | 스캔에서 context7·playwright의 `needs_update` | `None` 이 아님 (SHA 대 SHA 비교 성립) | auto |
| 7 | 사용자가 선택하지 않아도 안전한 항목이 올라간다 | `/cu` 실행 후 대화 기록에 `AskUserQuestion` 호출이 없고, auto 항목 업그레이드 종료코드가 남는다 | 질문 0회, auto 항목 전부 exit 0 (또는 실패가 보고됨) | manual |
| 8 | 되돌리기 어려운 것은 자동으로 건드려지지 않는다 | `/cu` 실행 전후 `winget list --id PostgreSQL.PostgreSQL.18` / `OpenJS.NodeJS.LTS` / `Python.Python.3.13` / `Microsoft.VCRedist.2015+.x64` 버전 대조 | 네 항목 모두 버전 변화 없음 | auto |
| 8b | 데이터베이스는 `/cu all`에도 안 올라간다 | `python scripts/cu.test.py` (T0 불변식 ③의 `/cu all` 대상 단정) + `never` 항목의 `risk` 값 확인 | exit 0 — `/cu all` 실행 대상 목록에 `winget:PostgreSQL.PostgreSQL.18` 부재 | auto |
| 9 | 손대지 않은 항목에 이유와 명령이 함께 나온다 | `/cu` 최종 보고의 hold 절 | 각 hold 항목에 `hold_reason` 과 실행 명령이 한 줄씩 있음 | manual |
| 10 | 소스 조회 실패가 조용히 묻히지 않는다 | 스캔 결과의 `source_errors` 필드 존재 확인 (없는 소스: scoop·choco·brew) | 필드가 존재하고, 미설치 소스는 오류가 아니라 목록에서 빠짐 | auto |
| 11 | 스킬 문서에서 확인 게이트가 제거됐다 | `grep -c AskUserQuestion skills/cu/SKILL.md` | `0` | auto |
| 12 | 3모드가 문서화됐다 | `grep -E '/cu all\|/cu scan' skills/cu/SKILL.md` | 두 모드 모두 매치 | auto |
| 13 | 릴리즈가 태그까지 반영됐다 | `git show v3.26.0 --stat \| head -5` | 이번 커밋을 가리킴 | auto |
| 14 | winget 표 파싱이 까다로운 이름에서 깨지지 않는다 | `python scripts/cu.test.py` (T0 불변식 ①) | exit 0 — VC++ Redist·Notion 7.23.0 fixture 행이 정확히 파싱됨 | auto |
| 15 | 무엇이 올라갔는지 사후에 추적할 수 있다 | 업그레이드 후 `~/.claude/lens/cu-last-scan.json` 과 재스캔 결과 대조 | 실행 전 버전이 스냅샷에 남아 있어 before/after 대조가 성립 | auto |

## 진행상황

- **마지막 업데이트**: 2026-07-30
- **현재 경로**: Plan A (Plan B 전환 없음 — W1~W4 트리거 미발동)
- **Goal 달성**: QA 실측 대기 (4개 기준 중 3개는 정적 검증 완료, 2번 기준은 실제 업그레이드 필요)
- **재개 포인트**: Codex 재리뷰 통과 확인 → T7 실측(auto 실행) → T8 릴리즈 v3.26.0

### 편차 기록 (계획 ↔ 실제)

- **T1~T5를 순차 1개 Worker로 묶음** → 계획은 태스크 5개였지만 전부 같은 `cu.py`를 수정하므로 병렬 Worker가 서로를 덮어쓴다. 진짜 병렬은 T0(신규 파일)·T6(다른 파일) 2개뿐이었다. (이유: 계획 단계에서 파일 단위 충돌을 태스크 분할에 반영하지 못했다. P5가 T3·T4만 지적했으나 실제로는 T1~T5 전체가 같은 문제였다.)
- **T7을 별도 Worker가 아니라 QA 단계로 흡수** → T7은 성격상 검증이므로 `/cc` Phase 6 QA와 중복이었다.
- **`never` 가드를 실행 경계(`cmd_upgrade`)에 신설** → 계획에 없던 코드. `upgrade_targets()`가 never를 제외하도록 설계했으나, **실행 흐름은 그 함수를 경유하지 않는다** — 에이전트가 스캔 JSON을 읽고 `cu.sh upgrade <id>`를 개별 호출하는 구조라 `upgrade_targets`는 테스트에서만 불리는 죽은 방어선이었다. P1(데이터 손실)이 문서로만 막혀 있었다. Codex·Supervisor가 독립적으로 같은 지점을 지적. `never_reason()` + `cmd_upgrade` 진입부 게이트로 코드 강제.
- **`upgrade_targets`의 mode 판정을 화이트리스트로 반전** → `mode != "default"` 였으므로 오타·빈 문자열 등 미지의 값이 전부 hold 를 포함시켰다(fail-open). "판단 불가는 보수 처리"라는 이 계획 자신의 원칙과 반대였다.
- **`needs_update is False` 항목을 실행 대상에서 제외** → 계획은 "risk=auto 전부 실행"이었다. 스캔이 최신 여부와 무관하게 설치된 플러그인·CLI를 전부 내보내므로, 무관한 항목 하나가 낡으면 최신 플러그인까지 매번 재설치된다.
- **스냅샷을 `scan --snapshot` 명시 플래그로 전환** → 계획은 "매 스캔마다 기록"이었는데, SKILL.md가 실행 후 전체 재스캔을 필수로 요구하므로 그 재스캔이 업그레이드 전 상태를 덮어써 before/after 대조가 불가능해진다. (Supervisor는 `cu-prev-scan.json` 보존을 제안했으나, 호출 지점에서 의도를 명시하는 플래그 쪽이 실수로 덮어쓸 수 없어 채택.)
- **`/cu scan` 조기 종료 명시** → SKILL.md 절차가 3모드 공용인데 scan 모드에서 멈추는 분기가 없어, `/cu scan`이 실제로 업그레이드를 실행했다.
- **"모두 최신" 종료 조건 수정** → 소스가 실패했는데 나머지가 최신이면 `source_errors` 보고 전에 "모두 최신"으로 끝났다. `vscode:__all__`은 `needs_update`가 항상 `null`이라 이 조건에서 영원히 실행되지 않는 문제도 함께 있었다.
- **winget 실패 판정 기준 교체** → `if rc != 0 and not out:` 이라 winget이 비정상 종료하면서 stdout에 진단문을 쓰면 성공으로 통과하고, 파싱할 표가 없어 **소스 전체가 조용히 사라졌다**. 판정 기준을 "stdout 유무"에서 "행을 실제로 파싱했는가"로 변경.
- **비영어 로케일 가드 추가** → 헤더/요약줄 탐지가 영어 컬럼명 전용이라 다른 로케일 머신에서 0건이 조용히 나온다. 헤더 미발견을 `source_errors`로 승격.
- **`driver` 키워드를 접미사 일치로** → 토큰 정확 일치라 `Intel.WirelessDriver`(토큰 `wirelessdriver`)를 놓쳤다. 단 `redis`⊂`vcredist` 충돌 때문에 나머지 NEVER 키워드는 토큰 일치를 유지.
- **`_upgrade_winget`에 600초 상한** → `--disable-interactivity`는 winget 내부 프롬프트만 막고 OS의 UAC 대화상자는 못 막는다. `/cu all` 경로에 R2(무한 대기)가 잔존했다.
- **CJK 표시폭 경로 실캡처 테스트 추가** → 이 머신 winget 출력에 실제로 한글 패키지명이 있어(`AVC 인코더 비디오 확장`) 가설이 아닌 라이브 경로였다.
- **pip 등급 표기 모순 수정(계획서 자체)** → T4 서술은 `hold`, 설계 2와 T4 검증은 `never`로 적혀 있었다. `never`가 옳다.
- **테스트 41 → 60개** → 위 수정마다 재발 방지 단정을 추가.

### 실행 지표

- **추가 질문 수**: 0 (실행 중 사용자에게 되물은 횟수 — 승인 게이트 2회는 스킬 규정 절차로 제외)
- **편차 건수**: 15
- **게이트**: 통과 (구조 게이트 `valid:true`, 차단 질문 0, 우회 없음)
- **더블 게이트 1차**: Codex **fail**(P1 3건·P2 2건) + Supervisor **fail**(score 78, Worker A·C) → 전량 수정 후 재검증
- **오판 1건**: Leader가 배포 8분 시점에 mtime 미변경을 근거로 "Worker 3개 사망"으로 판단하고 직접 실행 전환을 선언했으나, 실제로는 세 Worker 모두 정상 동작 중이었다(212s·294s·854s 완료). **대형 계획서를 읽는 동안은 산출물이 없는 것이 정상이며, mtime 부재는 사망 근거가 못 된다.** 생존 판정 기준을 완료 알림으로 두어야 한다.
