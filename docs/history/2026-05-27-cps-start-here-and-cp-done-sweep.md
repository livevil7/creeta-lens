# /cps (START_HERE 생성기) + /cp done 기존 task 전수 정리 — 완료

**완료일**: 2026-05-27 (대상: v3.10.0 — 소스 반영 완료, git tag/push는 사용자 release 단계)

## 요약

lens에 신규 skill `/cps`를 추가했다. 어떤 레포든 `/cps` 한 번이면 실제 docs를 스캔해 `docs/START_HERE.md`(레포 first-read 진입점 + 질문 라우팅)를 생성/갱신한다. 함께 `/cp done`을 강화해, 새 task만이 아니라 `docs/tasks/`에 쌓인 기존 task까지 전수 재평가해 완료분을 일괄 아카이브 제안하도록 했다. (이 sweep으로 본 task와 방치 2건을 정리한 것이 첫 실사용.)

## 주요 결정 사항

- **SKILL.md-only + 강제 evidence step** (Plan A): 인터랙티브 스킬이라 Claude의 Glob/Read가 곧 ground-truth. Codex가 권한 결정론적 `lib/start-here-builder.js`는 허구 경로 재발 시의 Plan B로 격하 — Plan B 미발동(허구 경로 0).
- **비파괴 게이트**: 기존 START_HERE는 diff+승인 후에만 갱신. CLAUDE.md 포인터는 없을 때만 1줄 조건부 주입(있으면 무변경, CLAUDE.md 신규 생성 안 함). docs/ 없으면 생성.
- **허구 경로 0 원칙**: Glob 미확인 경로 나열 금지, 근거 부족은 `(Not documented yet)`.
- **/cp done 강한 완료 신호**: 출시 기록(CHANGELOG/CLAUDE.md Version)이 확인되면 체크박스 미체크·재개포인트 잔존이어도 완료 추정으로 승격(최종 아카이브는 사용자 승인). 그 외 신호 상충 시 안전쪽(진행중/수동확인) 우선. 자동삭제 금지.
- **surgical**: DONE 모드 Phase 1만 강화, Phase 2~4 불변.

## 변경 파일

- `skills/cps/SKILL.md` — 신규 (5단계 절차)
- `skills/cp/SKILL.md` — DONE 모드 Phase 1 강화 (전수 재평가 3분류 + 강한 완료 신호)
- `.claude-plugin/{plugin,marketplace}.json`, `hooks/`, `skills/{c,cc,cp,cs}/SKILL.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md` — v3.9.0 → v3.10.0 범프 (11곳) + /cps 문서화
- `docs/START_HERE.md` — 신규 (dogfood 산출물)

## 테스트 & 검증

- /cc 병렬 실행 (Worker #1 opus: cps, Worker #2 sonnet: cp DONE). 품질 게이트 더블 검증: Supervisor iter1 FAIL(72) → iter2 PASS(88), Codex iter1 FAIL(7건) → iter2 PASS. Codex 단독 발견 2건(CLAUDE.md 모순, START_HERE 자기참조)이 이종 검증 가치 입증.
- dogfood: `docs/START_HERE.md` 생성 → 나열 경로 16/16 실존(허구 0, `ls` 대조). CLAUDE.md 포인터는 이미 참조 존재로 skip. `/cp done` 분류 검증(2026-05-16 → 완료추정, 출시 기록 근거).
- Goal 4/4 ✓.

## 추가 사항

- **남은 release (사용자)**: `git commit + tag v3.10.0 + push` → `/lens-upgrade` 후 라이브 `/cps`·강화된 `/cp done` 사용 가능. (현재 소스만 반영, 설치 캐시는 3.9.0)
- dogfood에서 tie-break이 출시된 옛 task를 완료추정에서 빼는 문제를 발견 → 사용자 결정으로 "출시 기록=강한 완료 신호" 예외 추가.
- 계획 문서(Plan A/B + 듀얼 합성 + Pre-mortem): 이 history의 원본 task.
