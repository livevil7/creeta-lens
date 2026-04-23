# 전체 프로젝트 문서 정리 (docs/ 구조 표준화) — 완료

**완료일**: 2026-04-11
**출시 버전**: v3.0.0 (commit e51b43e)

## 요약
10개 프로젝트에 docs/tasks, history, rules 구조를 적용하고 CLAUDE.md를 슬림화(핵심 + 포인터만)하는 표준화 작업. Change Log / Bug History는 git log로 대체하고, 배포/트러블슈팅/인프라 정보는 docs/rules/로 분리.

## 주요 결정 사항
- 각 프로젝트에 `docs/tasks/`, `docs/history/`, `docs/rules/` 3-폴더 구조 공통 적용
- CLAUDE.md 콘텐츠 분류 원칙: 유지(스택/명령어/환경변수/폴더구조) / 이동(배포·트러블슈팅·인프라 → rules/) / 삭제(Change Log, Bug History, 날짜별 기록)
- Change Log·Bug History 섹션은 전부 제거하고 git log로 추적 대체
- CLAUDE.md에 고정 포인터(`docs/tasks/`, `docs/rules/`, `docs/history/`) 추가 → 작업마다 CLAUDE.md 수정 불필요
- 크기 순 우선순위: P0(returns-bidding-analyzer, livevil-openclaw) → P1(creeta-homepage, namane-homepage, creeta-workspace) → P2/P3

## 결과
v3.0.0 릴리스에 포함되어 배포됨. 상세 변경사항은 CHANGELOG.md [3.0.0] 섹션 참조.

## 원본 Task 문서
내용은 본 history 문서로 통합됨. 필요 시 git log로 원본 확인 가능 (2026-04-23 이전 docs/tasks/ 경로).
