---
plan_id: 2026-09-04-cp-report-visibility-top-model
planner: cp
planner_model: opus (세션 자체 — 이 규칙을 도입하는 커밋이라 도입 이전 세션 모델로 작성)
grade: 기본
created: 2026-09-04
status: done
repo: creeta-lens
base: master
branch: feat/cp-report-visibility
pr: null
refs: []
---

# `/cp` 계획서를 눈앞에 띄운다 + 계획은 TOP 티어가 쓴다 — 완료

**완료일**: 2026-09-04
**출시**: v3.37.0 (표시 경로 수정 v3.37.1)

## 🎯 What — 무엇이 가능해졌는가

- `/cp` 로 기획을 시키면 **승인을 묻기 직전에 계획서가 화면에 실제로 뜬다.** 파일을 찾으러 탐색기를 열 일이 없다.
- 계획서를 안 띄웠으면 **승인을 요청하는 것 자체가 막힌다** — "저장했으니 승인해주세요" 로 넘어갈 수 없다.
- 원격(SSH)·헤드리스처럼 화면을 띄울 수 없는 자리에서는 **띄웠다고 거짓말하지 않는다.** 아티팩트 URL 로 대신 내주거나, 못 띄웠다고 첫 줄에 적는다.
- 계획서를 **어느 모델이 썼는지 문서에 남고**, 세션이 낮은 모델일 때는 계획 설계·작성을 최상위 모델(현재 Fable 5.1)에 맡긴다.

## ❓ Why — 왜 했는가

사용자 지적(2026-09-04):

> "board 및 md파일 뭐 저장은 한대. 근데 저장했으니, 승인해라 이렇게만 보고를 해. 나한테 명시적으로 보고서를 띄워서 내가 볼 수 있게까지 처리를 해야지 … 맨날 계획서 찾는다고 탐색기 찾고 뭐하고 아주 지겨워 죽겠어."
> "그리고 기획을 할 때는 왠만하면 fable 5.1 을 쓰게 해. 계획서를 쓸 때는 특히. 좀 똑똑하게 하자."

**안 본 문서에 대한 승인은 승인이 아니다.** `/cp` 는 v3.20 대부터 `{md, html, board}` 3종을 정확히 만들어 왔고, "산출물 링크는 풀 경로" 라는 산문 규칙도 v3.25 부터 있었다. 그런데도 같은 불만이 나온 이유는 산문의 강도가 아니라 **성질**이다 — 파일을 만드는 일은 모델 자신의 출력에 흔적이 남지만(그래서 산문만으로도 18개 레포에서 이행됐다, `harness-rules.md` §6), **브라우저를 여는 일은 아무 흔적도 남기지 않는다.** 안 해도 대화만 봐서는 티가 안 나고, 비용은 전부 사용자가 탐색기를 뒤지는 시간으로 청구된다.

모델 축도 같은 종류의 거꾸로 선 사다리였다. `/cc` 는 비가역·보안·아키텍처 작업에 TOP 티어를 배정하면서, **그 워커들이 따를 계획서는 세션 기본 모델로** 쓰고 있었다. 계획이 틀리면 실행 전체가 틀린 것을 정확하게 만든다.

## 🛠 How — 무엇을 했는가

### 1. 표시를 "행위"에서 "기록"으로 바꿨다

행위는 검사할 수 없지만 기록은 검사할 수 있다. 그래서 여는 것과 동시에 기록을 남긴다.

- **`lib/report-viewer.js` (신규)** — `docs/tasks/{id}.html`(없으면 `.lens/preview/{id}.html` 로 원문을 감싼 페이지)을 OS 기본 프로그램으로 열고 `.lens/report-shown.json` 에 `{method, file|url, shownAt}` 을 남긴다. `browser`·`artifact` 만 "봤다"로 친다.
- **`scripts/show-report.js` (신규)** — CLI. `show-report.js <md>` 로 띄우고, `--check <id>` 로 게이트가 읽고, `--artifact <url> <id>` 로 아티팩트 폴백을 되먹인다. 출력은 JSON 한 줄, exit 0 = 사용자가 지금 볼 수 있다.
- **정직성 조항** — SSH·헤드리스는 `remote` 로 기록하고 **게이트를 통과시키지 않는다.** 원격 기계의 브라우저를 여는 것은 아무도 안 보는 창을 띄우는 것이다.

### 2. `/cp` 파이프라인에 Phase 4.5 를 넣고 게이트를 걸었다

- **Phase 4.5 (신규, 생략 불가)** — 위치가 중요하다. Phase 2.6(HTML 생성)이 아니라 **Pre-mortem(P3) 이후, 승인(P5) 직전**이다. P3 이 `## ⚠️ 사전 리스크` 를 md 에 추가하므로, 2.6 산출물을 그대로 띄우면 **사용자가 보는 화면과 승인 대상 문서가 다르다.** 4.5 는 HTML·board 를 최종 md 로 갱신한 뒤 띄운다.
- **Phase 5.0 §7 표시 게이트** — `show-report.js --check {id}` 가 exit 0 이어야 승인 화면에 갈 수 있다. `unshown`·`remote`·`failed` 는 Phase 4.5 회귀.
- **Phase 5.1 승인 화면 고정 블록** — 첫 줄이 `📄 계획서 — 방금 띄웠습니다: <경로|URL>`. 이어서 브랜치/base, 작성 모델, 커버리지 카운트, 한 줄 요약.
- **Phase 6 Modify** — 수정하면 **다시 띄운다.** 사용자가 열어 둔 탭은 수정 전 문서이므로, 안 띄우면 옛 버전을 승인하게 된다.
- **`hooks/post-tool-plan-doc.js`** — 계획 md 를 쓰는 순간 "띄워라 + `planner_model` 을 적어라"를 주입한다. 이미 띄웠거나 이미 적혀 있으면 조용하다. 70KB 앞쪽의 규칙은 컨텍스트가 길어지면 건너뛰어지므로, 문서를 쓰는 그 시점에 다시 말한다.

### 3. 계획을 TOP 티어로 올렸다

- 세션이 **이미 TOP(`fable`)이면 세션 안에서 쓴다 — spawn 금지.** 부모가 대화·조사 컨텍스트를 갖고 있어 위임이 순손실인 것은 Pre-mortem 3.1 이 이미 내린 판정이다.
- 세션이 **TOP 미만이면 Phase 1~2.5 를 `Agent(model: "fable")` 에 위임**하되 **컨텍스트 전량**(원본 요청·What/Why·조사 산출·인벤토리)을 실어 보낸다. 컨텍스트 없는 위임은 상위 모델이 아니라 무지한 모델을 쓰는 것이다.
- 어느 쪽이든 frontmatter **`planner_model:`** 에 기록하고 승인 화면에 표시한다. Phase 5.0 §8 이 빈 값을 잡는다.
- TOP 상한은 그대로다(`/cc` 3 · `/cp deep` 2). 계획 위임은 그 안에서 **1개**를 쓴다.

## 📋 변경 파일

**신규** — `lib/report-viewer.js`, `lib/report-viewer.test.js`, `scripts/show-report.js`

**스킬** — `skills/cp/SKILL.md` (계획 모델 절 신설 · frontmatter `planner_model` · Phase 4.5 신설 · Phase 5.0 게이트 §7·§8 · Phase 5.1 승인 블록 · Phase 6 Modify 재표시 · 절대 규칙 2줄 · Phase 순서)

**훅** — `hooks/post-tool-plan-doc.js`

**규칙 (SoT)** — `docs/rules/harness-rules.md` (§4.1 보강 — 계획 작성 = Critical 칸 / §4.8 신설 — 표시는 산출물이 아니라 행위다)

**릴리즈** — `.claude-plugin/plugin.json`·`marketplace.json`, `hooks/hooks.json`, `hooks/session-start.js`, `skills/cc|cp|cs|ci/SKILL.md` 배너, `CLAUDE.md`, `README.md`, `CHANGELOG.md`

## ✅ 검증

| # | 검증 | 수단 | 결과 |
|---|---|---|---|
| V1 | 단위 불변식 (표시 판정·원격 거부·HTML 우선·아티팩트 폴백·연결 프로그램 게이트·프리뷰) | `node lib/report-viewer.test.js` | **20/20 PASS** (v3.37.1) |
| V2 | 실제 화면에 뜨는가 (Windows 로컬) | `node scripts/show-report.js docs/tasks/2026-08-14-cs-mirror-invariant.md` → 창 목록 실측 | Chrome 창 제목 `/cs 미러 개편 · 계획 - Chrome` **확인** |
| V3 | 게이트가 기록을 읽는가 | `show-report.js --check <id>` | exit 0 · `표시 게이트 통과` |
| V4 | 훅이 미표시·`planner_model` 부재를 잡는가 | 임시 레포에 계획 md 작성 → 훅 stdin 주입 | 두 지시 **모두 주입됨** |
| V5 | 충족되면 훅이 조용한가 | `planner_model` 추가 + 표시 기록 후 재실행 | 두 지시 **모두 사라짐** |
| V6 | 기존 테스트 회귀 | `plan-coverage` 37 · `gate-ledger` 34 · `git-branch-entry` 15 · `install-sync` 8 · `session-start` 11 | **105/105 PASS** (신규 20 포함 125/125) |

## ⚠️ 남은 것 · 주의점

- **표시 게이트는 "띄웠다"까지만 증명한다.** 사용자가 읽었는지는 증명하지 못한다 — 그래서 승인 화면이 위치·요약·리스크 한 줄을 여전히 같이 낸다.
- **`/cd`·`/crv` 보고서에는 아직 안 걸었다.** 같은 불만이 그쪽에서도 나오면 `show-report.js` 를 그대로 재사용하면 된다(스킬 3줄).
- **`.md` 를 OS 에 그대로 넘기면 안 된다 (v3.37.1 에서 수정).** 릴리즈 직후 실측에서 잡혔다 — 이 기계의 Windows 에는 `.md` 연결 프로그램이 없고(`assoc .md` exit 1), 그때 `start` 는 **exit 0 을 내면서 창도 다운로드도 만들지 않는다**(`file://` URL 로 바꿔도 동일). 첫 구현은 그것을 `browser` 로 기록했다 — **§4.8 이 금지하는 조용한 거짓 성공을 스스로 저지른 것.** 지금은 ① win32 확장자 연결을 먼저 확인하고 ② 덱이 없으면 `.lens/preview/{id}.html` 로 원문을 감싸 연다. 창 제목으로 재확인(무변화 → 계획 id).
- **`planner_model` 은 구조 게이트의 필수 항목이 아니다** — 기존 계획서 82건을 한꺼번에 실패시키지 않기 위해서다. 잡는 것은 Phase 5.0 §8(신규 계획)과 훅의 안내다.
