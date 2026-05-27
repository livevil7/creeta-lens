# /cp + /cc Goal-first 구조 동시 개편 — 완료

**완료일**: 2026-05-16 (출시: v3.4.0)

## 요약

`/cp`(계획)와 `/cc`(실행)를 **Goal-first** 구조로 동시 개편했다. 계획 문서가 `🎯 Goal → Plan A → Plan B → 사전 리스크 → 진행상황` 순서로 재구성되고, `/cc`는 Goal의 성공 기준을 최우선 로드해 미달 시 done을 차단하고 Plan A↔B를 자동 전환하는 Goal-aware 실행 엔진으로 격상됐다.

## 주요 결정 사항

- **Goal 절대 우위**: 모든 보조 섹션(Plan A/B, Pre-mortem)은 Goal에 종속. Goal이 약하면 Approve 거부.
- **/cp↔/cc 핸드오프 프로토콜 명문화**: 어떤 필드를 어떤 형식으로 전달하는지 양쪽 SKILL.md에 고정.
- **Plan B 의무화**: medium+ 규모는 Plan B 필수, small은 생략 사유 명시.
- **8개 언어 헤더 dict**: Goal/Plan A/Plan B/Trigger 키를 EN/KO/JA/ZH/ES/FR/DE/IT 전부 채움.
- **하위 호환**: 기존 v3.3.x 형식 문서도 `parsePlanFrontmatter`로 계속 읽힘.

## 변경 파일

- `skills/cp/SKILL.md` — Phase 0(Goal) → Plan A → Plan B → Pre-mortem 재구성
- `skills/cc/SKILL.md` — Goal-aware 실행 엔진 (성공 기준 미달 시 done 차단, Plan A↔B 자동 전환)
- `lib/plan-manager.js` — `REQUIRED_SECTIONS` / `generatePlanContent()` / 신규 `extractGoal()`
- `templates/plan.template.md` — 새 구조 reference
- `CHANGELOG.md` v3.4.0 entry + `plugin.json` 버전 bump

## 테스트 & 검증

`## [3.4.0] - 2026-05-16` 으로 출시됨 (CHANGELOG 확인). `/cp → Approve → /cc 자동 핸드오프` 시나리오에서 Goal 섹션 파싱 + 성공 기준 TodoWrite 등록 + Plan A↔B 전환 + 미달 시 done 거부가 동작.

## 추가 사항

이 Goal-first 기반은 이후 v3.7(검증 섹션), v3.8(사람 중심 2층 Goal), v3.9(Codex 듀얼 검증)로 계승됐다. 본 task는 출시 후 `docs/tasks/`에 방치돼 있다가 2026-05-27 `/cp done` sweep으로 정리됨.
