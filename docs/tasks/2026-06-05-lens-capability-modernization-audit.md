---
plan_id: 2026-06-05-lens-capability-modernization-audit
title: "Lens 자가 현대화 감사 기능 (/cr) — 기능별 의미·목적 주기 재분석"
status: draft
created: 2026-06-05
size: large
refs:
  - skills/cr/SKILL.md (new)
  - docs/rules/capability-assumptions.json (new)
  - lib/capability-audit.js (new)
  - hooks/session-start.js
  - lens.config.json
target_version: v3.13.0
---

# Lens 자가 현대화 감사 기능 (`/cr`)

## 🎯 목표 — 무엇이 가능해지는가 (사람 언어)

**이 작업이 끝나면 가능해지는 것 (4차원 양면 감사):**

- **[공급-드리프트]** Lens 사용자가 creeta-lens 레포에서 **한 번의 명령(`/cr`)** 으로, 지금 Lens의 모든 기능(7스킬·5훅·핵심 lib·Codex 연동)이 Claude/Codex의 최근 발전에 비춰 **"지금도 유효한가 / 더 얇게 만들 수 있나 / 무의미해졌나"** 를 분류된 리포트로 받는다.
- **[공급-업그레이드]** 각 기능을 *더 좋게* 만드는 구체 벡터(새 네이티브 능력 활용)와, **[편의]** 사용자 워크플로 기준 마찰 제거안을 함께 받는다.
- **[수요-마이닝]** 과거 세션 대화 패턴(반복·불편·우회)을 분석해 **net-new 기능 제안**을 받는다 (실제 반복에 뿌리내린 것만, 기존 스킬 중복은 거부).
- 분류·근거는 **라이브 probe(로컬 환경/CLI) + 공식 체인지로그**로 제시되고, 확신 높은 업그레이드는 **`/cp` task 문서**로 자동 생성된다.
- 감사가 오래됐거나 기능 구성이 바뀌면 **creeta-lens 레포에서 세션 시작 시에만** 한 줄 알림(타 프로젝트 미출력).
- 아직 필요한 기능이 실수로 "무의미(제거)"로 찍히지 않는다 — 죽음 판정은 **사람이 결정할 제안으로만**, 코드 자동삭제 0.

> **실증 완료 (Pass 1, 2026-06-05):** 이 4차원 감사를 멀티에이전트 워크플로로 **이미 1회 실행**했다. 결과 = `docs/history/2026-06-05-lens-modernization-audit.md` (0 OBSOLETE / 2 KEEP / 9 THIN + 14 우선조치 + 신기능 제안 0건(`/ch`·`/cx` 둘 다 2026-06-06 사용자 리뷰 후 드롭) → 수요 가치는 "반복 명령을 스킬 기본값으로"로 재정의돼 v3.14.0 반영). 원자료 = `.lens/conv-mining/audit-supply.json`·`audit-demand.json`. `/cr`은 이 패스를 **자동·주기화**하는 기능이다.

**완료의 정의 (Done = ?):**

> creeta-lens 레포에서 `/cr`를 실행하면, 각 기능에 KEEP/UPGRADE/OBSOLETE/NEW 판정과 근거가 달린 md+HTML 리포트가 `docs/history/`에 생기고 board에 카드로 뜨며, 확신 높은 건은 `docs/tasks/`에 `/cp` task로 떨어지고, 다음 세션 시작 시 staleness 알림이 사라진다.

## ✅ 검증 — 이게 됐다는 증거 (기계가 판정)

| # | 목표가 됐다는 신호 | 확인 방법 (명령/관측) | 통과 판정 | 종류 |
|---|------------------|----------------------|----------|------|
| 1 | `/cr`가 모든 기능을 빠짐없이 분류 | 리포트의 분류 행 수 vs 레지스트리 항목 수 비교 | 누락 0 | manual |
| 2 | 비-KEEP 판정에 라이브 근거 부착 | 리포트의 각 OBSOLETE/UPGRADE/NEW 행에 공식 체인지로그 URL+버전 인용이 있는가 | 근거 없는 비-KEEP = 0 | manual |
| 3 | 고신뢰 업그레이드 → `/cp` task 생성 | `ls docs/tasks/` 에 high-confidence 항목별 대응 task `.md` 존재 | 매핑 일치 | auto |
| 4 | md+HTML+board 3종 산출 | `ls docs/history/<id>.md <id>.html` + `grep <id> docs/board_creeta-lens.html` | 3파일 + 카드 노출 | auto |
| 5 | staleness 알림 스코프 | creeta-lens에서 세션 시작 시 알림 출력 / 임의 타 레포에선 미출력 | repo=출력, other=미출력 | manual |
| 6 | 알림 리셋(타이머) | `/cr` 완료(stamp) 후 `.lens/capability-audit-state.json`의 `lastAuditAt` 갱신 → 재시작 시 알림 사라짐 | 타임스탬프 갱신 확인 | auto |
| 7 | obsolete 안전장치 | OBSOLETE 판정이 있어도 코드/스킬 파일이 자동 삭제되지 않음 | `git status` 변경분 = 문서·신규파일만 | auto |
| 8 | 라이브 fetch 실패 시 안전 degrade | 네트워크 차단 상태로 `/cr` 실행 시 비-KEEP을 UNKNOWN으로 표기, OBSOLETE 추측 금지 | UNKNOWN 표기 + 오판 0 | manual |

## Plan A — 권장 경로

### 왜 이게 1순위인가

- **포터빌리티**: Lens는 여러 머신에 배포되는 플러그인. cron 대신 "온디맨드 스킬 + 세션 staleness 알림"이 머신 독립적이고, 기존 `/cu`(per-machine, 필요할 때만) 패턴과 일치한다.
- **레지스트리 = 반복 비용 절감**: 각 기능이 "메우는 네이티브 공백"을 1회 명시해두면, 매 감사는 *재도출*이 아니라 *대조(diff)* 가 된다 — 싸고 일관됨. (사용자 선택)
- **관심사 분리**: 레지스트리는 **Lens 쪽**(각 기능이 가정하는 공백)을, 라이브 fetch는 **네이티브 쪽**(Claude/Codex가 지금 실제로 하는 것)을 담는다. 감사 = 둘의 diff. 충돌이 아니라 합성이다.
- **재사용**: HTML 덱+board는 `/cp`의 기존 machinery(board-builder.js, report 템플릿)를 그대로 쓴다 — 새 렌더러 불필요.

### 단계

- [ ] **A1. 레지스트리 작성** — `docs/rules/capability-assumptions.json` (machine-readable). 모든 기능 1행씩: `{id, kind, refs[], purpose, assumed_native_gap, gap_closed_signal, signal_method(probe|web|both), official_sources[], false_obsolete_risk, last_reviewed}`. **`signal_method` 추가(P1 검증됨)** — 능력 신호 중 로컬 확정 가능한 것(네이티브 명령 존재·`codex --help` 노출 모델 등)은 `probe`, 로드맵/공식 발표는 `web`. **시드 = Pass1 감사의 `registry_seed` 11행**(`.lens/conv-mining/audit-supply.json`). **SoT = 실제 `skills/*/SKILL.md`·`hooks/*`·`lib/*` (START_HERE.md 신뢰 금지 — /cu 누락 구문).** → verify: JSON 유효 + 모든 `refs` 경로 실재
- [ ] **A2. `/cr` 스킬 작성** — `skills/cr/SKILL.md`. Phase A 레지스트리+Lens 버전 로드 → Phase B 라이브 fetch(공식 allowlist만: Claude Code releases/CHANGELOG, Codex releases/docs; **소수의 표적 쿼리로 묶어** quota 절약) → Phase C 분류(KEEP/UPGRADE/OBSOLETE/NEW + confidence + evidence URL; **OBSOLETE는 강한 근거만, 모호하면 KEEP/UNKNOWN**) → Phase D `docs/history/<date>-lens-capability-audit.md` 작성 → Phase E HTML 덱+board 재빌드 → Phase F 고신뢰 UPGRADE/OBSOLETE/NEW → `/cp` 핸드오프 task 생성 → Phase G `node lib/capability-audit.js stamp` 로 상태 갱신. → verify: 레포에서 end-to-end 실행 시 리포트 산출
- [ ] **A3. `lib/capability-audit.js` 추가** — `readAuditState()`, `isLensRepo(cwd)`(레지스트리 파일 존재로 판정), `computeRegistryHash()`, `formatAuditNudge(state,cfg)`, CLI `stamp` 서브커맨드(`.lens/capability-audit-state.json`에 `{lastAuditAt, registryHash}` 기록). → verify: `node lib/capability-audit.js stamp` 가 상태 파일 생성
- [ ] **A4. SessionStart 알림 배선** — `hooks/session-start.js`: `isLensRepo(cwd)` 이고 (`capabilityAuditIntervalDays` 초과 **또는** 레지스트리 해시 변경) 이면 `additionalContext`에 **muted 한 줄** 주입. **네트워크 호출 0, 로컬 상태 파일만 read.** → verify: lens 레포=알림, 타 레포=무알림 (검증 #5)
- [ ] **A5. config + 문서** — `lens.config.json` += `capabilityAuditIntervalDays`(기본 30) + `capabilityAuditNudge`(기본 true). `CLAUDE.md` 스킬 표 + `README.md` += `/cr`. (START_HERE /cu 드리프트는 **언급만**, 본 작업 범위 밖) → verify: 키 부재 시 기본값으로 동작
- [ ] **A6. 릴리스(MINOR → v3.13.0)** — release-guide 9곳 버전 범프 + CHANGELOG `Added` + 커밋 분리(코드/범프) + 태그 + `push --tags` + GitHub Release. → verify: `grep -rn "v3.12.2" skills/ hooks/ .claude-plugin/` = 0

### 막힐 수 있는 지점 (→ Plan B 트리거)

- **B-트리거 후보 ①**: A2 Phase B에서 공식 체인지로그 WebFetch/WebSearch가 실패(오프라인·레이트리밋·페이지 포맷 파싱 불가) → "공백이 닫혔나?"를 라이브로 판정 불가.
- **B-트리거 후보 ②**: 라이브 데이터는 받았으나 모호해서 OBSOLETE/KEEP 경계가 불분명 → false-obsolete 위험.

## Plan B — Fallback 경로 (안전 degrade)

### Trigger

Plan A **A2 Phase B에서 공식 체인지로그 라이브 fetch가 실패하거나, 응답이 해당 기능의 공백 종료 여부를 판정하기에 불충분**할 때 즉시 전환.

### 왜 이 대안인가

라이브 데이터가 없을 때 **추측으로 OBSOLETE를 찍는 것이 최악**(아직 필요한 기능을 죽이는 false-obsolete). 그래서 "정보 없음"을 정직하게 표기하는 쪽이 옳다. trade-off = 그 회차는 덜 actionable 하지만 **틀리지 않는다.**

### 단계

- [ ] B1. 판정 불가 기능을 전부 `UNKNOWN — live data unavailable`로 표기 (절대 OBSOLETE 추측 금지)
- [ ] B2. 로컬로 판정 가능한 것(레지스트리의 현재 status, 명백한 KEEP)만 분류
- [ ] B3. 리포트 헤더에 `DEGRADED (no live capability data)` 배지 + 재실행 안내
- [ ] B4. (선택, hint only) `/cu`가 이미 수집한 설치 Claude/Codex 버전을 *참고 정보*로만 표시 — OBSOLETE 근거로는 절대 미사용

## 🔀 듀얼 합성 (Claude ‖ Codex)

**합의 (고신뢰 — 그대로 lock):**
- 새 스킬 `skills/cr/SKILL.md`; 라이브 공식 체인지로그/문서만 조회(오프라인 버전레지스트리 아님); 레지스트리 "공백 가정 ↔ 종료 신호" 대조 → KEEP/OBSOLETE/UPGRADE/NEW + confidence.
- 산출 = `docs/history/<date>-lens-capability-audit.md/html` + board 재빌드; 고신뢰 건은 **삭제가 아니라** `docs/tasks/`에 `/cp` task로 생성.
- SessionStart 알림은 **네트워크 0**, 로컬 상태만 읽음. OBSOLETE 자동 제거 절대 금지, 모호하면 KEEP.

**분기 → 해소:**
- **레지스트리 포맷**: Claude=markdown 표 / Codex=JSON. → **채택=JSON** (`docs/rules/capability-assumptions.json`). 근거: 사용자가 "machine-readable" 명시 + 훅의 *레지스트리-해시 staleness 트리거*가 안정적 직렬화를 요구(JSON이 해시하기 깔끔). 유지보수는 release-guide 체크리스트 항목으로 보완.
- **staleness 상태 저장 위치**: Claude=전역 `~/.claude/lens/.lens-memory.json` / Codex=프로젝트-로컬 `.lens/capability-audit-state.json`. → **채택=Codex(프로젝트-로컬)**. 근거: 전역이면 모든 프로젝트에서 알림이 떠 nag 발생. `/cr`은 lens 레포에서만 의미 있으므로 로컬 상태가 알림 스코프를 자연히 한정. 덤으로 **레지스트리 해시 변경 시 재감사** 신호도 얻음.
- **fetch 실패 fallback**: Claude=버전-앵커 오프라인 판정 / Codex=UNKNOWN-default·KEEP-safe. → **채택=Codex(UNKNOWN-default)**. 근거: 더 단순하고 false-obsolete에 더 안전(Rule 2). 버전-앵커 컬럼은 과설계라 제거.
- **하이진 캐치(Codex)**: `docs/START_HERE.md`가 아직 6스킬(/cu 누락) 구문 → 레지스트리 SoT로 쓰면 안 됨. 레지스트리 작성 규칙에 반영.

## ⚠️ 사전 리스크 (Pre-mortem)

### Claude Opus 관점 (세션 컨텍스트 기반)

**P1. (핵심) 라이브 웹 체인지로그는 "능력"을 잘 안 알려준다 — 더 권위 있는 신호는 *실행 중인 환경 자체*다.**
체인지로그는 기능을 나열하지 모든 능력을 명시하지 않는다("Task tool이 이제 X 가능"은 릴리스 노트에 안 적힘). 반면 `/cr`이 도는 **현재 세션은 자기 능력 표면을 안다** — 네이티브 슬래시 명령 목록, 사용 가능한 도구, `claude --version`, `codex --help`/노출 모델. 즉 "네이티브 플러그인 열거 명령이 생겼나" "/goal이 있나" "codex가 아직 gpt-5.5를 노출하나" 같은 신호는 **웹 없이 로컬 probe로 더 정확히** 판정된다. → 권고: 레지스트리 `gap_closed_signal`에 `web`(체인지로그 인용)뿐 아니라 `probe`(로컬 환경 점검) 타입을 허용. *사용자가 "라이브 웹만" 선택했으므로 이는 Phase 5에서 별도 승인받을 Modify 후보 — 자동 반영하지 않음.*

**P2. Codex 쪽 가정은 Claude보다 빨리 드리프트하고, probe가 더 적합하다.**
`docs/rules/codex-integration.md`의 `gpt-5.5`·`xhigh`·VSCode 확장 경로는 codex 바이너리를 직접 `--help`로 찔러보는 게 웹보다 정확. P1과 같은 결: codex-integration 행의 신호는 probe 우선.

**P3. `isLensRepo(cwd)` 오탐/누락.** "레지스트리 파일 존재"만으로 판정하면 (a) lens 레포 하위 디렉토리에서 cwd≠루트, (b) 우연히 같은 경로를 둔 타 레포에서 오작동. → `docs/rules/capability-assumptions.json` **AND** `.claude-plugin/plugin.json`의 `name=="lens"` 동시 확인. 훅 cwd는 `CLAUDE_PROJECT_DIR` 사용.

**P4. SessionStart 5s 예산.** 레지스트리 해시 계산(파일 read+sha)은 싸지만, **반드시 hook-utils fail-soft로 감싸** 에러·지연이 세션을 막지 않게. 네트워크 호출 절대 없음(재확인).

**P5. (운영) A6 릴리스는 `scripts/bump-version.sh`를 써라 — 9곳 수기 편집 금지.** 레포에 일괄 버전 범프 스크립트가 이미 있다(릴리스 가이드의 9곳 수기와 드리프트 가능 — 스크립트가 11곳 갱신). → A6은 수기 대신 `bash scripts/bump-version.sh 3.13.0` 후 grep 검증.

**P6. (발견성) `/cr` SKILL.md에 `Triggers:` 줄 필수.** 자동추천 키워드 표는 scanner가 SKILL.md의 Triggers에서 동적 생성 → 없으면 UserPromptSubmit 자동추천에 안 뜸. SessionStart "Quick Commands"는 현재 /c·/cc·/cp만 하드코딩(이미 /cps·/cs·/cu 누락) — 이번에 /cr 추가는 하되 하드코딩 목록 보강은 본 작업 범위 밖(언급만).

**P7. (수명) `/cr` 매 실행 = `docs/history/`에 새 감사 파일 1개.** 의도된 audit trail이지만 board 카드가 누적 증가. 정상 설계이나 사용자 인지 필요.

### Codex 관점 (독립 코드 분석)
Phase 0.5에서 Codex 독립 조사가 이미 수행됨(듀얼트랙 활성) → v3.9 중복 회피 규칙에 따라 Codex pre-mortem은 **skip**. Codex의 리스크 시각(라이브 fetch 실패·레지스트리 드리프트·obsolete 오판·START_HERE 비신뢰)은 이미 `🔀 듀얼 합성` + 위 Risks에 통합됨.

### Trigger 매핑 (Pre-mortem 결과 → Plan B / 후속)
- **P1·P2 → Plan A 보강 후보(Phase 5 승인 필요)**: `gap_closed_signal`에 `probe` 타입 추가. 승인 시 A1 레지스트리 스키마 + A2 Phase B에 로컬 probe 단계 삽입.
- **P3·P4 → A3/A4 구현 세부**: `isLensRepo` 이중 확인 + fail-soft. (신규 Plan B Trigger 아님 — 구현 요건)
- **P5 → A6 치환**: 수기 9곳 → `scripts/bump-version.sh`.
- **P6 → A2 산출물 요건**: Triggers 줄 포함.
- **Blocker 판정**: 보안 치명/data-loss/되돌릴 수 없는 항목 **없음** → Phase 5 정상 진행(Modify 강제 아님). 단 P1은 품질상 권장 Modify.

## 진행상황
- **마지막 업데이트**: 2026-06-05
- **현재 경로**: Plan A (범위 4차원으로 확장 — 사용자 2회 추가지시 반영)
- **Pass 1 감사 실증 완료**: `docs/history/2026-06-05-lens-modernization-audit.md` (+HTML, board). 원자료 `.lens/conv-mining/*.json`. 신기능 0건(`/ch`·`/cx` 드롭) + 14 우선조치 도출 → 수요 가치=반복 명령 기본값화(v3.14.0).
- **재개 포인트**: v3.13.0(엔지니어링/코어 — 배포 완료) + v3.14.0(사용자 관점 반복명령→기본값 — 본 릴리스). 남은 코어 리팩토링(#6 /goal 위임·#7 Monitor 제거·#13 /cp 토큰·#12 /cps·#14 lens-upgrade)은 후순위 — 착수 시 별도 `/cp` 계획.
