## [3.17.0] - 2026-06-13

계획 스킬(`/cp`·`/cpp`)을 **What / Why / How / Review** 4대 골격으로 통일하고 **Why(왜)를 신규 필수 섹션**으로 도입. 지금까지 강제되던 What(목표)·How(방법)·Review(검증)에 더해 "왜 하는가"(문제·동기·안 하면 생기는 비용)를 1급 게이트로 박아 잘못된 문제를 정밀하게 푸는 계획을 차단. 더불어 `/cc`·`/ccp` 역할 경계 재조준 — `/cc`=개발(빌드), `/ccp`=개발됐거나 가동 중인 것을 전체 리뷰→QA→수정.

### Added (v3.17.0)

- **❓ Why — 계획서 신규 필수 섹션** (`skills/cp`·`cpp`). 모든 계획에 "왜 하는가"(푸는 문제·동기 + 안 하면 생기는 비용)를 명시. Karpathy Rule 1(Think Before Coding)의 문서화. 비면 게이트 reject (Fast 등급도 한 줄 필수).
- **`[WHY]` 핸드오프 페이로드 블록** (`skills/cc` Phase 0, `skills/cp` 핸드오프 프로토콜). `/cp`·`/cpp` → `/cc` 인계 시 Why 를 전달 — 실행자가 Plan B 전환·트레이드오프를 동기 기반으로 판단.

### Changed (v3.17.0)

- **What / Why / How / Review 4대 골격으로 계획 문서 재구조화** (`skills/cp` Phase 2.5 템플릿). 최상위 H2 를 `## 🎯 What — 목표` → `## ❓ Why — 왜` → `## 🛠 How — 어떻게(Plan A/B)` → `## ✅ Review — 검증` 순으로 정렬. 기존 Plan A/B·듀얼합성·Pre-mortem 은 How 하위 H3 로 이동(내용 보존). What=기존 🎯목표, Review=기존 ✅검증 그대로 매핑, Why·골격만 신규.
- **`/cp` Goal 품질 게이트 4→5조건** — "❓ Why 명시" 추가. Phase 5.0 Goal 게이트·문서 품질 규칙·Fast 등급 표·절대 규칙·Phase 순서 모두 What/Why/How/Review 로 동기화.
- **`/cpp` Spine 5→6섹션** — Why 를 필수 spine 으로 추가, 골격을 What→Why→How→Review 순으로. S0 에 Why 정의, S7 Self-Check 에 "Why 명시" 체크, 절대 규칙·Stage 순서 동기화.
- **`/cc` ↔ `/ccp` 역할 경계 재조준** (`skills/ccp` 정체성·표·관계 + frontmatter description). `/cc`=**개발(빌드)**, `/ccp`=**개발됐거나 가동 중인 것을 전체 리뷰→QA→수정**(적대적 독립 감사). 핵심 페어를 `/cpp`↔`/ccp` 에서 **`/cc`→`/ccp`** 로 명시. 파이프라인·4렌즈·만장일치·안전장치 **메커니즘은 불변**(포지셔닝/문구만). 라이브 수정은 Constitution 1(승인 게이트) 유지.

### Fixed (v3.17.0)

- (없음 — 계획 골격 보강 + 역할 경계 재조준 릴리스)

## [3.16.0] - 2026-06-11

`/cc`(실행)의 검증·완결 측 형제 **`/ccp`** 신설로 2×2 매트릭스(plan/execute × 표준/딥) 완성. 사용자 요청: "구현된 게 무엇이든 무슨 수를 써서라도(Playwright 등) 진짜 작동하는지 자가 검증하고, 안 되면 고쳐서 확실히 마무리." Codex 교차 협의(`/cpp` S4 하드게이트)로 안전장치 보강. 더불어 4개 오케스트레이션 스킬에 5분 진행보고 공통 규칙.

### Added (v3.16.0)

- **신규 skill `/ccp` (Lens Power Verify) — 적대적 검증·수복 엔진** (`skills/ccp/SKILL.md`). 이미 만들어진 것(출처 불문 — 다른 세션·수동·PR·방금 빌드)을 받아: P0 입력+"작동"의 정의 → P1 **실제 실행 베이스라인**(Playwright/앱/curl, read-only) → P2 **4 렌즈 적대적 다중검증**(Task 병렬 Skeptic; 기능·엣지오류·회귀통합·UX운영, UI면 +접근성/반응형, API면 +보안/권한, 각자 refute 기본) → P3 **만장일치 게이트**(blocking refute 1+면 fail, warning은 수용/보류 기록) → P4 **최소 수복**(실패 축만, pass 축 freeze) → P5 재검증 루프 → P6 **증거 리포트**(verified true/false). 경계(Codex 합의): `/cc`=만들면서 검증 vs `/ccp`=이미 만들어진 것 독립 감사. 다운그레이드 가드(미구현이면 `/cc` 권유).
- **Codex 교차 협의 반영 안전장치**: read-only 검증 우선, **파괴적 변경(배포·DB migration·대량삭제·외부 결제/메일·프로덕션 쓰기)은 dry-run 또는 승인 없이 금지**. 무한루프 방지 — 최대 5회 + 시간/토큰 예산 + 동일실패 2회 전략전환 + 3회 도달 시 승인. 못 끝내면 done 금지 → verified=false + blocking + 다음 액션(정직한 종료).

### Changed (v3.16.0)

- **5분 진행보고 공통 규칙** (`skills/cc`·`cp`·`cpp`·`ccp`). 장시간 작업 시 5분 주기 진행 한 줄을 4개 오케스트레이션 스킬의 기본 규칙으로 통일. `/cc` 사용자 향 기본값 #2 를 "2분"→"5분"으로 정렬(Monitor Agent 는 이미 5분 주기였음 — 일관성 확보). `/cp`·`/cpp` 절대규칙에 5분 규칙 1줄 추가, `/ccp` 는 native.
- **인벤토리 동기화**: `CLAUDE.md` Skills 표(+`/ccp` 행) + v3.16.0 feat 노트, `README.md`(`/ccp` 섹션 + 페어 안내), `scripts/bump-version.sh`(skills/ccp/SKILL.md 배너 동기화 추가, 12→13 파일). `/cpp` 절대규칙에 "검증·수복은 `/ccp`" 포인터 추가.

### Fixed (v3.16.0)

- (없음 — 신규 기능 + 공통 규칙 릴리스)

## [3.15.0] - 2026-06-11

`/cp` 와 `/cpp` 를 **fast/deep 페어**로 분리. 사용자 피드백: "빠르게 수정하고 빠른 계획 세우는 용도 vs 깊은 계획 세우는 용도, 용도에 맞게 유용하게." `/cp` 는 small 작업에도 Codex·Pre-mortem·HTML 을 강제해 "빠르지" 않았다 — 속도 등급으로 슬림화. `/cpp` 는 "실행만 하면 완성본" 수준의 빌드레디 계획 엔진으로 신설. 인기 spec-driven 프레임워크(GitHub Spec Kit, AWS Kiro, obra Superpowers, BMAD) 벤치마크 반영.

### Added (v3.15.0)

- **신규 skill `/cpp` (Lens Power Plan) — 빌드레디 심층 계획 엔진** (`skills/cpp/SKILL.md`). `/cp` 의 무거운 형제. 9-스테이지 파이프라인: S0 🎯Goal(사용자 언어)+🎬사용장면+📜Constitution(LOCKED) → S1 Clarify-to-Zero(사전 모호성 전량 제거) → S2 전방위 fan-out 조사(Task 도구 6축 병렬 서브에이전트) → S3 Body-Adaptive 딥스펙(도메인 라우터; UI→ASCII 와이어프레임+요소별 상태/문구/데이터바인딩/반응형) → **S4 Codex 교차 협의·합성(양보불가 하드게이트 — 미감지 시 graceful degrade 금지, 정지·보고)** → S5 빌드레디 태스크(정확한 경로+변경+검증+`[P]`/의존, 10–20분 단위) → S6 ✅EARS 검증(WHEN/THEN/SHALL) → S7 Self-Check("되묻기 0?" 체크리스트) → S8 Approve → `/cc` 핸드오프. spine 5개(목표·Constitution·EARS검증·빌드레디실행·진행상황)만 고정, 나머지 본문은 주제 적응형. 다운그레이드 가드(trivial 은 `/cp` 권유). 기존 라이프사이클(docs/tasks·board·/cc 핸드오프) 재사용, lib·`/cp` 무수정.
- **벤치마크 채택**: Constitution(Spec Kit `constitution.md`), Clarify-to-Zero(Spec Kit `/clarify`), 교차일관성 게이트(Spec Kit `/analyze` → Codex 격상), EARS 검증(AWS Kiro), 의존성 wave+10–20분 사이징(Kiro), 빌드레디 태스크 포맷=경로+변경+검증(obra Superpowers writing-plans). 미채택: BMAD 다중 페르소나(과함), 별도 CLI, 7-커맨드 분리.

### Changed (v3.15.0)

- **`/cp` 슬림화 — 속도 등급(Fast/Standard) 도입** (`skills/cp/SKILL.md`). `/cp` 를 **빠른 수정·표준 계획 lane** 으로 재포지셔닝. **Fast 등급**(오타·변수명·한두 파일·빠른 스케치): Codex(P0.5/P2.4)·Plan B·Pre-mortem(P3)·HTML 슬라이드 모두 skip → Goal(간결)→Plan A→md+board→승인 직행. **Standard 등급**(medium): 현행 전체 흐름 유지. **Deep 신호**("프로토타입까지", "아주 디테일하게", "전방위 조사", 화면 전체 설계) 감지 시 진행 전 `/cpp` 제안. **Goal 은 등급 무관 항상 필수** (양보 금지는 등급과 독립). 속도 등급 섹션이 per-phase "항상/필수" 규칙보다 우선. P0.5·산출물 게이트·Pre-mortem·절대규칙에 Fast 예외 명시. Standard PLAN={md,html,board}, Fast PLAN={md,board}.
- **인벤토리 동기화**: `CLAUDE.md` Skills 표(+`/cpp` 행, `/cp` fast/standard 표기) + v3.15.0 feat 노트, `README.md`(`/cpp` 섹션 + `/cp` 속도등급 표기), `scripts/bump-version.sh`(skills/cpp/SKILL.md 배너 동기화 추가, 11→12 파일).

### Fixed (v3.15.0)

- (없음 — 신규 기능 + 리포지셔닝 릴리스)

## [3.14.1] - 2026-06-06

### Fixed (v3.14.1)

- **자동 커밋이 시크릿을 제외하던 규칙 제거 — `.gitignore` 만 존중 (`skills/cc`·`skills/c`·`skills/cps`, `CLAUDE.md`)** — v3.14.0 이 auto-commit 안전 레일에 "시크릿 제외(`.env`·쿠키·세션·토큰 스테이징 안 함)"를 박았는데, 이는 사용자 강한 룰(`feedback_sensitive_files_to_livevil_setting`: 민감파일은 숨기지 말고 의도적으로 버전관리 — 예 livevil-setting)을 정면 위반. 이제 **무엇을 숨길지의 SoT 는 오직 레포의 `.gitignore`** 다. `git add -A` 가 이미 그것을 존중하므로 Lens 는 추가 시크릿 필터를 걸지 않는다 — 추적된 파일(의도적으로 버전관리하는 시크릿 포함)은 그대로 커밋, gitignore 된 것만 빠진다. Phase 7.4 rule #1 + 기본값 설명 + `/c`·`/cps` 블록 + CLAUDE.md config 표 + 감사 리포트 #9 동기화.

## [3.14.0] - 2026-06-06

사용자 관점 릴리스. v3.13.0 이 전부 안쪽(코드·토큰·구조) 작업이었다는 지적에 따라, **사용자가 매번 다시 치던 명령을 스킬 기본 동작으로** 박았다. 전역 `~/.claude/CLAUDE.md` 가 없거나 안 읽히는 환경(cron·타 머신)에서도 `/c`·`/cc` 가 이 기본값을 따른다. 또 대화 마이닝 신기능 제안(`/ch`·`/cx`)은 검토 결과 **둘 다 드롭** — 수요 측의 진짜 가치는 새 스킬이 아니라 이 기본값들이었다.

### Changed (v3.14.0)

- **`autoCommitOnComplete` 기본값 `false` → `true` (`lens.config.json`)** — 게이트 통과 시 `/cc`·`/cps` 가 자동 commit+push. 강한 안전 레일(시크릿 제외·기본 브랜치 보호·diverged 보고만·force-push 금지). 반복되던 "커밋하고 푸시해" 제거. 끄려면 `false`. `/cc` Phase 7.4 문구 동기화.
- **`/c`·`/cc` "사용자 향 기본값" 블록 신설 (`skills/c/SKILL.md`, `skills/cc/SKILL.md`)** — 반복 명령을 스킬 레벨 기본 동작으로: 산출물 **풀 경로 자동 보고**("어디 저장했어?" 제거) · 장시간 작업 **자동 진행보고**("N분마다 보고해" 제거) · **즉시·끝까지 실행**, 헤지·떠넘김 금지("지금 해 / 니가 해" 제거) · 단 **위험·시각 변경은 보고-먼저** 예외("보고 먼저 하고 적용" 제거).
- **CLAUDE.md config 표** — `autoCommitOnComplete` 기본값 `true` 반영.

### Removed (v3.14.0)

- **대화 마이닝 신기능 제안 `/ch`·`/cx` 드롭** — `/ch`(운영 헬스체크)는 범용 일반화 불가("정상"의 정의가 레포마다 달라 공통 불변식 0; `make`/`npm run` 이 이미 그 러너). `/cx`(세션 핸드오프)는 전제 약함(`initSession()` wipe 는 의도된 동작일 가능성 — 고칠 건 docstring 한 줄; 핸드오프 가치는 네이티브 `--resume`/`/cp` 재개와 겹침). 계획 문서 제거. 감사 리포트에 두 드롭 + §3.5(수요 가치=반복 명령 기본값화) 기록.

## [3.13.0] - 2026-06-06

Lens 자가 현대화 릴리스. 새 스킬 `/cr` 가 Lens 자신을 주기적으로 감사한다 — Claude Code + Codex 가 네이티브로 가져간 능력(공급)과 사용자의 실제 세션 패턴(수요)을 양면 대조해 각 기능을 KEEP/THIN/OBSOLETE 로 분류하고, 업그레이드·편의 개선·net-new 기능을 제안한다. 첫 실증 감사(멀티에이전트 워크플로, 25+19 agents)에서 나온 14개 우선조치 중 9개를 이번 릴리스에 함께 반영. 핵심 발견: 네이티브 4종(Dynamic Workflows·per-agent 모델 서브에이전트·/goal·plan mode)이 /c·/cc·/cp 의 *엔진*을 흡수했으나 OBSOLETE 는 0 — 디스크 영속·cross-vendor 이종검증·Karpathy 계약 *코어*는 생존. 상세: `docs/history/2026-06-05-lens-modernization-audit.md`.

### Added (v3.13.0)

- **신규 스킬 `/cr` (Lens Review) — `skills/cr/SKILL.md`**: 자가 현대화 감사. 레지스트리의 "가정된 네이티브 공백"을 라이브 probe(로컬 CLI/도구표) + 공식 체인지로그(fallback)로 대조 → 노후도 분류 + 업그레이드/편의 + (deep)대화 마이닝 신기능 제안 → 리포트(md+HTML+board) → 고신뢰 건 `/cp` 핸드오프. **OBSOLETE 는 코드 자동삭제 0, 제안만**. fetch 실패는 UNKNOWN-degrade(false-obsolete 방지).
- **능력 가정 레지스트리 — `docs/rules/capability-assumptions.json`**: 11행(네이티브 능력 단위) × {affects_lens, assumed_native_gap, gap_closed_signal, signal_method(probe/web/both), false_obsolete_risk}. `/cr` 의 SoT 데이터.
- **`lib/capability-audit.js`**: 감사 상태(`.lens/capability-audit-state.json`) read/`stamp` + `isLensRepo()` 이중확인 + 레지스트리 해시 + 알림 포맷. CLI `stamp`/`nudge`.
- **SessionStart staleness 알림 — `hooks/session-start.js`**: Lens 레포에서만, 기간 초과 또는 레지스트리 해시 변경 시 한 줄. **네트워크 호출 0**.
- **Pass-1 감사 리포트 + 신기능 계획**: `docs/history/2026-06-05-lens-modernization-audit.md`, `docs/tasks/`(/cr 계획 + 대화 마이닝 발견 `/ch`·`/cx` 계획).
- **config 키 — `lens.config.json`**: `capabilityAuditNudge`(기본 true), `capabilityAuditIntervalDays`(기본 30), `autoCommitOnComplete`(기본 false).

### Changed (v3.13.0)

- **Codex 코드리뷰 구조화·git-aware (`docs/rules/codex-integration.md`, `skills/cc/SKILL.md`)**: Phase 4.5 를 `codex exec review --uncommitted --output-schema --ephemeral` 로 전환(라이브 0.137 실측 통과). 수동 diff 주입·awk PASS/FAIL 휴리스틱 제거. 구버전은 자유형 fallback.
- **codex `service_tier=fast` 통일 (`docs/rules/codex-integration.md`)**: `priority` 는 레거시 별칭으로 강등. `gpt-5.5`/티어 서버측 검증 폐기 대비 버전무관 fallback 명시.
- **`/cc` Phase 7.4 자동 커밋+동기화 (opt-in) + Phase 1.5 헤드리스 폴백**: 게이트 통과 시 `autoCommitOnComplete` 면 commit+sync(시크릿 제외·기본 브랜치 보호·diverged 보고만). `LENS_NONINTERACTIVE=1`(cron) 이면 AskUserQuestion 게이트가 hang 대신 plan-only/자동승인 폴백.
- **`/cps` 완료 후 자동 커밋 (opt-in) — `skills/cps/SKILL.md`**.
- **PostToolUse 컨텍스트 주입 (`hooks/post-tool-task.js`)**: 직전 Task status/실패사유를 `additionalContext`(모델이 읽는 유일 필드)로 노출 — write→consume 단절 해소.
- **`/cs` `--json` 모드 (`scripts/git-sync-all.sh`, `skills/cs/SKILL.md`)**: `{pulled,pushed,unchanged,diverged,failed}` 구조화 출력(사람 출력은 stderr). set -u 빈배열 안전(bash 3.2 대비).
- **추천기 기본 off — `lens.config.json` `autoRecommend:false`**: 매 메시지 자동제안 nag 제거(추천기가 hollow — triggers 빈약·score 노이즈). 네이티브 Skills 발견에 위임. SessionStart 의 빈 Plugin Discovery 블록 제거(+ 고아 import 정리).

### Fixed (v3.13.0)

- **`/cu` codex 오탐 (`scripts/cu.py`)**: VSCode 번들 codex(alpha 케이던스)를 GitHub stable 과 비교해 "항상 update available" 뜨던 것 → vscode kind 면 `needs_update=null`(❓).
- **`/cs` 미구현 드리프트 (`skills/cs/SKILL.md`)**: "Stop 훅이 결국 auto-commit" 암시 제거(`stop.js` 는 git 동작 0).
- **문서 드리프트 (`CLAUDE.md`)**: "60+ known plugins" → 실제 `KNOWN_PLUGINS` 빈 상태 반영.

### Deprecated (v3.13.0)

- **`lib/plan-manager.js` 생성 절반 `@deprecated`**: `generatePlanContent`(8개국어 dict)·`extractGoal`·`validatePlanStructure`·`updatePlanStatus`·`save/loadPlanState`·`parsePlanFrontmatter` 는 런타임 호출자 0(검증됨) — `/cp` SKILL.md 가 직접 plan 문서를 작성. 백업/참조용으로 유지, 릴리스 동기화 의무 아님. 라이브 절반(`formatPlanSummary`/`ensurePlansDir`)은 유지.

## [3.12.2] - 2026-06-01

`/cu` 의 codex / gh 자동 처리 범위 확장. v3.12.0 의 첫 구현은 "Windows = codex 는 VSCode 번들 가정 + gh 는 winget 명령 안내만" 으로 단정해 둘 다 무조건 수동(`exit 3`) 으로 떨궜는데, 실제로는 `which codex` 경로(`AppData/Roaming/npm/...` → npm 글로벌)와 `winget list --id GitHub.cli` 소스 확인으로 자동 처리 가능했다. 이번 릴리즈에서 양쪽 다 sniff 해서 자동 가능하면 자동 실행, 식별 안 되면 기존처럼 명령만 안내로 떨어지게 보강.

### Changed (v3.12.2)

- **`scan_codex()` install-kind sniffing (`scripts/cu.py`)** — `shutil.which("codex")` 결과 경로로 `npm` / `vscode` / `unknown` 분기. npm 글로벌(`AppData\Roaming\npm`, `node_modules` 등) 이면 `can_auto=True` + `upgrade_cmd="npm install -g @openai/codex@latest"`, VSCode 확장 번들(`.vscode/extensions/openai.chatgpt-...`) 이면 기존 수동 안내, 식별 불가면 안전쪽으로 수동 안내.
- **`scan_gh()` 패키지매니저 소스 검출 (`scripts/cu.py`)** — Windows 에서 `winget list --id GitHub.cli` 출력에 "winget" 소스가 잡히면 `winget upgrade --silent --accept-source-agreements --accept-package-agreements --disable-interactivity` 로 자동 처리. macOS 는 `shutil.which("brew")` 통과 시 `brew upgrade gh` 자동. 그 외(apt/dnf/pacman/scoop/manual) 는 기존 수동 안내 유지.
- **upgrade 디스패처에 `_upgrade_codex_npm` / `_upgrade_gh_winget` / `_upgrade_gh_brew` + `_manual_hint` 분리 (`scripts/cu.py`)** — `cmd_upgrade()` 의 cli:codex / cli:gh 분기를 install-kind / 패키지매니저 감지로 다시 그어 자동 가능하면 즉시 자동, 아니면 `_manual_hint()` 로 exit 3.
- **`/cu` SKILL.md "What it does NOT do" 갱신** — "system package manager 가 필요한 CLI 는 무조건 수동" 단정 문구를 "per-CLI sniffing" 으로 교체. README 의 Auto-upgrade path 문구도 codex npm / winget gh / brew gh / 식별 불가 분기 명시.

### Fixed (v3.12.2)

- **codex / gh 가 실제로 자동 가능한 환경에서도 항상 exit 3 로 떨어지던 문제** — Windows + codex npm 글로벌 + gh winget 박스에서 `/cu` 가 두 CLI 를 매번 "수동 업데이트 필요" 로 안내해 사용자가 직접 명령을 복붙해야 했음. 이제 같은 박스에서 6/6 모두 자동 처리.

## [3.12.1] - 2026-06-01

Windows Python Store stub(`python3` exit 49) 함정이 `scripts/upgrade.sh` 에 그대로 남아 있어 `/lens-upgrade` 가 박스에 따라 즉시 깨지던 문제 핫픽스. v3.12.0 의 `cu.sh` 에는 이미 들어가 있던 fix(actual `--version` 실행으로 stub 회피)를 `upgrade.sh` 에 backport.

### Fixed (v3.12.1)

- **`/lens-upgrade` Windows Python Store stub 회피 (`scripts/upgrade.sh`)** — `command -v python3` 가 Store stub 을 truthy 로 잡아 `python3 upgrade.py` 호출이 exit 49 로 즉사하던 문제. cu.sh 와 동일한 패턴(python3/python/py 순서로 `--version` 직접 실행) 으로 교체. 실제 Python 이 PATH 에 있는데도 lens 업그레이드가 안 되던 Windows 박스에서 unblock.

## [3.12.0] - 2026-06-01

신규 skill `/cu` (Lens Update) 추가. `/lens-upgrade` 는 lens 한 가지만 다루지만, `/cu` 는 **이 컴퓨터에 실제 설치된 모든 CLI(Claude Code, Codex, gh)와 모든 Claude Code 플러그인**을 스캔해 현재/최신 버전을 비교하고, 사용자가 다중선택으로 고른 항목만 업그레이드한다. 컴퓨터마다 설치 상태가 다르다는 전제 위에 설계 — 검출 못 한 항목은 결과에 아예 나오지 않으므로 "없는 도구를 발견했다" 류의 환각이 구조적으로 차단된다.

### Added (v3.12.0)

- **신규 skill `/cu` (Lens Update)** — 5단계 절차: ① `scripts/cu.sh scan` 으로 설치 항목 JSON 산출(CLI 3종은 `--version` + GitHub releases/tags, 플러그인은 `installed_plugins.json` + 마켓플레이스 clone) → ② 표 렌더 + needs_update 표시 → ③ `AskUserQuestion(multiSelect)` 로 어떤 항목을 업그레이드할지 확인(CLI/Plugin 4-옵션 한도 회피 분리) → ④ 선택 항목마다 `cu.sh upgrade <id>` 실행(자동 가능: `claude update`·`claude plugin update`·lens는 `/lens-upgrade` 위임; 수동 안내: `winget`·`brew`·VSCode 확장은 명령만 출력하고 exit 3) → ⑤ 성공/실패/수동 분류 보고. (`skills/cu/SKILL.md`)
- **`scripts/cu.py` 스캐너 + 업그레이드 디스패처** — stdlib only. `shutil.which` 로 Windows `.cmd` shim 해결, `git ls-remote` 폴백으로 commit-SHA-as-version 마켓플레이스(claude-plugins-official 같은 로컬 경로 source) 의 최신 SHA 비교 지원, Windows Python Store stub(`python3` exit 49) 회피 wrapper, `sys.stdout.reconfigure(utf-8)` 로 콘솔 mojibake 차단.

### Changed (v3.12.0)

### Fixed (v3.12.0)

## [3.11.0] - 2026-05-30

Codex 호출과 Claude 실행을 **깊게+빠르게**로 통일. 토큰 비용은 고려하지 않는다(사용자 방침) — codex 는 항상 최고 추론(`xhigh`) + 큐 우선권(`priority`), Claude 측 워커·슈퍼바이저·QA 는 항상 `opus`. 더불어 background 병렬 모델에 안 맞던 군더더기(blocking timeout, 취약한 stdout awk 파싱)를 제거하고 모델 표기 drift(GPT-5.2 → gpt-5.5)를 정리. 실측 근거(gpt-5.5): `low` 추론은 `xhigh` 보다 토큰 ~6배 + 속도 이득 0 → xhigh 가 소규모에서 오히려 싸고 빠름. (계획: `docs/tasks/2026-05-30-codex-call-deep-fast-upgrade.md`)

### Added (v3.11.0)

- **codex 표준 호출에 깊이·속도 다이얼 명시 (`docs/rules/codex-integration.md` §4)** — `-m gpt-5.5 -c model_reasoning_effort=xhigh -c service_tier=priority -o "$OUT"`. reasoning_effort(품질)와 service_tier(큐 우선권)는 독립 다이얼이라 동시 적용. "왜 xhigh+priority" 근거 단락 + 실측 수치 추가.
- **`-o` 본문 수거 + 고유 파일명 규칙 (§5)** — `-o "$OUT"`(`mktemp /tmp/codex_XXXXXX.txt`)로 최종 답변만 파일 수거. background 병렬 호출(Phase 0.5·2.4·4.5) 간 파일명 충돌 방지.

### Changed (v3.11.0)

- **Claude 모델 배정 Opus 우선 (`skills/cc/SKILL.md`)** — Worker(전 난이도)·Supervisor·QA = `opus` 고정(난이도 무관). Monitor 만 `haiku` 유지(대시보드 상태 폴링 — opus 품질 이득 0인 유일 예외). 모델 할당 테이블·ASCII 다이어그램·난이도 매핑·Supervisor 모델 선택 로직·예시 일괄 갱신. "비용 효율" 문구 → "품질 우선". (`/cp` 는 Phase 3.1 pre-mortem 이 이미 opus — 변경 없음.)
- **codex 호출/수거 참조 통일 (`skills/cp/SKILL.md`, `skills/cc/SKILL.md`)** — Phase 0.5·2.4·3.2(cp)·4.5(cc)의 흩어진 직접 인용(`codex exec "..."`, `^codex$`~`tokens used` awk)을 §4/§5 참조로 통일.

### Fixed (v3.11.0)

- **blocking timeout 제거 (`docs/rules/codex-integration.md` §7)** — 과거 30초 `timeout 30 bash -c` 패턴은 동기 호출 시대의 잔재. 현재는 background 병렬이라 Claude 가 기다리지 않으므로 모순. "gate 에서 ready 면 수거, 아니면 degrade(기다리지 않음)"로 교체 — 숫자 timeout 없음. cp/cc 의 "timeout" 어휘도 "미응답/실패"로 정리.
- **모델 표기 drift (`docs/rules/codex-integration.md`)** — `GPT-5.2-Codex` → `gpt-5.5`(이 codex 확장 빌드가 노출하는 실제 모델). 성능 표의 응답시간·토큰 수치를 실측 기반으로 갱신.

## [3.10.0] - 2026-05-27

문서 라이프사이클 자동화 강화. 신규 skill `/cps` 로 어떤 레포든 "어디부터 읽고 질문을 어느 문서로 보낼지" 안내하는 진입점 문서(`docs/START_HERE.md`)를 실제 docs 스캔 기반으로 만든다. 더불어 `/cp done` 이 새 task 만이 아니라 방치된 기존 task 까지 전수 재평가해 완료분을 일괄 정리 제안한다. (예시 산출물 양식: `livevil-contents/docs/START_HERE.md`)

### Added (v3.10.0)

- **신규 skill `/cps` (Lens Start)** — 어떤 레포든 `docs/START_HERE.md`(레포 first-read 진입점 + 질문 라우팅)를 생성/갱신. 5단계 절차: ① 실제 docs 인벤토리 수집(`docs/**/*.md` 단 START_HERE 자신 제외 + 루트 README/CLAUDE.md, 제목 없으면 파일명 fallback) → ② 4섹션 조립(What This Repo Does / What This Repo Is Not / Current First-Read Path / Fast Answer Rules) → ③ 기존 파일 있으면 diff+승인 게이트(비파괴) → ④ Write(`docs/` 없으면 생성) → ⑤ CLAUDE.md 포인터 조건부 1줄 주입. **허구 경로 0 원칙**: Glob 미확인 경로 나열 금지, 근거 부족은 `(Not documented yet)`. (`skills/cps/SKILL.md`)

### Changed (v3.10.0)

- **`/cp` DONE 모드 Phase 1 강화** — "활성 작업 확인"이 단순 목록 표시 + 사용자 선택에서, **`docs/tasks/` 의 기존 task 전수 재평가**로 격상. Phase 1.1(체크리스트 완료율 + `✅ 검증` 표 + `## 진행상황`·CHANGELOG/CLAUDE.md Version 기반 신호 검토) → Phase 1.2(완료추정 / 진행중 / 수동확인필요 3분류, 신호 상충 시 안전쪽 우선) → Phase 1.3(완료추정 묶음 일괄 아카이브 AskUserQuestion, Approve 문구에 "원본 task 삭제" 명시, Modify 는 multiSelect 재질문) → Phase 1.4(안전 규칙: 분류는 추정일 뿐·자동삭제 금지·수동확인필요는 묶음 제외). **DONE Phase 2~4 흐름 불변**. (`skills/cp/SKILL.md`)
- **CLAUDE.md Skills 표 + README** — `/cps` 행 추가.

### Fixed (v3.10.0)

## [3.9.0] - 2026-05-26

Codex 를 "Claude 결과의 부분 검토자"에서 **공동 조사자·공동 검증자**로 격상. Claude 혼자 계획하고 코딩하면 놓치고 삽질하는 게 많다 — 조사·계획·개발 전 과정을 Claude ‖ Codex 이종 모델로 **더블 검증**한다. trivial 제외 항상 적용, Codex 부재/실패는 graceful degrade.

### Added (v3.9.0)

- **`/cp` Phase 0.5 — Codex 병렬 독립 조사** — Goal 정의 직후 Codex 를 **백그라운드**(Bash `run_in_background`)로 띄워 레포를 스스로 읽고 자기 접근안+리스크+관련 파일을 내게 한다. Claude 는 기다리지 않고 Phase 1(자기 Plan A 설계)을 병렬 진행. Codex 는 더 이상 "Claude 안의 검토자"가 아니라 독립 조사자. (`skills/cp/SKILL.md`)
- **`/cp` Phase 2.4 — 듀얼 합성·교차검증** — Claude 안 vs Codex 안을 **합의/분기**로 분류. 합의는 고신뢰 lock, 분기는 Claude 가 코드를 직접 재확인(Read/Grep/Bash)해 해소 — 객관 판정 불가면 trade-off 근거와 함께 선택하고 문서에 기록(사용자가 승인 게이트에서 확인). plan 문서에 `## 🔀 듀얼 합성` 섹션 신설. (`skills/cp/SKILL.md`, `lib/plan-manager.js`)
- **`/cc` Phase 4.5 — Codex 코드리뷰 게이트** — 매 반복의 코드 변경(diff)을 Codex 가 Supervisor 와 **병렬**로 독립 리뷰(버그·엣지·보안·회귀, 마지막 줄 PASS/FAIL). **Supervisor pass + Codex pass 둘 다**여야 Phase 6 진입 — Codex FAIL/high 지적이면 Supervisor pass 여도 fix_instructions 에 병합해 재할당. (`skills/cc/SKILL.md`)
- **`lib/plan-manager.js` `generatePlanContent()` 듀얼 합성 렌더링** — `planData.dualSynthesis = {agreements, divergences:[{point,claude,codex,chosen,rationale}]}` 제공 시 `## 🔀 듀얼 합성` 섹션 출력(옵션, 다국어 제목). 미제공 시 미출력 — REQUIRED_SECTIONS 불변, validate 영향 없음.

### Changed (v3.9.0)

- **`docs/rules/codex-integration.md` 확장** — 사용 지점을 pre-mortem 1곳 → 4곳(조사/합성/pre-mortem/코드리뷰)으로 갱신. §8.5 "듀얼 검증 호출 패턴" 신설: `run_in_background` 병렬성, 조사·리뷰는 프로젝트 루트에서 실행(파일 접근), 판정 파싱(PASS/FAIL + high), graceful degrade.
- **`/cp` Phase 3 Pre-mortem 중복 호출 회피** — Phase 0.5 에서 Codex 조사가 돌았으면 Codex 의 리스크 시각은 Phase 2.4 합성에서 통합됐으므로 Pre-mortem 의 Codex 호출은 skip(Opus 단독). Phase 0.5 skip 시(부재/handoff)만 Codex 병렬. quota 절약.
- **산출물 파일 링크 풀 경로 강제 (`skills/cp/SKILL.md` + `skills/cc/SKILL.md`)** — 보고·후속 안내에서 deliverable 파일은 bare 이름(`board.html`) 금지, 프로젝트 루트 기준 전체 경로 클릭 링크(`docs/tasks/{id}.md` 등)로 제시. 양 스킬 절대 규칙에 명시.

### Compatibility (v3.9.0)

- 더블 검증은 **trivial(오타·변수명·한 줄 수정)·비-코드 작업 skip**, Codex **부재/실패/timeout 은 graceful degrade**(Claude/Supervisor 단독 + 플래그, 블로킹 금지) — 기존 단일 모델 흐름이 그대로 fallback.
- v3.8.0 의 사람 중심 Goal 2층 구조와 직교 — 듀얼 합성·리뷰는 그 위에 얹힌 검증 레이어. plan 문서 신규 섹션(`🔀 듀얼 합성`)은 옵션이라 기존 문서/`validatePlanStructure()` 에 영향 없음.

## [3.8.0] - 2026-05-26

`/cp` 의 Goal 을 **사람 중심 2층 구조**로 재설계. 기존 Goal 은 "POST /api/users 가 201 반환" 같은 개발자 검증어를 강제해 사용자가 자기 계획서를 읽고도 판단할 수 없었다. 이제 🎯 목표는 "무엇이 가능해지는가"(사람 언어)만, 기술 증거는 ✅검증 표로 완전히 분리한다. 사용자가 읽고 승인하는 층과 기계(/cc·/goal)가 판정하는 층을 나눴다.

### Changed (v3.8.0)

- **Goal = 사람 언어 2층 구조 (`skills/cp/SKILL.md` Phase 0 / 2.5 / 문서 품질 규칙)** — 🎯 목표 문장은 "이 작업이 끝나면 무엇이 가능해지는가" 를 사람 말로(함수명·HTTP 코드·SQL·클래스명·경로 등 기술 토큰 금지). `201`·`user row`·`exit 0` 같은 기술 증거는 전부 ✅검증 표로 격리. 목표 문장은 사용자용, 검증 표는 기계용.
- **Goal 품질 게이트 강화 (Phase 0 / Phase 5.0)** — ① 목표 문장에 기술 토큰이 있으면 reject → 검증 표로 이동, ② 각 목표가 ✅검증 ≥1행으로 매핑 안 되면(=모호) reject. 통과 못하면 Approve 거부, Modify 강제.
- **`lib/plan-manager.js` 전면 동기화** — `generatePlanContent()` 가 새 2층 구조 생성: Goal 은 사람 언어 plain bullet(체크박스 제거), 검증표에 `종류`(auto/manual) 칼럼 추가, 8개 언어 헤더 dict 를 사람 중심 라벨로 교체(goal/deliverables/verification/vCriterion 값 변경 + `vKind` 신설 + 사장된 `criteria` 키 제거). 데이터 필드 `goal.verification = [{signal, method, expected, kind}]`. successCriteria(사람 목표) 미스 시 deliverables 폴백, verification 미제공 시 outcomes 로 manual 행 생성.
- **핸드오프 계약 분리 — 양방향 동기화 (`skills/cp/SKILL.md` + `skills/cc/SKILL.md`)** — `[GOAL]` = 사람 언어, `[SUCCESS_CRITERIA]` = 🎯 사람 목표 그대로, `[VERIFICATION]` 표에 `종류` 칼럼 추가. 수신측 `/cc` 도 4칼럼 페이로드 + Phase 6 QA 를 동기화: `종류=auto` 행은 명령 직접 실행, `종류=manual` 행은 **자동 pass 처리 금지**(사람 확인 대기로 transcript 명시).

### Added (v3.8.0)

- **Goal 인터뷰 (Phase 0.0)** — 요청이 모호하거나 사람 목표가 불명확하면 사람 언어 질문 2개("무엇을 할 수 있게 되나요?" / "무엇으로 확인하나요?")로 목표를 끌어낸다. 기술 검증은 Claude 가 답변에서 역으로 도출 — 사용자에게 묻지 않음.
- **Goal 분해 / 서브골 (Phase 0.2)** — large 작업은 목표를 사람 언어 서브골 리스트로 쪼개고 각 서브골→검증행 매핑 + 선택적 `의존: N` 표기. small/medium 은 단일 목표 리스트.
- **`extractGoal()` 다국어 + 신구조 파싱** — 헤더를 🎯/Goal/목표/目標/目标/Ziel/Objectif/Objetivo/Obiettivo 로 인식(기존엔 영어 "Goal" 만). v3.8 신구조의 plain-bullet 사람 목표를 successCriteria 로 추출하면서, 레거시(체크박스=기준 / plain=deliverables) 구조도 그대로 호환.

### Compatibility (v3.8.0)

- 런타임 경로는 `/cp` 가 SKILL.md 를 따라 md 를 직접 작성하는 것 — `generatePlanContent()` 는 백업 생성기(선례: `docs/tasks/2026-05-16-cp-goal-first-overhaul.md`). 이번 전면 동기화로 백업 생성기도 신구조와 일치.
- 기존 v3.4–3.7 형식 plan 문서(개발 중심 Goal + 체크박스 성공 기준)는 `validatePlanStructure()` 통과 그대로 유지(섹션 alias 가 🎯/✅/목표/검증 모두 인식). `extractGoal()` 도 레거시 체크박스 구조를 계속 파싱.

# Changelog

## [3.7.0] - 2026-05-23

네이티브 Claude Code `/goal` 연동 + plan 문서에 `✅ 검증(Verification)` 섹션 신설(필수). Goal 이 "무엇을(성공 기준)"에 더해 "어떻게 검증하나(방법·기대 결과)"까지 정의하도록 강제 — 이 표가 `/cc` QA 의 실행 절차이자 네이티브 `/goal` 평가자의 증거 소스로 연결된다.

### Added (v3.7.0)

- **`✅ 검증 (Verification)` 섹션 — plan 문서 필수 구조** — 각 성공 기준을 `검증 방법(명령/액션)` + `기대 결과(pass 판정)` 표로 정의. `lib/plan-manager.js` `generatePlanContent()` 가 Goal 직후 표 생성(8개 언어 헤더 `verification`/`vCriterion`/`vMethod`/`vExpected`), `goal.verification = [{criterion, method, expected}]` 데이터 필드 신설. 미제공 시 `successCriteria` 로 폴백 행 생성. (`lib/plan-manager.js`, `skills/cp/SKILL.md`)
- **`REQUIRED_SECTIONS` 에 `Verification` 추가 + 다국어 `SECTION_ALIASES`** — `validatePlanStructure()` 가 검증 섹션 누락을 차단. `/cp` Phase 0 Goal 게이트도 3→4 조건(각 기준에 검증 방법 정의)으로 강화, 핸드오프 페이로드에 `[VERIFICATION]` 블록 추가(cp↔cc 양방향). (`lib/plan-manager.js`, `skills/cp/SKILL.md`, `skills/cc/SKILL.md`)
- **네이티브 `/goal` 연동 (Claude Code v2.1.139+)** — `/cp` Execute 시 SUCCESS_CRITERIA 로 조립한 `/goal … or stop after N turns` 명령 한 줄을 출력해 사용자가 harness-강제 실행을 선택 가능. `/cc` 는 SlashCommand 도구 부재로 자동 실행 불가 → 출력+안내 방식. 기존 Skill-도구 핸드오프는 그대로(추가 옵션, 비대체). (`skills/cp/SKILL.md`)
- **`/cc` 네이티브 `/goal` 호환 — 증거 transcript 명시 의무** — `/goal` 평가자(Haiku)는 도구 없이 대화 내용만 판정하므로, Phase 6 QA 가 각 SUCCESS_CRITERIA 의 증거(명령 출력·exit code·파일 상태)를 transcript 에 남기고 `[VERIFICATION]` 의 검증 방법을 그대로 실행하도록 규정. (`skills/cc/SKILL.md`)

### Fixed (v3.7.0)

- **`validatePlanStructure()` placeholder 오판 (검증 명령 회귀 방지)** — 미완성 템플릿 토큰 탐지 정규식 `/\{[a-z_]+\}/i` 가 검증 방법의 `curl -w %{http_code}`·`${VAR}` 같은 shell/curl 문법을 "미해결 placeholder" 로 오판하던 문제. negative lookbehind `(?<![%$])` 로 제외. 실제 누락 토큰(`{slug}` 등)은 계속 탐지. (`lib/plan-manager.js`)

### Compatibility (v3.7.0)

- 기존 v3.4–3.6 형식 plan 문서(검증 섹션 없음)는 `validatePlanStructure()` 에서 `missing: ['Verification']` 반환 — v3.4.0 전례와 동일한 advisory(하드 블록 아님). 신규 문서 또는 `/cp Modify` 로 검증 섹션 추가 시 통과. 코드 생성기는 `verification` 미제공 시 `successCriteria` 로 폴백 행을 만들어 섹션 자체는 항상 존재.

## [3.6.5] - 2026-05-22

SessionStart auto-pull 을 기본 OFF(opt-in)로 전환 — 느린 멀티레포 fetch 가 세션 시작을 지연/중단시키던 root cause 차단.

### Changed (v3.6.5)

- **SessionStart auto-pull 기본 OFF (opt-in 전환)** — `LENS_SYNC_AUTO_PULL` 의 의미가 opt-out(`=0` 으로 끔, 기본 ON)에서 opt-in(`=1`/`true` 로 켬, 기본 OFF)으로 바뀜. 기본 세션 시작 경로에서 git fetch/pull 네트워크 I/O 를 완전히 제거. 명시적 `/cs pull` 은 이 게이트와 무관하게 동작하므로 on-demand sync 는 그대로 가능. 자동 sync 가 필요하면 env 에 `LENS_SYNC_AUTO_PULL=1` 설정. (`hooks/sync-pull.js`)
- **auto-pull 을 기본 동작처럼 설명하던 문서 정정** — opt-in 으로 표기 통일: `plugin.json`·`marketplace.json` description, `skills/cs/SKILL.md` 3곳(Why /cs · Hook complement · Relationship). (`.claude-plugin/*`, `skills/cs/SKILL.md`)

### Fixed (v3.6.5)

- **세션 시작 지연/중단 root cause** — SessionStart 의 sync-pull hook 이 워크스페이스 전 repo(약 23개)를 동기적으로 pull 하면서 cold start 가 ~59.6s 까지 도달, host(VS Code Claude Code 확장)의 세션 초기화 예산(~60s)을 거의 초과해 시작이 지연/중단되던 문제. hook timeout 은 90s 로 잡혀 있어 init 예산을 넘길 수 있었음. 기본 OFF 전환으로 시작 경로의 무제한 네트워크 I/O 자체를 제거해 해결(timeout 값 자체는 opt-in pull 을 위해 90s 유지). (`hooks/sync-pull.js`, `hooks/hooks.json`)

## [3.6.4] - 2026-05-21

범용 공개 배포 하드닝 — 하드코딩 경로/개인정보 제거 + cross-platform 버그 수정. 5개 스킬 + 스크립트 + manifest/template 전수 코드리뷰(병렬 4-에이전트) 결과 반영. 상세 계획: `docs/tasks/2026-05-21-public-distribution-hardening.md`.

### Fixed (v3.6.4)

- **`/cs` auto-commit author 하드코딩 제거 (B1)** — `git-sync-all.sh` 가 `-c user.name="livevil7" -c user.email="livevil7@gmail.com"` 로 작성자를 강제하던 것 제거. 이제 사용자 본인 git config 사용 (낯선 사용자 커밋이 저자에게 오귀속되던 문제). (`scripts/git-sync-all.sh`)
- **stale repo URL 정정 (B2)** — `CreetaCorp/lens` (renamed, redirect 의존) → 실재 레포 `livevil7/creeta-lens`. plugin.json·marketplace.json·README 9곳. 마켓플레이스 *이름* `CreetaCorp` 와 설치키 `lens@CreetaCorp` 는 유지. (`.claude-plugin/*`, `README.md`)
- **`upgrade.py --dry-run` 거짓 "nothing to do" (M3)** — dry-run 이 `git fetch` 를 건너뛰어 stale marketplace.json 을 읽던 문제. fetch 는 항상 수행(읽기 전용), pull/merge 만 dry-run 에서 skip. (`scripts/upgrade.py`)
- **`upgrade.py` 하드코딩 `master` 브랜치 (M4)** — `git pull --ff-only origin master` → 현재 브랜치 동적 감지(`main` 기본 레포 호환). (`scripts/upgrade.py`)
- **`/cs` push 타겟 하드코딩 (M5)** — pull 은 `@{u}` 에서, push 는 `origin` 고정이라 멀티 remote drift 발생. push 도 upstream 의 remote(`${upstream%%/*}`) 로. (`scripts/git-sync-all.sh`)
- **개인 컨텍스트/끊긴 포인터/하드코딩 경로 제거 (N1~N6)** — 출하 skill·template 에서: `livevil-setting/docs/rules/coding-principles.md` 외부 포인터 → 프로젝트 `docs/rules/`; cs/SKILL.md 개인 레포명·workspace 문구 일반화; 예시 템플릿의 `livevil-contents`·`namane` → generic; codex-integration.md `/c/Users/ADMIN/.vscode` → `$HOME/.vscode`; "Codex GPT-5.2" → "Codex"; cp/SKILL.md `{lens}` placeholder → `${CLAUDE_PLUGIN_ROOT}`. (`skills/*`, `templates/*`, `docs/rules/codex-integration.md`)

### Changed (v3.6.4)

- **`/cs` 가 플러그인 마켓플레이스 clone 도 동기화 (M1)** — `git-sync-all.sh` 기본 ROOTS 에 `~/.claude/plugins/marketplaces` 추가 → 마켓플레이스 clone 이 더 이상 `/cs` 스캔 밖에서 stale 되지 않음. **pull-only 가드**: 마켓플레이스 경로는 fetch+ff-pull 만, auto-commit/push 절대 안 함(플러그인 자기 repo 보호). 개인 스캔루트(`$HOME/livevil-setting`, `$HOME/spotedcrypto-v2`)는 제거(M6). (`scripts/git-sync-all.sh`)
- **`bump-version.sh` macOS(BSD sed) 호환 (M2)** — GNU/BSD `sed -i` 분기 감지(`SEDI` 배열)로 macOS 에서도 동작. (`scripts/bump-version.sh`)
- **`/cp` PLAN 이 md-only 로 끝나는 구조적 결함 차단 (M7)** — Phase 5.0 진입 검사에 **산출물 게이트** 신설: `{id}.md`+`{id}.html`+`board_<repo>.html` 3종이 모두 있어야 Phase 5 진입. 완료된 PLAN = 원자적 3-파일 세트로 재정의. 반복되던 "필수" 경고를 게이트로 대체. (`skills/cp/SKILL.md`)

## [3.6.3] - 2026-05-21

### Fixed (v3.6.3)

- **`/cs` workspace-root 문서가 거짓 절대경로를 안내하던 문제** — `skills/cs/SKILL.md` 의 "Workspace roots" 가 Windows 기본값을 `/c/Users/ADMIN/Documents/GIT` 로 하드코딩 표기했으나, 실제 `git-sync-all.sh` 는 `$HOME` 기반 후보(`$HOME/Documents/Git` 등)를 자동 탐지하며 그런 경로를 쓰지 않음. 잘못된 문서를 믿고 불필요하게 `GIT_ROOTS` 를 넘기게 되는 혼란 유발. 실제 `$HOME` 기반 자동 탐지 동작에 맞게 정정 (코드 변경 없음, 문서 drift 수정). (`skills/cs/SKILL.md`)
- **skill 배너 버전이 여러 릴리스 동안 stale 했던 문제** — `bump-version.sh` 의 치환 정규식이 3-part(`vX.Y.Z`)만 매칭해서, 2-part 배너(`Lens v3.1`, `Lens Multi v3.4`, `Lens Plan v3.5`, `Lens Sync v3.2`)는 매 릴리스마다 조용히 건너뛰어졌음. 4개 skill 배너를 모두 v3.6.3 으로 정렬. (`skills/{c,cc,cp,cs}/SKILL.md`)

### Changed (v3.6.3)

- **`bump-version.sh` 재발 방지 강화** — (1) 치환 정규식의 patch 세그먼트를 optional(`vX.Y(.Z)?`)로 바꿔 2-part 배너도 잡도록 함, (2) 빠져 있던 `skills/cs/SKILL.md` 를 bump 대상(10→11 files)에 추가 (banner + "currently X.Y.Z" prose). (`scripts/bump-version.sh`)

## [3.6.2] - 2026-05-21

### Fixed

- **`/cp` PLAN/DONE 가 md 만 남기고 끝나던 문제** — HTML 보고서+board 생성이 부록 "HTML 보고서 뷰" 섹션에만 있고 PLAN Phase 순서에는 단계로 없어서, Phase 흐름대로 따라가면 HTML 이 생성되지 않았음. **Phase 2.6 (PLAN) / Phase 3.5 (DONE)** 을 필수 단계로 명시하고 "Phase 순서 절대" 규칙에 추가. `reportFormat` opt-in 과 무관하게 PLAN/DONE 은 **md + slide-deck HTML + board 를 한 번에** 산출. (`skills/cp/SKILL.md`)

## [3.6.1] - 2026-05-21

### Fixed

- **Board "convert to html" 버튼 file:// 먹통 수정** — `navigator.clipboard`는 보안 컨텍스트(https/localhost)에서만 동작하는데, 기존 코드가 `window.isSecureContext`를 확인하지 않아 `file://`에서 토스트도 모달도 안 뜨는 문제. `isSecureContext` 게이트 추가 → `file://`에선 곧바로 "수동 복사" 모달로 폴백. (`templates/board.template.html`)

## [3.6.0] - 2026-05-21

### Added (v3.6.0)

- **3-folder board `board_<repo>.html`** — `lib/board-builder.js` (schema v3) 재작성. `docs/tasks/`, `docs/history/`, `docs/rules/` 세 폴더를 단일 뷰로 통합 인덱스. `.md`+`.html` basename 페어링, md 텍스트 인라인(40KB cap), `lens:source-hash` stale 감지. 보드명은 git remote / 디렉토리명에서 자동 추출 (`board_<repo>.html`).
- **`/cp html <md-path>` CONVERT 모드** — md 파일 옆에 슬라이드덱 HTML을 생성(`docs/tasks/` 또는 `docs/history/`), 이후 board 자동 재빌드. 이전에는 md-only 문서였던 것을 HTML 뷰로 변환하는 명시적 진입점.
- **md-only 문서 raw 렌더링** — html 파일이 없는 md 문서는 board에서 raw md를 textContent로 표시(XSS-safe) + "convert to html" 버튼(클립보드에 `/cp html docs/<folder>/<id>.md` 복사)으로 안내.

### Changed (v3.6.0)

- **Board 기본 생성(default-on)** — 이전: `reportFormat: "html"` opt-in 시에만 생성. 이제 `/cp` PLAN/DONE 실행 시 항상 `board_<repo>.html` 재빌드.
- **슬라이드덱 HTML 위치 변경** — `docs/reports/{id}.html` → md 파일과 동일 폴더(`docs/tasks/` 또는 `docs/history/`) 내 생성.
- **`_shared.css` 이동** — `templates/report-shared.css` → `docs/_shared.css`. 보드 및 슬라이드덱이 `../docs/_shared.css` 없이 동일 폴더 기준 참조.

### Removed / Breaking (v3.6.0)

- **`docs/reports/` 중간 폴더 폐지** — 신규 빌더는 `docs/reports/` 를 생성하거나 읽지 않음. **비파괴적 마이그레이션**: 기존 `docs/reports/*.html` 및 `docs/board.html` 은 삭제·수정되지 않음(새 보드 파일명 `board_<repo>.html` 이 달라 공존). 사용자가 직접 html 파일을 해당 폴더로 이동하면 신규 board 에 편입됨.

### Security (v3.6.0)

- **md textContent 렌더링 — XSS-safe** — board 내 md-only 문서는 `innerHTML` 없이 `textContent` 로 삽입. 외부 html 뷰는 `<iframe>` sandbox 격리.

## [3.5.0] - 2026-05-20

### Added (v3.5.0)

- **HTML 보고서 뷰 + Task Board** (`reportFormat: "html"` opt-in) — `/cp` 가 만든 task/history 를 Pretendard 미니멀 슬라이드 보고서(`docs/reports/{id}.html`)로 보고, `docs/board.html` 인덱스에서 카드 클릭 시 오른쪽 panel 에 iframe 으로 즉시 표시.
- `templates/report-shared.css` — 보고서 공통 스타일 (Pretendard / 단일 blue accent / 슬라이드 컴포넌트).
- `templates/report-conversion-spec.md` — 보고서 작성 규칙 + md=SoT 원칙 + `lens:source-hash` 메타.
- `templates/report-history.example.html` (8슬라이드), `templates/report-plan.example.html` (6슬라이드) — 양식 reference.
- `templates/board.template.html` — board UI (Todo/Doing/Done, iframe slide-over panel).
- `lib/board-builder.js` — `docs/reports/*.html` 스캔 → `docs/board.html` 생성. `lens:source-hash` 로 stale 카드 감지, `_shared.css` 최초 1회 배포.

### Changed (v3.5.0)

- **`skills/cp/SKILL.md`** — "HTML 보고서 뷰 + Task Board (reportFormat: html — opt-in)" 섹션 신설. **md = 데이터/상태 SoT, HTML = 파생 뷰** 원칙. PLAN/DONE 모드에서 reportFormat=html 일 때 보고서 HTML 생성 절차 (reference Read → 의미 재구성 → source 메타 기록 → board 갱신).
- **`lens.config.json`** — `reportFormat: "md"` (기본, 하위호환), `buildBoard: false` 추가.

### Fixed (v3.5.0)

(없음)

## [3.4.0] - 2026-05-16

### BREAKING — Goal-first plan document structure (v3.4.0)

`/cp` 가 생성하는 plan 문서의 마크다운 섹션 구조가 완전히 바뀜. 기존 task 파일은 그대로 읽히지만, 새로 생성되는 파일은 새 구조를 따른다.

- **기존 (v3.3.x)**: `Task → Matched Skills → Execution Plan → Expected Outcomes → Risks → Execution Mode → Status`
- **신규 (v3.4+)**: `🎯 Goal (deliverables + success criteria + Done=?) → Plan A (rationale + steps + failure points) → Plan B (trigger + tradeoff + steps) → ⚠️ Risks → Progress → Status`

### Changed (v3.4.0)

- **`skills/cp/SKILL.md` — PLAN 모드 완전 재구성** — Phase 0 (Goal & Deliverable) 신설, Phase 1 (Plan A), Phase 2 (Plan B), Phase 2.5 (문서 작성, 새 템플릿), Phase 3 (Pre-mortem), Phase 4 (TodoWrite), Phase 5 (검토 게이트), Phase 6 (응답). Goal 품질 게이트 + Plan B 의무화 규칙 + `/cp → /cc 핸드오프 프로토콜` 섹션 신설. 핵심 원칙에 "Goal 이 최상위" 추가, 절대 규칙에 "Goal 절대 양보 금지" + "Phase 순서 절대" 추가.
- **`skills/cc/SKILL.md` — Goal-aware 실행 엔진으로 격상** — Phase 0 (/cp 핸드오프 수신) 신설, Phase 1.1 분석에서 Goal/SUCCESS_CRITERIA 우선 정독, Phase 2 TodoWrite 에 SUCCESS_CRITERIA 최상위 등록 명시, Phase 5.0 자동 Plan A↔B 전환 판정 (사용자 confirm 모드, 재시도 한도 3회), Phase 6 QA 에 SUCCESS_CRITERIA 직접 검증 의무, Phase 7 최종 보고에 "Goal 달성: N/N" 형식, Phase 7.4 plan 문서 진행상황 갱신. 절대 규칙에 "Goal 절대 우위" + "핸드오프 페이로드 검증" 추가. v3.1 → v3.4 표기 통일.
- **`lib/plan-manager.js` — `REQUIRED_SECTIONS` 및 `generatePlanContent()` 재작성** — 새 섹션 목록(`Goal / Plan A / Plan B / Risks / Status`), 8개 언어(EN/KO/JA/ZH/ES/FR/DE/IT) 헤더 dict 에 goal/planA/planB/trigger/deliverable/successCriteria 등 키 추가. Plan B 가 없으면 "Plan B 불필요" 자리표시자 자동 삽입. frontmatter `version: 1` → `2` (구조 변경 신호).
- **`templates/plan.template.md` — 새 구조 reference 로 교체** — 런타임 미사용이지만 AI 컨텍스트용. Goal/Plan A/Plan B/Risks/Progress/Status 자리표시자.
- **`CLAUDE.md` Version 섹션** — `Current: v3.4.0` 으로 갱신, `plan-manager.js` exports 목록에 `extractGoal`, `extractPlanBTriggers` 추가.

### Added (v3.4.0)

- **`lib/plan-manager.js` 신규 함수 `extractGoal(content)`** — plan 문서에서 Goal 섹션 파싱 → `{ deliverables, successCriteria, doneDefinition, raw }` 반환. `/cc` 핸드오프 진입 시 SUCCESS_CRITERIA 를 TodoWrite 최상위 항목으로 등록하는 데 사용. best-effort 파서, 인식 못한 형식은 null 반환.
- **`lib/plan-manager.js` 신규 함수 `extractPlanBTriggers(content)`** — Plan A 의 "막힐 수 있는 지점" 블록에서 트리거 추출. `/cc` 가 Supervisor 실패 신호와 매칭해 Plan B 자동 전환 여부를 판정하는 데 사용.
- **`/cp → /cc 핸드오프 프로토콜`** — 양쪽 SKILL.md 본문에 동일 표현으로 박힘. HANDOFF FROM /cp 페이로드 (`plan_doc_path`, `plan_id`, `GOAL`, `SUCCESS_CRITERIA`, `CURRENT_PATH`, `PLAN_A_STEPS`, `PLAN_A_FAILURE_TRIGGERS`, `PLAN_B_TRIGGERS`, `PLAN_B_STEPS`) + 절대 규칙 (Goal 빈 채로 핸드오프 금지 / plan 문서가 SoT / `/cc` 는 Goal 수정 권한 없음 / SUCCESS_CRITERIA 미달 시 done 차단).

### Migration notes

- 기존 `docs/tasks/` 의 v3.3.x 형식 plan 파일은 그대로 읽힘 (frontmatter 구조 동일, `parsePlanFrontmatter` 미수정). 다만 `validatePlanStructure()` 는 새 REQUIRED_SECTIONS 기준이므로 구식 파일은 missing sections 를 반환할 수 있음 — 새 구조로 작성된 파일만 통과.
- `/cc` 의 자동 Plan B 전환은 **사용자 confirm 모드** 로 안전 배포 (Plan A 막힘 신호 감지 시 "Plan B 전환할까요?" AskUserQuestion). 신뢰성 확보 후 향후 자동화 활성화 예정.

## [3.3.3] - 2026-05-16

### Changed (v3.3.3)

- **`lib/plugin-registry.js` — `KNOWN_PLUGINS` 비움** — 외부 플러그인 추천(`superpowers`, `design-council` 패턴 예시) 모두 제거. lens는 lens 자체 기능만 가지도록 정리. `searchRegistry()` / `formatRegistryResults()` API 는 유지(빈 배열일 때 자연스럽게 0건 반환).
- **`lib/skill-scanner.js` — sentry hardcoded 참조 3곳 제거** — Hybrid plugin 감지 주석에서 `e.g. sentry` 제거, 도메인 매칭 정규식에서 `sentry|` 키워드 제거(다른 generic 키워드 유지), `.mcp.json` wrapper unwrap 주석에서 `used by sentry, etc.` 제거. 동작은 generic 하게 유지, brand-specific 참조만 제거.
- **`skills/c/SKILL.md` — gstack priority 섹션 삭제** — 별도 standalone skill 디렉토리(`~/.claude/skills/gstack/`)에 대한 우선순위 매핑 테이블 통째 제거. "Match installed skills" 로 generic화.
- **`skills/cc/SKILL.md` — gstack Priority 섹션 2곳 통째 삭제** — 분해 단계의 매핑 테이블 + 본문의 "스킬 할당" 섹션 모두 제거. "Skill 매칭 확인" 으로 generic화. 외부 MCP 예시 텍스트도 generic 화.
- **`skills/cp/SKILL.md` — Karpathy 4규칙 풀버전 marker 강화** — `(Karpathy — 항상 준수)` → `(Karpathy — MUST FOLLOW · 기본 지침)` 헤더 + 각 규칙의 do/don't 풀버전 인라인. `/c`, `/cc` 와 marker 정합.
- **`.claude/settings.local.json` — 죽은 MCP 권한 정리** — `mcp__plugin_supabase_*`, `mcp__plugin_sentry_*` 등 lens 개발 워크스페이스에서 안 쓰이는 MCP 권한 제거.

### Fixed (v3.3.3)

- **`lib/agent-tracker.js` — 락 fallback 재시도 1회 추가** (린트/QA 발견) — 동시 hook 실행 시 `withFileLock` 첫 시도 실패하면 즉시 무락 fallback 으로 떨어지던 패턴을, 한 번 더 락 시도한 후 fallback 으로 변경. dashboard.json clobber 위험 감소. fail-soft 원칙(사용자 도구 호출 비차단) 유지.

### Note (v3.3.3)

사용자가 다른 모든 플러그인/스킬을 정리하면서 lens 가 외부 의존을 명시적 참조하던 부분을 모두 제거. lens 는 이제 lens 자체만으로 동작하며, 설치된 다른 플러그인이 있으면 generic 스캐닝으로 인식한다.

## [3.3.1] - 2026-05-14

### Added (v3.3.1)

- **`scripts/upgrade.py`** — `upgrade.sh`의 Python 포팅. Windows git-bash의 `sed multi-line` / `grep -P locale` 문제를 회피하기 위한 대안 진입점. `python upgrade.py [--dry-run|--yes|--verbose|--version vX.Y.Z]` 형태로 동일 인터페이스 제공.
- **`lib/hook-utils.js`** — hook 공통 helper 함수 추가 (stdin guard, safe fs wrappers).

### Fixed (v3.3.1)

- **CRITICAL #1 — Hook stdin blocking guard** (`hooks/post-tool-task.js`, `scripts/user-prompt-handler.js`): Claude Code가 stdin 안 보내면 5초 timeout까지 hang하던 패턴 차단. `process.stdin.isTTY` 가드 + fail-soft. lens-qa-review의 CRITICAL #1 해결.
- **CRITICAL #2 — fs.* try/catch graceful degradation** (`lib/agent-tracker.js` 163줄 refactor, `lib/plan-manager.js`, `lib/skill-scanner.js`): 권한/disk full/file corrupt 상황에서 hook 통째로 throw하던 cascade ERROR 차단. 각 fs call을 try/catch로 감싸고 fallback 동작. lens-qa-review의 CRITICAL #2 해결.

### Note (v3.3.1)

v3.3.0이 plugin source format(구조적 fix)을 다뤘다면, v3.3.1은 lens-qa-review에서 미해결로 남았던 CRITICAL 2건(hook stability)을 codex로 fix한 patch release. 이로써 lens-qa-review의 9건 발견사항 중 핵심 4건(CRITICAL 2 + MAJOR 2)이 모두 release에 흡수됨.

## [3.3.0] - 2026-05-14

### Added (v3.3.0)

- **`formatPluginSource(source)` helper export** — `lib/plugin-registry.js`. string과 typed object 양쪽을 안전하게 string으로 렌더링. session-start.js의 Plugin Discovery Registry 표가 이 helper로 source 컬럼을 출력하므로 미래에 다른 source 타입(`marketplace`, `internal-pattern` 등)이 추가돼도 표 형식 안 깨짐.
- **typed source 분기 지원** — `formatPluginSource`가 `type: 'github'` / `'marketplace'` / `'internal-pattern'` / fallback (`source.id || source.repo || source.marketplace`) 4가지 케이스 처리.

### Changed (v3.3.0)

- **`KNOWN_PLUGINS` source 데이터 구조: string → typed object** — 이전 `source: 'ccplugins/awesome-claude-code-plugins'` 형식은 Claude Code 내부 plugin loader가 `'/'` 기준으로 split해서 owner를 marketplace ID로 잘못 해석하던 근본 원인. 새 형식 `source: { type: 'github', repo: '...' }` 는 의미가 명시적이라 같은 오해석이 발생할 수 없음.
- **`searchRegistry()` 견고성** — query가 빈 문자열/null이어도 안전, `keyword`를 `String()`으로 강제 변환.

### Fixed (v3.3.0)

- **`Plugin not available for MCP: X@ccplugins - plugin-not-found` 패턴 영구 차단** — v3.2.2의 KNOWN_PLUGINS 항목 9개 정리는 증상 fix였고, v3.3.0의 source 구조 변경이 근본 fix. 미래에 어떤 plugin이 추가돼도 같은 fake-marketplace lookup이 안 일어남.

### Note (v3.3.0)

backward compat: `formatPluginSource()`가 string도 그대로 통과시키므로 외부 코드가 `source` 필드를 string으로 가정하더라도 안 깨짐. minor bump 기준.



## [3.2.2] - 2026-05-14

### Fixed (v3.2.2)

- **KNOWN_PLUGINS registry 정리** — `lib/plugin-registry.js`에서 사용 빈도 낮은 추천 항목 9개 제거: `brand-guardian`, `content-creator`, `growth-hacker`, `product-sales-specialist`, `pricing-packaging-specialist`, `app-store-optimizer`, `docker-compose`, `playwright-test`, `data-analyst`. 유지: `design-council` (lens 자체 skill), `superpowers` (travisvn 추천).
- **brand-guardian@ccplugins not-found 에러 해소** — `source: 'ccplugins/awesome-claude-code-plugins'` 패턴이 Claude Code plugin loader에서 `ccplugins`를 marketplace ID로 잘못 해석해 `Plugin not available for MCP: brand-guardian@ccplugins - error type: plugin-not-found` 로그가 startup마다 반복되는 문제를 KNOWN_PLUGINS에서 해당 entry 제거로 차단.

## [3.2.1] - 2026-05-14

### Added (v3.2.1)

- **Karpathy 4규칙 헤더 블록** — `/c`, `/cc`, `/cp` 3개 SKILL.md 본문 시작 직후에 4가지 코딩 원칙 (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution-완화) 박스 삽입. Leader · Worker · Supervisor · QA 모든 phase에서 자동 적용. 출처: <https://github.com/multica-ai/andrej-karpathy-skills>
- **Worker dispatch 프롬프트에도 4규칙 박스** — `/c` Worker prompt template, `/cc` Worker prompt + 재할당 Worker prompt 안에 별도 박스 삽입. SKILL.md 헤더만으로는 spawn된 Worker가 못 읽는 문제 해소. 특히 `/cc`는 N개 Worker 병렬 dispatch라 Rule 3(외과적 변경: 본인 task 외 영역 금지) 명시
- **/cp Pre-mortem과의 관계 명문화** — Phase 2.5 Pre-mortem은 Rule 1("생각 먼저")의 부분 실현. 중복 적용이 아니라 Pre-mortem 단계 자체가 Rule 1의 구체적 실행임을 본문에 명시

### Changed (v3.2.1)

- **Goal-Driven Execution 완화 채택** — 원문은 TDD 강제지만 도메인 분기로 의역. 코드/SDK = TDD, 콘텐츠/문서 = acceptance criteria, 운영 스크립트 = dry-run + 수동 확인, 인프라 = before/after diff. 단순 문서 수정에 과한 검증을 요구하지 않으면서 검증 가능성은 유지

### Note (v3.2.1)

본 patch release는 lens 본체 로직 변경 없음. SKILL.md 본문에 항상 준수해야 하는 코딩 원칙 메타블록을 추가하는 docs/policy 변경. 외부 SoT: `livevil-setting/docs/rules/coding-principles.md` (사용자 환경 종속, 본 plugin과 분리)

## [3.2.0] - 2026-05-04

### Added (v3.2.0)

- **`/cs` Multi-Repo Sync skill** — 워크스페이스 하위 모든 git repo를 일괄 동기화하는 신규 명령어. `pull` (incoming만), `push` (outgoing만), `sync` (둘 다, 기본). Fetch → fast-forward pull → dirty면 auto-commit (`chore: auto-sync YYYY-MM-DD`) → ahead push 4단계 파이프라인. Diverged repo는 손대지 않고 `manual resolve required`로 보고. fail-soft: 한 repo 실패가 나머지를 막지 않음. `skills/cs/SKILL.md`
- **SessionStart auto-pull hook** — 새 세션 시작 시 자동으로 `/cs pull` 실행. 다른 기기에서 push한 변경을 가만히 받음. 끄려면 `LENS_SYNC_AUTO_PULL=0` 환경변수. push는 자동 실행하지 않음 (안전성 우선, 명시적 `/cs` 또는 `/cs push` 필요). `hooks/sync-pull.js`, `hooks/hooks.json`
- **`scripts/git-sync-all.sh` self-contained** — 종속성 없는 POSIX shell 스크립트. workspace 자동 감지 (Windows: `/c/Users/ADMIN/Documents/GIT`, macOS: `~/projects` `~/livevil-setting` `~/spotedcrypto-v2`), `GIT_ROOTS` 환경변수로 override 가능. 모든 git repo를 1-level 스캔, fail-soft 처리, 컬러 박스 리포트 출력
- **Cross-platform Bash resolution** — Windows에서 Git for Windows의 `bash.exe`, msys64, WSL fallback 자동 감지. macOS/Linux에서는 `/bin/bash`. 사용자가 어느 노트북에서 lens를 실행해도 작동

### Changed (v3.2.0)

- **plugin description** — "Skill navigator" 만에서 "Skill navigator + multi-repo git sync"로 확장
- **hooks.json description** — Lens v3.2.0 표기 + sync 기능 언급
- **keywords** — `git-sync`, `multi-repo`, `auto-pull` 추가

## [3.1.0] - 2026-04-23

### Added (v3.1.0)

- **`/cp` PLAN 모드 Phase 2.5 Pre-mortem** — 계획 문서 저장 직후 Opus + Codex GPT-5.2 병렬 pre-mortem 실행. 결과를 계획 문서의 `## ⚠️ 사전 리스크` 섹션에 출처(Claude Opus / Codex GPT-5.2)를 병기해 저장. Codex CLI 미설치 환경에서는 Opus 단독 fallback + 명시 표기. `skills/cp/SKILL.md`
- **Supervisor 조건부 opus 승격** — `/c`, `/cc` Phase 4 Supervisor가 Worker 할당에 `opus`가 포함된 경우 자동으로 `sonnet → opus`로 승격. Worker (Hard) = opus인데 Supervisor = sonnet이었던 역전 구조 해소. 단순 태스크는 비용 절약을 위해 sonnet 유지. Supervisor 프롬프트에 "당신의 모델은 {assigned_model}" 자기인식 명시. `skills/c/SKILL.md`, `skills/cc/SKILL.md`
- **Worker 스킬 강제 할당 (Skill Enforcement)** — Worker 프롬프트의 기존 "할당된 Skill (있는 경우)" 참고 블록을 "필수 실행 스킬 (SKIP 금지)" 명령문으로 교체. 첫 액션 = Skill invoke 강제, 완료 보고 첫 줄에 `Skill invoked: /{skill_name}` 필수. `skills/c/SKILL.md`, `skills/cc/SKILL.md`
- **Supervisor 감사 조항** — Supervisor 프롬프트에 "스킬 호출 감사" 섹션 추가. Worker 완료 보고에서 `Skill invoked:` 라인 존재 여부를 grep으로 검증, 스킬 할당됐는데 누락 시 해당 서브태스크 **점수 0점** + 재작업 지시. `general`로 명시된 일반 태스크는 감사 제외. JSON 출력 스키마에 `skill_audit` 필드 추가. `skills/c/SKILL.md`, `skills/cc/SKILL.md`
- **Codex CLI 통합 규칙** — 신규 `docs/rules/codex-integration.md` 문서. Codex CLI 감지 로직(PATH/VSCode 확장 경로/fallback), 인증 확인, 표준 호출 패턴(`codex exec --skip-git-repo-check`), 응답 파싱 규칙(`codex` ~ `tokens used` 본문 추출), pre-mortem 프롬프트 템플릿, 에러 처리, 비용/성능 가이드

### Changed (v3.1.0)

- **`/cp` 계획 문서 템플릿** — `## 기술적 접근`과 `## 진행상황` 사이에 `## ⚠️ 사전 리스크` 섹션 placeholder 자동 추가. Phase 2.5에서 채움. Phase 2와 2.5를 분리된 Write 작업으로 처리해 원자성 보장 (Phase 2.5 실패해도 계획 문서 이미 저장됨). `skills/cp/SKILL.md`
- **Model Assignment Table** — `/c`, `/cc` 모두 Supervisor 행을 `sonnet` → `sonnet (default) / opus (when any Worker uses opus)`로 갱신
- **버전 동기화** — 9곳 버전 문자열 `v3.0.0` → `v3.1.0`: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (2곳), `hooks/hooks.json`, `hooks/session-start.js` (4곳), `skills/c/SKILL.md` (2곳), `skills/cc/SKILL.md` (2곳), `skills/cp/SKILL.md` (2곳), `CLAUDE.md`
- **docs/history/ 정리** — v3.0.0 릴리스 시 완료됐으나 `docs/tasks/`에 남아있던 3개 task 파일을 `docs/history/`로 이관

## [3.0.0] - 2026-04-11

### Added (v3.0.0)

- **`/c` v3.0 — Sequential task execution engine** — Complete rewrite from skill navigator to full execution engine. 6-phase workflow: Leader analyzes → Approval → Worker (sequential) → Supervisor → QA → Report. `skills/c/SKILL.md`
- **`/cc` v3.0 — Parallel task execution engine** — Complete rewrite with unified architecture. Same 6-phase workflow as /c, but Phase 3 deploys N workers in parallel. `skills/cc/SKILL.md`
- **`/cp` v3.0 — Documentation management engine** — Auto-detects mode: plan tasks, record completions, organize project docs. Three modes: Plan (task description given), Done (no args + completed tasks), Organize (no args + messy docs). `skills/cp/SKILL.md`
- **Model assignment system** — Workers assigned haiku/sonnet/opus based on task difficulty. Leader uses current model, Supervisor uses sonnet, QA and Monitor use haiku
- **Monitor agent** — Background haiku agent reports progress every 5 minutes during execution. Auto-terminates when all workers complete
- **Task approval system** — Mandatory AskUserQuestion before any execution showing task table with assigned skills, models, and difficulty levels
- **docs/ document structure** — New project-wide documentation convention: `docs/tasks/` (active work), `docs/history/` (completed records), `docs/rules/` (project rules). Folder location = status
- **TodoWrite integration** — All /c and /cc executions create and update TodoWrite entries for real-time progress tracking
- **Worker skill reporting** — Leader reports which gstack/installed skill is assigned to each worker before execution starts

### Changed (v3.0.0)

- **`/c` completely rewritten** — From 82-line skill navigator to 600-line sequential execution engine with Supervisor/QA pipeline
- **`/cc` completely rewritten** — From 368-line orchestration to 627-line parallel execution engine with unified architecture matching /c
- **`/cp` completely rewritten** — From 208-line planning tool to 378-line documentation management engine with auto mode detection
- **CLAUDE.md slimmed** — Removed Release Checklist (55 lines), Publishing section, Recent Changes. Added fixed pointers to docs/tasks/, docs/history/, docs/rules/. 213 → 128 lines
- **docs/ restructured** — DOCUMENTATION-GUIDE, DOCUMENT-CONVENTIONS, RELEASE-GUIDE, PUBLISHING-GUIDE moved to `docs/rules/`. Analysis reports and work plans moved to `docs/history/`. New `docs/tasks/` for active work
- **Version strings** — All 9 locations bumped from v2.0.0 to v3.0.0

### Removed (v3.0.0)

- **`/c` skill navigator mode** — Replaced by full execution engine (skill inventory still available with `/c` no args)
- **`.lens/results/` save path** — Replaced by `docs/` structure
- **CreetaDocs/ folder** — Replaced by `docs/tasks/` for /cp output
- **CLAUDE.md bloat** — Release checklist, publishing guide, change log sections removed (moved to docs/rules/ or CHANGELOG.md)

## [2.0.0] - 2026-04-06

### Added (v2.0.0)

- **gstack skill priority matching** — `/c` now prioritizes gstack skills over other plugins when matching user requests. 12 common mappings (QA→/qa, debug→/investigate, review→/review, etc.)
- **Agent skill assignment** — `/cc` Leader assigns gstack skills to Workers, Supervisors, and QA agents based on sub-task domain. Mapping table for Worker/Supervisor/QA roles
- **Recommended Skills table in plans** — `/cp` generates a skill-to-step mapping table in every planning document, showing which gstack skill matches each step

### Changed (v2.0.0)

- `/c` Matching Rules section expanded with gstack priority rule
- `/cc` Core Principle section expanded with "Skill Assignment — gstack Priority" subsection
- `/cp` Technical Approach section expanded with "Recommended Skills" subsection
- Version bump: 1.9.0 → 2.0.0 (MAJOR — core matching logic change)

## [1.9.0] - 2026-03-31

### Changed (v1.9.0)

- **`/cc` completely rewritten** — Leader-Worker-Supervisor-QA team orchestration replacing the previous parallel multi-agent approach
- **General-purpose Workers** — Workers are now general-purpose agents, not limited to installed skills
- **Mandatory user approval** — User approval required before execution (Phase 1.3)
- **QA Verification phase** — Phase 5 added with actual testing via Playwright/Bash/curl
- **Supervisor quality review** — Scoring system introduced (80+ = pass)
- **Max 5 iteration feedback loop** — Failed sub-tasks re-dispatched with Supervisor feedback
- **English-only** — All output and documentation switched to English for international distribution
- **Rebranded** — Repository moved from `Creeta-creet/creet` to `CreetaCorp/lens`

## [1.7.1] - 2026-03-02

### Fixed (v1.7.1)

- **Storage path consistency** — Unified all documentation references to `docs/` (was mixed `.lens/plans/` and `docs/`). Code already used `docs/` correctly; docs now match.
- **`cancelled` status support** — Added `cancelled` to `validStatuses` in `updatePlanStatus()` with `cancelledAt` timestamp tracking. Was missing despite being documented in DOCUMENT-CONVENTIONS.md.
- **Regex safety in `updatePlanStatus()`** — Rewrote to extract YAML frontmatter first before replacement, preventing greedy regex from matching body content.
- **8-language plan headers** — Added Spanish, French, German, Italian section headers to `generatePlanContent()` (was only EN/KO/JA/ZH).
- **YAML frontmatter parser** — Added null/boolean/integer type conversion in `parsePlanFrontmatter()`.
- **JSON parse safety** — `savePlanState()` now gracefully resets on corrupted `plan-state.json` instead of crashing.
- **CLAUDE.md exports list** — Updated from 5 to 15 exported functions including `getStatePath()`.

### Changed (v1.7.1)

- All version strings unified to v1.7.1 across plugin.json, marketplace.json, hooks.json, CLAUDE.md
- `skills/cp/SKILL.md` save location simplified to 2-tier priority (planDir → docs/)
- `docs/DOCUMENT-CONVENTIONS.md` updated with correct storage paths, slug rules, folder structure
- `README.md` added `saveSynthesisResults` and `resultsDir` config options

## [1.7.0] - 2026-02-28

### Added (v1.7.0)

- **`/cp` — Lens Plan**: New skill for plan-first execution. Generates a work plan document (작업계획서) before executing, saves it as a markdown file, presents for user approval, then executes. 7-phase workflow: Scan → Analyze → Generate Plan → Approve → Execute → Post-Exec Update. `skills/cp/SKILL.md`
- **Plan Manager module** — Plan document file naming (`YYYY-MM-DD-slug.md`), state tracking (`plan-state.json`), slug generation (Korean/Japanese/Chinese character support), plan listing and summary. `lib/plan-manager.js`
- **`planDir` config option** — Custom plan file directory override (default: project `docs/`). `lens.config.json`
- **`defaultPlanLanguage` config option** — Force plan document language (default: auto-detect from user). `lens.config.json`
- **`recordPlanCreation()`** — New function in memory-store for tracking plan creation in session memory. `lib/memory-store.js`

### Changed (v1.7.0)

- `hooks/session-start.js` — Now initializes plans directory at session start; loads recent plan history into session context; Quick Commands section includes `/cp`
- `skills/c/SKILL.md` — Added `/cp` cross-reference in Rules section; version → v1.7.0
- `skills/cc/SKILL.md` — Version → v1.7.0
- All version strings unified to v1.7.0 across 8 files

## [1.6.0] - 2026-02-28

### Added (v1.6.0)

- **Agent Dashboard** — Real-time sub-agent lifecycle tracking via `.lens/agent-dashboard.json`. Tracks session ID, agent status (pending/running/done/error), duration, error logs. `lib/agent-tracker.js`
- **PreToolUse hook (Task)** — Registers each Task agent as "running" in the dashboard before execution. `hooks/pre-tool-task.js`
- **PostToolUse hook (Task)** — Marks Task agent as "done" or "error" after completion, records duration. `hooks/post-tool-task.js`
- **Stop hook** — Records final session state on exit, marks orphaned agents as error. `hooks/stop.js`
- **Slash command priority override** — When user explicitly types `/skill-name`, UserPromptSubmit injects highest-priority instruction to execute it immediately instead of re-recommending. `scripts/user-prompt-handler.js`
- **design-council registry entry** — Added to plugin-registry as a built-in multi-agent orchestration pattern. `lib/plugin-registry.js`

### Changed (v1.6.0)

- `hooks/hooks.json` — Expanded from 2 hooks (SessionStart, UserPromptSubmit) to 5 hooks (+PreToolUse, +PostToolUse, +Stop)
- `hooks/session-start.js` — Now initializes agent dashboard via `initSession()` at startup; dashboard path included in hook output
- All version strings unified to v1.6.0 across 7 files

### Documentation (v1.6.0)

- Added `docs/DOCUMENTATION-GUIDE.md` — Documentation standards and structure definition
- Rewrote `CLAUDE.md` following documentation guide (200-line limit, table-first)
- Updated `README.md` — Removed internal architecture details, removed hardcoded version numbers
- Added v1.6.0 entry to `CHANGELOG.md` (this entry)

## [1.5.0] - 2026-02-25

### Fixed (v1.5.0)

- **Cross-platform stdin** — `user-prompt-handler.js` was using `fs.readFileSync('/dev/stdin')` which is Unix-only. Replaced with `fs.readFileSync(0, 'utf-8')` (file descriptor 0) which works on Windows, Mac, and Linux. The `UserPromptSubmit` hook was completely non-functional on Windows before this fix.
- **Dynamic plugin cache path** — `skill-scanner.js` PLUGINS_CACHE_DIR was hardcoded. Replaced with 4-level env var resolution: `CLAUDE_PLUGIN_CACHE_DIR` → inferred from `CLAUDE_PLUGIN_ROOT` → `CLAUDE_HOME/plugins/cache` → `~/.claude/plugins/cache`.
- **Stable memory path** — `memory-store.js` was using `process.cwd()` to locate memory file, causing data loss when Claude Code was opened from different directories. Now always writes to `~/.claude/lens/.lens-memory.json` (respects `CLAUDE_HOME` env var).
- **Version string inconsistency** — `hooks.json` and `session-start.js` still showed `v1.3.0` despite v1.4.0 being released. All version strings updated to v1.5.0.

## [1.4.0] - 2026-02-24

### Added (v1.4.0)

- **`/cc` — Lens Multi**: New skill for parallel multi-agent execution. Finds ALL relevant skills for a request, runs them simultaneously as independent Task agents, and synthesizes the results into a unified output. Unlike `/c` which recommends one skill, `/cc` runs the whole team at once.
  - N ≤ 5 matched skills: auto-executes without prompting
  - N > 5 matched skills: confirms via AskUserQuestion before running
  - Locates each skill's SKILL.md via Glob → injects full prompt into a `general-purpose` Task agent
  - Synthesis block highlights agreements, conflicts, and recommended next steps
  - Falls back to `/c` workflow if only 0–1 skills match

### Changed (v1.4.0)

- `session-start.js` Quick Commands section now lists both `/c` and `/cc` with distinct descriptions
- `skills/c/SKILL.md` description updated to v1.4.0; notes `/cc` as the parallel companion

### Removed (v1.4.0)

- `skills/design-council/SKILL.md` — Was incorrectly shipped as an installable skill. Moved to README as a pattern example under "Building Custom Skills with Lens".

## [1.3.0] - 2026-02-22

### Changed (v1.3.0)

- **Zero hardcoded dependencies** — Keyword matcher no longer contains hardcoded skill names. All keyword-to-skill mappings are built dynamically from scanner results at session start.
- **Dynamic keyword map** — `keyword-matcher.js` completely rewritten. Uses each skill's `triggers` field from scanner output instead of a static `DEFAULT_KEYWORD_MAP`.
- **Scan cache** — Session start now saves scan results to `.lens-cache.json` so the `UserPromptSubmit` hook can match keywords without re-scanning.
- **README genericized** — All plugin-specific examples replaced with generic placeholders. Lens is now fully plugin-agnostic in code and documentation.

### Removed (v1.3.0)

- `DEFAULT_KEYWORD_MAP` in `keyword-matcher.js` — Was hardcoding 10 specific skill names from bkit and other plugins.

## [1.2.0] - 2026-02-22

### Added (v1.2.0)

- **MCP tool detection** — Scanner now detects `.mcp.json` files and lists MCP tool servers
- **LSP server detection** — Scanner reads `lspServers` from `plugin.json` for language servers
- **Hybrid plugin support** — Plugins with both Skills and MCP are marked with `hasMcp` flag
- **Type column** in scan output — Each entry shows its type: Skill, MCP, or LSP
- **`mcpServers` wrapper format** — Handles both direct `{"server": {...}}` and wrapped `{"mcpServers": {"server": {...}}}` formats
- **Language extraction** for LSP entries from `extensionToLanguage` mappings
- **`readPluginDescription()`** helper for MCP/LSP entries without skill metadata
- **`parseMcpFile()`** and **`parseLspPlugin()`** functions in skill-scanner.js

### Changed

- `scanInstalledSkills()` now returns entries with `type` field (`'skill'`, `'mcp'`, `'lsp'`)
- `formatSkillTable()` shows Type column and breakdown summary (e.g. "48 skills, 4 MCP tools, 2 LSP servers")
- `commands/` directory scanning — Previously only scanned `skills/`, now scans both
- `extractFullDescription()` — Fixed YAML block scalar parsing for empty lines
- `extractTriggers()` — Improved regex to handle multi-line triggers and YAML keys
- `yamlValue()` — Stops at `Triggers:` and `argument-hint:` to avoid polluting descriptions
- Domain detection expanded from 14 to 24 patterns (added Workflow, Fullstack, Database, Storage, QA, Branding, Enterprise, Navigator, Config, Schema, SDK)

### Fixed

- Triggers were always empty (0/48) due to YAML block scalar regex not handling empty lines
- `commands/*.md` files were not being scanned (only `skills/*/SKILL.md` was scanned)
- Domain misclassification (e.g. `/dynamic` classified as Auth instead of Fullstack)

## [1.1.0] - 2026-02-21

### Added

- Session hooks (SessionStart, UserPromptSubmit)
- Multilingual keyword matching (EN, KO, JA, ZH, ES, FR, DE, IT)
- Session memory persistence
- Plugin discovery registry
- Lens suggestion line in responses
- `lens.config.json` for configuration

### Changed

- Rebranded from Compass to Lens
- 4-phase workflow: Scan → Recommend → Execute → Discover

## [1.0.0] - 2026-02-20

### Added

- Initial release as Compass
- Basic skill scanning from `skills/` directory
- Simple keyword matching
- Skill recommendation
