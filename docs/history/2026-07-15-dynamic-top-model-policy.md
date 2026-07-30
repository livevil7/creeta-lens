# Lens 모델 정책 전환 — 고정 모델명 폐지, 난이도 사다리 자동 추종 — 완료

**완료일**: 2026-07-30 (실행 완료: 2026-07-15)
**출시**: v3.24.0 (커밋 `9fd7182`, 태그 `v3.24.0`)

> 이 기록은 계획서 `docs/tasks/2026-07-15-dynamic-top-model-policy.md` 의 본문·진행상황에서 추출해 작성했다. 실행은 2026-07-15 세션에서 이뤄졌고, history 이관만 2026-07-30 에 했다.

## 요약

Lens 지시문에 못박혀 있던 고정 모델명(`opus`·`gpt-5.5`)을 지우고 **업무 난이도에 맞는 모델 사다리**로 교체했다. Easy=경량 티어 / Medium=중간 티어 / Hard=최상위 티어(TOP)로 배분하고, 각 칸이 **모델 세대와 함께 자동으로 올라가게** 했다 — 새 모델이 나와도 사람이 문서를 고치지 않는다.

codex 축은 `~/.codex/models_cache.json` 순위표에서 **1등을 매 호출 직전 동적 선택**하는 resolver 로 바꿨다. 특정 모델명을 문서에 못박지 않고, 사용자가 데스크톱 앱에서 바꾼 config 기본값에도 의존하지 않는다.

착수 근거: Lens 의 모든 품질 검증이 당시 순위표 **7위** 모델(gpt-5.5)로 돌고 있었고, Claude 쪽 최고 난이도 자리도 한 세대 전(opus)에 고정돼 있었다.

## 주요 결정 사항

- **"최고 모델 무차별 배정"을 기각하고 난이도 배분으로 재설계** — 사용자 정정(2026-07-15 Modify)이 결정적이었다. 초안은 Claude 축을 "전 역할 TOP"으로 잡았으나, 원칙은 **난이도별 배분**이고 사다리의 각 칸이 자동 상승하는 것이 이 작업의 본질이라는 지적을 반영했다. 이로써 `/cc` 의 v3.11 "전부 opus (품질 우선·비용 비고려)" 철학이 공식 폐기되고 `/c` 와 사다리가 통일됐다.
- **사다리의 칸은 이름이 아니라 상대 위치** — `haiku`/`sonnet`/`fable` 를 적는 대신 "경량 티어 / 중간 티어 / enum 최상위"로 정의했다. enum 이 갱신되면 사다리가 따라 올라간다.
- **codex 는 순위표 1등 동적 선택, 난이도는 별도 다이얼** — 모델 선택과 추론 깊이(`xhigh`/`high`)를 분리했다.
- **조용한 강등 금지** — resolver 가 실패해 낮은 모델로 떨어지면 결과물에 ⚠️ 플래그를 남기도록 의무화했다. 빈 값이 `-m ""` 으로 새어 조용히 기본 모델로 실행되는 경로를 인자 배열 분기로 원천 차단했다.

## 변경 파일

**규칙 (SoT)** — `docs/rules/codex-integration.md`(§4 resolver 강화판), `docs/rules/harness-rules.md`, `docs/rules/capability-assumptions.json`

**스킬 5종** — `skills/c/SKILL.md`, `skills/cc/SKILL.md`(P4.5 resolver 인라인 — Supervisor 지적 반영), `skills/ccp/SKILL.md`, `skills/ci/SKILL.md`, `skills/cp/SKILL.md`

**릴리즈** — `.claude-plugin/marketplace.json`·`plugin.json`, `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `hooks/hooks.json`, `hooks/session-start.js`, `docs/board_creeta-lens.html`

**계획서** — `docs/tasks/2026-07-15-dynamic-top-model-policy.md` + `.html` (이 history 로 이관)

## 테스트 & 검증

검증 **9/9 전량 pass**, Goal 3/3 달성.

| # | 검증 | 결과 |
|---|---|---|
| V1 | resolver 가 순위표 1등을 뽑는가 | `gpt-5.6-sol` ✓ |
| V2 | §4 표준 호출 E2E | EXIT 0 + `V324-OK` ✓ |
| V3 | 옛 모델명 호출형 잔존 | 0건 ✓ |
| V4 | 5개 스킬에 사다리 반영 | ✓ |
| V5 | `fable` spawn 실측 | ✓ (Supervisor 실행이 겸용 검증) |
| V6 | 태그 ref 확인 | `git show v3.24.0:.claude-plugin/marketplace.json` → ref=v3.24.0 ✓ |
| V7 | 이 컴퓨터 플러그인 반영 | 3.23.1 → 3.24.0 ✓ |
| V8 | Mac Mini 플래그 경로 | 정상 ✓ |
| V9 | JSON 파싱 | ✓ |

**Pre-mortem**: 4-skeptic 병렬 공격으로 27건 수집 → 12건 채택·계획 반영, **blocker 2건 사전 해소**.

**Supervisor**: `fable` 82점 pass.

**Codex 리뷰는 degrade 됐다** — 대형 diff 로 180초를 초과해 `codex-integration.md` §7 규칙대로 Supervisor 단독 게이트로 진행했다. 이때 timeout 가드가 라이브로 실증됐고, 이 실패가 v3.25.0 에서 **타임아웃 규모 분기(180/300/600초)** 개정의 근거가 됐다.

## 추가 사항

- **자기 감시 배선** — 모델 순위가 바뀌어 문서 예시가 낡으면 Lens 정기 감사(`/crv`)가 스스로 알아차리도록 `capability-assumptions.json` 에 감사 항목을 넣었다.
- **수용된 한계** — Claude 두뇌 목록에는 순위 정보가 없어 미래 새 모델명의 우열은 자동 판별이 불가능하다. 판별 불확실 시 상속을 안전 기본값으로 두고, `/crv` 감사가 목록 변화를 감지해 개정을 제안한다. (⚠️ 이 "상속" 규칙 자체는 **v3.25.0 에서 폐기**됐다 — 계측 구멍이자 최상위 모델 과소비의 직접 원인이었다.)
- **다른 컴퓨터** — 각자 `/lens-upgrade`·`/ci` 실행 시 자동 반영.
- **출시 순서 교훈** — 마켓플레이스가 태그의 `ref` 를 보므로 **커밋 → 태그 → push → `git show` 검증** 순서를 엄수해야 한다. 순서가 바뀌면 다른 컴퓨터에 옛 코드가 설치된다(실제 사고 이력이 있어 절차화됨).
