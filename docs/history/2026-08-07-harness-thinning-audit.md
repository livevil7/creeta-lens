---
title: 하네스 감축 감사 — 네이티브가 흡수한 규율 걷어내기 (v3.29.0)
date: 2026-08-07
status: completed
grade: standard
planner: manual-audit
---

# 하네스 감축 감사 (v3.29.0)

## 🎯 What — 무엇이 가능해졌나

- Lens 를 켜도 **Claude Code 가 이미 강제하는 규칙을 두 번 읽지 않는다.** 같은 지시를 호스트가 한 번, Lens 가 열두 번 말하던 상태가 끝났다.
- 세션을 시작할 때 **Lens 가 밀어 넣던 스킬 목록·추천 규칙·팁 줄이 사라졌다.** 그 자리를 호스트의 스킬 목록이 그대로 채운다.
- 병렬 작업을 돌릴 때 **진행 상황만 세던 보조 에이전트가 더 이상 뜨지 않는다.** 진행 보고는 그대로 받되, 그 일을 하던 별도 인력이 없어졌다.
- 남은 스킬 9개는 전부 **호스트가 대신 해주지 않는 일**만 한다.

**완료의 정의 (Done = ?)**

> `/cc` 를 한 번 돌렸을 때 Monitor 에이전트가 뜨지 않고, 세션 시작 컨텍스트에 스킬 표가 없으며, 남은 9개 스킬 어디에도 Claude Code 가 이미 강제하는 규율 문단이 복붙돼 있지 않다.

## ❓ Why — 왜 했나

**푸는 문제**: LLM 세대가 올라가면서 하네스(모델을 붙잡아 두던 비계)가 모델 안으로 흡수됐다. 흡수된 뒤에도 비계를 그대로 두면 두 가지 손해가 난다. ① **토큰** — 같은 규칙을 여러 번 읽는다. ② **가중치 왜곡** — 호스트가 한 번 말하는 것을 Lens 가 열두 번 반복하면, 둘이 어긋날 때 Lens 쪽으로 기운다. 실제로 되묻기 정책에서 이 왜곡이 일어나고 있었다(§4.5).

**안 하면**: 모델이 좋아질수록 Lens 가 모델의 판단을 덮어쓰는 방향으로 나빠진다. 비계는 저절로 사라지지 않는다.

**직접 계기**: 사용자 지적 — *"지금 llm 모델이 진화하면서 하네스를 걷어내는 게 더 좋다고 하던데."*

## 🔬 조사 방법

`/crv` 를 돌리지 않고 수동으로 했다. 판정 기준은 `docs/rules/harness-rules.md` §1 — **"호스트가 이미 강제하는가"** 하나.

1. **공급 측 probe** — 라이브 세션(Claude Code 2.1.222)의 시스템 프롬프트·도구 설명을 직접 읽어 대조. `claude --help`, `claude plugin list`, `claude ultrareview --help` 실행.
2. **수요 측** — 설치된 6개 플러그인(lens·agentmemory·context7·playwright·insane-search·ui-ux-pro-max) 전수 검토.
3. **레지스트리 대조** — `docs/rules/capability-assumptions.json` 의 가정 ↔ 라이브 현실 diff.

## 🔎 핵심 발견

### 발견 1 — 규율 텍스트는 전부 네이티브로 이동했다

| Lens 가 인라인하던 것 | 라이브에서 확인된 네이티브 위치 |
|------|----------|
| pipeline 기본 / barrier 예외 | Workflow 도구 — `DEFAULT TO pipeline()` + smell test 예제 |
| 위임 후 중복 금지 | Agent 도구 — `Once you've delegated a search, don't also run it yourself` |
| 결과 릴레이 | Agent 도구 — `The agent's final report is not shown to the user — relay what matters` |
| Adversarial verify / Perspective-diverse / Completeness critic / No silent caps | Workflow 도구 `Quality patterns` — **항목명까지 1:1** |
| 침묵은 성공이 아니다 | Monitor 도구 — `Coverage — silence is not success`, 자문 문장까지 동일 |
| 정직 보고 · 완료 판정 · 삭제 전 확인 | 시스템 프롬프트 `Delivering work` 절 |

### 발견 2 — 레지스트리가 이미 알고 있었는데 조치가 밀려 있었다

`capability-assumptions.json` 의 `native-todowrite-background` 행은 **2026-06-06 에 "Monitor 에이전트는 순수 오버헤드"** 라고 판정해 두었다. 그럼에도 v3.25(7월)는 Monitor 를 제거하는 대신 5분 보고 규칙을 *강화*했다.

**이것이 이번 감사의 가장 중요한 교훈이다** — 감사가 판정을 내려도 코드에 반영되지 않으면 아무 일도 일어나지 않는다. 레지스트리에 `acted_v3.29` 필드를 추가해 판정과 조치를 같은 행에서 추적하게 했다.

### 발견 3 — Karpathy Rule 1 이 하네스와 반대 방향이었다

Rule 1 은 *"불확실하면 묻는다"*, 하네스는 *"루틴한 판단은 스스로 내리고 blocking question 은 아껴라"*. Rule 1 전문이 스킬 12곳에 복붙돼 있어 가중치가 되묻기 쪽으로 기울어 있었고, 사용자의 다른 룰(`feedback_try_first`)과도 충돌했다. `harness-rules.md` §4.5 에 충돌 심사로 기록하고 **하네스 우선**으로 판정했다 — 단, "가정을 드러내라"는 Rule 1 의 취지는 *질문*이 아니라 *계획서의 가정·미해결 질문 섹션*으로 배출한다.

### 발견 4 (부수) — 슬래시 OVERRIDE 가 죽어 있었다

`scripts/user-prompt-handler.js` 는 `autoRecommend === false` 일 때 1번째 분기에서 즉시 반환했다. 그런데 그 아래에 **슬래시 명령 OVERRIDE**(사용자가 `/cp` 라고 치면 되묻지 않고 즉시 Skill 도구를 때리게 하는 강제)가 있었다. `autoRecommend` 는 v3.13 부터 기본 `false` 였으므로, **그 이후 이 OVERRIDE 는 한 번도 실행된 적이 없다.** 핸들러를 OVERRIDE 전용으로 재작성하며 복구했고, 실측으로 확인했다.

## 🛠 What was done

### 삭제

| 대상 | 위치 | 대체 |
|------|------|------|
| `/c` 스킬 (777줄) | `skills/c/` | 하네스 본체 + TodoWrite |
| `/ccp` 스킬 (228줄) | `skills/ccp/` | `/code-review`(+`ultra`) · `/security-review` · `/cc` P6 QA |
| 전담 Monitor 에이전트 | `/cc` P3.1 강제 배포 | 하네스 자동 재호출 + TodoWrite |
| 오케스트레이션 규율 6항목 | `/cc` P3.0 | Agent·Workflow 도구 설명 |
| QA 패턴 4항목 | `/ccp` 하네스 절 | Workflow Quality patterns |
| 워커 "작업 규율" 8줄 | `/cc` 워커 프롬프트 | 시스템 프롬프트 (Leader 향 보고 계약 2줄만 존치) |
| Karpathy 4규칙 전문 ×12 | 8개 스킬 | `~/.claude/CLAUDE.md` (워커 프롬프트 1곳만 존치) |
| 스킬 인벤토리 표 주입 | SessionStart 훅 | 호스트 스킬 목록 |
| Lens Suggestion Line | SessionStart 훅 | 네이티브 auto-discovery |
| 키워드 추천기 · 플러그인 레지스트리 | `lib/keyword-matcher.js` · `lib/plugin-registry.js` · `.lens-cache.json` | 네이티브 semantic auto-discovery |
| 죽은 설정 4개 | `lens.config.json` (`autoRecommend`·`showReport`·`minMatchScore`·`customKeywords`) | — |
| 유령 경로 `skills/cpp/` | `scripts/bump-version.sh` 검증 목록 | v3.25 삭제분이 스크립트에만 남아 있었음 |

### 신설·개정

- `harness-rules.md` §2 에 `[네이티브]`/`[Lens]` 표시 도입, §C·§D 를 "네이티브 위치 색인"으로 전환
- `harness-rules.md` §1 — 재복붙 예외 3개 → **2개**. 예외 3("자주 위반되는 규칙의 3중 반복")은 additive-only 를 무력화하는 만능 우회로여서 폐지. 예외 1 의 전제가 미검증임을 명시
- `harness-rules.md` §4.5 (Rule 1 ↔ 되묻기 충돌) · §4.6 (Monitor 폐지) · §5 (걷어낸 것 전량 추적표) 신설
- `capability-assumptions.json` — `native-work-discipline` · `native-code-review` 행 신설, `acted_v3.29` 필드 도입, `last_full_audit` 2026-06-05 → 2026-08-07
- `user-prompt-handler.js` OVERRIDE 전용 재작성 (발견 4 수정)

## ✅ Review — 검증

| 목표가 됐다는 신호 | 확인 방법 | 통과 판정 | 종류 | 결과 |
|---|---|---|---|---|
| 스킬 9개만 남음 | `ls skills/ \| wc -l` | `9` | auto | ✅ 9 |
| SessionStart 주입이 대폭 축소 | `node hooks/session-start.js \| wc -c` | 4,804B → 1,000B 미만 | auto | ✅ **603B** (additionalContext 147자) |
| 슬래시 OVERRIDE 동작 | `CLAUDE_USER_MESSAGE='/cp deep x' node scripts/user-prompt-handler.js` | OVERRIDE 문자열 출력 | auto | ✅ 확인 |
| 비-슬래시는 무음 | 같은 스크립트에 일반 문장 | `{"systemMessage":""}` | auto | ✅ 확인 |
| 레지스트리 JSON 유효 + 경로 실재 | `node -e` 파싱 + `fs.existsSync` 전수 | 파싱 OK, 드리프트 0 | auto | ✅ 13행 / 드리프트 0 |
| 4규칙 **전문 블록**이 1곳만 남음 | `grep -c '### 2. Simplicity First' skills/*/SKILL.md` | 총 1건, 위치는 `/cc` 워커 dispatch | auto | ✅ **1건** (`skills/cc/SKILL.md:405`). 나머지 스킬의 `Think Before Coding` 언급은 전부 1줄 포인터 |
| 버전 문자열 일관 | `bash scripts/bump-version.sh` stale 검사 | 잔여는 전부 히스토리 표기 | auto | ✅ 확인 |

## 🚧 비목표 (이번에 하지 않은 것)

- **agentmemory 정리** — 초기 감사에서 네이티브 파일 메모리와 중복이라고 제안했으나, **사용자가 멀티머신 용도로 유지를 지시**했다. 네이티브 파일 메모리는 머신 로컬이고 agentmemory 는 Mac Mini 중앙 서버를 통해 여러 머신이 공유한다 — 겹치는 것은 표면뿐이다. 유지.
- **ui-ux-pro-max 중복 파일** — 벤더 플러그인 내부(`.claude/skills` ↔ `cli/assets/skills` 동일 내용 2벌)라 이 저장소 범위 밖. 보고만.
- **`/cc` 팬아웃 엔진 자체** — Dynamic Workflows 가 대체 후보이나 plan-tier 게이트(Max/Team)가 있어 비-Max 세션에선 `/cc` 가 유일 경로. 존치.
- **codex 이종검증** — 네이티브 워커는 전부 Anthropic 계열이라 대체 불가. 존치.

## ⚠️ 리스크

| # | 리스크 | 트리거 | 완화 |
|---|------|--------|------|
| R1 | 진행보고 누락 증가 | Monitor 폐지 후 본체가 침묵 | 회귀 감시(§4.6). 재발 시 폴링 에이전트가 아니라 **네이티브 Monitor 도구** 기반으로 복구 |
| R2 | 워커 규율 이완 | 서브에이전트가 시스템 프롬프트를 못 받는 경우 | 전제 자체가 미검증이므로 §1 에 명시. 실측 결함이 관측되면 그때 복구 |
| R3 | `/ccp` 상실로 실행 증명 누락 | `/cc` P6 QA 가 얕아지면 | P6 QA 는 auto 행 명령을 직접 실행하도록 이미 강제. 얕아지면 `native-code-review` 행 재검토 |
| R4 | `/c` 사용자 습관 | 기존 `/c` 타이핑 | 슬래시 OVERRIDE 가 미설치 스킬엔 반응하지 않음. `/cc`·`/cp` 로 안내 |

## 📊 결과 수치

- 스킬: **11개 → 9개**
- `/cc` SKILL.md: **1,078줄 → 993줄**
- 삭제된 스킬 본문: `/c` 777줄 + `/ccp` 228줄
- SessionStart 훅 출력: **4,804B → 603B** (주입 컨텍스트 147자)
- 삭제된 lib: 2개 파일 + 캐시 1개
- 죽은 설정 키: 4개
- 복구된 버그: 1건 (슬래시 OVERRIDE)

## 관련 문서

- `docs/rules/harness-rules.md` — §1 additive-only · §2 인벤토리 · §4.5 되묻기 충돌 · §4.6 Monitor 폐지 · §5 걷어낸 것 추적표
- `docs/rules/capability-assumptions.json` — `acted_v3.29` 필드로 판정↔조치 추적
- `CHANGELOG.md` — v3.29.0
