# Lens v3.6.0 — /cp Taskboard 전면 재설계 — 완료

**완료일**: 2026-05-21

## 요약

`/cp`의 문서 보드를 전면 재설계해 **v3.6.0**으로 배포했다. `board-builder.js`가 `docs/{tasks,history,rules}` 3폴더의 `.md`+`.html`을 직접 인덱싱해 단일 라이트 테마 `board_<repo>.html`을 생성하고, html이 있는 문서는 slide-over iframe으로, md-only 문서는 원본 텍스트 + "Convert to HTML" 버튼(Claude 재생성 요청)으로 보여준다. `docs/reports/` 중간단계는 폐지(비파괴).

## 주요 결정 사항

- **전환 버튼 = Claude 재생성 요청**: 정적 `file://`는 폴더 읽기·Claude 호출·파일 쓰기가 모두 불가하므로, 버튼은 `/cp html docs/<경로>` 명령을 클립보드에 복사하고 사용자가 Claude Code에 붙여넣어 실행한다. 슬라이드 데크 품질은 Claude 재구성으로만 가능.
- **전면 재설계 + 비파괴**: `reports/` 폐지, 3폴더 직접 인덱싱. 단 기존 `reports/`·`board.html`은 삭제하지 않음(다른 repo 호환).
- **보드 기본 생성**(opt-in 해제), 파일명 `board_<repo>.html`.
- **XSS 차단 = escape + `textContent`만**: md를 절대 `innerHTML`/파싱하지 않음 → 마크다운 라이브러리 불필요(단순성).
- **디자인**: 초기 다크/사이드바 버전을 사용자가 반려 → `livevil-contents`의 기준 보드(라이트·3열 카드·slide-over)를 명시적 베이스로 클론. Rules 열은 보라 액센트로 "참조 문서" 구분.

## 변경 파일

- `lib/board-builder.js` — schema v3 재작성(3폴더 스캔, md inline·40KB 캡·stale 해시) + `$` replace 버그 픽스(함수 치환)
- `templates/board.template.html` — 라이트 3열 + slide-over + 전환버튼/실패 모달
- `skills/cp/SKILL.md` — CONVERT 모드(`/cp html`) 신설 + PLAN/DONE html 위치(reports/→폴더 옆) + 보드 기본 생성
- `templates/report-conversion-spec.md` — `../_shared.css` + beside-md 위치
- `lens.config.json` — `buildBoard: true`
- `.claude-plugin/{plugin,marketplace}.json`, `CLAUDE.md`, `README.md`, `CHANGELOG.md` — v3.6.0

## 테스트 & 검증

- `node lib/board-builder.js` → `19 docs (tasks=3 history=11 rules=5)` 콘솔 출력
- 브라우저(localhost http) 검증: 라이트 3열 카드 그리드, html 클릭→슬라이드 데크 iframe, md-only 클릭→원본+Convert 버튼(클립보드 토스트 `/cp html docs/...`), 콘솔 에러 0
- XSS 픽스처(`<script>`, `</script>` breakout) → 보드 내 raw `</script>`=1(보드 자체뿐), 픽스처는 `<\/` escape + textContent로 미실행 확인
- **버그 발견·수정**: `tpl.replace('{{BOARD_DATA}}', payload)`가 md의 `` $` ``(codex-integration.md)를 replace 특수패턴으로 해석 → 템플릿 누출로 JSON 깨짐(콘솔 `Invalid or unexpected token`). 함수 치환 `() => payload`로 픽스. 브라우저 검증이 아니었으면 못 잡았을 통합 버그.
- 배포: commit `c48fcf8` + tag `v3.6.0` → `origin(livevil7/creeta-lens)` push → `/lens-upgrade` exit 0 → `claude plugin list` = **v3.6.0**

## 추가 사항

- 새 스킬은 **Claude Code 재시작** 후 로드됨(현 세션은 v3.5.0 스킬로 동작 중에 작업).
- 캐시 `3.5.0`/`3.3.1`은 활성 세션이라 보존됨 — 재시작 후 다음 업그레이드 시 정리.
- **보류 작업**: `creeta-homepage/docs/tasks/2026-05-21-lens-homepage-update.md` (홈페이지 Lens 카피 v3.5→현행 갱신).
- `docs/tasks/`의 테스트 md 2개(`2026-05-16-cp-goal-first-overhaul`, `2026-05-20-cp-html-reports-board`)는 테스트 산출물로 잔존(보드 렌더 픽스처).
