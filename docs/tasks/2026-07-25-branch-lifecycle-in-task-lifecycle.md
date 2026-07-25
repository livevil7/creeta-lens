---
plan_id: 2026-07-25-branch-lifecycle-in-task-lifecycle
planner: cp
grade: standard
created: 2026-07-25
status: planned
refs: []
---

# 브랜치 생명주기를 작업 생명주기에 붙이기 — /cp · /cc · /cp done · /cs 재배치

## 결정 요약 (관리자용)

**1 task = 1 문서 = 1 브랜치 = 1 PR.** 지금 Lens 는 "작업의 완료"를 문서 위치(`docs/tasks/` → `docs/history/`)로만 정의하고, git 의 완료(브랜치 → PR → 머지 → 삭제)와 전혀 연결하지 않는다. 그래서 브랜치는 작업이 *끝난 뒤* `/cs` 가 `sync/<날짜>` 로 급조하고, `/cp done` 은 머지 여부를 모른 채 문서만 옮긴다.

브랜치 생명주기의 소유권을 세 스킬에 나눠 배치한다 — **`/cp` 가 이름을 정하고(문서에 기록), `/cc` 가 만들어 그 위에서만 커밋하고, `/cp done` 이 PR·머지·삭제로 닫는다.** `/cs` 는 task 브랜치를 소유하지 않고 계획 밖 변경만 쓸어담는다.

단계는 **2단**이다: `feat/x` → 테스트 → 그 레포의 base 병합 → 브랜치 삭제. staging 을 새로 만들지 않는다 — 실제 staging 배포 환경이 있는 레포가 `Returns_ERP_v20` 하나뿐이고, 환경 없는 staging 브랜치는 main 과 항상 동일해져 머지를 두 번 하는 절차만 남기 때문이다.

## 🎯 What — 목표 (무엇이 가능해지는가)

**이 작업이 끝나면 가능해지는 것:**

- 새 작업을 시작하면 그 작업만의 브랜치에서 코드가 바뀐다 — 통합 브랜치(main·master·staging)가 작업 중간 상태로 오염되지 않는다.
- 작업을 완료 처리하면 그 변경이 리뷰 가능한 상태로 올라가고, 병합이 확인된 뒤에야 완료 기록으로 내려간다 — "문서상 완료인데 코드는 어디 있는지 모르는" 상태가 사라진다.
- 병합이 끝난 브랜치는 자동으로 없어진다 — 브랜치 목록을 열면 지금 진행 중인 작업만 보인다.
- 배포 환경이 있는 레포에서는 작업이 실수로 배포를 트리거하지 않는다 — 지금은 막혀 있지 않다.
- 여러 작업자(병렬 worker)가 동시에 같은 레포를 고쳐도 서로의 변경을 지우지 않는다.

**완료의 정의 (Done = ?):**

> 아무 레포에서나 새 작업을 계획하고 실행한 뒤 완료 처리했을 때, 그 작업의 코드가 자기 브랜치에서 리뷰를 거쳐 통합 브랜치에 들어가 있고, 그 브랜치는 지워져 있고, 완료 기록 문서가 남아 있다.

## 🚧 비목표 (Non-Goals)

- **staging 브랜치를 새로 만드는 것** — 배포 환경이 뒤에 없는 staging 은 리뷰 가치가 0이고 머지 절차만 늘린다. 사용자 확정(2026-07-25): "staging조차 배포환경이 있는 것이나 하는 거지."
- **staging 배포 환경 구축(26개 레포)** — 인프라·비용 과제로 이 계획과 분리한다.
- **`master` → `main` 이름 통일(13개 레포)** — 원격 default 변경·다른 머신 재동기화·배포 훅 점검이 레포마다 따라온다. Lens 가 base 를 감지하면 문제가 해소되므로 이번 범위에서 뺀다.
- **`Returns_ERP_v20` 의 staging→main 승격 절차 대체** — `promote-to-main.sh` 는 그 레포의 배포 절차다. Lens 는 staging 을 base 로 인식만 하고 승격에 관여하지 않는다.
- **PR 리뷰 프로세스(승인자·CODEOWNERS·CI 필수화) 설계** — 1인 개발이라 리뷰어가 본인이다. PR 은 "변경을 한 덩어리로 보이게 하는 장치"로만 쓴다.
- **기존 원격 브랜치 대청소를 이 작업에 포함** — 도입 전 1회 정리는 선행 조건(T0)으로 분리해 실행한다.

## ❓ Why — 왜 해야 하는가

- **푸는 문제 / 동기 (왜 지금·무엇을·누구를 위해·어디서)**: 사용자가 27개 레포를 혼자 개발하면서 Lens 로 계획→실행→완료를 돌리는데, 그 흐름에 브랜치 개념이 아예 없다. 실측 결과 **26개 레포 중 25개가 통합 브랜치 위에서 직접 작업**하고 있다(`creeta-lens`=master, `livevil-contents`=main, `Returns_ERP_v20`=staging …). 그래서 세 가지가 동시에 깨진다. ① 작업 중간 상태가 통합 브랜치에 바로 쌓여 "지금 main 이 배포 가능한가"를 알 수 없다. ② `/cc` 의 자동 커밋 보호가 `main|master` 문자 비교라서 **`staging` 체크아웃인 `Returns_ERP_v20` 은 보호에서 빠진다** — staging 은 배포 트리거다. ③ `/cp done` 이 머지와 무관하게 문서만 옮기므로 브랜치가 계속 쌓인다(`livevil-research` 실측: 원격 브랜치 10개 중 살아 있는 작업 1개, 접두사 9종 혼재).
- **안 하면 (방치 시 비용)**: 브랜치 누적은 이미 발생한 사고다 — `livevil-research` 는 지금도 `agent/research-workspace-features-20260725` 에 체크아웃된 채 main 과 갈라져 있고(main 전용 7커밋 / 브랜치 전용 3커밋), 그 브랜치가 자기 자신을 upstream 으로 가져 `/cs` 규칙상 **사실상 base 로 승격**돼 버렸다. 즉 3커밋이 main 에 못 들어간 채 고립됐고, `/cs` 는 그걸 정상으로 본다. 이 구조를 고치지 않으면 "어느 계보가 살아 있는지" 판단 비용이 계속 커지고, `Returns_ERP_v20` 에서는 판단 실수 한 번이 운영 배포 사고가 된다.
- **언제**: 지금이 적기다. `livevil-research` 에서 이 문제를 부분적으로 푼 자산(`docs/rules/branch-hygiene.md`, `scripts/prune_branches.py`, PR #4)이 이미 존재하므로, 그 실측 결론을 Lens 규칙으로 승격하면 재발명 없이 전 레포로 확장된다.

## 🧰 실행 전략 & 자원

- **난이도**: medium — 코드량은 크지 않지만(신규 lib 1개 + 스킬 문서 3곳 + config) 27개 레포의 git 상태를 건드리는 판정 로직이라 정확성 요구가 높다. 파일 수 9개, 되돌리기는 쉬움(전부 버전관리 + 기본값 off 시작).
- **권장 모델**: `fable` (Task enum 최상위 티어) — base 판정·머지 판정은 "틀리면 배포 사고" 경로다. 문서 편집 태스크(T1·T4·T6)는 `sonnet` 으로 충분.
- **병렬 실행**: T1·T2·T3 은 서로 독립이라 3-way 병렬 가능. T4·T5·T6 은 T2·T3 완료 후(의존). T7·T8·T9 는 독립. 단일 세션 순차로도 무리 없는 규모 — `/cc` 로 넘길 때 wave 2개로 묶는다.
- **활용 스킬**: `/cc`(실행·병렬 worker), `/ccp`(도입 후 27개 레포 대상 실동작 검증), Codex(base·머지 판정 로직 교차검증 — 이미 P0.5 에서 1회 수행). 브라우저 검증 불필요(CLI 레이어).
- **기존 자원·시스템 (재사용)**:
  - `livevil-research/docs/rules/branch-hygiene.md` — 접두사 4종·patch-id 머지 판정·태그 아카이브 원칙. **실측으로 확립된 결론**이라 Lens 규칙의 기반으로 삼는다.
  - `livevil-research/scripts/prune_branches.py` + `tests/test_prune_branches.py` — rebase·squash 머지 판정이 이미 구현·테스트됨. Lens 로 승격(복제) 대상.
  - `creeta-lens/scripts/git-sync-all.sh` — 브랜치 생성→커밋→push→PR→복귀 순서와 fail-closed 원칙이 이미 검증됨. task 브랜치 흐름이 이 순서를 그대로 재사용한다.
  - `creeta-lens/lib/plan-manager.js` — frontmatter 생성·파싱·상태갱신 진입점 존재. 필드 추가로 확장.
  - `creeta-lens/lib/hook-utils.js` — 파일 lock 존재(Codex 지적). 병렬 worker 직렬 통합 lock 에 재사용.
  - `creeta-lens/lib/board-builder.js` — board 생성기. In Review 칼럼 추가 지점.
  - `Returns_ERP_v20/promote-to-main.sh` — staging→main 승격. 그대로 둔다.

## 🚫 DO NOT CHANGE

- `creeta-lens/scripts/git-sync-all.sh` 의 **PR-only fail-closed 원칙과 "브랜치를 커밋보다 먼저 자른다" 순서** — 주석에 실측 근거가 박혀 있다("Order is the whole trick"). task 브랜치 도입과 무관하게 유지.
- `git-sync-all.sh` 의 **base = 그 브랜치의 upstream** 규칙 — `Returns_ERP_v20` 이 staging 에 있는 이유가 여기 걸려 있다. 판정 소스를 추가할 뿐, 이 규칙을 뒤집지 않는다.
- **`.gitignore` 존중 / 시크릿 임의 제외 금지** (`/cc` Phase 7.4 rule 1) — 사용자 강한 룰. 브랜치 로직이 이 규칙에 손대지 않는다.
- `Returns_ERP_v20` 의 `staging` → `main` 승격 절차 및 `promote-to-main.sh` — Lens 가 대체·자동화하지 않는다.
- `livevil-research/docs/rules/branch-hygiene.md` **원본 파일** — 그 레포 소유 문서다. Lens 규칙으로는 **복제·참조**하고 원본을 수정하지 않는다.
- `livevil-research` 의 열린 PR #4 / #5 — 진행 중인 작업이다. 이 계획이 건드리지 않는다.
- `lens.config.json` 의 기존 키(`autoCommitOnComplete` 등)의 **의미** — 새 키를 추가할 뿐 기존 동작을 재정의하지 않는다.

## 🛠 How — 어떻게 (Plan A / Plan B)

### Plan A — 권장 경로

#### 왜 이게 1순위인가

세 가지 근거다. ① **생성 자동화보다 삭제 자동화가 먼저다** — 브랜치 자동 생성만 넣으면 이미 실측된 누적 문제(원격 10개 중 살아있는 것 1개)를 가속한다. 그래서 T0(1회 정리)·T8(prune 승격)을 같은 릴리즈에 묶고, 정리 수단이 없으면 생성 기능을 기본 off 로 둔다. ② **base 판정을 문자 비교에서 감지로 바꾸는 것이 최우선 안전 항목이다** — `main|master` 하드코딩이 `staging` 을 놓치는 것이 현재 유일한 배포 사고 경로다. ③ **판정 로직을 lib 한 곳에 모은다** — 지금 브랜치 지식이 `git-sync-all.sh`(bash)에만 있고 스킬 문서에는 산문으로만 있어서, 스킬이 저마다 다르게 판단한다. `lib/git-branch.js` 하나가 SoT 가 되면 `/cp`·`/cc`·`/cp done`·board 가 같은 답을 본다.

#### 브랜치 모델 (2단 — 확정)

```
feat/<slug>  ──PR──▶  그 레포의 base ──▶ 브랜치 삭제
                       (main | master | staging — 레포마다 감지)

예외 1개: Returns_ERP_v20
feat/<slug>  ──PR──▶  staging ──[배포·검증]──▶ promote-to-main.sh ──▶ main
                                                (그 레포 고유 절차 — Lens 관여 X)
```

- 접두사는 **`feat/` `fix/` `ops/` `docs/` 4종만.** `agent/` `claude/` `codex/` `task/` `feature/` `backup/` 금지(현재 `livevil-research` 누적의 원인). `sync/` 는 `/cs` 전용 임시 접두사로 **예외 인정**하되 "머지 즉시 삭제"를 규칙에 명시한다.
- 이름은 `feat/<무엇을-하는지>`. 날짜를 붙이지 않는다(커밋이 이미 갖고 있다).
- base 판정 우선순위: ① `lens.config.json` 의 `baseBranch.<repo>` 명시값 → ② 현재 브랜치의 upstream (`git for-each-ref --format='%(upstream:short)'`) → ③ `origin/HEAD`. **`main|master` 문자 추정 금지.**

#### 소유권 재배치 (설계의 핵심)

| 시점 | 스킬 | 지금 | 바뀌는 것 |
|---|---|---|---|
| 계획 승인 | `/cp` Phase 2.5·5 | 브랜치 개념 없음 | frontmatter 에 `repo` / `base`(감지값) / `branch: feat/<slug>` 기록. **브랜치를 만들지는 않는다**(`/cp` 는 문서만) |
| 실행 진입 | `/cc` Phase 0 | 현재 브랜치 그대로 작업 | base fetch·최신화 → `checkout -b <plan.branch>`. dirty·diverged·upstream 부재면 **실행 차단**(fail-closed) |
| 병렬 worker | `/cc` Phase 3 | 같은 작업트리 공유 | 같은 파일을 건드리는 worker 2개 이상이면 worktree 격리 + Leader 만 task 브랜치에 직렬 통합(lock) |
| 실행 완료 | `/cc` Phase 7.4 | `main\|master` 면 분기 후 커밋 | **커밋 허용 조건 = 현재 브랜치가 `plan.branch` 와 같을 때만.** 그 외(감지된 base 포함)는 커밋 거부·보고 |
| 완료 처리 | `/cp done` | 문서만 이동 | ① PR 생성/확인 ② 머지 판정 ③ 머지됐으면 history 기록 + 브랜치 삭제 ④ **미머지면 history 로 내리지 않고 "In Review" 보고** |
| 스윕 | `/cs` | 모든 dirty 를 `sync/` 로 | task 브랜치는 **건너뛴다**(재포장·reset 금지). `sync/` 는 계획 밖 dirty 전용 |

#### 머지 판정 (틀리면 코드가 사라지는 지점)

`ahead` 커밋 수를 근거로 쓰지 않는다. GitHub 의 rebase·squash 머지는 커밋을 새로 쓰므로 조상 관계만 보면 이미 병합된 브랜치가 영원히 미병합으로 보인다(`livevil-research` PR #4 실측).

```sh
# ① 빠른 경로 — 팁이 base 의 조상
git merge-base --is-ancestor origin/<branch> origin/<base>
# ② 실패 시 — base 에 없는 patch 가 있는지 (rebase·squash 대응)
git cherry origin/<base> origin/<branch> | grep '^+'
```

둘 다 통과 못 하면 **자동 삭제하지 않는다**(리베이스 중 충돌 해결로 patch-id 가 바뀐 경우 — 도구가 병합을 증명할 수 없다는 뜻).

#### 단계

- [ ] **T0 선행 정리 (1회, 도입 전)** — `livevil-research` 원격 브랜치 10개 상태를 `prune_branches.py` 로 판정하고, 병합된 것 삭제 / 계보 다른 것 태그 아카이브 / 열린 PR(#4·#5) 처리. 체크아웃을 `main` 으로 복귀. `creeta-lens`·`livevil-research` 의 로컬 `sync/2026-07-25-*` 잔여 브랜치 정리.
      검증: `git branch -a` 에 `agent/`·`sync/` 잔여 0, 27개 레포 전부 base 체크아웃 → 상태표 출력
- [ ] **T1 `docs/rules/branch-lifecycle.md` 신설** — Lens 워크스페이스 브랜치 규칙 SoT. 내용: 2단 모델 / 접두사 4종+`sync/` 예외 / base 판정 3단 우선순위 / 1task=1브랜치=1PR / 머지 판정 2단 / 태그 아카이브 / `Returns_ERP_v20` 예외 / `namane-cms`(main+master 공존) 처리. `livevil-research/docs/rules/branch-hygiene.md` 를 출처로 명기.
      검증: 문서 존재 + `/cp`·`/cc`·`/cs` 세 스킬이 이 문서를 참조 링크로 걸었는지 grep
- [ ] **T2 `lib/git-branch.js` 신설** — `resolveBase(repoPath)`(config→upstream→origin/HEAD), `canCommitTo(repoPath, planBranch)`, `mergedState(repoPath, branch, base)`(ancestor→cherry 2단), `branchName(prefix, slug)`(접두사 검증·날짜 금지), `preflight(repoPath)`(dirty·diverged·upstream 검사).
      검증: 27개 레포 전체에 `resolveBase` 를 돌려 `Returns_ERP_v20`=staging, `creeta-lens`=master, `livevil-contents`=main 이 나오는지 표로 출력 + `mergedState` 를 `livevil-research` 의 실제 머지된 브랜치에 돌려 `MERGED(patch 동일)` 판정 재현
- [ ] **T3 `lib/plan-manager.js` frontmatter 확장** — `repo` / `base` / `branch` / `pr` 4필드를 생성(`createPlan`)·파싱(`parseFrontmatter`)·갱신(`updatePlanStatus`)에 추가. 기존 필드·기존 문서 하위호환 유지(필드 없으면 null).
      검증: 기존 task 문서 3건 파싱 시 에러 0(필드 없음 → null) + 신규 생성 문서에 4필드 존재
- [ ] **T4 `skills/cp/SKILL.md` — PLAN 모드** — Phase 2.5 문서 템플릿에 브랜치 필드 추가, Phase 5.0 게이트에 "base 감지 결과 표시" 추가(사용자가 승인 화면에서 `staging` 을 눈으로 확인), 핸드오프 페이로드에 `[BRANCH]` 블록(`repo`/`base`/`branch`) 추가.
      검증: `/cp` 로 새 계획 1건 생성 → frontmatter 4필드 + 승인 게이트 출력에 base 표시 + 핸드오프 페이로드에 `[BRANCH]` 존재
- [ ] **T5 `skills/cc/SKILL.md` — 실행** — Phase 0 에 브랜치 preflight+생성 단계 신설. Phase 7.4 rule 2 의 `main|master` 문자 비교를 `canCommitTo(plan.branch)` 로 교체. Phase 3 에 worktree 격리 조건(같은 파일 건드리는 worker 2+) 명시.
      검증: `Returns_ERP_v20`(staging 체크아웃)에서 dry-run → "staging 직접 커밋 거부 + feat/ 브랜치 생성 필요" 로 판정되는지 확인 (현재는 통과해버림)
- [ ] **T6 `skills/cp/SKILL.md` — DONE 모드** — Phase 1.5 신설(task 문서의 `branch` 로 git 상태 판정: 미푸시 / PR 없음 / PR 열림 / 머지됨). Phase 4 에 브랜치 삭제(로컬+원격) 추가. **미머지 task 는 history 이동 금지** 규칙 명시 + "In Review" 보고 형식 추가.
      검증: 머지 안 된 브랜치를 가진 task 로 `/cp done` → history 미생성 + "In Review" 보고. 머지된 브랜치 → history 생성 + 브랜치 삭제 확인
- [ ] **T7 `lib/board-builder.js` — In Review 칼럼** — `gh pr list --json` 조인으로 To do / Doing / **In Review** / Done 4칼럼. `gh` 부재·인증 실패 시 3칼럼으로 graceful degrade(조용한 실패 금지 — 사유 표시).
      검증: `creeta-lens` board 재빌드 → In Review 칼럼 렌더 + `gh` 없는 환경 시뮬레이션에서 3칼럼 + 사유 표시
- [ ] **T8 `scripts/prune_branches.py` 승격 + `/cs` 통합** — `livevil-research` 에서 `creeta-lens/scripts/` 로 복제(원본 유지), 멀티레포 지원(`--repo-root`), `/cs` 종료 시 "브랜치 5개 초과 레포" 경고 + prune 안내. `--apply` 는 두 `삭제` 판정만.
      검증: 27개 레포 전체 판정 실행(`--apply` 없이) → 레포별 삭제/아카이브/유지 집계 출력. 테스트 `tests/test_prune_branches.py` 동반 이식 후 통과
- [ ] **T9 `lens.config.json` 확장** — `baseBranch`(레포별 명시 맵, 기본 `{}`), `requireTaskBranch`(기본 **false** — T0·T8 완료 후 true 로 전환), `autoDeleteMergedBranch`(기본 true), `branchPrefixes`(기본 `["feat","fix","ops","docs"]`).
      검증: config 파싱 + `requireTaskBranch:false` 에서 기존 동작 100% 보존(회귀) → true 로 켠 뒤 T5 검증 재실행
- [ ] **T10 Lens 2분 진행보고 완전 강제** (사용자 지시 2026-07-25: "cc를 할 때 반드시 2분마다 진행사항 보고하는 걸 완전 강제하도록 해") — `docs/rules/harness-rules.md`(SoT) + `skills/{cc,cp,c,ccp,cr,cs}/SKILL.md` 의 주기 5분 → **2분**. 매 보고 3요소 필수(① 생존확인 실측 — 확인 없이 "진행 중" 금지 ② 끝난 것/남은 것 N/M ③ 부분 산출물 먼저 제출), "아직입니다"만 적는 보고는 위반. **강제 수단 = Lens 훅**(`PostToolUse` 경과시간 추적 → 2분 초과 시 보고 요구 주입). 산문 규칙만으로는 조용히 스킵된다는 것이 실측 이력(2026-07-20 워크플로 조용한 사망 오보).
      ⚠️ `ScheduleWakeup` 은 강제 수단이 아니다 — `/loop` 전용 페이서이고 "백그라운드 폴링용 짧은 주기 예약 금지"가 스키마에 명시(조사 중 확인).
      검증: 6개 스킬+SoT 에 "5분" 잔존 0건 / 훅을 2분 경과 상태와 미경과 상태 양쪽에서 실행해 리마인더 발화·침묵 대조 / `hooks.json` 파싱 + 기존 훅 5개 문법 검사
- [ ] **T11 기본 agent 규칙에도 2분보고 강제** (사용자 지시: "렌즈에도 강제하고, 기본 agent 규칙에도 강제해") — `C:/Users/ADMIN/.claude/CLAUDE.md`(전역, 모든 세션 자동 로드) + SoT `livevil-setting/docs/rules/coding-principles.md` 양쪽에 동일 규칙 추가. `scripts/sync-karpathy-rules.ps1` 의 동기화 범위가 새 규칙을 커버하는지 확인하고, 커버하지 않으면 최소 수정(⚠️ `.ps1` 은 UTF-8 BOM 필수 — 없으면 한글 깨짐).
      검증: 양쪽 파일에 규칙 존재 + 내용 일치 대조 + `sync-karpathy-rules.ps1 -Verify` 출력 / `livevil-setting` 의 무관한 미커밋 변경(`claude-memory/`)이 그대로 남아있는지
- [ ] **T12 모델 사다리 4단 개정** (사용자 지적 2026-07-25: "왜 opus는 안써? 사고과정이 들어가는 건 다 상위 모델로 하고, 단순 개발·반복은 sonnet 으로 배정해야 하는 거 아니야?") — **실제 결함: Task 도구 enum 에는 티어가 4개(`haiku`/`sonnet`/`opus`/`fable`)인데 Lens 사다리는 3칸(Easy=haiku / Medium=sonnet / Hard=TOP=fable)만 써서 `opus` 칸이 비어 있다.** 그래서 "사고과정은 필요하지만 최고난도는 아닌" 작업이 전부 sonnet 으로 떨어진다. `skills/{cc,c,ccp}/SKILL.md` 의 사다리를 4단으로 개정하고 판정 기준을 한 줄로 명문화: **"사고과정(트레이드오프 판단)이 들어가면 상위 티어 이상, 정형 반복이면 중간 티어 이하."** 각 칸은 이름이 아니라 상대 위치(세대와 함께 자동 상승)라는 기존 서술과 "모든 spawn 모델 명시(상속 금지)" 규칙은 유지. TOP 상한(3)에 `opus` 는 포함되지 않음을 명시.
      검증: 3개 스킬에 `opus` 칸 실재 + 기존 예시의 모델 배정이 4단 기준으로 갱신됐는지

#### 막힐 수 있는 지점 (→ Plan B 트리거)

- **T5 검증**: `gh` 인증·`workflow` 스코프 문제로 PR 생성이 실패하는 레포가 3개 이상 → PR 필수 전제가 깨진다.
- **T2 검증**: `resolveBase` 가 `docs` 레포(원격에 main·master 둘 다 없음, upstream 조회 결과가 정상 형태가 아닌 이상 상태)나 `namane-cms`(main+master 공존)에서 판정 불가.
- **T0**: `livevil-research` 의 `task/community-insight-surface-v3` 처럼 patch-id 가 달라 머지를 증명할 수 없는 브랜치가 다수 → 자동 정리 불가, 수동 확인 부담이 커짐.
- **T6**: 사용자가 혼자 개발하므로 "PR 열림 = 미완" 규칙이 완료 처리를 계속 막는 마찰로 체감될 수 있다.
- **T9 기본값 정책 (Pre-mortem 2)**: `requireTaskBranch:false` 로 배포하는 것이 사용자 룰(dormant 스캐폴딩 금지)과 충돌한다 → 사용자가 "기본 off 배포 금지"를 확인하면 T0·T8 완료 없이는 **릴리즈 자체를 하지 않는** 순서로 재배치.
- **`/c` 누락 (Pre-mortem 3)**: T5 검증 후 `/c` 로 실행했을 때 base 직접 커밋이 재현되면 → 범위를 넓혀 `/c` 도 같은 게이트에 포함(T5 확장 또는 T10 신설).
- **`Returns_ERP_v20` 완료=배포 (Pre-mortem 4)**: T6 검증에서 staging PR 머지가 배포를 트리거하는 것이 확인되면 → 그 레포는 "PR 생성까지만" 으로 `/cp done` 동작을 분기.
- **로컬 브랜치 머지 판정 (Pre-mortem 9)**: `mergedState` 를 push 전 로컬 브랜치에 돌려 판정이 달라지면 → 로컬/원격 구분 처리를 T2 에 추가하고 "미푸시" 를 독립 상태로 둔다.
- **멀티레포 전제 위반 (Pre-mortem 11)**: T0(`livevil-research` 정리)가 `creeta-lens` 작업과 한 task 로 묶여 진행 추적이 꼬이면 → T0 를 **별도 task 문서로 분리**해 먼저 완결.

### Plan B — Fallback 경로

#### Trigger

Plan A 의 **T5 검증에서 PR 생성 실패 레포가 3개 이상**이거나, **T6 도입 후 "PR 열림 때문에 완료 처리 불가" 가 한 세션에 2회 이상 발생**하면 즉시 전환.

#### 왜 이 대안인가

PR 을 필수로 두는 이유는 "변경을 한 덩어리로 리뷰 가능하게" 만드는 것뿐이다. 1인 개발에서 리뷰어가 본인이면 PR 은 마찰만 남는다. Plan B 는 **브랜치는 유지하되 PR 을 생략**하고 로컬에서 base 로 병합한다. 잃는 것: 변경 이력이 GitHub PR 페이지에 남지 않고, 다른 머신(Mac Mini)에서 리뷰할 수단이 없어진다. 얻는 것: `gh` 의존 제거, 완료 처리 즉시성.

#### 단계

- [ ] B1 `lens.config.json` 에 `mergeMode: "local" | "pr"` 추가 (기본 `pr`, 트리거 시 `local`)
- [ ] B2 `/cp done` Phase 1.5 판정에서 `local` 모드면 PR 상태 대신 "base 에 patch 포함 여부"만 본다
      검증: 머지 안 된 브랜치 → `--no-ff` 로 base 병합 → `mergedState` 가 `MERGED` 로 바뀌는지 확인
- [ ] B3 `/cp done` Phase 4 는 동일(브랜치 삭제) — 삭제 판정은 그대로 patch-id 기반
      검증: 병합 후 브랜치 삭제 + `git log base` 에 커밋 존재
- [ ] B4 `gh` 가 있는 레포는 `pr` 모드로 개별 복귀 가능하게 레포별 오버라이드 허용

## 🔀 검토된 대안 (Alternatives Considered)

**대안 A — 네이티브 worktree(`EnterWorktree`)를 task 단위 격리 수단으로 사용**
- *Good, because* 하네스가 이미 제공한다(`.claude/worktrees/` 자동 생성·브랜치 생성·정리 프롬프트). Lens 가 git 조작 코드를 안 써도 된다.
- *Bad, because* `docs/rules/capability-assumptions.json` 이 네이티브 worktree 를 **단일 레포 한정**으로 명시하고(Codex 교차조사에서 확인), 이 워크스페이스는 `C:\Users\ADMIN\Documents\GIT` 아래 27개 독립 레포가 병렬로 있는 멀티레포다. 또 `EnterWorktree` 툴 설명이 "사용자나 CLAUDE.md 가 명시적으로 worktree 를 요구할 때만" 사용하도록 못 박고 있어 기본 경로로 삼을 수 없다.
- **기각** — 단, `/cc` 병렬 worker 가 같은 파일을 건드릴 때의 충돌 방지에는 **국소적으로 채택**(T5). 전체 task 격리 수단으로는 쓰지 않는다.

**대안 B — `/cs` 를 확장해 브랜치를 전부 `/cs` 가 관리**
- *Good, because* 브랜치 지식이 이미 `git-sync-all.sh` 한 곳에 모여 있어 추가 lib 없이 확장 가능. 멀티레포 순회 로직도 완성돼 있다.
- *Bad, because* `/cs` 는 "워크스페이스 전체 스윕"이라 **"지금 이 작업"이라는 개념이 없다.** 그래서 지금도 `sync/` PR 하나에 무관한 레포·무관한 변경이 뒤섞여 `chore: auto-sync` 로 올라간다(PR #5 실측). 사후 스윕으로 task 브랜치를 만들려는 시도가 이미 실패한 것이 현재 상태다.
- **기각** — `/cs` 는 계획 밖 dirty 전용으로 **범위를 좁힌다**(Plan A T5·소유권 표).

**대안 C — git hook(`pre-commit`)으로 base 브랜치 커밋을 차단**
- *Good, because* Lens 를 거치지 않는 수동 커밋까지 막는다. 방어선이 가장 낮은 층에 생긴다.
- *Bad, because* 27개 레포에 hook 을 설치·동기화해야 하고(hook 은 clone 에 안 따라온다), 다른 머신(Mac Mini)까지 배포 대상이 된다. 그리고 hook 은 "왜 막혔는지"를 사용자에게 설명하지 못한다 — Lens 는 스킬 레이어에서 판단해야 base·PR 상태를 보고에 실을 수 있다.
- **기각** — 다만 `requireTaskBranch:true` 가 안정화된 뒤 보조 방어선으로 재검토 가치 있음(후속 과제).

**대안 D — 사용자 최초 제안대로 전 레포 3단(`feat` → `staging` → `main`)**
- *Good, because* 흐름이 하나로 통일돼 예외를 기억할 필요가 없다.
- *Bad, because* staging 배포 환경이 있는 레포가 `Returns_ERP_v20` 하나뿐이라(실측), 나머지 26개에서 staging 은 main 과 항상 동일해지고 머지를 두 번 하는 절차만 남는다.
- **기각** — 사용자 확정(2026-07-25): "3단을 할 필요가 전혀 없어 / staging조차 배포환경이 있는 것이나 하는 거지."

### 🔀 듀얼 합성 (Claude ‖ Codex)

**합의 (고신뢰 — 그대로 lock):**
- 브랜치 생명주기 소유권 배치: `/cp`=이름 확정, `/cc`=생성·커밋, `/cp done`=PR·머지 확인, `/cs`=예외 동기화. (양쪽 독립 도출)
- `main|master` 추정 금지, base 는 설정 우선 + upstream 감지. `Returns_ERP_v20` staging 우회가 최대 운영 리스크.
- `/cc` 병렬 worker 는 같은 작업트리를 공유하면 안 되고, worktree 격리 + Leader 직렬 통합이 필요.
- `/cp done` 은 PR·머지 검증 실패 시 **task 문서를 삭제하지 않는다**(fail-closed).
- `/cs` 의 `sync/` 는 계획 밖 dirty 전용으로 축소하고, Lens task 브랜치는 재포장·reset 하지 않는다.

**분기 → 해소:**
- **브랜치 이름 규칙**: Claude=`feat/ fix/ ops/ docs/` 4종(레포 기존 `branch-hygiene.md` 승격) / Codex=`lens/<plan-id>-<slug>` → **채택: Claude 안.** 근거: `livevil-research/docs/rules/branch-hygiene.md` 가 "도구·에이전트 이름을 접두사에 넣지 않는다"를 명시적 규칙으로 두고 `claude/`·`codex/`·`agent/` 접두사 누적을 실측 사고로 기록했다. `lens/` 는 같은 실수의 반복이다. 또 `<plan-id>` 는 날짜를 포함하는데 같은 문서가 "날짜는 커밋이 이미 갖고 있다"며 금지한다.
- **PR 을 누가 만드나**: Claude=`/cp done` 시점 / Codex=`/cp done` 시점(동일) + "자동 머지는 명시 승인+CI 통과 시에만" → **채택: 양쪽 병합.** 자동 머지는 이번 범위에서 제외하고(비목표: PR 리뷰 프로세스 설계) 머지는 사람이 한다. Codex 의 "CI 통과 조건" 은 CI 가 있는 레포가 소수라 후속 과제로 남긴다.
- **부분 실패 처리**: Codex 가 "27개 레포 중 일부만 성공 → 잘못된 history" 리스크와 **레포별 상태 manifest + 재개 가능한 fail-closed** 를 제안 → **채택.** Claude 안에 없던 항목이라 R1·리스크 레지스터에 반영. 단 이번 계획은 "1 task = 1 레포" 를 기본 전제로 두므로(멀티레포 단일 task 는 드묾) manifest 는 `/cp done` 의 판정 결과 표로 최소 구현한다.
- **`docs/rules/capability-assumptions.json`(네이티브 worktree 단일레포 한정)**: Codex 단독 발견 → 대안 A 기각 근거로 채택.

### ⚠️ 사전 리스크 (Pre-mortem)

#### Claude TOP 관점 (세션 컨텍스트 + 프로젝트 규칙 기반)

1. **사용자 강한 룰과 정면 충돌 — 원격 머신 동기화**: `feedback_always_commit_and_sync`("커밋은 무조건 + Mac Mini 등 운영 머신까지 동기화")는 이 설계와 상충한다. task 브랜치는 **머지 전까지 다른 머신에 도달하지 않는다.** 운영 머신에서 바로 필요한 변경(cron·서비스 코드)은 별도 경로가 필요하다. → **T5 착수 전 사용자 확인 필수 항목.**
2. **사용자 강한 룰과 충돌 — dormant 스캐폴딩 금지**: `feedback_no_dormant_scaffolding`("옵트인·dry-run 금지, 라이브 가동까지가 완료")과 T9 의 `requireTaskBranch: false` 기본값이 상충한다. R1(누적 가속) 완화책이 곧 룰 위반 구조다. → T0·T8 을 **같은 릴리즈에 넣고 즉시 true 로 전환**하는 것을 완료 조건으로 못 박아야 한다("기본 off 로 배포하고 나중에 켠다"는 금지).
3. **`/c` 누락 = 실제 구멍**: `/c`(단일 worker)도 같은 자동커밋 규칙을 참조하는데 이번 범위에서 빠졌다. v3.25 가 실행 진입 게이트를 `/c`·`/cc` **둘 다**에 붙였으므로, 도입 직후 `/c` 로 실행하면 base 직접 커밋 경로가 그대로 남는다. → T5 에 `/c` 를 포함하거나 T10 으로 분리.
4. **`Returns_ERP_v20` 은 "완료 처리 = 배포"가 된다**: base 가 `staging` 이므로 `/cp done` 이 여는 PR 의 머지가 곧 staging 배포다. 완료의 의미가 레포마다 달라진다. → 이 레포만 **"PR 생성까지만, 머지는 사람"** 으로 T1·T6 에 명시.
5. **`/cc` SKILL.md 에 `#### 7.4` 가 두 개** (자동 커밋 / plan 진행상황 갱신). T5 가 "Phase 7.4 rule 2 교체"로 지시하면 실행자가 어느 쪽인지 헷갈린다. → 태스크에 **원문 문구 인용**으로 앵커를 고정.
6. **규칙 SoT 상충**: T1 이 `sync/` 를 "예외 인정"하면, 승격 원본(`livevil-research/docs/rules/branch-hygiene.md`)이 **명시적으로 금지한 항목**을 Lens 규칙이 뒤집는다. 두 문서가 같은 워크스페이스에 공존하므로 어느 쪽이 상위인지 T1 에 명시해야 한다.
7. **board 의 오프라인 성질이 깨진다**: T7 이 `gh pr list` 를 board 빌드마다 호출하면 27개 레포 × API 호출이 생긴다. 지금 board-builder 는 네트워크 의존 0(오프라인 동작)이다. → 캐시 + 짧은 타임아웃 + 실패 시 3칼럼 강등.
8. **config 사본이 둘**: `lens.config.json` 은 레포본과 **플러그인 캐시 설치본**이 따로 있다. `resolveBase` 가 어느 것을 읽는지 모호하면 머신·레포마다 다른 답이 나온다. → 읽기 경로를 T2 에 명시.
9. **`git cherry` 는 원격 기준**: T5 가 만든 브랜치는 첫 push 전엔 로컬 전용이라 `mergedState` 판정이 달라진다. → 로컬/원격 브랜치를 구분해 처리.
10. **fetch 27회 중복**: T2 검증의 판정표는 레포별 `git fetch` 를 요구하고, 이는 `/cs` 가 이미 하는 일과 중복이다. 네트워크 실패 시 stale base 로 판정이 떨어진다. → `/cs` 의 fetch 결과 재사용 또는 "fetch 없이 판정 + stale 표시".
11. **이 계획 자체가 전제를 위반**: "1 task = 1 레포"를 기본 전제로 뒀지만, 이 작업은 `creeta-lens`(주) + `livevil-research`(T0 정리·T8 원본) **2개 레포**를 건드린다. 첫 실행부터 멀티레포다. → T0 를 별도 task 로 분리하는 편이 전제와 정합.
12. **`/cp done` 이중 게이트**: T6 의 "미머지면 history 금지"가 기존 Phase 1.2 완료추정(체크리스트 ≥80%)과 겹친다. 체크리스트 100% + PR 미머지인 task 는 영구히 `tasks/` 에 남는다. → 두 판정의 우선순위를 T6 에 명시.

#### Codex 관점

Phase 0.5 에서 Codex 독립 조사가 이미 수행됐고 리스크 시각은 `🔀 듀얼 합성` 에 통합됨 (부분 실패 manifest·worktree 격리·staging 우회). 중복 호출 회피 규칙에 따라 별도 Codex pre-mortem 은 생략.

#### Trigger 매핑 (Pre-mortem → Plan B / 신규 트리거)

- 이미 매핑됨: 1(→R4·Side Effect), 7(→T7 degrade), 12(→R7 마찰)
- **신규 트리거로 승격** (아래 "막힐 수 있는 지점"에 추가): 2(룰 충돌 → 기본값 정책 재결정), 3(`/c` 누락), 4(완료=배포), 9(로컬 브랜치 판정), 11(멀티레포 전제)

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: Lens 가 지금까지 "문서 상태"만 관리했다는 것이 이 작업으로 드러난다 — `docs/tasks/` 유무가 곧 진행 상태라는 원칙(`폴더 = 상태`)은 문서 세계에서만 참이었고, 코드 세계의 진행 상태(브랜치·PR·머지)와 이중장부였다. 이걸 붙이면 board 가 처음으로 **실제 개발 상태판**이 된다(In Review 칼럼). 이후 열리는 방향: PR 상태를 근거로 `/cp done` 의 완료 추정 정확도가 올라가고(체크박스 휴리스틱 의존 감소), `/ccp` 가 "PR diff 를 대상으로" 검증하는 경로가 열린다.
- **⚠️ 주의점**:
  - **삭제 자동화 없이 생성 자동화를 배포하면 안 된다.** T8(prune) 미완 상태로 `requireTaskBranch:true` 를 켜면 브랜치 누적이 가속된다. 그래서 T9 기본값을 false 로 두고 T0·T8 완료를 전환 조건으로 명시했다.
  - **`Returns_ERP_v20` 을 첫 검증 대상으로 삼는다.** 가장 위험한 레포에서 먼저 통과해야 나머지에 켤 수 있다. staging 커밋이 곧 배포다.
  - **머지 판정을 `ahead` 로 하지 않는다.** 계보가 다르면(orphan) ahead 가 수백으로 보이지만 병합할 것은 없다 — 이미 실측된 오판 사례가 있다.
  - `livevil-research` 는 지금 base 가 아닌 브랜치에 체크아웃돼 있고 그 브랜치가 upstream 을 갖고 있다. T0 정리 없이 T2 를 돌리면 `resolveBase` 가 그 피처 브랜치를 base 로 판정한다.
- **🔀 Side Effect (blast radius)**:
  - `/cs` 동작이 바뀐다 → task 브랜치를 건너뛰므로, 그 변경은 PR 머지 전까지 **다른 머신(Mac Mini)에 도달하지 않는다.** 지금은 `sync/` PR 로라도 원격에 올라갔다. 운영 머신에서 바로 필요한 변경은 `/cs push` 로 별도 처리해야 한다.
  - `autoCommitOnComplete:true` 의 의미가 바뀐다 → "base 에 커밋"이 아니라 "task 브랜치에 커밋". 기존 세션 흐름을 기억하는 사용자에게는 동작 변화로 체감된다.
  - `board_*.html` 스키마가 바뀐다(칼럼 4개) → 기존 board 파일은 재빌드 필요. `gh` 없는 머신에서는 3칼럼으로 떨어진다.
  - `lib/plan-manager.js` frontmatter 변경 → v3.3.x 호환 주석이 달린 코드다. 기존 task 문서 27개 이상이 새 필드 없이 존재하므로 파싱 하위호환이 필수.
  - `/c`(단일 worker) 는 이 계획 범위 밖이지만 같은 자동커밋 규칙을 참조한다 → T5 변경 후 `/c` 문서와 불일치가 생길 수 있다(후속 정합 필요, 이번엔 언급만).

## ⚠️ 리스크 레지스터

| ID | 리스크 | 트리거 | 영향 | 대응 | 중단 조건 |
|---|---|---|---|---|---|
| R1 | 브랜치 자동 생성이 누적 문제를 가속 | `requireTaskBranch:true` 전환 후 임의 레포의 원격 브랜치가 5개 초과 | 높음 | T8(prune)을 같은 릴리즈에 묶고, T0 선행 정리를 완료 조건으로. `/cs` 종료 시 5개 초과 경고 | T8 미완이면 `requireTaskBranch` 를 true 로 올리지 않는다 |
| R2 | `Returns_ERP_v20` staging 오배포 | base 판정이 staging 을 못 잡아 main 을 base 로 PR, 또는 staging 에 직접 커밋 | 높음 (운영 사고) | `lens.config.baseBranch["Returns_ERP_v20"]="staging"` 명시값 우선. 이 레포를 T2·T5 첫 검증 대상으로 | 감지된 base 가 config 명시값과 불일치하면 그 레포에서 실행 차단 |
| R3 | 병렬 worker 가 같은 파일 동시 수정 → 변경 유실 | 같은 파일을 대상으로 하는 worker 2개 이상 배포 | 중간 | worktree 격리 + `hook-utils.js` lock 으로 Leader 직렬 통합 | 충돌이 1회라도 감지되면 그 task 는 순차 실행으로 강등 |
| R4 | `gh` 부재·`workflow` 스코프로 PR 생성 실패 | T5 검증에서 실패 레포 3개 이상 | 중간 | Plan B(로컬 머지 모드)로 전환, 레포별 오버라이드 | PR 실패가 3레포 이상이면 `mergeMode:"local"` 로 전환 |
| R5 | 기존 stale 브랜치·열린 PR 이 새 규칙과 충돌 | T0 없이 T2~T6 도입 | 중간 | T0 를 선행 필수로. `livevil-research` 체크아웃 복귀 + PR #4·#5 처리 | T0 미완이면 T2 검증을 실행하지 않는다 |
| R6 | patch-id 로 머지를 증명 못 하는 브랜치 다수 | 리베이스 충돌 해결 이력이 있는 브랜치(`task/community-insight-surface-v3` 등) | 낮음 | 자동 삭제 대상에서 제외하고 `유지` 로 남겨 사람이 확인 | 추측 삭제 금지 — `--apply` 는 두 `삭제` 판정만 |
| R7 | 완료 처리 마찰(PR 열림 = 미완) | 한 세션에 2회 이상 완료 차단 | 낮음 | Plan B 로 전환하거나 `/cp done` 에 "PR 열림 상태로 history 기록" 명시 옵션 추가 | 사용자가 마찰을 지적하면 즉시 Plan B 검토 |

## ❓ 미해결 질문

**차단 (답이 없으면 실행 불가)**
- (없음)

**비차단 (가정을 두고 진행)**
- `master` → `main` 이름 통일을 할 것인가 — **가정**: 하지 않는다. Lens 가 base 를 감지하므로 기능상 불필요하고, rename 은 원격 default·다른 머신·배포 훅까지 파급된다. · **확인 시점**: T1 문서 작성 시 사용자에게 한 줄 확인, 원하면 별도 task 로 분리
- `namane-cms` 는 원격에 `main` 과 `master` 가 **둘 다** 있다 — **가정**: 체크아웃된 `master`(upstream 존재)를 base 로 본다. · **확인 시점**: T2 의 27개 레포 판정표 출력 시 이 레포를 명시 표시해 사용자 확인
- `docs` 레포는 원격에 `main`·`master` 둘 다 없고, upstream 조회 결과가 정상 형태(`origin/main`)가 아니라 리터럴 문자열로 잡히는 이상 상태 — **가정**: `resolveBase` 판정 불가로 처리하고 `requireTaskBranch` 대상에서 제외. · **확인 시점**: T2 검증
- **`validatePlanStructure` 자체 결함 2건을 이번에 고칠 것인가** — 이 계획을 게이트에 통과시키는 과정에서 발견했다. ① 섹션 매칭이 `^##` 만 허용하는데 `/cp` SKILL.md 템플릿은 `### 🔀 검토된 대안` 을 `## 🛠 How` 하위에 두라고 지시한다 → 스킬 지시를 그대로 따른 계획서는 **항상 게이트 fail**. ② placeholder 오탐 — lookbehind 가 `%`·`$` 만 제외해서 git upstream 표기(`@` + 중괄호 u)를 템플릿 변수로 오인한다 → 브랜치를 다루는 계획서가 게이트를 통과할 수 없다(이 문서가 실제로 걸렸다). **가정**: T3 가 같은 파일(`lib/plan-manager.js`)을 건드리므로 그때 함께 고치되, 범위 확대이므로 사용자 승인 후 착수. · **확인 시점**: 이 계획 승인 시
- `sync/` 접두사를 유지할 것인가 — **가정**: 유지하되 규칙에 "도구 전용·머지 즉시 삭제"로 명시(`/cs` 재작성 회피 = surgical). · **확인 시점**: T1
- 멀티레포 단일 task(한 작업이 2개 이상 레포를 건드림)를 어디까지 지원 — **가정**: 1 task = 1 레포를 기본 전제로 두고, 다중 레포는 `/cp done` 판정 결과 표로만 다룬다(manifest 최소 구현). · **확인 시점**: T6

## ✅ Review — 검증

**검증 전략 (어디까지·어떻게·보고)**: 이 작업은 CLI·git 레이어라 브라우저 검증이 없다. 세 층으로 검증한다. ① **판정 정확성** — `lib/git-branch.js` 를 **27개 레포 실물에 전량 실행**해 base 판정표를 출력하고, 알려진 정답 3건(`Returns_ERP_v20`=staging, `creeta-lens`=master, `livevil-contents`=main)과 이상 케이스 2건(`namane-cms`, `docs`)을 대조한다. ② **차단 동작** — 가장 위험한 `Returns_ERP_v20`(staging 체크아웃)에서 커밋 시도를 **dry-run** 으로 돌려 거부되는지 확인한다(현재는 통과해버리는 것이 결함이므로 before/after 대조가 곧 증거). ③ **왕복 1건** — 실제 레포 1개(`creeta-lens`)에서 계획→실행→완료를 한 바퀴 돌려 브랜치 생성·커밋·PR·머지·삭제·history 기록까지 이어지는지 확인한다. 파괴적 단계(브랜치 삭제·머지)는 `creeta-lens` 에서만 수행하고 `Returns_ERP_v20` 은 판정·차단까지만 검증한다. 보고는 판정표 + before/after 대조 + 왕복 로그를 대화에 그대로 싣는다.

| # | 목표가 됐다는 신호 | 확인 방법 (명령/관측) | 통과 판정 | 종류 |
|---|---|---|---|---|
| 1 | 작업이 자기 브랜치에서 진행된다 | `/cc` 진입 후 `git -C <repo> rev-parse --abbrev-ref HEAD` | `feat/`·`fix/`·`ops/`·`docs/` 중 하나로 시작, base 이름과 다름 | auto |
| 2 | 통합 브랜치가 오염되지 않는다 | 왕복 검증 중 `git -C creeta-lens log --oneline master..HEAD` 와 `git status` | 작업 중 `master` 의 tip 이 변하지 않음(커밋 0) | auto |
| 3 | 배포 트리거 레포에서 직접 커밋이 막힌다 | `Returns_ERP_v20`(staging) 에서 `canCommitTo(plan.branch)` dry-run | `false` + "staging 은 base — 커밋 거부" 사유 출력. 변경 전 코드로 같은 입력 실행 시 `true`(결함 재현) | auto |
| 4 | base 를 레포마다 정확히 감지한다 | `node -e "require('./lib/git-branch').resolveBase(...)"` 를 27개 레포 전량 실행 | `Returns_ERP_v20`=staging / `creeta-lens`=master / `livevil-contents`=main, 판정 불가는 명시적 null(조용한 추정 0건) | auto |
| 5 | 머지 판정이 rebase·squash 에서도 맞다 | `livevil-research` 의 이미 머지된 브랜치에 `mergedState` 실행 | `MERGED(patch 동일)` 로 판정(조상 검사만으로는 미병합으로 보이는 브랜치) | auto |
| 6 | 미머지 작업은 완료 기록으로 내려가지 않는다 | 머지 안 된 브랜치를 가진 task 로 `/cp done` 실행 | `docs/history/` 에 파일 미생성 + task 파일 유지 + "In Review" 보고 출력 | auto |
| 7 | 병합된 브랜치는 자동으로 없어진다 | 왕복 검증에서 머지 후 `git branch -a \| grep <branch>` | 로컬·원격 모두 결과 없음 + `docs/history/` 에 기록 생성 | auto |
| 8 | 브랜치 목록에 진행 중인 작업만 남는다 | T0 후 + 왕복 후 `scripts/prune_branches.py --remote origin --base <base>` | `삭제 대상` 0건 (모두 정리됨), `유지` 는 열린 PR 의 head 뿐 | auto |
| 9 | 기존 동작이 깨지지 않는다 | `requireTaskBranch:false` 로 기존 task 문서 3건 파싱 + `/cs` 1회 실행 | 파싱 에러 0, `/cs` 결과가 변경 전과 동일(회귀 없음) | auto |
| 10 | 상태판이 실제 개발 상태를 보여준다 | board 재빌드 후 `docs/board_creeta-lens.html` 열기 | In Review 칼럼에 열린 PR 의 task 카드가 표시됨 | manual |

## 🔍 실행 중 발견한 결함 (전부 실측 재현)

> 이 계획을 실행하는 과정에서 드러난 것들. 계획 시점에는 몰랐다.

| # | 결함 | 재현 | 처리 |
|---|---|---|---|
| D1 | `prune_branches.py` 가 `origin/HEAD` 를 **빈 이름 브랜치**로 "삭제" 판정 | git 이 `refs/remotes/origin/HEAD` 를 `origin` 으로 축약 → 이름 계산이 빈 문자열 → `PROTECTED={"HEAD"}` 가드 미발동. 보고서 첫 항목이라 `--apply` 가 abort. `git push origin --delete ""` → `fatal: --delete only accepts plain target ref names`, exit 128, 브랜치 무손상(throwaway 원격에서 실증) | T8 |
| D2 | 같은 스크립트가 Windows 에서 크래시 | `UnicodeEncodeError: 'cp949' codec can't encode '—'`. Mac 에서만 검증된 도구인데 워크스페이스는 Windows + Mac Mini 양쪽 사용 | T8 |
| D3 | 아카이브 판정 공백 | `backup/macmini-preIA-20260723`(커밋 169 / 변경 파일 4)이 계보가 같아서 `유지` 로 분류됨 — `branch-hygiene.md` 가 "태그 아카이브"로 지목한 바로 그 패턴인데 판정에서 빠진다 | T8 |
| D4 | `validatePlanStructure` 가 `^##` 만 허용 | `/cp` SKILL.md 템플릿은 `### 🔀 검토된 대안` 을 `## 🛠 How` 하위에 두라고 지시 → **스킬 지시를 그대로 따른 계획서는 항상 게이트 fail.** 이 문서가 실제로 그렇게 fail 했다 | T3(lib) + T4(템플릿) 양쪽 |
| D5 | 같은 함수의 placeholder 오탐 | lookbehind 가 `%`·`$` 만 제외해서 git upstream 표기(`@`+중괄호 u)를 템플릿 변수로 오인 → 브랜치를 다루는 계획서가 통과 불가. 이 문서가 실제로 걸려 문구를 우회 수정해야 했다 | T3 |
| D6 | Lens 훅이 **거짓 "완료" 신호** | 백그라운드 서브에이전트 10개 배포 **직후** 훅이 전부에 `done (132ms). All N agents complete` 를 출력. 실제로는 방금 시작한 시점(한 에이전트는 311초 소요). `PostToolUse:Agent` 가 백그라운드에선 *반환 시점*에 발화하는데 그걸 완료로 해석. 132ms = 도구 호출 자체의 소요시간 | T10 (범위 추가) |
| D7 | `canCommitTo` **계약 자체의 순서 오류** (Leader 책임) | "base 와 같으면 항상 false" 로 계약했는데, task 브랜치를 push 하면 upstream 이 자기 자신이 되어 base=자기자신으로 판정됨 → **두 번째 커밋이 거부된다.** throwaway 원격으로 재현(수정 전 false → 수정 후 true). 판정 순서를 "planBranch 일치가 최우선" 으로 정정 | T2 (완료) |
| D8 | `parsePlanFrontmatter` 가 **CRLF 문서의 frontmatter 를 통째로 `null` 로 반환** | 앵커가 `^---\n` LF 전용. 실측: frontmatter 보유 문서 6건 중 **CRLF 3건**(Windows 작성분) — 그 문서들은 `status`·`grade`·신규 `branch` 를 전부 못 읽는다. **이 계획서 자체도 CRLF** 였다. 즉 board 조인과 `/cp done` 판정이 Windows 문서에서 조용히 반쪽이었다 | T3 (`^---\r?\n` 로 수정, LF 회귀 0 확인) |
| D9 | `updatePlanStatus` 의 frontmatter 정규식도 LF 전용 | D8 과 같은 계열. CRLF 문서에서는 frontmatter 의 `status:`/`updated:` 가 갱신되지 않고 본문만 바뀐다 | **미수정 — 보고만.** 그 함수는 런타임 미호출(deprecated)이라 범위 밖. Leader 승인 시 `\r?` 1토큰으로 동일 수정 가능 |
| D10 | placeholder 검사가 **비ASCII 플레이스홀더를 원래부터 못 잡음** | 문자 클래스가 ASCII 전용(`[a-z_]+`)이라 한글 플레이스홀더는 수정 전·후 모두 통과. Leader 지시문이 "한글 플레이스홀더는 계속 잡혀야 한다"고 썼는데 그 전제가 애초에 성립하지 않았다 | **미수정 — 보고만.** 유니코드 문자 클래스로 확장하는 것은 요청 범위 밖 동작 변경 |
| D13 | placeholder 검사가 **산문에 인용된 정규식 문법도 오탐** | D5 를 고친 뒤에도, 이 문서에 유니코드 문자 클래스 표기를 그대로 적었더니 그 중괄호가 템플릿 변수로 잡혀 게이트가 fail 했다(실측 — 이 표의 D10 항목을 쓰다가 발생). `@` 를 lookbehind 에 추가하는 방식은 **오탐 유형마다 예외를 늘리는 접근**이라 근본 해결이 아니다 | **미수정 — 설계 재검토 필요.** 후속 과제: "미치환 템플릿 변수" 를 문자 패턴이 아니라 **템플릿 생성기가 실제로 쓰는 토큰 목록**으로 판정하는 방식 |
| D11 | `sync-karpathy-rules.ps1` 에 **BOM 이 원래 없었다** | Leader 지시문이 "BOM 유지 필수"라고 했으나 `git show HEAD:` 로 확인한 원본 선두가 `b'# sync'`. 유지할 BOM 이 없었다 | **정정 완료 — 추가하지 않음.** 새로 넣은 줄은 전부 ASCII 라 한글 깨짐 위험 0 |
| D12 | Karpathy 동기화 `-Verify` 가 **작업 전부터 exit 1** | 선재 drift 2건: ① `GUI Ground Truth` 섹션이 `~/.claude/CLAUDE.md` 에 애초에 복사돼 있지 않음 ② `~/.codex/AGENTS.md` 가 이 PC 에 **파일 자체가 없음**. 새로 넣은 진행보고 섹션은 `byte-identical=True` 로 통과 | **범위 밖 — Leader/사용자 판단 필요** |

**D6·D7 이 이 작업의 성격을 말해준다** — 계획서에 "생성 자동화보다 삭제 자동화가 먼저"라고 적었는데, 실제로는 **판정 자체가 틀린 것**이 더 먼저였다. D1 은 첫 `--apply` 에서, D7 은 두 번째 커밋에서 각각 터진다.

## 진행상황
- **마지막 업데이트**: 2026-07-25
- **현재 경로**: Plan A (실행 중 — `/cc` 핸드오프)
- **작업 브랜치**: `feat/branch-lifecycle` (master tip `5cbf645` 에서 분기 — 미오염 검증 기준점). `livevil-setting` 은 `docs/progress-report-2min`
- **재개 포인트**: worker 산출물 수합 → Supervisor + Codex 리뷰 → QA 검증 → 커밋·PR

### 편차 기록 (계획 ↔ 실제)
- **T0 를 T8 보다 먼저** 두었으나 → 도구가 D1 로 고장나 있어 **이름 명시 수동 삭제**로 우회(사용자 승인). 원격 6개 삭제 + `main` 복귀 + 로컬 `agent/` 삭제 완료. 재판정 결과 삭제 대상 0건(남은 1건은 D1 오판)
- **"7개 삭제"로 보고했다가 6개로 정정** — 7번째가 D1 의 빈 이름 항목이었다
- **태스크 단위 병렬 → 파일 단위 병렬로 재분할** — T4·T6·T10 이 모두 `cp/SKILL.md` 를, T5·T10·T12 가 모두 `cc/SKILL.md` 를 건드려 충돌. 파일 배타 소유로 10 worker 재구성 (이 작업의 성공기준 #5 를 실행 자체가 지켜야 했다)
- **범위 추가 3건** — T10(2분보고 강제)·T11(기본 agent 규칙)·T12(모델 사다리 4단)는 실행 중 사용자 지시로 추가
- **모델 배정 상향** — 초기 배정(sonnet 다수)이 사용자 기준("사고과정=상위 모델")에 미달해 opus 7 / fable 2 / sonnet 1 로 재배정. 원인은 D-급 결함이 아니라 Lens 사다리에 `opus` 칸이 없던 것(→ T12)
- **`creeta-lens` 의 `sync/2026-07-25-215113` 정리 계획 철회** — 열린 PR #1 의 head 였다(삭제 전 확인으로 발견)
