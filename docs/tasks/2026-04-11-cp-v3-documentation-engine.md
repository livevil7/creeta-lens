# /cp v3.0 — Documentation Management Engine 업그레이드

## 목표
- [x] 문서 구조 규칙 정의 (tasks/history/rules)
- [x] CLAUDE.md 슬림화 + 고정 포인터 추가
- [x] /cp SKILL.md v3.0 작성 (자동 모드 감지: Plan/Done/Organize)
- [x] creeta-lens 프로젝트 문서 재정리 (Organize 적용)
- [ ] /cp v3.0 플러그인 릴리즈 (버전 범프 + tag + release)
- [ ] 나머지 프로젝트 마이그레이션 (returns-bidding-analyzer, livevil-openclaw 등)

## 체크리스트
- [x] 문서 구조 규칙 설계 (폴더=상태, Task/History 분리)
- [x] CLAUDE.md 표준 템플릿 정의
- [x] /cp SKILL.md 재작성 (3모드 자동 감지)
- [x] 플러그인 캐시에 반영
- [x] creeta-lens docs/ 재정리 실행
- [x] 불필요 파일/폴더 정리
- [ ] 버전 범프 (v2.0.0 → v3.0.0)
- [ ] 다른 프로젝트에 /cp organize 적용

## 기술적 접근
- /cp 자동 모드 감지: 인자 있으면 Plan, 없으면 스캔 후 Done/Organize/상태보고
- 폴더 = 상태 원칙: frontmatter status 불필요, docs/tasks/ 존재 여부로 판단
- CLAUDE.md 포인터 고정: 작업마다 수정 불필요

## 진행상황
- **마지막 업데이트**: 2026-04-11
- /cp SKILL.md v3.0 완성, 캐시 반영 완료
- creeta-lens 문서 재정리 완료 (CLAUDE.md 213→128줄)
- Worker #2 잔여 파일 8개 정리 완료

## 재개 포인트
다음 세션에서 이것부터:
- [ ] 버전 범프 작업 (docs/rules/release-guide.md 참조)
- [ ] returns-bidding-analyzer에 /cp organize 첫 적용
