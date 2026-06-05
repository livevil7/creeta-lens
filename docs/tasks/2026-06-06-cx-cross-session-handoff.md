---
plan_id: 2026-06-06-cx-cross-session-handoff
title: "/cx — 세션 경계 자동 핸드오프 (직전 작업+산출물 위치 복원)"
status: draft
created: 2026-06-06
size: medium
source: "대화 마이닝 Pass 1 (docs/history/2026-06-05-lens-modernization-audit.md §3)"
refs:
  - lib/agent-tracker.js
  - hooks/stop.js
  - hooks/session-start.js
  - skills/cx/SKILL.md (new)
target_version: v3.14.0
---

# `/cx` — 세션 경계 자동 핸드오프

## 🎯 목표 — 무엇이 가능해지는가 (사람 언어)

**이 작업이 끝나면 가능해지는 것:**

- 세션이 끊기거나 여러 세션·머신을 오갈 때, 새 세션에서 **`/cx`** 한 번으로 "직전 세션이 무엇을 하고 있었고, 산출물이 어디에 있는지"를 즉시 복원한다. "Continue from where you left off / 세션 끊겼어 다시 파악해"를 반복하지 않아도 된다.

**완료의 정의 (Done = ?):**

> 세션 A 에서 작업 후 종료 → 세션 B 에서 `/cx` 실행 시, 직전 작업 요약 + 산출물 절대경로(생성 이미지 폴더·temp 출력·변경 파일) + 다음 할 일이 복원된다.

## ✅ 검증

| # | 신호 | 확인 방법 | 통과 | 종류 |
|---|------|----------|------|------|
| 1 | initSession 보존 | 새 세션 시작 후에도 직전 세션 핸드오프 블록이 남아있음 | wipe 안 됨 | auto |
| 2 | Stop 훅 캡처 | 세션 종료 시 `.lens/` 에 {직전 작업, 산출물 절대경로[], next-step} 기록 | 파일 존재 | auto |
| 3 | session-start 노출 | 새 세션 additionalContext 에 직전 핸드오프 1줄 | 노출됨 | manual |
| 4 | /cx 복원 | `/cx` 가 직전 컨텍스트+산출물 위치를 출력 | 복원됨 | manual |
| 5 | /cp dedup | /cp plan 의 resume/handoff 필드와 중복 안 됨(비계획 ad-hoc만) | 중복 0 | manual |

## Plan A — 권장 경로 (외과적 축소판)

### 왜 이게 1순위인가 — 진짜 코드 갭 (검증됨)

`lib/agent-tracker.js:163-168` 의 `initSession()` 은 docstring 이 **"Preserves previous session's completed agents as history"** 라고 주장하지만, 구현은 `createDefaultDashboard()`(빈 대시보드) + `saveDashboard()` 로 **직전 세션 상태를 wipe** 한다(2026-06-05 직접 검증). `memory-store`(.lens-memory.json)는 sessionCount/추천/plan 이력만 담고 **진행 중 작업 + 산출물 경로는 없다.** claude-mem 은 미설치(MEMORY.md 표기는 drift). → 풀 신규 M-스킬은 과대(/cp plan 에 이미 진행상황/재개포인트/`[HANDOFF FROM /cp]` 존재 → 제2 플랜독 엔진화 위험). **외과적 버전만.**

### 단계

- [ ] step 1: `initSession()` 이 wipe 대신 **직전 세션의 lastSession 핸드오프 블록을 보존** (docstring 과 구현 일치시킴). → verify: 새 세션 후 직전 블록 잔존
- [ ] step 2: `hooks/stop.js` 에서 **산출물 절대경로**(temp `.output`, 생성 이미지 폴더, 변경 파일) + **1줄 next-step** 캡처 (대시보드도 /cp 도 안 하는 비중복 핵심). → verify: 종료 후 상태 파일에 기록
- [ ] step 3: `hooks/session-start.js` additionalContext 로 직전 핸드오프 1줄 노출. → verify: 새 세션 컨텍스트에 노출
- [ ] step 4: `skills/cx/SKILL.md` — 그 위 얇은 reader. `/cp` resume/handoff 필드와 **명시적 dedup**(비계획 ad-hoc 작업만). → verify: /cx 복원 동작

### 막힐 수 있는 지점 (→ Plan B)

- 산출물 경로를 stop.js 가 신뢰성 있게 못 잡음(어떤 변경이 "산출물"인지 모호).

## Plan B — Fallback

### Trigger
step 2 에서 산출물 경로 자동 캡처가 부정확/불완전할 때.

### 단계
- [ ] 산출물 자동 캡처 대신 **변경 파일 목록(git status) + 마지막 TodoWrite 상태**만 보존(보수적). 산출물 절대경로는 사용자가 /cx 후 보강. 과한 추론보다 정확한 최소 정보.

## ⚠️ 사전 리스크
- **docstring↔구현 불일치 자체가 버그** — step 1 은 사실상 버그 수정. 다른 곳이 "wipe" 동작에 의존하지 않는지 확인(매 세션 깨끗한 대시보드를 기대하는 코드).
- **/cp 와 책임 중복** — /cp 는 계획된 작업의 resume, /cx 는 비계획 ad-hoc 의 핸드오프. 경계를 SKILL 에 명시 안 하면 제2 플랜독 엔진화.
- **프라이버시** — 산출물 절대경로에 민감 경로 포함 가능 → 시크릿 경로는 마스킹/제외.

## 진행상황
- **마지막 업데이트**: 2026-06-06
- **현재 경로**: Plan A (계획 — 미구현)
- **재개 포인트**: step 1(initSession 보존)이 선행 + 가장 작음. step 2(stop.js 캡처)가 비중복 핵심. /cp 와의 dedup 경계를 SKILL 에 먼저 못박을 것.
