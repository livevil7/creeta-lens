# /c, /cc SKILL.md v3.0 전면 업그레이드

## 목표
- [ ] /c와 /cc의 공통 아키텍처 통일 (차이점: worker 1개 vs N개만)
- [ ] 실행 전 반드시 task 단위 승인 체계 구축
- [ ] 난이도별 모델 할당 시스템 (haiku/sonnet/opus)
- [ ] 5분 주기 진행사항 모니터링 에이전트
- [ ] docs/ 문서 규칙 완전 연동
- [ ] TodoWrite 기반 실시간 진행 추적

## 현재 상태 분석

### /c (현재 v2.0.0 — 82줄)
- 스킬 스캔 → 추천 → 실행하는 **네비게이터**
- Worker 개념 없음, 스킬 직접 호출만
- 승인 체계: 스킬 선택만 AskUserQuestion, 실행 자체는 승인 없이 바로
- 모델 할당: 없음
- 진행 보고: 없음
- 문서 연동: 없음

### /cc (현재 v2.0.0 — 368줄)
- Leader-Worker-Supervisor-QA 팀 구조
- Worker 병렬 배치, Supervisor 품질 검토, QA 검증
- 승인 체계: 실행 전 계획 승인만 (AskUserQuestion)
- 모델 할당: Worker prompt에 haiku/sonnet 제안만 있고 강제 아님
- 진행 보고: 없음 (완료 후 최종 보고만)
- 문서 연동: .lens/results/에 저장 (docs/ 규칙 미적용)

## 변경 설계

### 1. /c와 /cc 공통 아키텍처

```
사용자 명령
  ↓
Phase 1: 분석 + 계획 (현재 모델로 실행)
  - 작업 분해 → task 목록
  - 각 task에 모델/스킬 할당
  - docs/rules/ 읽기
  ↓
Phase 2: 승인 요청 (AskUserQuestion)
  - task 목록 + 할당된 스킬 + 모델 표시
  - Approve / Modify / Cancel
  ↓
Phase 3: Worker 배치 + 모니터 배치
  - /c: Worker 1개 (순차 실행)
  - /cc: Worker N개 (병렬 실행)
  - 모니터 에이전트: 5분마다 진행 보고 (공통)
  - TodoWrite 항목 생성
  ↓
Phase 4: Supervisor 검토
  ↓
Phase 5: QA 검증
  ↓
Phase 6: 최종 보고 + 문서 기록
  - docs/tasks/ 업데이트
  - 완료 시 /cp done 제안
```

**핵심: /c와 /cc의 유일한 차이 = Phase 3에서 Worker를 1개 띄우냐 N개 띄우냐**

### 2. 모델 할당 규칙

| 역할 | 모델 | 기준 |
|------|------|------|
| Leader (계획) | 현재 모델 (사용자 세팅) | 계획 수립은 항상 최고 품질 |
| Worker (쉬운 task) | `haiku` | 파일 읽기, 검색, 데이터 수집, 단순 수정 |
| Worker (보통 task) | `sonnet` | 코드 작성, 분석, 디버깅 |
| Worker (어려운 task) | `opus` | 아키텍처 설계, 복잡한 리팩토링, 보안 분석 |
| Supervisor | `sonnet` | 품질 검토 |
| QA | `haiku` | 실제 테스트 실행 |
| Monitor | `haiku` | 5분 주기 상태 체크 |

### 3. 승인 요청 포맷

```
Lens v3.0 — 실행 계획
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

요청: {사용자 원본}

Task 목록: {N}개

┌───┬──────────────────┬────────────┬────────┬─────────────┐
│ # │ Task             │ 할당 스킬   │ 모델   │ 난이도       │
├───┼──────────────────┼────────────┼────────┼─────────────┤
│ 1 │ [설명]           │ /investigate│ sonnet │ Medium      │
│ 2 │ [설명]           │ general    │ haiku  │ Easy        │
│ 3 │ [설명]           │ /review    │ sonnet │ Medium      │
└───┴──────────────────┴────────────┴────────┴─────────────┘

실행 방식: 순차 (/c) 또는 병렬 (/cc)
모니터링: 5분 주기 진행 보고
```

### 4. 모니터 에이전트

Worker와 별도로 배치되는 경량 에이전트:

```
역할: 5분마다 현재 진행 상태를 사용자에게 보고
모델: haiku (최소 비용)
동작:
  1. TodoWrite 현재 상태 읽기
  2. 완료된 task / 진행 중 task / 대기 중 task 카운트
  3. 경과 시간 표시
  4. 사용자에게 간단한 상태 메시지 출력
주기: 5분 (loop skill 활용 또는 background agent)
종료: 모든 Worker 완료 시 자동 종료
```

### 5. docs/ 연동

- **시작 시**: docs/rules/ 읽어서 프로젝트 규칙 Worker에 전달
- **진행 중**: docs/tasks/ 활성 문서 업데이트 (진행상황 섹션)
- **완료 시**: /cp done 제안 (history 작성 + task 삭제)

### 6. Worker 스킬 할당 보고

Leader가 계획을 세울 때:
1. 각 task의 도메인 식별
2. gstack 스킬 매칭 (기존 로직 유지)
3. 매칭 결과를 승인 요청 테이블에 표시
4. Worker 프롬프트에 할당 스킬 포함: "Follow /investigate methodology"

## 체크리스트

### /c SKILL.md 재작성
- [x] Phase 1: 분석 + 계획 (task 분해, 모델/스킬 할당)
- [x] Phase 2: 승인 요청 (task 테이블 + AskUserQuestion)
- [x] Phase 3: Worker 1개 순차 배치 + Monitor 배치
- [x] Phase 4: Supervisor 검토
- [x] Phase 5: QA 검증
- [x] Phase 6: 최종 보고 + docs/ 연동
- [x] TodoWrite 연동

### /cc SKILL.md 재작성
- [x] Phase 1~6 동일 구조 (/c와 공유)
- [x] Phase 3만 다름: Worker N개 병렬 배치
- [x] 기존 /cc의 iteration 로직 유지 (max 5)

### 공통
- [x] 모니터 에이전트 스펙 정의
- [x] 모델 할당 규칙 명세
- [x] 스킬 할당 보고 포맷 정의
- [x] docs/ 연동 규칙 정의

### 배포
- [x] 플러그인 캐시 반영
- [ ] 버전 범프 (v2.0.0 → v3.0.0)
- [ ] 테스트

## 기술적 접근

### 코드 구조
/c와 /cc가 거의 동일한 워크플로우를 공유하므로, SKILL.md에서 공통 부분을 최대한 통일하되 Phase 3만 분기.

### 모니터 에이전트 구현 방식
- Agent tool의 `run_in_background: true` 활용
- haiku 모델로 비용 최소화
- TodoWrite 상태를 읽어서 보고
- 모든 Worker 완료 감지 시 자동 종료

### /c에서 Supervisor/QA 필요 여부
- 간단한 작업 (task 1~2개): Supervisor/QA 생략 가능
- 복잡한 작업 (task 3개+): Supervisor + QA 실행
- 사용자가 승인 시 선택 가능하게

## 위험 및 고려사항

| # | Risk | 심각도 | 완화 |
|---|------|--------|------|
| 1 | /c와 /cc SKILL.md 중복 코드 | M | 공통 섹션을 명확히 표시, 유지보수 시 동시 수정 |
| 2 | 모니터 에이전트가 컨텍스트 소비 | L | haiku + 최소 출력으로 비용 절감 |
| 3 | 5분 보고가 작업 방해 | L | 간결한 1~2줄 상태만 표시 |
| 4 | 모델 할당 판단 오류 | M | 사용자가 승인 시 모델 변경 가능 |
| 5 | 기존 사용자 워크플로우 깨짐 | H | v2→v3 마이그레이션 노트 필요, 버전 범프 |

## 완료 기준
- [ ] /c와 /cc가 동일한 Phase 구조 사용 (차이: Worker 배치 방식만)
- [ ] 모든 실행 전 task 단위 승인 요청 동작
- [ ] Worker에 모델이 명시적으로 할당됨 (haiku/sonnet/opus)
- [ ] 5분 주기 모니터 에이전트 작동
- [ ] TodoWrite로 실시간 진행 추적 가능
- [ ] docs/ 규칙에 따라 문서 자동 관리
- [ ] 할당된 스킬이 사용자에게 보고됨

## 실행 방식
- **순서**: /c SKILL.md 먼저 → /cc는 /c 기반으로 Phase 3만 변경
- **예상 규모**: Large — 두 파일 합쳐 ~600줄 이상 재작성
- **예상 시간**: 2~3시간

## 재개 포인트
다음 세션에서 이것부터:
- [ ] /c SKILL.md v3.0 작성 시작 (Phase 1~6 전체)
- [ ] /cc는 /c 완성 후 Phase 3만 교체
