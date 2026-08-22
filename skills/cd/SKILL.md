---
name: "cd"
description: "Lens Done — closes a finished task: confirms completion, decides the git state (branch merged? PR closed?), cleans the branch under a lease, and moves the plan from docs/tasks/ to docs/history/. Split out of /cp in v3.34 — completing work is a different activity from planning it, and most of this is git plumbing."
argument-hint: "[task name or plan path]"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cd | Lens Done — 완료 처리 · 브랜치 정리 · History 이관. `/cp` 에서 분리(v3.34). | MIT |

Triggers: done, complete, finish task, close out, wrap up, 완료, 완료 처리, 끝냄, 마무리, 히스토리 이관

`/cd` 는 **끝난 작업을 닫는다.** 완료를 확인하고, git 상태를 판정하고(머지됐나·PR 이 닫혔나), 브랜치를 lease 로 안전하게 정리하고, 계획 문서를 `docs/tasks/` → `docs/history/` 로 옮긴다.

> **왜 `/cp` 에서 분리했나 (v3.34)**: `/cp` 1,526줄 중 294줄(19%)이 이 모드였고, 그 대부분이 git 배관이다. 계획을 세우는 일과 끝난 일을 닫는 일은 서로 다른 활동이라, 한 스킬에 두면 계획을 하려고 부를 때마다 완료 처리 절차가 통째로 컨텍스트에 실렸다. **`/cp` = 이번 작업의 계획, `/cd` = 그 작업의 종료.**

**진입**: 인자가 있으면 그 task, 없으면 `docs/tasks/` 를 스캔해 체크리스트가 전부 완료된 문서를 찾아 **AskUserQuestion 으로 제안**한다. 자동 실행하지 않는다.

---

## 절차

완료된 작업의 History 문서를 작성하고 Task 파일을 정리합니다.

### Phase 1: 활성 작업 확인 및 완료 추정 분류

`docs/tasks/` 를 스캔하여 모든 파일을 재평가합니다. 단순 목록 표시를 넘어 각 task 의 완료 여부를 자동 추정하고 분류합니다.

#### Phase 1.1: 기존 task 파일 전수 재평가

각 `docs/tasks/*.md` 파일을 Read 해서 아래 3가지 신호를 검토:

1. **체크리스트 완료율** — `- [ ]` 대 `- [x]` 비율. 100% 근처면 완료 후보.
2. **`✅ 검증` 표** (있으면) — 각 행의 "통과 판정" 을 현재 레포 상태/git log 로 참고 (가능한 범위). 대부분 통과하면 완료 후보.
3. **`## 진행상황`** — "현재 경로" / "마지막 업데이트" 가 오래됐거나 "완료 임박" 등 진행 신호 검토. **버전 출시/배포 기록은 task 의 `## 진행상황` 섹션 + 레포의 `CHANGELOG.md` / `CLAUDE.md` Version 섹션에서 확인한다.**

#### Phase 1.2: 자동 분류 (3가지 범주)

각 task 를 다음 중 하나로 분류:

| 분류 | 판단 기준 | 처리 |
|------|----------|------|
| **완료 추정** | 체크리스트 ≥80% 완료 **또는** 검증표 모든 행 통과 신호 **또는** 진행상황에 버전 출시/배포 기록 있음 | 아래 1.3 으로 일괄 제안 |
| **진행중** | 체크리스트 <80% **또는** 진행상황에 "재개 포인트" 명시 있음 | 제외 (현황 보고만) |
| **수동 확인 필요** | 표준 구조(YAML frontmatter + `## 🎯 What`/`## 🎯 목표`/`## Goal` + (`## 🛠 How` 또는 `## Plan A`) + `## 진행상황`)를 갖추지 못해 체크리스트/검증표/진행상황을 신뢰성 있게 파싱할 수 없는 경우 (구버전 포맷) | 제외 (완료 추정 묶음에 안 넣음) |

**강한 완료 신호 (tie-break 예외)**: task 가 명시한 **대상 버전**(예: `**대상 버전**: v3.4.0`, 제목/`refs`/본문의 버전)이 레포의 `CHANGELOG.md` / `CLAUDE.md` Version 섹션에 **출시 기록**으로 확인되면 — 체크박스가 미체크(0%)거나 "재개 포인트"가 남아있거나 구버전 포맷이어도 — **완료 추정으로 올린다**. (출시됐다 = 사실상 done. 완료를 체크박스 대신 ✅·버전으로 기록한 옛 task 가 영원히 안 정리되는 것을 막는다.) 최종 아카이브는 여전히 사용자 승인이므로 안전은 승인 게이트가 담당한다.

**분류 신호 상충 시 tie-break 규칙**: **위 강한 완료 신호가 없을 때**, 그 외 신호가 상충하면 (예: 체크리스트 ≥80% 인데 동시에 "재개 포인트" 명시됨) **안전한 쪽을 우선한다**. "진행중" 또는 "수동 확인 필요"를 완료 추정보다 우선한다. 잘못 아카이브하느니 남겨두는 것이 안전하다.

#### Phase 1.3: 완료 추정 묶음 일괄 제안

분류 결과를 표로 표시:

```
기존 task 재평가 결과:

| 파일명 | 상태 | 이유 |
|--------|------|------|
| 2026-05-16-cp-goal-first-overhaul.md | 완료 추정 | 체크리스트 5.5/6 ✓, 버전 v3.4.0 배포됨 |
| 2026-05-20-cp-html-reports-board.md | 완료 추정 | 검증 표 S1~S7 통과, v3.6.0/v3.6.2 통합됨 |
| 2026-05-27-... | 진행중 | 재개 포인트: Phase 5 사용자 검토 |
```

**AskUserQuestion** (header: "작업 완료 — 기존 task 정리"):

```
아래 task 들이 완료된 것으로 보입니다. 이들을 history 로 정리할까요?

완료 추정 (일괄 제안):
  ☐ 2026-05-16-cp-goal-first-overhaul.md
  ☐ 2026-05-20-cp-html-reports-board.md

진행중:
  ⊕ 2026-05-27-cps-start-here-and-cp-done-sweep.md (Phase 5 대기)

선택:
- **Approve** — 완료 추정 항목들을 history 로 이동 (= history 에 기록 작성 + 원본 task 파일 삭제). 내용은 history 에 보존됨. (Phase 2 진입)
- **Modify** — 선택적 제외 (예: "2026-05-16만 정리, 2026-05-20은 아직") 후 진행
- **Skip All** — 중단
```

사용자가 **Approve** 또는 **Modify** 를 선택하면, 선택된 각 task 에 대해 아래 Phase 2 로 순차 진입.

**Modify 선택 시**: 완료 추정 항목을 다시 AskUserQuestion(multiSelect)으로 제시해 사용자가 실제 정리할 항목만 고르게 한 뒤 그에 대해서만 Phase 2 이상을 진행한다.

#### Phase 1.4: 안전 규칙 (절대 준수)

- **분류는 추정일 뿐** — 자동 판정이 아니라 "이 정도면 완료일 가능성 높음" 이라는 확률적 제안. 최종 판단은 **항상 사용자 승인**.
- **자동 삭제 절대 금지** — 사용자 승인 후 Phase 2~4(완료 인터뷰 → 브랜치 정리 → history 작성 → task 삭제)를 수행하므로 내용 손실은 없음. 내용 보존 강제.
- **"수동 확인 필요"는 완료 추정 묶음에 넣지 않음** — 파싱 불가 항목은 사용자가 눈으로 판정해야 함. 추정 분류는 신뢰도가 높은 항목만.
- **기존 Progress 섹션 존중** — 사용자가 손으로 적어둔 "재개 포인트" / "마지막 업데이트"를 근거로 삼되, 불명확하면 수동 확인 대상으로 넘김.

### Phase 1.5: git 상태 판정 (v3.25+)

> **머지가 확인되지 않은 task 는 history 로 이동하지 않는다.** 문서상으로는 "완료"인데 코드가 어디 있는지 아무도 모르는 상태 — 이걸 막는 것이 이 Phase 의 존재 이유다. "폴더 = 상태"(핵심 원칙 2)는 그대로 두고, **git 이 그 상태의 증거**가 된다. 규칙 SoT: `docs/rules/branch-lifecycle.md`.
>
> ⚠️ **DONE 모드는 git 조작이 허용되는 예외다.** `/cp` 의 절대 규칙("계획 & 문서화만 — 문서 외 파일 수정 금지")은 **PLAN 모드**에 적용된다. DONE 모드는 작업을 *닫는* 정리 단계이므로 push·PR 생성·**병합된** 브랜치 삭제를 수행한다. 대신 **Phase 1.4 의 안전 규칙을 그대로 상속**한다 — 자동 삭제 절대 금지, 사용자 승인 필수, 추측 삭제 금지. 브랜치 **생성**은 여전히 `/cc` 의 일이고 `/cp` PLAN 모드는 이름만 정한다.

Phase 1.3 에서 정리 대상으로 선택된 각 task 에 대해, 문서 frontmatter 에 `branch` 가 있으면 `lib/git-branch.js` 의 `mergedState(repoPath, branch, base)` 로 판정한다.

**판정 직전에 원격 ref 를 최신화한다 (선행 조건 — 생략 불가)** — `mergedState` 가 읽는 것은 **로컬에 저장된 원격 추적 ref** 다. 그 ref 가 마지막으로 갱신된 뒤 원격 task 브랜치에 새 커밋이 들어오면, 낡은 tip 을 보고 "머지됨" 으로 분류하고 **브랜치 정리(Phase 2.5)의 삭제가 더 새로운 원격 작업을 지운다.** 이 워크스페이스는 Windows 개발 머신과 Mac Mini 양쪽에서 같은 레포를 쓰므로 가정이 아니라 실제로 일어나는 시나리오다. 따라서:

- 판정 **바로 전에** base 와 task 브랜치의 원격 ref 를 가져온다 (`git fetch <remote> <base> <branch>`, 삭제된 원격 브랜치까지 반영하려면 `--prune` 을 포함한 fetch). 정확한 문법·호출 위치는 구현(`lib/git-branch.js`)에 위임하고, 문서가 고정하는 규칙은 **"fetch 없이 나온 판정은 삭제 근거로 쓰지 않는다"** 다.
- fetch 가 실패하면(네트워크 단절·인증 실패·원격 부재) **판정을 진행하지 않는다.** "원격 상태 확인 불가 — 삭제 보류" 로 보고하고 그 task 는 history 이동·브랜치 삭제 **둘 다 보류**한다. `gh` 조회 불가와 같은 취급 — 조용히 넘어가지 않는다.
- 같은 원칙("판정 직전 refresh + SHA lease")이 배치 정리 도구 `scripts/prune_branches.py` 에도 적용된다. 두 경로의 판정 원칙은 항상 같아야 한다 (SoT: `docs/rules/branch-lifecycle.md`).

```bash
# 4번째 인자 {fetch:true} 가 필수다 — 이게 없으면 판정 직전 refresh 가 돌지 않는다.
# 낡은 tracking ref 로 "머지됨" 을 판정하면 브랜치 정리(Phase 2.5)에서 lease 가
# 거부되어 그 task 의 완료 처리가 멈춘다 — 완료 인터뷰가 헛돈다.
node -e "const g=require('${CLAUDE_PLUGIN_ROOT}/lib/git-branch.js');console.log(JSON.stringify(g.mergedState(process.argv[1],process.argv[2],process.argv[3],{fetch:true})))" . feat/<slug> <base>
```

반환값의 `state` 가 아래 6상태이고 `reason` 이 판정 근거다. **PR 유무는 `mergedState` 가 모른다** — 따로 조회한다. `gh` 부재·인증 실패면 **조용히 넘어가지 말고** "PR 상태 조회 불가" 를 표시하고 history 이동은 보류한다(머지 미확인과 같은 취급).

**조회 레포를 `--repo` 로 못 박는다 (필수)** — 못 박지 않은 `gh pr list` 는 gh 가 자체 규칙(`gh repo set-default` / 다중 remote 해석)으로 고른 base 레포를 조회하고, 원격이 여럿이거나 set-default 가 걸려 있으면 그것이 **다른 레포**다 — 그리고 그 조회는 *성공*으로 돌아오므로 gh-실패 가드로는 잡히지 않는다. 다른 레포에 동명 브랜치의 머지된 PR 이 있으면 그것이 **거짓 `prMerged:true` 증거**가 되어 미머지 task 를 history 로 보내고, 반대로 매칭이 없으면 **진짜 머지된 task 가 막힌다.** `OWNER/REPO` 는 판정에 쓴 remote 의 URL(`git remote get-url <remote>`)에서 해석한다 — `scripts/prune_branches.py` 의 `_remote_github_repo()` 가 쓰는 규칙과 같아야 한다(두 경로의 판정 원칙은 항상 같다. SoT: `docs/rules/branch-lifecycle.md`). **해석 불가**(URL 미해석·github.com 이 아닌 호스트)면 어느 레포의 PR 을 보는지 모르는 상태다 — "PR 상태 조회 불가" 와 **같은 취급으로 fail-closed**: 조회를 실행하지 않고 history 이동을 보류한다.

```bash
# ⚠️ --state all 이다. 열린 PR 만 조회하면 "머지된 PR" 을 못 본다.
# ⚠️ --repo 필수 — OWNER/REPO 는 판정에 쓴 remote 의 URL 에서 해석한 값
#    (scripts/prune_branches.py _remote_github_repo() 와 같은 규칙).
#    해석 실패면 이 조회를 실행하지 않는다 = "PR 상태 조회 불가" (fail-closed).
# ⚠️ baseRefName 필수 — MERGED 라는 상태만으로는 증거가 아니다 (아래 base 자격 검사).
gh pr list --repo <OWNER/REPO> --head <branch> --state all --json number,state,baseRefName,mergedAt --limit 50
```

**base 자격 검사 — MERGED 상태만으로는 증거가 아니다 (필수)** — 조회 결과에서 완료 증거로 인정하는 PR 은 **`state: MERGED` 이고 `baseRefName` 이 이 task 문서 frontmatter 의 `base` 와 같은 것**뿐이다. 브랜치 이름 일치 + MERGED 만 보면 **stacked PR** 이 통과한다 — head 가 그 레포의 base 가 아니라 **다른 작업 브랜치**를 base 로 머지되고 head 가 삭제된 경우, `prMerged:true` → `merged-deleted` 가 나와 **그 변경이 계획의 base 에는 없는데도** task 가 완료로 아카이브된다. 규칙이 이미 못 박은 조항이다 — "PR base 는 그 레포의 base 다. 다른 작업 브랜치를 base 로 삼지 않는다"(`docs/rules/branch-lifecycle.md` §2). base 가 다른 MERGED PR 은 그 조항 밖에서 만들어진 것이고 완료 증거 자격이 없다.

- **같은 브랜치 이름으로 PR 이 여러 개**일 수 있다(닫힘·머지·재오픈 — `--state all` 이라 전부 온다). CLOSED(미머지)·OPEN 은 애초에 증거 후보가 아니므로 개수와 무관하다. 자격(**base 일치 + MERGED**)을 통과한 PR 이 **정확히 1개**일 때만 그것을 증거로 쓴다 — frontmatter `pr` 에 기록하는 번호도 이 자격 통과 PR 이다.
- 자격 통과 **0개**(MERGED 는 있는데 전부 base 불일치인 경우 포함)면 `prMerged` 를 주지 않는다 — 판정은 `unknown` 으로 남아 **사람 확인**으로 간다. 보고에 `PR #N 은 MERGED 지만 base 가 <baseRefName> (계획 base <base> 아님) — 증거 불인정` 을 명시해, 사람이 그 stacked 변경의 행방을 추적할 수 있게 한다.
- 자격 통과 **2개 이상**이면 같은 브랜치가 두 사이클에 재사용된 흔적이다(1 task = 1 브랜치 = 1 PR 위반). 어느 머지가 이 task 의 것인지 도구가 특정할 수 없다 — 자동 증거로 쓰지 않고 `unknown` 유지, 후보 전부(번호·mergedAt)를 보고하고 사람 확인.

**`unknown` 이 나왔고 base 자격을 통과한 MERGED PR 이 정확히 1개면 재판정한다** — GitHub 이 머지 후 head 를 자동 삭제하고 로컬 브랜치까지 정리된 상태에서는 원격·로컬 ref 가 둘 다 없어 `mergedState` 가 내용을 증명할 방법이 없다(→ `unknown`). 그건 **정상 완료 흐름**인데, 그대로 두면 **그 task 는 영원히 history 로 못 간다.** base 자격까지 통과한 머지를 확인했으면 그 사실을 판정에 되먹인다:

```bash
node -e "const g=require('${CLAUDE_PLUGIN_ROOT}/lib/git-branch.js');console.log(JSON.stringify(g.mergedState(process.argv[1],process.argv[2],process.argv[3],{fetch:true,prMerged:true})))" . feat/<slug> <base>
```

`prMerged: true` 는 **로컬·원격 ref 가 둘 다 없을 때만** 참조된다(내용 증거가 있으면 그쪽이 우선). 지울 ref 가 없으므로 이 경로의 오판이 삭제로 이어지지 않는다. ⚠️ PR 상태를 **확인하지 않은 채** `prMerged: true` 를 주지 마라 — 그리고 **base 자격 검사 없이도 주지 마라.** 이름 일치 + MERGED 는 증명이 아니라 가정이다.

| 상태 | 의미 | 처리 | 판정에 쓴 SHA 기록 |
|---|---|---|---|
| `unpushed` | 원격에 브랜치가 없고, **내용이 base 에 없음이 증명됐다** | **push + PR 생성 제안** (AskUserQuestion). history 이동 보류 | — (원격 ref 없음) |
| `merged-deleted` | 원격 브랜치가 없지만 **로컬 ref 기준으로 내용이 base 에 들어갔음이 증명됐다** — 머지 직후 head 를 삭제한 정상 흐름(§3 이 규정한 것) | `merged`/`patch-merged` 와 동일하게 Phase 2 이후 진행. 브랜치 정리(Phase 2.5)는 **원격 삭제를 건너뛴다**(지울 ref 가 없다) — **로컬 브랜치만** 삭제 | `branchSha` 는 `null`(원격 ref 부재). 대신 `localSha` 를 로컬 삭제의 lease 로 쓴다 |
| `unmerged` (PR 없음) | 원격에 있고 미머지, PR 도 아직 없다 | **PR 생성 제안**. history 이동 보류 | `origin/<branch>` tip |
| `unmerged` (PR 열림) | 리뷰 대기 | **history 로 내리지 않는다** → **"In Review"** 로 보고. task 파일은 `docs/tasks/` 에 그대로 둔다 | `origin/<branch>` tip |
| `merged` / `patch-merged` | 병합이 증명됐다 | Phase 2(완료 인터뷰) → **Phase 2.5(브랜치 정리)** → Phase 3(history 기록) → Phase 4(task 정리) 순으로 진행 — **브랜치 정리가 아카이브보다 먼저다** | **필수** — `origin/<branch>` tip + 비교에 쓴 `origin/<base>` tip. Phase 2.5 가 이 값을 lease 로 쓴다 |
| `unknown` | **도구가 증명하지 못했다** — 계보가 다르거나, 원격 ref 가 없는데 내용 반영 여부도 확인 불가(merge-tree 충돌·구버전 git·로컬 ref 도 없음) | **자동 처리 금지.** 사람 확인 요청 — history 이동·브랜치 삭제 **둘 다 보류**. ⚠️ **push + PR 생성을 제안하지 않는다** — 이미 머지된 작업일 수 있다(그 제안은 `unpushed` 전용) | 기록만(사람 확인용). 삭제 근거로는 쓰지 않는다 |

**판정에 쓴 SHA 를 기록한다** — fetch 직후 판정에 실제로 사용한 tip SHA 를 판정 결과와 함께 남긴다. 이 값이 Phase 2.5 의 **lease** 다: 삭제 명령에 이 SHA 를 **실어 보내고**, 원격 tip 이 다르면 git 이 삭제를 거부한다("확인한 뒤 삭제" 가 아니다 — Phase 2.5). **SHA 없이 나온 판정으로는 브랜치를 삭제하지 않는다.**

#### 1.5.1 이중 게이트 우선순위 — git 판정이 우선

Phase 1.2 의 완료추정 로직(체크리스트 ≥80% / 검증표 통과 / 버전 출시 기록)과 이 Phase 는 **이중 게이트**가 된다. 충돌 시:

- **git 판정이 이긴다.** 체크리스트가 100% 여도, 강한 완료 신호(버전 출시)가 있어도 — **미머지면 history 이동 금지**다. 체크박스는 사람이 적은 주장이고, 머지는 증거다.
- **하위호환 (필수)**: frontmatter 에 `branch` 필드가 **없는 기존 task 문서**는 Phase 1.2 의 종전 로직 그대로 판정하고 이 Phase 를 skip 한다. 그러지 않으면 브랜치 필드가 도입되기 전에 만들어진 옛 문서가 **영구히 정리 불가**가 된다. (skip 했다는 사실은 보고에 한 줄로 남긴다 — 조용한 우회 금지.)

#### 1.5.2 머지 판정에 `ahead` 커밋 수를 쓰지 않는다

`ahead` 개수나 조상 관계만 보면 **rebase·squash 머지된 브랜치가 영원히 미병합으로 보인다** — 두 방식 모두 커밋을 새로 쓰기 때문이다(실측: `livevil-research` PR #4). 판정은 2단이다: ① `git merge-base --is-ancestor` 빠른 경로 → ② 실패 시 **patch-id 동등성**(`git cherry origin/<base> origin/<branch>` 에 `^+` 행이 없으면 병합됨 = `patch-merged`). 둘 다 통과 못 하면 `unknown` 이고, **`unknown` 은 절대 자동 처리하지 않는다** (리베이스 중 충돌을 손으로 해결해 patch-id 가 바뀐 경우 — 도구가 병합을 증명할 수 없다는 뜻).

#### 1.5.3 `Returns_ERP_v20` 예외 — 완료 처리가 배포가 되지 않게

`Returns_ERP_v20` 의 base 는 `staging` 이고 **staging 머지는 곧 배포**다. 이 레포에서는 DONE 모드가 **PR 생성까지만** 하고 **머지는 사람이 한다.** `/cp done` 이 머지를 대행하면 "완료 처리 = 배포"가 되어, 문서 정리 의도로 실행한 명령이 라이브 배포를 트리거한다. 따라서 이 레포의 task 는 `unmerged` (PR 열림) → **In Review 보고에서 멈춘다.** 이후 사람이 머지한 뒤 `/cp done` 을 다시 실행하면 `merged` 판정으로 정상 마감된다.

#### 1.5.4 In Review 보고 형식

```text
In Review — history 로 내리지 않았습니다 (머지 미확인)

| task | branch | base | 상태 | PR |
|------|--------|------|------|----|
| 2026-07-25-foo.md | feat/foo | staging | unmerged (PR 열림) | #12 |
| 2026-07-24-bar.md | fix/bar  | master  | unpushed           | — |

- feat/foo: PR #12 리뷰 대기 → 머지 후 `/cp done` 재실행하면 자동 마감됩니다.
- fix/bar: 원격에 없습니다 → push + PR 생성할까요?
```

`unknown` 은 같은 표에 `unknown (병합 증명 불가 — 사람 확인 필요)` 로 싣고, 무엇을 확인해야 하는지(어느 브랜치의 어느 커밋인지)까지 적는다.

### Phase 2: 완료 인터뷰

Task 파일의 내용을 읽은 후, 5개 질문으로 결과를 수집합니다.
AskUserQuestion을 사용하여 한 번에 물어봅니다:

```
Q1. 무엇을 했나요? (한두 문장 요약)
Q2. 주요 결정 사항은? (왜 이 방식으로?)
Q3. 변경된 파일들은?
Q4. 어떻게 검증했나요?
Q5. 남은 작업이나 주의사항? (선택)
```

### Phase 2.5: 브랜치 정리 (v3.25+ — 아카이브 전 게이트)

> **왜 아카이브(Phase 3~4)보다 먼저인가** — 삭제 lease 는 "Phase 1.5 판정 이후 브랜치가 진전되지 않았다"를 확인하는 **마지막 검증**이다. 이 검증을 history 작성·task 삭제 **뒤에** 두면, lease 가 거부되는 순간 이미 검증 안 된 새 작업이 "완료"로 기록돼 있고 재평가할 task 문서도 없다 — 되돌릴 수 없다. 순서를 뒤집으면 실패 방향이 안전해진다: 여기서 멈추면 task 는 `docs/tasks/` 에 그대로 남고, `/cp done` 재실행이 새 fetch 로 재판정한다. 반대 창("브랜치는 지웠는데 history 작성 실패")은 덜 위험하다 — 여기서 지우는 브랜치는 머지가 **증명**된 것이라 내용이 이미 base 에 있고, task 문서도 아직 남아 있다(복구 경로는 Phase 3 참조). 잘못 아카이브하느니 남겨두는 것이 안전하다는 Phase 1.4 원칙의 연장이다. 규칙 SoT: `docs/rules/branch-lifecycle.md` §2·§7.1.

**병합된 브랜치 삭제 (v3.25+)** — Phase 1.5 판정이 `merged` / `patch-merged` 이고 `lens.config.json` 의 `autoDeleteMergedBranch` 가 `true` 일 때만, 해당 task 의 `branch` 를 **로컬·원격 둘 다** 삭제한다. 브랜치를 남기면 작업은 끝났는데 브랜치만 쌓인다 — 이 개편이 없애려는 상태 그 자체다.

**원격 삭제는 원자적 lease 삭제로만 한다 (필수) — check-then-delete 금지** — "현재 원격 tip 을 읽어 판정 SHA 와 같은지 **확인한 뒤** 지운다"는 순서는 **금지**다. 확인과 삭제는 별개의 두 명령이고, 그 사이에 다른 머신(Mac Mini 등)이 push 하면 방금 확인한 값은 이미 낡은 값이다 — 그 새 커밋이 그대로 지워진다. 확인은 원자적이지 않으므로 **확인으로는 이 경쟁 상태를 막을 수 없다.** 대신 **기대 SHA 를 삭제 명령 자체에 실어 보내고, 원격 tip 이 그와 다르면 git 이 서버 단계에서 삭제를 거부**하게 한다. 판정과 삭제 사이의 원자성은 우리가 비교해서 얻는 것이 아니라 git 이 보장하는 것이다.

```bash
# 원격 — 브랜치 tip 과 base tip 두 기대값을 한 atomic push 에 실는다.
# base 쪽 refspec 은 아무것도 쓰지 않는다(움직였으면 lease 가 push 전체를 거부).
git push --atomic \
  --force-with-lease=refs/heads/<base>:<판정baseSHA> \
  --force-with-lease=refs/heads/<branch>:<판정SHA> \
  origin <판정baseSHA>:refs/heads/<base> :refs/heads/<branch>

# 로컬 — 아래 "로컬 삭제" 두 조건을 만족할 때만. 원격과 같은 이유로 원자적이어야 한다
# (비교-후-삭제 사이에 다른 프로세스가 진전시키면 판정 안 된 커밋이 지워진다).
# base 기대값도 같은 트랜잭션에 싣는다 — update-ref --stdin 은 열거된 ref 를
# 동시에 잠그고 all-or-nothing 으로 처리한다.
# ⚠️ 체크아웃된 브랜치 위에서 실행 금지 — update-ref -d 는 branch -D 와 달리
#    현재 브랜치도 말없이 지워 HEAD 를 깨뜨린다(git 2.53 실측). 이 가드는 유지하되
#    해법은 skip 이 아니라 "base 로 이동 후 삭제"다 (아래 별도 절).
# ⚠️ NUL 종단(-z) 필수 — Windows text 모드 subprocess 가 \n 을 \r\n 으로 번역해
#    LF 종단 --stdin 형식을 fatal: extra input 으로 깨뜨린다(실측).
printf 'verify\0refs/heads/<base>\0<판정baseSHA>\0delete\0refs/heads/<branch>\0<판정SHA>\0' \
  | git update-ref -z --stdin
```

**삭제 근거는 두 개다 (v3.26+)** — "브랜치 tip 이 판정 그대로" **그리고 "그 패치가 base 에 있다"**. 브랜치 lease 만 걸면 판정 이후 base 가 force-push·reset 됐을 때 브랜치 tip 은 그대로라 lease 가 통과하고, **그 커밋을 담은 마지막 원격 ref 가 삭제된다**(실제 파괴 재현됨). base 가 어느 방향으로든 움직였으면 `base 가 진전됨 — fetch 후 재판정` 으로 멈춘다. force 전환 금지.

lease 가 `stale info` 로 거부하면 **재시도·force 전환 금지** — "원격이 진전됨 — fetch 후 재판정 필요" 로 보고하고 멈춘다. 기록된 SHA 가 없으면 lease 를 걸 수 없으므로 삭제하지 않는다. 이 거부는 아래 **진행 게이트**의 실패다 — 이 task 는 Phase 3(history)·Phase 4(task 삭제)로 진행하지 않는다.

**`merged-deleted` 는 원격 삭제를 건너뛴다** — 그 상태는 원격 ref 가 이미 없다는 뜻이다(머지 직후 head 삭제 = 정상 흐름). 지울 원격 ref 가 없으므로 lease 삭제를 시도하지 않고, `branchSha` 가 `null` 이라 위의 "기록된 SHA 없으면 삭제 안 함" 규칙이 자동으로 막는다. **로컬 브랜치만** 삭제하고, 그때의 lease 는 `localSha` 다(로컬 tip 이 그 값과 같을 때만). 이 형태는 배치 정리 도구 `scripts/prune_branches.py` 가 실제로 쓰는 것과 **같아야 한다** — 두 경로가 다른 삭제 방식을 쓰면 한쪽에만 경쟁 상태가 남는다 (SoT: `docs/rules/branch-lifecycle.md`).

**로컬 삭제 — 증명이 끝난 뒤에는 조상 검사를 반복하지 않는다** — `git branch -d` 가 보는 것은 "브랜치 tip 이 base 의 조상인가" 하나뿐이다. 그런데 `patch-merged` 는 **정의상 조상이 아니다** — squash·rebase 머지가 커밋을 새로 썼기 때문이고, 그건 사고가 아니라 의도된 결과다. 그래서 Phase 1.5 가 patch-id 동등성으로 "모든 내용이 base 에 들어갔다" 를 증명해도 `-d` 는 매번 거부하고, **그런 완료마다 로컬 브랜치가 계속 남는다.** 이미 더 강한 증명이 끝났는데 더 약한 검사가 결과를 뒤집는 셈이다. 따라서:
- **다음 두 조건을 모두 만족할 때만** 조상 검사를 우회하는 삭제(`git update-ref -d`)를 허용한다.
  1. Phase 1.5 판정이 `merged` · `patch-merged` · **`merged-deleted`** — 도구가 병합을 **증명**했다(내용 증명). `merged-deleted` 는 원격이 이미 없으니 **로컬만** 지운다.
  2. 로컬 브랜치 tip 이 Phase 1.5 의 **판정 SHA 와 같다** — 판정에 들어가지 않은 로컬 커밋이 없다(SHA 증명). `merged-deleted` 는 원격 ref 가 없으므로 그 비교 기준이 `branchSha` 가 아니라 **`localSha`** 다. (이 조건은 **ref 가 존재할 때**의 조건이다 — 부재면 아래 "이미 정리됨".)
- **로컬 ref 부재는 "이미 정리됨"이다 — 미푸시 커밋이 아니다.** 다른 머신에서 작업·완료한 task 는 이 머신에 `refs/heads/<branch>` 가 아예 없는 것이 정상이다. 없는 로컬 tip 은 판정 SHA 와 "같을" 수가 없으므로, 이 상태에 "tip ≠ SHA = 미푸시 커밋" 규칙을 적용하면 **존재하지 않는 미푸시 커밋을 사유로 멈춘다** — 그리고 원격만 지운 채 멈추면 재실행 시 양쪽 ref 가 다 없어 또 막힌다. 지울 로컬 ref 가 없으면 로컬 삭제는 **성공(이미 정리됨)** 으로 처리하고 진행한다.
- 로컬 ref 가 **존재하는데** tip 이 판정 SHA 와 다르면 — 그것이 진짜 push 안 된 로컬 커밋이다 → 지우지 않고 "로컬에 미푸시 커밋 있음 — 삭제 보류" 로 보고한다.
- 그 외 모든 경우(`unknown`·`unmerged`·판정 SHA 없음·증명 없음)에는 **`-D` 금지가 그대로다.** 여기서 열리는 것은 "**증명이 끝난** 브랜치의 중복 조상 검사 우회" 하나뿐이고, "증명 없는 강제 삭제" 는 열리지 않는다.

**체크아웃된 브랜치 — skip 이 아니라 base 로 이동 후 삭제** — `/cc` 가 task 브랜치를 만들어 그 위에서 작업을 끝내고 곧바로 `/cp done` 을 실행하는 것이 **가장 흔한 사용 경로**이고, 그 시점에 삭제 대상 task 브랜치가 체크아웃돼 있는 것은 **정상 상태**다. 여기서 로컬 삭제를 "체크아웃 중"이라고 건너뛰고 아카이브로 진행하면, Phase 3(history 작성)·Phase 4(task 삭제)의 문서 변경이 **이미 머지됐고 원격 ref 도 지워진 그 브랜치 위에서** 커밋된다 — 완료 기록이 base 에 영영 도달하지 못하고 고립된다. 아카이브는 **정리가 지속될 브랜치 위에서** 실행돼야 한다. 따라서 삭제 대상 `branch` 가 현재 체크아웃돼 있으면:

1. 이 검사·이동은 이 task 브랜치 정리의 **첫 단계**다 — 원격 lease 삭제보다도 먼저 실행한다. 이동에서 멈출 때 "원격만 지워진" 어중간한 상태를 만들지 않기 위해서다.
2. **dirty 검사** — `git status --porcelain` 이 비어 있지 않으면 **이동하지 않는다.** 완료 인터뷰까지 온 시점이면 작업 커밋은 끝났어야 하고, 미커밋 변경을 안고 checkout 하면 실패하거나 변경이 base 로 딸려 간다. "미커밋 변경 있음 — commit/stash 후 `/cp done` 재실행" 으로 보고하고 **이 task 는 여기서 멈춘다**(삭제·아카이브 미진입).
3. 해석된 **base 로 checkout** 한다 (`git checkout <base>` — base 는 `resolveBase()` 로 해석한 값, 추정 금지). 이후 Phase 3·4 의 문서 변경은 base 위에서 일어나 정상적으로 남는다.
4. 이동 성공 후 원격 lease 삭제 → 위의 원자적 로컬 삭제(`git update-ref -d refs/heads/<branch> <판정SHA>`) 순으로 진행한다 — 이제 체크아웃 가드에 걸리지 않는다. ⚠️ **가드 자체는 유지된다** — 체크아웃된 브랜치를 `update-ref -d` 로 지우면 HEAD 가 깨진다는 사실은 변하지 않는다. 바뀐 것은 대응이다: skip 이 아니라 **먼저 이동**.
5. **이동 실패는 fail-closed** — checkout 이 어떤 이유로든 실패하면 삭제도 아카이브도 진행하지 않는다. 고립된 완료 기록을 만드는 것이 이 결함의 본질이므로 "이동 못 함 = 아카이브 못 함"이다. 사유 + "`/cp done` 재실행 시 재판정" 안내를 보고하고 멈춘다.

이 경로는 아래 진행 게이트의 "시도하지 않은 삭제"도 "시도했다 거부·실패한 삭제"도 아니다 — **이동 후 삭제**라는 별도의 정상 경로이고, 이동+삭제가 모두 성공했을 때만 "삭제 성공"이다.

**삭제 금지 조건 (Phase 1.4 안전 규칙 상속 — 하나라도 걸리면 삭제하지 않고 사유를 보고)**:
- `unknown` 상태 — **절대 자동 삭제 금지.** 도구가 병합을 증명하지 못한 브랜치를 지우면 코드가 사라진다. 추측 삭제 금지.
- **열린 PR 의 head 브랜치** — 삭제하면 PR 이 닫힌다. In Review 는 아직 완료가 아니다.
- `autoDeleteMergedBranch` 가 `false` — 삭제하지 않고 "수동 정리 대상" 으로 보고만 한다. **아카이브는 진행한다** — 삭제를 *시도하지 않은* 것이지 *실패한* 것이 아니다(아래 진행 게이트).
- **증명 없는 강제 삭제 금지** — `-D` 는 위 "로컬 삭제" 두 조건(증명된 `merged`/`patch-merged` **그리고** 로컬 tip = 판정 SHA)을 모두 만족할 때만 쓴다. 증명이 없거나 SHA 가 어긋나면 `-D` 도 `-d` 도 쓰지 않는다. 반대로 **증명이 끝난 브랜치를 `-d` 거부만을 이유로 남기지도 않는다** — 조상 검사는 patch 머지를 판정할 능력이 없다.
- **판정 직전 fetch 를 못 했다** — 원격 상태를 확인하지 못한 판정에는 삭제 근거가 없다. "원격 상태 확인 불가 — 삭제 보류" 로 보고한다(Phase 1.5 선행 조건).
- **lease 거부 — 원격이 진전됐다** — lease 삭제가 `stale info` 로 거부되면 판정에 쓴 SHA 가 더는 원격 tip 이 아니라는 뜻이다. **force 로 재시도하지 않고** "원격이 진전됨 — 재판정 필요" 로 보고한다. 사용자가 `/cp done` 을 재실행하면 새 fetch 로 다시 판정된다. 기록된 SHA 가 없으면 lease 를 걸 수 없으므로 애초에 삭제하지 않는다.

**진행 게이트 — "시도하지 않은 삭제"와 "시도했는데 거부된 삭제"를 구분한다 (Phase 3 진입 조건)**:

| 이 Phase 의 결과 | 해당 경우 | Phase 3(history)·Phase 4(task 삭제) 진행? |
|---|---|---|
| **삭제 성공** | 원격 lease 삭제 + 로컬 `update-ref -d` 성공 / 체크아웃돼 있던 브랜치의 **base 이동 후 삭제** 성공(위 별도 절 — 이동+삭제 둘 다 성공해야 이 행이다) | ✅ 진행 |
| **삭제를 시도하지 않음 (정당한 skip)** | `autoDeleteMergedBranch: false` / `merged-deleted` 의 원격 삭제 skip(지울 원격 ref 없음 — 로컬 삭제 결과만 따진다) / **로컬 ref 부재 — 이미 정리됨**(다른 머신에서 완료한 task, 지울 로컬 ref 없음 = 성공과 동치) / frontmatter 에 `branch` 없음(1.5.1 하위호환 — Phase 1.5 자체를 skip) | ✅ 진행 — skip 사유를 완료 메시지에 남긴다 |
| **삭제를 시도했는데 거부/실패** | lease `stale info` 거부(원격 진전) / `update-ref -d` 거부(로컬 진전) / 로컬 ref 가 **존재하는데** tip ≠ 판정 SHA(진짜 미푸시 커밋) / 판정 SHA 부재(Phase 1.5 필수 기록 누락 — 재판정 필요) / 체크아웃 브랜치의 **base 이동 실패**(dirty 미커밋 변경·checkout 실패 — 위 별도 절, fail-closed) | ❌ **이 task 의 완료 처리를 여기서 멈춘다** — history 를 쓰지 않고 task 파일도 지우지 않는다(아카이브 미진입). 사유 + "`/cp done` 재실행 시 재판정" 안내를 보고한다 |

- 원격 lease 삭제는 성공했는데 로컬 쪽이 거부·실패한 경우도 **멈춘다**(아카이브 미진입). 원격 브랜치는 머지 증명이 끝난 것이라 지워도 잃는 것이 없고, 로컬의 미푸시 커밋은 재실행 시 Phase 1.5 가 로컬 ref 기준으로 재판정한다(내용이 base 에 없음이 증명되면 `unpushed` → push+PR 제안 경로). "원격 삭제됨 / 로컬 보류 / 아카이브 보류" 를 함께 보고한다.
- `unknown`·열린 PR·`unmerged`·fetch 실패는 애초에 Phase 1.5 게이트가 Phase 2 진입 자체를 막으므로 여기 오지 않는다. 위 삭제 금지 조건에 남아 있는 해당 항목들은 **방어선**이다 — 어떤 경로로든 도달했다면 삭제도 아카이브도 하지 않는다.

### Phase 3: History 문서 생성

> Phase 2.5(브랜치 정리)를 통과한 task 만 여기 도달한다. 여기서 작성이 실패해도 잃는 것은 없다 — 머지는 이미 증명됐고(코드는 base 에 있다) task 파일도 아직 `docs/tasks/` 에 있다. 단, 브랜치 ref 는 이미 지워졌을 수 있으므로 `/cp done` 을 처음부터 재실행하면 Phase 1.5 가 `unknown` 을 낼 수 있다 — 이 경우의 복구는 재판정이 아니라 **그 자리에서 history 작성만 재시도**하는 것이다. 실패했으면 실패로 보고하고 task 파일을 지우지 않는다.

`docs/history/YYYY-MM-DD-{slug}.md`에 저장합니다.
날짜는 **완료 날짜** (오늘), slug는 task 파일과 동일하게 사용합니다.

```markdown
# {제목} — 완료

**완료일**: YYYY-MM-DD

## 요약
{Q1 답변}

## 주요 결정 사항
{Q2 답변 — 리스트 형식}

## 변경 파일
{Q3 답변 — 파일 경로 리스트}

## 테스트 & 검증
{Q4 답변}

## 추가 사항
{Q5 답변, 있을 시}
```

### Phase 3.5: HTML 보고서 + board 생성 (필수 — opt-in 없음)

> **Phase 3 의 history md 저장 직후 항상 수행한다.**

1. "HTML 보고서 뷰 + Task Board" 섹션 절차대로 `docs/history/{id}.html` slide-deck(history 양식, 최대 8슬라이드) 생성.
2. `docs/_shared.css` 없으면 배포.
3. `node ${CLAUDE_PLUGIN_ROOT}/lib/board-builder.js {projectRoot}` 로 board 재빌드.

### Phase 4: 정리

> Phase 2.5(브랜치 정리)를 **삭제 성공 또는 정당한 skip** 으로 통과한 task 만 여기 도달한다. 삭제를 시도했다 거부·실패한 task 는 Phase 2.5 에서 멈춰 `docs/tasks/` 에 그대로 남아 있다.

1. `docs/tasks/`에서 원본 Task 파일 **삭제**
2. TodoWrite 항목 전부 `completed` 처리
3. 완료 메시지 표시: 생성된 history 파일 경로 + 삭제된 task 파일 + **Phase 2.5 의 브랜치 정리 결과** — 삭제된 브랜치(로컬/원격) 또는 삭제하지 않은 사유(skip 사유 포함)

---
