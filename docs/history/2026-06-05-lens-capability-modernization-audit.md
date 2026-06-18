# Lens 자가 현대화 감사 기능 (`/cr`) — 완료

**완료일**: 2026-06-06

## 요약

Lens가 자기 자신의 모든 기능을 Claude/Codex의 최근 네이티브 발전과 사용자 세션 패턴에 비춰 주기적으로 재평가하는 `/cr`(자가 현대화 감사) 스킬을 신설했다. 한 번의 명령으로 4차원 양면 감사 — 공급-드리프트(여전히 유효한가), 공급-업그레이드(더 좋게 만들 벡터), 편의(워크플로 마찰 제거), 수요-마이닝(반복 패턴 기반 net-new 제안) — 를 수행해 각 기능에 KEEP/UPGRADE/OBSOLETE/NEW 판정과 라이브 근거를 단 분류 리포트를 산출한다. 감사 로직은 머신 독립적인 온디맨드 스킬 + creeta-lens 레포 한정 SessionStart staleness 알림(네트워크 호출 0)으로 구현했고, OBSOLETE 자동삭제는 0건 — 죽음 판정은 사람이 결정할 제안으로만 남긴다. v3.13.0으로 배포 완료.

## 주요 결정 사항

- **온디맨드 스킬 + 세션 staleness 알림 (cron 아님)** — Lens는 여러 머신에 배포되는 플러그인이라 cron은 머신 의존적이다. 기존 `/cu`(per-machine, 필요할 때만) 패턴과 일치하는 온디맨드 방식을 채택해 포터빌리티를 확보했다.
- **레지스트리 포맷 = JSON** — Claude(markdown 표) vs Codex(JSON) 분기에서 JSON(`docs/rules/capability-assumptions.json`)을 채택. 사용자가 "machine-readable"을 명시했고, 훅의 레지스트리-해시 staleness 트리거가 안정적 직렬화를 요구하기 때문(JSON이 해시하기 깔끔).
- **staleness 상태 = 프로젝트-로컬** — 전역 `~/.claude` vs 프로젝트-로컬 분기에서 `.lens/capability-audit-state.json`(로컬)을 채택. 전역이면 모든 프로젝트에서 알림이 떠 nag가 발생하지만, `/cr`은 lens 레포에서만 의미 있으므로 로컬 상태가 알림 스코프를 자연히 한정한다. 덤으로 레지스트리 해시 변경 시 재감사 신호도 얻는다.
- **fetch 실패 = UNKNOWN-default (버전-앵커 오프라인 판정 아님)** — 라이브 데이터가 없을 때 추측으로 OBSOLETE를 찍는 것이 최악(false-obsolete)이다. 더 단순하고 안전한 UNKNOWN 표기를 택했다. 그 회차는 덜 actionable하지만 틀리지 않는다.
- **`probe` 신호 타입 허용** — 능력 신호 중 로컬 확정 가능한 것(네이티브 명령 존재, `codex --help` 노출 모델 등)은 `probe`, 로드맵/공식 발표는 `web`. Pre-mortem P1·P2 — "체인지로그는 능력을 다 안 알려주고 실행 중인 환경 자체가 더 권위 있는 신호" — 를 레지스트리 스키마(`signal_method`)에 반영했다.
- **OBSOLETE 자동삭제 0, 모호하면 KEEP** — 고신뢰 건도 삭제가 아니라 `docs/tasks/`에 `/cp` task로 핸드오프. obsolete 안전장치로 코드/스킬 파일 자동삭제를 금지했다.
- **수요 가치 재정의** — Pass 1 감사에서 신기능 제안은 0건(`/ch`·`/cx` 둘 다 사용자 리뷰 후 드롭). 수요 가치는 "반복 명령을 스킬 기본값으로"로 재정의돼 v3.14.0에 반영됐다.

## 변경 파일

- `skills/cr/SKILL.md` (신규) — `/cr` 스킬. Phase A 레지스트리+버전 로드 → Phase B 라이브 fetch(공식 allowlist) → Phase C 분류(KEEP/UPGRADE/OBSOLETE/NEW + confidence + evidence) → Phase D md 리포트 → Phase E HTML 덱+board → Phase F 고신뢰 건 `/cp` 핸드오프 → Phase G stamp. `Triggers:` 줄 포함(자동추천 노출용).
- `docs/rules/capability-assumptions.json` (신규) — machine-readable 레지스트리. 기능별 `{id, kind, refs[], purpose, assumed_native_gap, gap_closed_signal, signal_method(probe|web|both), official_sources[], false_obsolete_risk, last_reviewed}`. Pass1 감사의 11행을 시드로 사용.
- `lib/capability-audit.js` (신규) — `readAuditState()`, `isLensRepo(cwd)`, `computeRegistryHash()`, `formatAuditNudge()`, CLI `stamp` 서브커맨드.
- `hooks/session-start.js` — `isLensRepo(cwd)` 이고 (감사 주기 초과 또는 레지스트리 해시 변경)이면 muted 한 줄 알림 주입. 네트워크 0, fail-soft.
- `lens.config.json` — `capabilityAuditIntervalDays`(기본 30) + `capabilityAuditNudge`(기본 true) 추가.
- `CLAUDE.md` / `README.md` — 스킬 표에 `/cr` 추가.
- 릴리스 산출물 — `scripts/bump-version.sh 3.13.0`(11곳 일괄 범프) + CHANGELOG `Added` + 태그 + GitHub Release.

## 테스트 & 검증

8개 검증 신호(✅표) 기준:

- **분류 완전성** — 리포트 분류 행 수가 레지스트리 항목 수와 일치, 누락 0.
- **근거 부착** — 모든 비-KEEP(OBSOLETE/UPGRADE/NEW) 행에 공식 체인지로그 URL+버전 인용. 근거 없는 비-KEEP = 0.
- **핸드오프** — 고신뢰 UPGRADE/OBSOLETE/NEW가 `docs/tasks/`에 대응 `/cp` task로 생성됨.
- **3종 산출 + board** — `docs/history/<id>.md`·`.html` + board 카드 노출.
- **알림 스코프** — creeta-lens 세션 시작 시 알림 출력, 타 레포에선 미출력.
- **타이머 리셋** — stamp 후 `lastAuditAt` 갱신 → 재시작 시 알림 소멸.
- **obsolete 안전장치** — OBSOLETE 판정이 있어도 `git status` 변경분 = 문서·신규파일만(코드/스킬 자동삭제 0).
- **degrade 안전** — 네트워크 차단 시 비-KEEP을 UNKNOWN으로 표기, OBSOLETE 추측 0.

실증 완료(Pass 1, 2026-06-05): 이 4차원 감사를 멀티에이전트 워크플로로 1회 실행해 `/cr`이 자동화할 패스를 입증했다. 결과 = `docs/history/2026-06-05-lens-modernization-audit.md`(0 OBSOLETE / 2 KEEP / 9 THIN + 14 우선조치 + 신기능 0건). 원자료 = `.lens/conv-mining/audit-supply.json`·`audit-demand.json`.

## 추가 사항

- **수요 가치 후속** — "반복 명령을 스킬 기본값으로"는 v3.14.0에서 별도 반영.
- **남은 코어 리팩토링(본 task 범위 밖, 별도 `/cp` 계획으로 분리)** — #6 `/goal` 위임, #7 Monitor 제거, #12 `/cps`, #13 `/cp` 토큰, #14 lens-upgrade. 미완이 아니라 의도적으로 분리된 후속 항목.
- **언급만 한 드리프트** — `docs/START_HERE.md`의 6스킬(/cu 누락) 구문, SessionStart "Quick Commands" 하드코딩(/cps·/cs·/cu 누락)은 본 작업 범위 밖으로 명시.
- **수명 주의** — `/cr` 매 실행 = `docs/history/`에 새 감사 파일 1개. 의도된 audit trail이나 board 카드가 누적 증가한다.
