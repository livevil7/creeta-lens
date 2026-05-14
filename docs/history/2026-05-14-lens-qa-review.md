# Lens 플러그인 코드 리뷰 + QA — 부분 close

**완료일**: 2026-05-14

## 요약

9건의 발견사항(CRITICAL 2, MAJOR 3, MINOR 4) 중 **MAJOR 2건**(bump-version.sh 4개 버그, plugin-registry source 호환성)이 v3.2.2(`fa17c45`)와 v3.3.0(`ee1a4f9`) release에 흡수되어 close. **CRITICAL 2건은 미해결 carry-over**.

## 흡수된 항목 (close)

### MAJOR — bump-version.sh 4개 버그 (#3)
- (a) sed pattern → v3.2.2에서 정규식 `v[0-9]+\.[0-9]+\.[0-9]+`로 일반화
- (b) CHANGELOG.md multi-line prepend → awk로 교체
- (c) grep -P locale → `LC_ALL=C.UTF-8` 명시 (스크립트 호출자 책임)
- (d) verify가 stale drift 못 잡음 → 새 verification block: `grep -rohE "v[0-9]+\.[0-9]+\.[0-9]+"` 후 `$NEW_VERSION` 외 모두 stale 표기

### MAJOR — plugin-registry source 호환성 (#4)
- string `source` → typed `{type, repo}` 객체 (v3.3.0)
- `formatPluginSource()` helper로 backward compat
- Claude Code의 fake marketplace lookup 패턴 구조적 차단

## 미해결 carry-over (v3.4 roadmap 후보)

### CRITICAL — Session 차단 위험 (미해결)

- **#1 stdin blocking read in 4 hooks** (`post-tool-task.js:77`, `pre-tool-task.js:64`, `stop.js:61`, `session-start.js:25`). Claude Code가 stdin 안 보내면 5초 timeout까지 hang. Fix 방안: `if (process.stdin.isTTY) process.exit(0);` 가드.
- **#2 fs.* operations without try/catch** (session-start.js, agent-tracker.js, keyword-matcher.js, memory-store.js, plan-manager.js 등 15곳). 권한/disk/corrupt 시 hook 통째로 throw → "Hook UserPromptSubmit error" 패턴. Fix 방안: sync-pull.js의 fail-soft 패턴 적용.

### MINOR — 미해결

- context 비용 절감 (Plugin Discovery Registry 표 크기), 에러 처리 일관성, KNOWN_PLUGINS 표기 통일.

## 주요 결정 사항

- v3.3.0은 MAJOR 2건에 집중. CRITICAL은 의도적 deferral — 별도 hook refactor task로 분리할 가치.
- 모든 발견사항을 v3.3.0에 욱여넣지 않은 이유: minor release scope는 "structural fix"에 집중, hook 안전성은 별도 정밀 작업 필요.

## 변경 파일

이번 QA review의 fix는 두 release에 분산됨:
- v3.2.2 (`fa17c45`): `scripts/bump-version.sh`
- v3.3.0 (`ee1a4f9`): `lib/plugin-registry.js` + dependents

## 테스트 & 검증

- v3.2.2 bump-version.sh 정규식: v3.2.2 → v3.3.0 bump가 첫 실전 검증 (10/10 파일 자동 sync, stale detection 작동).
- v3.3.0 source 구조: lens-upgrade Phase 5 verify에서 cache 새 install 시 새 구조로 정상 로드 확인.

## 추가 사항

CRITICAL 2건(#1, #2)은 다음 v3.4 또는 v3.3.1 patch에서 별도 task로 다시 열어 처리 권장. hook safety 단독 PR이 안전.
