# `/ci` — Creeta Install (설치목록 동기화 스킬) — 완료

**완료일**: 2026-07-01

## 요약
per-user 설치목록(`~/.claude/lens/manifest.json`)과 이 머신의 실제 플러그인 설치현황을 대조해 4분류(설치할 것 / 제거할 것 / 목록밖 그대로둠 / 이미 맞음) 프리뷰 → 승인 → 설치·제거 동기화를 수행하는 신규 스킬 `/ci`를 만들었다. 결정론 백엔드 `lib/install-sync.js`(무의존, `claude plugin list --json` 1차 + `installed_plugins.json` 폴백) + 단위테스트 `lib/install-sync.test.js` + `skills/ci/SKILL.md`로 구성되며, **v3.22.0으로 출시**됐다(commit fe20cb2, tag v3.22.0).

## 주요 결정 사항
- **managed / excluded / foreign 3분리 안전모델 (Codex 핵심 교정)**: 제거는 `manifest.excluded`에 명시한 항목만. manifest에 없는 "foreign" 플러그인은 절대 자동 삭제하지 않고 보고만 한다. 모든 uninstall은 백업(`~/.claude/lens/removed-backup-<ts>/`) + 항목별 재확인 후에만.
- **Lens 자기보호 하드가드**: `lens@CreetaCorp`(자기 자신)은 제거 후보에서 원천 배제 — self-uninstall 재앙 차단.
- **cu.py 패턴 재사용 (Codex 교정)**: 초안이 모델로 삼은 `install-skills.ps1`은 livevil-setting 소속으로 이 레포에 없음 — Codex 지적으로 확인 후 레포 내 `scripts/cu.py`의 `installed_plugins.json` 직접 읽기 + scope 보정 패턴으로 교체.
- **설치현황 이중 수집**: `claude plugin list --json`(이 세션 실측 스키마) 1차 + `~/.claude/plugins/installed_plugins.json` 직접 파싱 폴백 — CLI 스키마가 버전에 따라 변할 수 있어 폴백 필수.
- **범용 설계**: livevil 개인 특화 로직 금지. manifest는 사용자가 채우는 빈 틀로 시작하며, 누구나 자기 목록을 갖는다. 목록 관리 UX는 `/ci add`·`/ci remove`·`/ci edit`.

## 변경 파일
- `skills/ci/SKILL.md` — 신규 스킬 (동기화 흐름 오케스트레이션 + 목록 관리 분기)
- `lib/install-sync.js` — 결정론 백엔드 (manifest 로더·설치현황 수집·diff 4분류·dry-run 프리뷰)
- `lib/install-sync.test.js` — 단위테스트 (foreign 불가침·lens 자기보호·excluded∩installed)
- 릴리즈 배선 — `scripts/bump-version.sh`(버전-bearing 스킬 목록), `docs/START_HERE.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`

## 테스트 & 검증
- task 계획의 EARS 6건(manifest 빈 틀 생성 / foreign 불가침 / lens 자기보호 / dry-run 무변경 / 제거 전 백업 / 세션 노출) 중 auto 항목은 단위테스트 `lib/install-sync.test.js`(레포에 실존)로 커버하도록 설계됐다.
- 이 문서는 사후 아카이브라 당시 개별 검증 로그는 남아 있지 않다. 다만 **v3.22.0 릴리즈·설치로 최종 확인** — 산출물 3종(`skills/ci/`, `lib/install-sync.js`, `lib/install-sync.test.js`)이 레포에 실존하고, `/ci`가 세션 스킬 목록에 정상 노출된다(2026-07-04 확인).

## 추가 사항
- manifest는 빈 틀로 시작 — 내 목록을 livevil-setting/skills.json에서 export해 이식하는 것은 별도 작업.
- `claude plugin list --json` 스키마는 Claude Code 버전에 따라 변할 수 있음 — 변화 감지 시 `installed_plugins.json` 폴백이 방어선.
