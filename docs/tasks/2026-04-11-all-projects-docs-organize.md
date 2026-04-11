# 전체 프로젝트 문서 정리 (docs/ 구조 표준화)

## 목표
- [ ] 10개 프로젝트에 docs/tasks, history, rules 구조 적용
- [ ] 각 CLAUDE.md 슬림화 (핵심 + 포인터만)
- [ ] Change Log / Bug History 삭제 (git log 대체)
- [ ] 배포/트러블슈팅/인프라 정보 → docs/rules/ 이동

## 대상 프로젝트 (크기순 — 큰 것부터)

| # | 프로젝트 | CLAUDE.md | 우선순위 | 예상 작업 |
|---|---------|-----------|---------|----------|
| 1 | returns-bidding-analyzer | 322줄 | P0 | Change Log 88줄 삭제, API/배포/DB절차 → rules/ |
| 2 | livevil-openclaw | 251줄 | P0 | Change Log 120줄 삭제, SSH/배포 → rules/ |
| 3 | creeta-homepage | 197줄 | P1 | 분석 필요 |
| 4 | namane-homepage | 159줄 | P1 | 분석 필요 |
| 5 | creeta-workspace | 139줄 | P1 | 분석 필요 |
| 6 | namane-sns | 128줄 | P2 | 분석 필요 |
| 7 | livevil-mini-server | 119줄 | P2 | 분석 필요 |
| 8 | livevil-setting | 98줄 | P2 | 이미 작은 편 |
| 9 | namane-shop-renewal | 84줄 | P2 | 이미 작은 편 |
| 10 | returns-erp | 27줄 | P3 | 구조만 생성 |

## 각 프로젝트 공통 작업

1. `docs/tasks/`, `docs/history/`, `docs/rules/` 폴더 생성
2. CLAUDE.md 스캔 → 콘텐츠 분류:
   - **유지**: 프로젝트 설명, 스택, 주요 명령어, 환경변수, 폴더 구조
   - **이동**: 배포 절차 → `docs/rules/deployment.md`, 트러블슈팅 → `docs/rules/troubleshooting.md`, 인프라 → `docs/rules/infrastructure.md`
   - **삭제**: Change Log, Bug History, 날짜별 작업 기록
3. CLAUDE.md에 고정 포인터 추가
4. 기존 docs/ 파일 있으면 분류하여 적절한 하위 폴더로 이동

## 체크리스트

### P0 (즉시 — 가장 큰 2개)
- [ ] returns-bidding-analyzer (322줄 → ~80줄 목표)
- [ ] livevil-openclaw (251줄 → ~90줄 목표)

### P1 (단기 — 중간 크기)
- [ ] creeta-homepage (197줄)
- [ ] namane-homepage (159줄)
- [ ] creeta-workspace (139줄)

### P2 (보통 — 작은 편)
- [ ] namane-sns (128줄)
- [ ] livevil-mini-server (119줄)
- [ ] livevil-setting (98줄)
- [ ] namane-shop-renewal (84줄)

### P3 (최소)
- [ ] returns-erp (27줄 — 구조만 생성)

## 진행상황
- **마지막 업데이트**: 2026-04-11
- creeta-lens 완료 (213→128줄, 참고 사례)

## 재개 포인트
다음 세션에서 이것부터:
- [ ] returns-bidding-analyzer /cp organize 실행
- [ ] livevil-openclaw /cp organize 실행
