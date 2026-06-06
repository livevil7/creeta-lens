---
title: "Lens 현대화 감사 — 11기능 재분석 + 대화 마이닝 신기능 제안 (Pass 1)"
date: 2026-06-05
kind: audit
method: "이종 멀티에이전트 워크플로 (공급 측 25 agents + 수요 측 19 agents, 듀얼 검증)"
---

# Lens 현대화 감사 — Pass 1 (2026-06-05)

> 이 문서는 `/cr`(자가 현대화 감사) 기능의 **첫 실증 실행** 결과이자, 그 기능이 매번 산출할 리포트의 양식 레퍼런스다. 두 축으로 감사했다:
> - **공급 측** — Claude Code(v2.1.160) + Codex(0.137.0) 네이티브 능력이 어디까지 왔나 → 각 기능 노후도·업그레이드·편의
> - **수요 측** — 사용자의 과거 세션 82개·954 발화에서 반복/불편/우회 패턴 → net-new 기능 제안
>
> 방법: 두 개의 멀티에이전트 워크플로(기능별 독립 분석 → 적대적 검증 → 종합). 라이브 CLI probe + 공식 문서 + 실제 소스 정독 기반. 근거 없는 OBSOLETE 금지, false-obsolete 적대 검증.

---

## 0. 한 줄 결론

**2026-06 네이티브 Claude Code가 Lens 오케스트레이션 "엔진"의 대부분을 흡수했다 — 그러나 11기능 중 OBSOLETE는 0이다.** `/cs`(멀티레포 sweep)와 Codex 연동(cross-vendor 이종검증)은 네이티브가 직접 공백을 인정해 KEEP, 나머지 9개는 THIN(엔진은 네이티브에 위임해 얇게, 고유 코어만 생존). 살아남는 코어는 셋으로 수렴한다: **① 디스크 영속 산출물**(board HTML·docs 라이프사이클·감사로그 — 네이티브는 전부 세션 휘발), **② cross-vendor 이종검증**(codex/gpt-5.5 — 네이티브 평가자·워커가 전부 Anthropic 가족이라 구조적 비대체), **③ Worker 프롬프트에 박힌 Karpathy 4규칙 강제계약**.

---

## 1. 공급 측 — 11기능 노후도 판정

| # | 기능 | 판정 | 한 줄 |
|---|------|------|-------|
| 1 | `/c` 단일 내비 | **THIN** | 모델배정·Monitor폴링·Supervisor·QA·5회게이트는 네이티브 흡수. 남는 코어=Worker의 Karpathy 4규칙 강제계약 + 추천 1개 확정 |
| 2 | `/cc` 병렬 엔진 | **THIN** | 병렬 엔진은 Dynamic Workflows로 하강. 단 Codex AND-게이트 + /cp plan-binding + 한국어/Karpathy 규율은 생존 |
| 3 | `/cp` 계획 엔진 | **THIN** | 실행·목표강제·프리모템은 네이티브(plan mode/goal/workflows) 위임 가능. 디스크 영속 문서 라이프사이클 + 작성시점 Goal 품질게이트는 비대체 |
| 4 | `/cps` START_HERE | **THIN** | 네이티브 /init은 CLAUDE.md만, 라우팅 인덱스 아님. 비파괴 diff 게이트·(Not documented yet) 규율 비대체 |
| 5 | `/cs` 멀티레포 동기화 | **KEEP** | 네이티브가 직접 인정한 공백 — EnterWorktree는 단일레포 멀티워크트리뿐. 워크스페이스 전 레포 sweep 무대체 |
| 6 | `/cu` per-machine 업데이터 | **THIN** | 실행부는 네이티브 패스스루. cross-tool 열거 + staleness 플래깅(native는 'unknown') + multi-select는 비대체 |
| 7 | `/lens-upgrade` | **THIN** | 버전올리기는 네이티브 흡수. 멀티스코프 dedup·stash·자동롤백·origin교정은 무노출 |
| 8 | 발견/추천 레이어(훅) | **THIN** | 실측상 hollow(아래 §4). /command nag-차단 OVERRIDE + 세션 온보딩만 생존 |
| 9 | 에이전트 대시보드(훅) | **THIN** | 쓰기 전용 텔레메트리(reader 0건). 세션 경계 영속 감사로그 + orphan 정합성은 비대체 |
| 10 | plan-manager + board-builder | **THIN** | board-builder=KEEP급(5 호출처, 무대체). plan-manager 무거운 절반은 런타임 호출자 0 |
| 11 | Codex 이종검증 연동 | **KEEP** | cross-vendor 이종검증은 구조적 비대체(네이티브 평가자·워커 전부 Anthropic). 개념층 KEEP / 배관층 THIN |

**핵심 발견 (관통):** 네이티브 4종 — **Dynamic Workflows**(16동시·adversarial verify, v2.1.154+) + **per-agent 모델 서브에이전트**([sonnet,opus,haiku]) + **`/goal`**(매 턴 Haiku 평가자 재판정, v2.1.139+) + **plan mode** — 이 `/c`·`/cc`·`/cp`의 절차 분량 대부분을 네이티브 프리미티브의 prose 래퍼로 만들었다. 하지만 OBSOLETE 0 — 이유는 네이티브가 전부 **세션 휘발성**이고 **단일(Anthropic) 모델 가족**이며 **Karpathy 계약을 강제하지 않기** 때문.

---

## 2. 우선순위 실행목록 (임팩트 × 저비용)

> 업그레이드·편의 개선을 임팩트/비용으로 랭킹. 각 항목은 `/cr`이 발견 시 `/cp` task로 핸드오프할 후보다.

| # | 기능 | 조치 | 유형 | 임팩트 | 비용 |
|---|------|------|------|--------|------|
| 1 | codex / `/cc` | Codex 리뷰 게이트를 **`codex exec review --uncommitted --output-schema --ephemeral`**로 전환(bare `codex review` 아님 — exec review라야 schema 동시 노출). awk PASS/FAIL·수동 diff·orphan 의존 제거. 라이브 실측 통과·plan-tier 무의존 | upgrade | high | M |
| 2 | 발견/추천 | UserPromptSubmit **매 메시지 자동제안 폐기**(autoRecommend 기본 off) + 죽은 `KNOWN_PLUGINS=[]` 디스커버리 제거 + CLAUDE.md:51 '60+ known plugins' 드리프트 수정 | deprecate | high | S |
| 3 | `/cu` | vscode-번들 codex(0.137.0-alpha)를 GitHub stable과 비교하는 **오탐('항상 update available')** → `needs_update=null`. `_codex_install_kind`가 이미 vscode 구분 ~3줄 | fix | med | S |
| 4 | codex SoT | `service_tier=priority` → 정식 **`service_tier=fast`+`features.fast_mode=true`**(priority는 레거시 별칭) + `gpt-5.5` 하드코딩 **버전무관 fallback**. SoT 1곳 갱신으로 /cp·/cc 전부 정합 | fix | med | S |
| 5 | plan-board | plan-manager.js의 **런타임 호출자 0인 절반**(generatePlanContent 8개국어 dict·extractGoal·validate·save/loadPlanState) `@deprecated` 격리, 8개국어 dict 릴리스 동기화 의무 제거 | deprecate | med | S |
| 6 | `/c`·`/cc` | Phase 4(Supervisor)+5(QA) 자작 점수제·5회 게이트를 **네이티브 `/goal` emit**으로 위임(/cp v3.7.0 선례). Supervisor/QA spawn 비용 제거 | adopt-native | high | M |
| 7 | `/c`·`/cc` | **Monitor 폴링 에이전트 제거**(haiku 5분, ALWAYS deploy) → background exit 재호출+TodoWrite. 진행보고는 2분+ long-running만 | adopt-native | med | S |
| 8 | 대시보드 | PostToolUse 훅이 `additionalContext`로 직전 Task status/실패사유 **모델 주입**(현 비스키마 필드는 모델에 안 닿음). write→consume 단절 해소 | upgrade | high | S |
| 9 | `/cc`·`/cps` | 작업 종료 시 **자동 commit(+Co-Authored-By)+원격동기화** 기본화(더블게이트+QA 통과 시). live .env 제외, default 브랜치면 먼저 브랜치, diverged면 보고만 | ergonomics | high | M |
| 10 | `/cc`·`/c` | **헤드리스(cron/TTY없음) 감지 시 AskUserQuestion 폴백**(자동승인 or plan-only 종료). Mac Mini 무인 파이프라인 hang 방지 | ergonomics | med | M |
| 11 | `/cs` | `git-sync-all.sh` `--json` 모드 + diverged/failed 최상단 강조 + SKILL.md:100 'Stop훅 auto-commit' 미구현 암시 제거(stop.js git 동작 0) | fix | med | S |
| 12 | `/cps` | `/cs` 스윕에 **START_HERE 커버리지 체크** 끼워 '진입문서 없는 레포 N개' 일괄 보고+생성(14레포 수동 비현실적) | upgrade | high | M |
| 13 | `/cp` | on-invoke 토큰(**~15.8k, Lens 최대**) 절감 — ORGANIZE/CONVERT·codex-integration·Karpathy 전문 인라인을 별도 참조로 분리, PLAN만 본문 | upgrade | high | M |
| 14 | `/lens-upgrade` | Phase 1+4 정상경로를 `claude plugin marketplace update`+`plugin update --scope`로 위임, Lens는 백업·dedup·검증·롤백·origin교정만 | adopt-native | med | M |

---

## 3. 수요 측 — 대화 마이닝 신기능 제안

> 82세션·954 발화에서 반복/불편/우회 패턴을 추출 → 신기능 제안 → 적대적 검증(근거 약하거나 기존 스킬 중복이면 DROP).

**관통 테마:** ① claim-vs-reality(보고 전 라이브 미검증 단정 — 최빈 신뢰붕괴) ② 운영 파이프라인 '지금 정상?' 헬스체크 세션마다 반복 ③ 장시간 작업 진행보고 부재('2분마다 보고' 13회+) ④ 다중 세션·머신 핸드오프 부담('Continue from where you left off' 10회+) ⑤ 즉시·끝까지 실행 강박 ⑥ 시크릿 livevil-setting 중앙화.

> **후속 정정 (2026-06-06, 사용자 리뷰 후):** Pass-1 은 `/ch`·`/cx` 2건을 KEEP 으로 제안했으나, 사용자 검토에서 **둘 다 드롭**으로 정정됐다(아래 ①②). 신기능 제안은 결국 **0건** — Pass-1 이 마이닝 5건 중 3건을 잘랐으나 사실 **5건 모두 잘랐어야 했다.** 대신 수요 측의 진짜 가치는 신기능이 아니라 **반복 명령을 기본값으로 박는 것**(아래 §3.5)으로 재정의됐고 v3.14.0 에 반영.

### 신기능 제안 — 검토 후 0건 (모두 DROP)

**① `/ch` 운영 헬스체크 디스패처 — DROP (2026-06-06 정정)**
- Pass-1 제안: 사용자 기존 SoT(런북·체크스크립트·대시보드)를 발견·실행하는 얇은 디스패처.
- **드롭 사유**: 범용 Lens 스킬로 **일반화 불가**. "정상(healthy)"의 정의는 레포 도메인마다 다르고 공통 불변식이 0이라(체크 로직이 환원 불가능하게 프로젝트별) — `/cs`(git 불변)·`/cu`(--version 불변)처럼 성립하지 않는다. 일반화 가능한 유일한 형태는 "레포가 선언한 체크를 실행하는 러너"인데 그건 이미 `make`/`npm run`/CI 가 하는 일이고, 사용자 14+ 레포에 그 선언 컨벤션이 균일하게 없다. 진짜 반복 실패는 "구조 부재"가 아니라 *런북을 무시하고 쿼리 재즉흥*하는 행동 문제 — 메모리 룰(`feedback_livevil_publishing_status_runbook_first`)이 이미 처리.

**② `/cx` 세션 핸드오프 — DROP (2026-06-06 정정)**
- Pass-1 제안: `initSession()` wipe 를 보존으로 고치고 Stop 훅이 산출물 경로 캡처 + 얇은 reader.
- **드롭 사유**: 전제가 약하다. `initSession()` 의 wipe 는 **버그가 아니라 의도된 동작**일 가능성이 크다(세션마다 대시보드를 새로 시작하는 게 정상) — 그러면 고칠 건 동작이 아니라 *틀린 docstring 한 줄*뿐이다(별건 정정). 핸드오프 가치도 네이티브 `--resume`/`--continue` + `/cp` 의 "재개 포인트" 와 겹쳐 고유가치가 얇다. → 새 스킬 불요.

### §3.5 수요 측의 진짜 가치 — 반복 명령 → 기본값 (v3.14.0 반영)

신기능이 아니라, 사용자가 *매번 다시 치던 명령*을 스킬 기본 동작으로 박는 것이 실제 사용자-관점 개선이다. 마이닝 근거 → v3.14.0:
- "커밋하고 푸시해"(다회) → `autoCommitOnComplete` **기본 on** (안전 레일).
- "N분마다 보고해"(13회+) → `/c`·`/cc` 장시간 작업 자동 진행보고 기본.
- "어디 저장했어?" → 산출물 풀 경로 자동 보고 기본.
- "지금 해 / 멀 기다려 / 니가 해" → 즉시·끝까지 실행, 헤지·떠넘김 금지 기본.
- "보고 먼저 하고 적용" → 위험·시각 변경은 보고-먼저 기본.

### DROP — (Pass-1 원래 3건, 근거 강함)

- **`/cv` 라이브 검증 게이트** → `/cc`·`/cp`로 MERGE. 문제는 절실하나 capability ~85%가 이미 `/cc` Phase 6 QA(verified=false 차단 + 4채널 라우팅)에 구현됨. 핵심 전제(보고 전 *자동* 게이트)는 invocable skill로 **구조적 불가** — un-invoked 주장에 게이트를 강제하려면 skill이 아니라 harness Stop-hook(settings.json). → `/cc` QA에 '생성물 factuality WebSearch 대조' 한 줄 + `/cp` 어휘 추가로 흡수.
- **progress-pulse(자동 주기보고 훅)** → 빌트인 **`/loop` 중복**(DROP). 핵심 메커니즘이 기술적 불가 + 사용자 본인 메모리가 못박음: "ScheduleWakeup은 /loop dynamic 컨텍스트 전용, 일반 훅에서 호출 불가". 해법은 `/loop 2m <status check>`.
- **`/cp` 라이브 임베드 뷰어** → **범위 밖**(DROP). 근거가 잘못된 대상에 붙음(grounded=false) — 인용은 전부 일반 UI 개발 워크플로지 /cp 요청 아님. /cp 핵심 아키텍처 4건 위반(코드 실행 금지·JS 제한·md=SoT·CSS 인라인 금지). 그 공백은 verify+Playwright+ui-ux-pro-max 영역.

---

## 4. 검증된 코드 드리프트 / 버그 (별건, 외과 수정 후보)

감사 중 라이브 실측·소스 정독으로 확인된 사실(추측 아님):

- **`lib/agent-tracker.js:163-168`** — docstring "Preserves..." ↔ 구현은 wipe. (직접 검증 ✅)
- **발견/추천 레이어 hollow** — `KNOWN_PLUGINS=[]`(죽은 레지스트리), 481세션 빈 메모리(`recordSkillUsage` 호출 0), context7/playwright `triggers:[]`, 추천 score=`keyword.length` 노이즈. **CLAUDE.md:51 '60+ known plugins'는 드리프트**(실제 [] 비어있음).
- **`skills/cs/SKILL.md:100`** — 'Stop 훅이 결국 auto-commit' 암시 ↔ `stop.js`는 git 동작 0 (미구현 드리프트).
- **설치 origin 불일치** — 설치 origin=`CreetaCorp/lens` vs 스크립트=`livevil7/creeta-lens` → `/lens-upgrade` origin교정 필요.
- **`/cu` codex 오탐** — vscode 번들(0.137.0-alpha.4) vs GitHub stable(0.137.0) 비교로 '항상 update available'.
- (stale 제안 정정) `hook-utils.js:65`는 이미 `isTTY` 가드 적용됨 — stdin-hang은 해결된 상태.

---

## 5. 이 감사와 `/cr` 기능의 관계

이 Pass 1은 `/cr`(자가 현대화 감사 스킬)이 **주기적으로 자동 생성할 리포트의 양식**이다. `/cr`은 4개 입력축으로 이 리포트를 만든다:

1. **공급-드리프트** — 라이브 네이티브 능력(probe+web) vs 레지스트리의 "공백 가정" → 노후도(KEEP/THIN/OBSOLETE)
2. **공급-업그레이드** — 새 네이티브를 써서 기존 기능을 더 강하게 (§2)
3. **편의(ergonomics)** — 사용자 워크플로 기준 마찰 제거 (§2의 ergonomics 행)
4. **수요-마이닝** — 세션 대화 패턴 → net-new 제안 (§3)

`/cr` 레지스트리(`docs/rules/capability-assumptions.json`)의 **시드**는 이 감사의 `registry_seed` 11행(네이티브 능력별 gap_closed_signal + signal_method=probe/web/both + false_obsolete_risk)으로 채운다. `.lens/conv-mining/audit-supply.json`·`audit-demand.json`에 전체 원자료 보존.

**다음 단계:** `/cr` 기능 자체의 구현 계획은 `docs/tasks/2026-06-05-lens-capability-modernization-audit.md` 참조. §2 상위 항목(특히 #1 Codex review, #2 추천기 폐기, #9 자동커밋)은 `/cr`이 아니어도 즉시 착수 가능한 독립 업그레이드다.
