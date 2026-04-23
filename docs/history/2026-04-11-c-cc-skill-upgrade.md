# /c, /cc SKILL.md v3.0 전면 업그레이드 — 완료

**완료일**: 2026-04-11
**출시 버전**: v3.0.0 (commit e51b43e)

## 요약
/c와 /cc 스킬을 공통 아키텍처로 통일(차이는 worker 1개 vs N개)하고, task 단위 승인 체계·난이도별 모델 할당(haiku/sonnet/opus)·5분 주기 진행 모니터링·docs/ 문서 규칙 연동·TodoWrite 실시간 추적을 도입.

## 주요 결정 사항
- /c와 /cc의 유일한 차이는 Phase 3에서 Worker를 1개 띄우냐 N개 띄우냐로 단순화
- 6-Phase 공통 파이프라인: 분석/계획 → 승인(AskUserQuestion) → Worker+모니터 배치 → Supervisor 검토 → QA 검증 → 최종 보고 + docs/ 기록
- 난이도별 모델 할당을 권고에서 강제 규칙으로 승격
- 5분 주기 진행 보고 모니터 에이전트 신설 (이전엔 최종 보고만 존재)
- 결과 저장을 `.lens/results/` 임시 저장에서 `docs/tasks/` 표준 경로로 연동
- TodoWrite로 실시간 진행 추적 (승인된 task 목록을 todo 항목으로 자동 생성)

## 결과
v3.0.0 릴리스에 포함되어 배포됨. 상세 변경사항은 CHANGELOG.md [3.0.0] 섹션 참조.

## 원본 Task 문서
내용은 본 history 문서로 통합됨. 필요 시 git log로 원본 확인 가능 (2026-04-23 이전 docs/tasks/ 경로).
