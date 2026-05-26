---
name: goal-human-centric-codex-dual-verification
plan_id: 2026-05-26-goal-human-centric-codex-dual-verification
description: Lens v3.8.0+v3.9.0 — 사람 중심 Goal 2층 구조 + Codex 공동 조사·더블 검증 (한 릴리스로 배포) 완료
status: done
completed: 2026-05-26
---

# 사람 중심 Goal 2층 구조 + Codex 듀얼 검증 — 완료

**완료일**: 2026-05-26 · **릴리스**: v3.9.0 (v3.8.0 작업 포함, 별도 릴리스 없이 묶음)

## 요약

`/cp` 의 Goal 을 **사람 중심 2층 구조**로 재설계하고(v3.8.0), Codex 를 "Claude 결과의 부분 검토자"에서 **공동 조사자·공동 검증자**로 격상(v3.9.0)했다. 두 작업은 한 세션에서 연속 진행되어 **v3.9.0 한 릴리스**로 묶여 배포됐고, `/lens-upgrade` 로 이 PC 설치본(3.6.5 → 3.9.0)까지 반영했다.

- **v3.8.0**: Goal 문장에서 개발 검증어(`201`·`user row` 등)를 추방하고, 🎯 목표="무엇이 가능해지는가"(사람 언어)와 ✅ 검증="이게 됐다는 증거"(기계 언어)로 2층 분리. 기존엔 사용자가 자기 계획서를 읽고도 함수·HTTP 코드 때문에 판단할 수 없던 문제 해결.
- **v3.9.0**: `/cp` 는 Claude‖Codex 병렬 독립 조사(Phase 0.5) + 합성·교차검증(Phase 2.4), `/cc` 는 매 반복 Codex 코드리뷰 게이트(Phase 4.5)로 모든 코드 변경을 이종 모델 더블 검증.

## 주요 결정 사항

- **Goal=사람 언어, 검증=기계 언어 (2층 완전 분리)** — 사용자 명시 요청("무슨 함수가 어쩌고 하면 내가 알아듣겠어?"). 기술 토큰은 목표 문장에서 reject → ✅검증 표로 강제 이동. 이 매핑이 게이트가 됨: "사람 목표 → 검증 ≥1행" 매핑 안 되면 = 모호 = reject.
- **검증어는 검증 표에만** (사용자 선택) — Goal 옆 괄호 병기·완전 제거 대신 "검증 표에만 남긴다" 선택. Goal 문장은 100% 사람 언어.
- **더블 검증은 항상(trivial만 skip)** (사용자 선택) — 비용·속도보다 안전망 우선. trivial(오타·한 줄)·비-코드는 skip, Codex 부재/실패는 graceful degrade(블로킹 금지).
- **/cc 형태 = Claude 구현 → Codex 리뷰 게이트** (사용자 선택) — 독립 구현 후 병합(머지 충돌·비용 큼) 대신 리뷰 루프. Supervisor pass + Codex pass 둘 다여야 진행.
- **/cp 분기 = Claude가 근거와 함께 선택·기록** (사용자 선택) — 객관 판정 불가한 분기는 trade-off 근거와 함께 Claude가 결정하고 `🔀 듀얼 합성` 섹션에 기록(사용자가 승인 게이트에서 확인).
- **plan-manager.js 전면 동기화** (사용자 선택) — 런타임은 SKILL.md 기반(코드 생성기는 백업)이지만, 백업 생성기·extractGoal·8-lang dict 까지 신구조로 일치시켜 latent drift 제거.
- **Pre-mortem 중복 호출 회피** — Phase 0.5 에서 Codex 조사가 돌면 Phase 3 Codex 호출 skip(quota 절약), Opus 단독으로 통합안 점검.
- **산출물 링크 풀 경로 강제** (사용자 요청) — 보고 시 bare 파일명 금지, 프로젝트 루트 기준 전체 경로 클릭 링크.
- **v3.8.0 별도 릴리스 안 함** — 미커밋 상태에서 v3.9.0 작업이 이어져, 두 기능셋을 v3.9.0 한 커밋·태그로 묶음. CHANGELOG 는 [3.8.0]·[3.9.0] 항목 분리 유지.

## 변경 파일 (commit `b27b2a6`, 13개)

- **스킬**: `skills/cp/SKILL.md` (Phase 0 2층·0.0 인터뷰·0.2 서브골·0.5 Codex 조사·2.4 듀얼 합성·2.5 템플릿·5.0 게이트·핸드오프·절대규칙), `skills/cc/SKILL.md` (핸드오프 4칼럼·Phase 4.5 Codex 리뷰·Phase 5 더블 게이트·QA auto/manual·절대규칙)
- **라이브러리**: `lib/plan-manager.js` (8-lang dict·generatePlanContent 2층+종류 칼럼·extractGoal 다국어·dualSynthesis 렌더링·JSDoc)
- **규칙 문서**: `docs/rules/codex-integration.md` (사용지점 4곳·§8.5 듀얼 검증 호출 패턴)
- **manifest/문서**: `.claude-plugin/plugin.json`·`marketplace.json`, `CLAUDE.md`, `CHANGELOG.md`, `README.md`, `hooks/hooks.json`·`session-start.js`, `skills/c|cs/SKILL.md` (버전 bump 3.7.0→3.8.0→3.9.0)

## 테스트 & 검증

- **plan-manager.js 실측** (`node -e`) — generatePlanContent(ko)가 🎯 목표(plain bullet)+✅검증(종류 칼럼)+🔀 듀얼 합성 생성 확인, `validatePlanStructure` = `{valid:true}`, `extractGoal` 왕복(사람 목표→successCriteria) 확인.
- **레거시 호환** — 옛 체크박스 구조(deliverables+성공기준) 문서도 extractGoal 이 그대로 파싱 확인. verification 미제공 시 outcomes 로 manual 행 폴백.
- **릴리스 체인** — `bump-version.sh 3.9.0` (11/11 파일), commit `b27b2a6` + tag `v3.9.0` + push(master+태그). 옛 로컬 태그 충돌(v1.9.0/v2.0.0)은 이번 릴리스와 무관.
- **`/lens-upgrade` 실측** — 마켓플레이스 v3.9.0 감지 → `claude plugin install lens@CreetaCorp` → 검증: registry 1 entry = v3.9.0, `claude plugin list` 확인.
- **Karpathy 규칙 보존** — 새 3.9.0 캐시의 c/cc/cp SKILL.md 전부 `MUST FOLLOW` 마커 포함 확인(직접 grep — 검증 스크립트는 stale).

## 추가 사항

- **Claude Code 재시작 필요** — 현재 세션은 캐시 3.6.5 로 동작(skill 로드 시점). 재시작해야 v3.9.0 로드.
- **옛 로컬 태그 정리 완료** — v1.3.0~v2.0.0 9개 삭제(로컬 한정, 원격 보존 → `git fetch --tags` 복구 가능).
- **검증 스크립트 stale** — `livevil-setting/scripts/sync-karpathy-rules.ps1` 가 하드코딩 `lens\3.3.3\skills` 경로 + `~/.claude/CLAUDE.md` 의 `MUST FOLLOW` 마커 불일치로 false [MISS] 발생. 별도 수정 필요(미처리).
- **stale task 2건 잔존** — `docs/tasks/2026-05-16-cp-goal-first-overhaul.md`(v3.4 shipped), `2026-05-20-cp-html-reports-board.md`(v3.6.0 shipped)는 이번에도 archive 안 함.
- **미저장 메모리** — "목표·설명은 사람 언어로" + "산출물 풀 링크" 선호는 durable 하지만 메모리에 미기록(사용자 보류).
