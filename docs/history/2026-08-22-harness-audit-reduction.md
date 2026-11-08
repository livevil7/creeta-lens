# 하네스 감사 후속 — /cp·/cc 감축 — 완료

**완료일**: 2026-11-08

## 요약
`/cp`·`/cc` 를 "시켰을 때 삽질하지 않게 하는 최소한"만 남기도록 감축했다. 6단계 모두 Plan A 로 완주했고(Plan B 전환 없음), 작업 인벤토리 52건 중 44건 포함·8건 제외(사유 전건 기재)로 처리했다. 결과: `/cc` 1,142 → 824줄(-28%), `/cp` 1,526 → 933줄(-39%), 합계 -34%. 코드 게이트화한 항목과 순증 기능(승인표 `건드릴 파일`·`읽은 근거 문서` 칼럼, `docs/history/` 겹침 문서 주입)을 포함한다. 릴리스: v3.34.0 (PR #4, 커밋 cbe217d, 2026-08-23 07:50 KST 병합). 브랜치 `fix/tracker-guard-and-dead-refs`.

## 주요 결정 사항
- 이 계획은 `/cp` 로 만들지 않았다(개편 대상의 도구가 범위를 가두는 것을 피하려고 — 소유자 지적). 차용한 것은 작업 인벤토리(커버리지 원장) 하나.
- 한 번에 재작성 기각 — v3.29 가 감축 다음날 +149줄(64%) 되돌아온 이력. 단계별 커밋(6ebb59e, e5505cf, 9ba2996, 14c5106, 68bf8d7, 6ed0957)으로 진행.
- Codex 4.5 교차 검증은 opt-in 강등 계획(#46)을 뒤집어 유지·승격(소유자 지시 + codex 실호출 661건 실측) → `scripts/codex-review.sh` 로 이관.
- `agent-tracker` 삭제 제외(#44) — 정식 산출물이고 861회 라이브 주입. matcher 수정이 정답.
- 커버리지 게이트는 하드블록 대신 `PostToolUse`+`additionalContext` 주입형(#43) — grandfathering 없이 막으면 in-flight 78/82 가 실행 불가(R1).
- `/cc` 네이티브 Workflow 재작성(#50), 버전 문자열 8곳 제거(#51) 등은 범위 밖으로 제외.
- 편차 6건: 감사를 `/cc` 가 아닌 네이티브 Workflow 로 실행 · 0단계 원인이 matcher 가 아니라 `initSession()` 덮어쓰기 · 「예시」 절 전체 삭제 → 최종 보고 서식만 존치 · R3 가정 빗나감(필수 섹션 축소 후 통과율 23% → 22%, 남긴 6개가 맞았다는 반증으로 판단) · Codex 강등 → 승격 · `verifyOwnership` 정규식 → 문자열 매칭.

## 변경 파일
`git diff --stat cbe217d^1 cbe217d`: 27개 파일, +2,195 / -1,195.
- 스킬: `skills/cc/SKILL.md`, `skills/cp/SKILL.md`, `skills/cps/SKILL.md`, `skills/cd/SKILL.md`(신설), `skills/ci/SKILL.md`, `skills/cs/SKILL.md`
- 훅: `hooks/hooks.json`, `hooks/post-tool-plan-doc.js`(신설), `hooks/post-tool-progress.js`, `hooks/post-tool-task.js`, `hooks/pre-tool-task.js`, `hooks/session-start.js`, `hooks/session-start.test.js`(신설)
- 라이브러리: `lib/agent-tracker.js`, `lib/git-branch.js`, `lib/git-branch-entry.test.js`(신설), `lib/plan-manager.js`, `lib/plan-coverage.test.js`
- 스크립트: `scripts/codex-review.sh`(신설)
- 문서·메타: `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/rules/harness-rules.md`(§6 추가), `docs/rules/capability-assumptions.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `docs/tasks/2026-08-22-harness-audit-reduction.md`

## 테스트 & 검증
검증표 9행 중 8행 auto 통과, 9행(우회율)은 manual 관측 대기. 진행상황 기록 기준:
- 테스트 202 → 240건(+38), `lib/` 테스트 보유 파일 2 → 4. 세션 시작 회귀 테스트 11/11.
- 이 문서 자체가 커버리지 게이트 통과: `{valid:true, total:52, included:44, excluded:8}`.
- 훅 5종 exit 0, 삭제 대상 댕글링 참조 잔여 0, `affects_lens` 경로 13/13 실존.
- 검증표 6·7행의 목표(`/cc` ≤700줄, `/cp` ≤450줄)에 대해 최종 실측은 824·933줄. 이 차이에 대한 별도 기록 없음(기록 없음).

## 추가 사항
- 남은 일: (1) 검증 9행 — 신규 tasks 문서의 `planner: cp` 비율 33% → 70%+ 관측(manual, 관측 대기). (2) 태그·마켓플레이스 반영은 계획상 "별건"이며 이 계획서에 완료 기록 없음(기록 없음). (3) 비차단 질문: `/cc` 를 네이티브 Workflow 위로 재작성할지는 별도 판단 대상.
- 대표(소유자)가 2026-11-08 이 계획 마감을 승인함.
