---
plan_id: 2026-06-06-ch-operational-health-dispatcher
title: "/ch — 운영 헬스체크 디스패처 (런북/체크스크립트 발견·실행)"
status: draft
created: 2026-06-06
size: medium
source: "대화 마이닝 Pass 1 (docs/history/2026-06-05-lens-modernization-audit.md §3)"
refs:
  - skills/ch/SKILL.md (new)
target_version: v3.14.0
---

# `/ch` — 운영 헬스체크 디스패처

## 🎯 목표 — 무엇이 가능해지는가 (사람 언어)

**이 작업이 끝나면 가능해지는 것:**

- 사용자가 **한 명령(`/ch`)** 으로 "지금 내 운영 파이프라인이 정상인가?"(featured 롤링·won 큐·발행 현황·대기열 이상)를 **한 화면 요약**으로 받는다. 매번 즉석 SSH/sqlite 쿼리를 절대경로까지 손으로 조립하지 않아도 된다.
- 비정상(빈 큐·안 도는 회전·비정상 누적)은 **원인 후보까지** 함께 보여준다.

**완료의 정의 (Done = ?):**

> 운영 레포에서 `/ch` 를 실행하면, 사용자가 이미 만들어 둔 런북/체크스크립트/대시보드를 발견해 실행하고, 각 항목을 PASS/FAIL/이상치로 한 화면에 요약한다 (즉석 쿼리 재즉흥 없음).

## ✅ 검증

| # | 신호 | 확인 방법 | 통과 | 종류 |
|---|------|----------|------|------|
| 1 | 기존 SoT 발견·실행 | `/ch` 가 `docs/runbooks/*.md` §TL;DR / `scripts/check-*.sh` / 대시보드를 찾아 실행 | 즉석 쿼리 0, 기존 SoT 사용 | manual |
| 2 | 한 화면 요약 | 각 체크가 PASS/FAIL/이상치로 표기 | 전 항목 표기 | manual |
| 3 | 이상 시 원인 후보 | FAIL 항목에 원인 후보 1줄 이상 | 있음 | manual |
| 4 | SoT 부재 시 비파괴 | 런북 없는 레포면 "런북 없음 — 생성 권장"만, 임의 쿼리 생성 금지 | 안내만 | manual |

## Plan A — 권장 경로 (얇은 디스패처)

### 왜 이게 1순위인가

사용자는 이미 `publishing-status.md` 런북·`check-operational-status.sh`·대시보드(:5002)·일일 텔레그램 notify 를 만들어 뒀고, **"즉석 쿼리 짜지 말고 내 런북/SoT 먼저 읽어라"** 를 강한 메모리 룰(`feedback_livevil_publishing_status_runbook_first`)로 못박았다. 따라서 `/ch` 는 체크를 **새로 정의하면 안 된다**(런북과 경쟁하는 4번째 SoT = 룰 위반 + Karpathy 단순성 위반). 발견·실행만 한다.

### 단계

- [ ] step 1: SoT 발견 — `docs/runbooks/*.md` 의 §TL;DR 원라이너, `scripts/check-*.sh`/`*-status.sh`, rotate dry-run, 알려진 대시보드 URL을 글롭/감지
- [ ] step 2: 실행 — 발견한 체크를 실행(읽기 위주; 파괴적 동작 금지), 출력 수거
- [ ] step 3: 요약 — PASS/FAIL/이상치 한 화면 + FAIL 원인 후보
- [ ] step 4: SoT 부재 시 — "런북 없음 — 생성 권장" 안내(임의 쿼리 금지)

### 막힐 수 있는 지점 (→ Plan B)

- 레포에 런북/체크스크립트가 전혀 없음 → 발견할 SoT 0.

## Plan B — Fallback

### Trigger
step 1 에서 발견된 SoT 가 0건일 때.

### 단계
- [ ] "이 레포엔 헬스체크 SoT(런북/스크립트/대시보드)가 없습니다 — `/cp` 로 `docs/runbooks/health.md` 생성을 권장" 안내. **임의 즉석 쿼리로 헬스체크를 지어내지 않는다** (그게 바로 사용자가 금지한 안티패턴).

## ⚠️ 사전 리스크
- **4번째 SoT 생성 위험**: 체크를 코드로 새로 정의하면 사용자 런북과 경쟁 → 반드시 발견·실행만.
- **파괴적 체크**: 일부 "체크"가 부작용 있는 스크립트일 수 있음 → 읽기 위주만, dry-run 우선, 모호하면 실행 전 확인.

## 진행상황
- **마지막 업데이트**: 2026-06-06
- **현재 경로**: Plan A (계획 — 미구현)
- **재개 포인트**: 구현 착수 시 `skills/ch/SKILL.md` 작성부터. 발견 로직은 글롭+감지(결정론), SoT 우선순위는 런북>스크립트>대시보드.
