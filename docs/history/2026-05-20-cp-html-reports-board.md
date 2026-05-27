# /cp 보고서 HTML 양식 + Task Board — 완료

**완료일**: 2026-05-21 (출시: v3.6.0, 계획 작성 2026-05-20)

## 요약

livevil-contents에서 검증한 Pretendard 미니멀 보고서 HTML 양식 + board 인덱스를 lens `/cp`의 범용 기능으로 승격했다. `/cp`가 만든 task/history 문서를 slide-deck HTML로 보고, `docs/board.html`이 카드 클릭 시 iframe panel로 즉시 표시한다. 데이터 모델은 **md = SoT, HTML = 파생 뷰**.

## 주요 결정 사항

- **md SoT + HTML 파생 뷰** (사용자 확정) — 상태/요약은 md에만, HTML은 항상 md에서 파생.
- **board-builder.js**: `docs/{tasks,history}` 스캔 → board.html, `lens:source-hash` stale 감지.
- **자산 자동 배포**: `_shared.css`를 cp 실행 시 최초 1회 배포(있으면 skip).
- **하위 호환**: 최초엔 `reportFormat` opt-in(기본 md)으로 md-only 프로젝트 무영향. 이후 v3.6.0 board 전면 재설계에서 **always-on**으로 승격되며 이 task의 기반이 흡수됨.

## 변경 파일

- `templates/` — report-shared.css, report-conversion-spec.md, report-{history,plan}.example.html, board.template.html
- `skills/cp/SKILL.md` — "HTML 보고서 뷰 + Task Board" 섹션
- `lib/board-builder.js` — 신규 (스캔 → board, iframe panel, stale 감지)
- `lens.config.json` — reportFormat 옵션

## 테스트 & 검증

livevil-contents 3카드로 board 빌드 + 카드 클릭 → iframe panel 동작 검증. v3.6.0으로 출시(CHANGELOG `## [3.6.0]`). 본 task의 opt-in 접근은 v3.6.0 board 전면 재설계(`docs/history/2026-05-21-cp-board-redesign.md`)에서 `board_<repo>.html` 3-폴더 통합 + always-on으로 진화함.

## 추가 사항

이 task의 실질 후속/완성본은 `docs/history/2026-05-21-cp-board-redesign.md`다. 본 계획 문서가 `docs/tasks/`에 중복 방치돼 있다가 2026-05-27 `/cp done` sweep으로 정리됨.
