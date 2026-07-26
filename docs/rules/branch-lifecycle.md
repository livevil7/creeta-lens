# 브랜치 생명주기 규칙 (Branch Lifecycle)

Lens 워크스페이스(27개 레포)의 브랜치 규칙 SoT. `/cp`·`/cc`·`/cs` 가 브랜치를 정하고·만들고·닫을 때 이 문서를 기준으로 삼는다. 스킬 본문은 이 규칙을 재서술하지 않고 여기를 참조한다.

**출처와 위상**:

- 승격 원본: `livevil-research/docs/rules/branch-hygiene.md` (2026-07-25 그 레포의 브랜치 정리에서 실측으로 확립). 접두사 4종, 머지 후 즉시 삭제, patch 동등성으로 머지 증명, 스냅샷은 태그, 자동 커밋을 브랜치에 쌓지 않기, PR base 는 통합 브랜치 — 이 여섯 결론은 재발명하지 않고 그대로 승격했다.
- **위상 차이**: 원본은 **그 레포 한 곳의 규칙**이고, 이 문서는 **워크스페이스 전체 + Lens 도구 동작의 규칙**이다. 두 문서가 어긋나는 지점은 §3 에서 명시적으로 다룬다(숨기지 않는다).
- 판정 구현: `lib/git-branch.js` — `resolveBase` / `canCommitTo` / `mergedState` / `branchName` / `preflight`. 문서와 구현이 어긋나면 **문서가 SoT**이고 구현을 고친다.

---

## 0. 실측 근거 (2026-07-25 재확인)

규칙의 모든 조항은 아래 실측에서 나왔다. 수치는 이 문서를 쓰면서 직접 재측정한 값이다.

### 0.1 base 브랜치 위 직접 작업

```sh
# 워크스페이스 루트의 git 레포마다 "현재 브랜치 == 감지된 base" 인지 센다
node -e "const {resolveBase}=require('./lib/git-branch.js'); ..."   # 전체 스니펫은 §4.4
```

```text
base 브랜치 위에서 작업 중: 25/27
작업 브랜치 위: 2 → creeta-lens (feat/branch-lifecycle), livevil-setting (docs/progress-report-2min)
```

**27개 중 25개가 통합 브랜치 위에서 직접 작업 중이었다.** 예외 2개는 이 규칙을 만드는 오늘 작업이 스스로 만든 브랜치다 — 즉 규칙 도입 직전 상태는 실질 27/27 이었다. 워크스페이스 루트에는 디렉터리 30개가 있고 그중 `data`·`hellomarket`·`Returns-Finance` 는 git 레포가 아니라서 27개가 대상이다.

### 0.2 base 이름 분포

원격 ref 존재 기준(`git rev-parse --verify refs/remotes/origin/<name>`):

| 상태 | 개수 | 레포 |
| --- | --- | --- |
| `master` 만 | 11 | creeta, creeta-homepage, creeta-lens, creeta-pulse, creeta-workspace, livevil-AI_infuencer, livevil-setting, namane-homepage, namane-shop-renewal, namane-sns, returns-bidding-analyzer |
| `main` 만 | 13 | creeta-echo, livevil-boost, livevil-contents, livevil-data, livevil-mini-server, livevil-openclaw, livevil-research, namane-mkt, namane-snscard, nestree, Returns-Doc, Returns-Homepage, Stage |
| `main` + `master` 둘 다 | 1 | namane-cms |
| `main` + `staging` | 1 | Returns_ERP_v20 |
| 원격에 둘 다 없음 | 1 | docs (원격 저장소가 비어 있음 — §4.3) |

`resolveBase()` 가 실제로 내리는 판정 기준으로는 **master 12 / main 14 / staging 1** 이고 **판정 실패 0건**이다(판정 출처: upstream 24, origin/HEAD 2, config 1). 두 표의 차이는 `namane-cms`(→ master)와 `docs`(→ main) 가 어디로 귀속되는지의 차이다.

> ⚠️ **수치 대조**: 이 규칙 도입 과정의 초기 브리핑이 `master 13 / main 12 / staging 1` 을 인용했으나 **오집계였다**(합계가 28이 되어 27과 맞지 않았다). 재측정값이 위 표이며, 그 값을 인용했던 `skills/cp/SKILL.md`·`skills/cc/SKILL.md` 두 곳은 2026-07-25 정정 완료. **이 문서의 수치가 SoT** 이며, 인용하는 쪽은 아래 명령으로 재확인한 값을 쓴다.
>
> ```sh
> for d in */; do r="${d%/}"; [ -d "$r/.git" ] || continue
>   m=$(git -C "$r" rev-parse --verify -q refs/remotes/origin/main   >/dev/null 2>&1 && echo main)
>   s=$(git -C "$r" rev-parse --verify -q refs/remotes/origin/master >/dev/null 2>&1 && echo master)
>   g=$(git -C "$r" rev-parse --verify -q refs/remotes/origin/staging >/dev/null 2>&1 && echo staging)
>   printf "%-28s %s %s %s\n" "$r" "$m" "$s" "$g"
> done
> ```

### 0.3 `main` 과 `master` 는 두 단계가 아니다

**같은 역할의 다른 이름이다.** git 이 2020년에 기본 브랜치 이름을 `master` → `main` 으로 바꿨기 때문에, 그 전에 만든 레포만 `master` 로 남아 있다. 두 이름이 동시에 존재하는 레포에서도 계층 관계가 아니다 — `namane-cms` 실측: `origin/main` 은 `origin/master` 의 조상이고(main 고유 커밋 0개, master 가 9커밋 앞) `main` 의 마지막 커밋은 2026-03-31, `master` 는 2026-04-13 이다. `main` 은 **완전히 흡수된 잔여물**이고 살아 있는 base 는 `master` 다.

따라서 `master` → `main` rename 은 이 규칙의 목표가 아니다. Lens 는 이름을 통일하지 않고 **감지**한다(§4).

### 0.4 `staging` 은 배포 환경이 있는 곳에만 있다

`staging` 원격 브랜치가 있는 레포는 `Returns_ERP_v20` **하나**다. 그 레포는 `staging` 이 실제 배포 환경에 연결되어 있고 `scripts/promote-to-main.sh` 로 main 에 승격한다.

### 0.5 접두사 누적과 정리 결과

한 레포(`livevil-research`)에서 접두사 9종이 혼재했다: `agent/ claude/ codex/ feat/ feature/ task/ ops/ backup/ sync/` (2026-07-25 정리 기록). 원격 브랜치 10개 중 살아 있는 작업은 1개였고, **오늘 정리로 병합 증명된 6개를 삭제**했다.

정리 후 현재 원격(`git ls-remote --heads origin`) — main 외 4개 + 오늘 `/cs` 가 새로 만든 `sync/` 1개:

```text
refs/heads/main
refs/heads/backup/macmini-preIA-20260723
refs/heads/claude/why-so-many-branches-apcojh
refs/heads/ops/pre-renewal-macmini-20260719
refs/heads/task/community-insight-surface-v3
refs/heads/sync/2026-07-25-215207
```

지금 직접 재확인되는 접두사는 남은 ref 의 `backup/ claude/ ops/ sync/ task/` 5종과, 닫힌 PR #2(`agent/research-workspace-features-20260725`)의 `agent/` 1종이다. 나머지 3종(`codex/ feat/ feature/`)은 브랜치와 reflog가 함께 삭제되어 정리 기록에만 남아 있다.

### 0.6 자동 커밋 누적

`backup/macmini-preIA-20260723` 실측: base 에 없는 패치 **169개**인데 merge-base 기준 고유 변경은 **4파일**이다.

```text
docs/reports/platform-engine-soak-final.json
docs/tasks/2026-07-12-platform-engine-rebuild-and-control-plane.md
livevil_research/wiki.py
registry/update_sources.yaml
```

`ops: record 24-hour platform engine soak` 형태의 반복 커밋이 브랜치를 만들었다. **커밋 수는 남은 작업량의 근거가 되지 못한다**(§5, §6).

---

## 1. 브랜치 모델 — 2단 (확정)

```text
feat/<slug>  ──PR──▶  그 레포의 base  ──▶  브랜치 즉시 삭제
                      (main | master | staging — 레포마다 감지)
```

**단계는 둘뿐이다: 작업 브랜치 → base.** 그 사이에 아무것도 넣지 않는다.

### 1.1 `staging` 을 새로 만들지 않는다

배포 환경이 뒤에 없는 `staging` 은 시간이 지나면 `main` 과 항상 동일해지고, 남는 것은 머지를 두 번 하는 절차뿐이다. 사용자 확정 발언 그대로: *"3단을 할 필요가 전혀 없어 / staging조차 배포환경이 있는 것이나 하는 거지."*

- 26개 레포에 `staging` 브랜치를 신설하는 것은 **비목표**다. 배포 환경 구축은 별개의 인프라 과제다.
- 이미 `staging` 이 있는 레포(1개)는 그것이 base 다. Lens 는 없애지도 만들지도 않고 감지만 한다.

### 1.2 예외 1개 — `Returns_ERP_v20`

```text
feat/<slug>  ──PR──▶  staging  ──[배포·검증]──▶  promote-to-main.sh  ──▶  main
                                                 (그 레포 고유 절차 — Lens 관여 없음)
```

- base 는 `staging` 이다. **이중 방어**다: `lens.config.json` 의 `baseBranch["Returns_ERP_v20"] = "staging"` 로 명시 고정되어 있고(판정 ①), config 를 비워도 체크아웃된 `staging` 의 upstream 이 `origin/staging` 이므로 판정 ②가 같은 답을 낸다.
- `staging` 머지가 곧 배포다. 그래서 이 레포에서는 **PR 생성까지만 자동화하고 머지는 사람이 한다.** "작업 완료 처리"가 자동으로 "배포"가 되어서는 안 된다. `staging` 직접 커밋은 §2.1 의 규칙 2·3 두 경로에서 모두 차단된다(실측).
- `staging` → `main` 승격은 그 레포의 `scripts/promote-to-main.sh` 가 소유한다. Lens 는 이 경로를 호출하지도, 대체하지도, 문서화하지도 않는다.

---

## 2. 1 task = 1 문서 = 1 브랜치 = 1 PR

작업의 완료를 문서 위치(`docs/tasks/` → `docs/history/`)로만 정의하면 브랜치는 작업이 끝난 *뒤* 급조되고 계속 쌓인다(§0.5 실측). 계획 시점에 이름을 정해 문서에 박아두고, 실행이 그 브랜치만 쓰고, 완료 처리가 그것을 닫는다.

| 시점 | 소유자 | 하는 일 |
| --- | --- | --- |
| 계획 승인 | `/cp` | 브랜치 **이름을 확정**해 task 문서 frontmatter 에 기록한다: `repo` / `base`(감지값) / `branch: feat/<slug>` / `pr`(초기 null). **브랜치를 만들지는 않는다** — `/cp` 는 문서만 쓴다 |
| 실행 진입 | `/cc` | base 를 fetch·최신화한 뒤 `checkout -b <문서의 branch>` — **`requireTaskBranch` 값과 무관하게 항상 만든다**(그 플래그는 "만드느냐" 가 아니라 **"확보에 실패했을 때 차단하느냐"** 만 통제한다). diverged·base 판정 불가면 **차단**(fail-closed). dirty 면 차단하되, **그 dirty 가 전부 이 task 의 계획 산출물(plan md·board)이면 예외** — `/cp` 는 계획 문서를 커밋하지 않고 넘기므로 정상 핸드오프는 항상 dirty 다. 그 외 dirty 는 목록을 보여주고 (중단 / stash / 명시 승인) 을 묻는다. 헤드리스는 fail-closed |
| 병렬 worker 격리 | `/cc` Phase 3.5 | worktree 로 격리했으면 Leader 가 **패치 전송으로 직렬 통합**한다(merge·cherry-pick 금지 — worker 는 커밋하지 않아 worktree 브랜치는 보통 커밋 0개이고, merge 는 **아무것도 안 가져오면서 성공**한다. 게다가 worktree 는 task base 가 아니라 `origin/<기본 브랜치>` 에서 갈라진다). 통합 결과를 역적용 검사로 **관측**한 뒤에만 worktree 를 제거하고, 충돌·실패면 검토 단계로 **진행하지 않는다**(fail-closed) |
| 실행 중 커밋 | `/cc` | **현재 브랜치가 문서의 `branch` 와 같을 때만 커밋한다.** 그 외는 커밋을 거부하고 보고 — 판정 순서는 §2.1, 구현은 `canCommitTo(repoPath, planBranch)` |
| 완료 처리 | `/cp done` | ① PR 생성/확인 → ② 머지 판정(§5) → ③ **브랜치 정리를 먼저 한다**(lease 통과, 또는 `autoDeleteMergedBranch:false` 같은 정당한 skip) → ④ 그 다음 history 기록 + task 문서 삭제 → ⑤ **미머지면 history 로 내리지 않고 "In Review" 로 보고** |
| 워크스페이스 스윕 | `/cs` | task 브랜치를 **소유하지 않는다.** task 브랜치는 건너뛴다(재포장·reset 금지). `sync/` 브랜치는 계획 밖 dirty 변경 전용이다(§3.2) |

- **정리가 아카이브보다 먼저다.** history 를 쓰고 task 문서를 지운 *뒤에* 브랜치를 지우려 하면, lease 가 거부됐을 때 **검증되지 않은 작업이 "완료" 로 기록된 채 남고 재평가할 task 문서도 없다** — 되돌릴 수 없다. 순서를 뒤집으면 실패는 "완료인데 문서상 미완료"(내용은 base 에 증명돼 있고 task 도 남음, 손실 0)로 넘어진다. Phase 1.4 의 "잘못 아카이브하느니 남겨두는 것이 안전" 과 같은 방향이다.
  - ⚠️ **삭제를 *시도하지 않은 것*과 *시도했다 실패한 것*을 구분한다.** `autoDeleteMergedBranch:false` 는 전자이므로 아카이브를 막지 않는다. lease 거부·삭제 실패는 후자이므로 아카이브에 진입하지 않는다.
- **기존 브랜치를 "재개" 로 받아들이기 전에 그것이 이 계획의 것인지 검증한다.** 브랜치 이름은 결정적이라, 이전 task 의 잔여물이나 slug 가 겹친 새 task 가 같은 이름을 갖는다. 이름 일치만으로 checkout 하면 **새 작업이 낡거나 무관한 이력 위에** 쌓인다. 세 조건이 전부 참일 때만 재개다:
  1. **소유** — `/cc` 가 브랜치를 만든 직후 계획 문서 `## 진행상황` 에 남긴 기록(브랜치명·레포·시작 SHA)이 있고 지금 값과 일치한다. frontmatter 의 `branch` 는 `/cp` 가 *이름을 예약*한 것일 뿐 실행 사실을 증명하지 못하므로 보조 근거다.
  2. **동일성** — `git merge-base --is-ancestor <기록된 시작 SHA> <branch>` 가 exit 0. exit 1 이면 같은 이름으로 reset·재생성된 남의 브랜치이고, exit 128 은 판정 불가다(둘 다 차단). ⚠️ `--is-ancestor origin/<base> <branch>` 는 **차단 사유로 쓰지 않는다** — base 가 그 뒤 전진하면 정상 재개에서도 exit 1 이 난다.
  3. **미완료** — `mergedState` 가 `merged`/`patch-merged`/`merged-deleted`/`unknown` 이 아니다. merged 계열은 끝난 task 의 시체이고 그 위 커밋은 닫힌 작업을 되살린다.
  - 실패하면 **fail-closed**(중단이 기본). 자동으로 이름에 접미사를 붙이지 않는다 — §3.1 이 이름의 유일성 토큰을 금지하고, 이름을 바꾸면 커밋 판정(§2.1 규칙 2)이 모든 커밋을 거부해 조용히 "커밋 없는 실행" 이 된다. 사용자가 고유 이름을 택하면 **계획 문서의 `branch` 를 그 이름으로 갱신하는 것이 필수**다.
- **1 task = 1 레포가 이 규칙의 전제다.** frontmatter 의 `repo`/`base`/`branch`/`pr` 은 스칼라 4필드이고, 레포별 구조를 담지 않는다. 하나의 task 가 여러 레포를 건드려야 한다면 **레포마다 task 문서를 나눈다.**
  - 다중 레포를 한 문서에 담는 것은 **이번 범위 밖**이다(계획서의 명시적 전제). 스칼라 필드에 구조를 넣으면 파싱이 `[object Object]` 같은 값을 만들고, 핸드오프·DONE·board 소비자가 전부 깨진다.
  - 실제로 여러 레포가 얽히는 작업은 있다 — 이 규칙을 도입한 작업 자체가 `creeta-lens` 와 `livevil-setting` 두 곳을 건드렸다. 그때도 **레포별로 브랜치와 PR 을 따로** 만들었고(`feat/branch-lifecycle` / `docs/progress-report-2min`), 문서만 하나였다. 그 방식이 지금 지원되는 형태다: **문서는 주 레포에 두고, 부수 레포의 브랜치·PR 은 본문에 적는다.** frontmatter 는 주 레포 하나만 기술한다.
  - 레포별 메타데이터를 frontmatter 로 구조화하는 것은 후속 과제다. 필요해지면 `plan-manager` 파싱·`/cp` 핸드오프·DONE 판정·board 조인을 **함께** 바꿔야 한다.
- 브랜치 하나에 두 개의 task 를 태우지 않는다. 머지 판정과 완료 처리가 서로를 막는다.
- PR base 는 **그 레포의 base** 다. 다른 작업 브랜치를 base 로 삼지 않는다 — 그 브랜치가 머지·삭제되면 PR 이 의미를 잃는다.

### 2.1 커밋 허용 판정 — 순서가 계약이다

`canCommitTo(repoPath, planBranch)` 의 판정 순서다. **순서를 바꾸면 규칙이 깨진다.**

| 순위 | 조건 | 결과 |
| --- | --- | --- |
| 0 | 현재 브랜치를 읽을 수 없다(detached HEAD, git 조회 실패) | **금지** |
| 1 | 계획 문서에 `branch` 가 있고 현재 브랜치가 그것과 **같다** | **허용** — base 판정 결과와 무관 |
| 2 | 계획 문서에 `branch` 가 있고 현재 브랜치가 **다르다** | **금지** — 사유에 "어느 브랜치를 체크아웃해야 하는지" 명시 |
| 3 | 계획 문서에 `branch` 가 **없다** | 현재 브랜치가 허용 접두사 4종이고 **base 가 아닐 때만** 허용. base 판정 불가면 금지 |

**규칙 1 이 base 검사보다 앞인 이유(실증으로 정정된 계약)**: 초기 계약은 "현재 브랜치가 base 와 같으면 **항상** 금지"였고 **틀렸다.** task 브랜치를 push 하면 그 브랜치의 upstream 이 자기 자신(`origin/<자기 브랜치>`)이 되고, base 판정 ②(upstream)가 **자기 자신을 base 로 답한다.** 그러면 `current === base` 가 성립해 **두 번째 커밋부터 전부 거부**된다. throwaway 원격으로 재현·확인됐다(수정 전 `allowed=false` → 수정 후 `true`).

따라서 **"base 와 같으면 금지"는 계획에 브랜치가 명시되지 않은 경우(규칙 3)에만 적용된다.** 계획 문서가 "이 브랜치에 커밋하라"고 명시한 것이 최상위 근거다.

**`Returns_ERP_v20` 보호는 약화되지 않는다 — 두 경로 모두 차단됨을 실측했다**:

```text
ERP resolveBase          : {"base":"staging","source":"config"}
ERP + planBranch feat/x  : {"allowed":false,"reason":"현재 브랜치(staging)가 계획 브랜치(feat/x)와 다름 — feat/x 체크아웃 필요"}   ← 규칙 2
ERP + planBranch null    : {"allowed":false,"reason":"현재 브랜치(staging)가 base 브랜치 — base 직접 커밋 금지"}                  ← 규칙 3
```

계획 브랜치가 있으면 규칙 2 가 막고, 없으면 규칙 3 이 막는다. `staging` 에 직접 커밋하는 경로는 남지 않는다.

---

## 3. 접두사

### 3.1 4종만 쓴다

| 접두사 | 용도 | 수명 |
| --- | --- | --- |
| `feat/` | 기능 추가·변경 | 머지 즉시 삭제 |
| `fix/` | 버그 수정 | 머지 즉시 삭제 |
| `ops/` | 운영·배포·스케줄 변경 | 머지 즉시 삭제 |
| `docs/` | 문서만 변경 | 머지 즉시 삭제 |

- **금지**: `agent/` `claude/` `codex/` `task/` `feature/` `backup/`. 도구·에이전트 이름을 접두사에 넣으면 누적의 원인이 된다(§0.5 실측 — 9종 혼재, 10개 중 살아 있는 것 1개). `feature/` 는 `feat/` 와 중복이고, `backup/` 은 브랜치가 아니라 태그의 일이다(§6).
- 도구가 자동으로 만든 이름(`claude/...`, `codex/...`)으로 작업을 시작했다면 **PR 을 열기 전에** 4종으로 이름을 바꾼다.
- 이름 형식은 `<접두사>/<무엇을-하는지>`. 예: `feat/branch-lifecycle`, `fix/duplicate-cover-upload`, `ops/cron-retry-window`, `docs/progress-report-2min`.
- **날짜를 붙이지 않는다.** 커밋이 이미 날짜를 갖고 있고, 날짜가 붙은 이름은 같은 작업을 재개할 때 두 번째 브랜치를 만들게 한다.
- 접두사 목록은 `lens.config.json` 의 `branchPrefixes` 로 덮어쓸 수 있다. 기본값은 위 4종이다. 늘리려면 이 문서를 먼저 고친다.

### 3.2 `sync/` 는 예외 — 어느 쪽이 상위인지

**상충을 먼저 드러낸다**: 출처 문서(`livevil-research/docs/rules/branch-hygiene.md`)는 `sync/` 를 금지 목록에 넣었다. **이 문서는 `sync/` 를 도구 전용 임시 접두사로 예외 인정한다.**

**우선순위**: 이 문서 = Lens 워크스페이스 규칙(27개 레포 공통 + 도구 동작 정의) → **상위**. 출처 문서 = `livevil-research` 레포 내부 규칙 → **하위**. 같은 레포에서 두 규칙이 부딪히면 이 문서를 따른다. 실질적으로는 적용 대상이 갈리므로 모순이 아니다:

- **사람이 손으로 만드는 브랜치**: 4종만. `sync/` 를 사람이 만들지 않는다 — 하위 문서의 금지가 그대로 유효하다.
- **`/cs` 가 자동으로 만드는 브랜치**: `sync/` 만 쓴다.

**왜 예외를 인정하는가**: `/cs`(`scripts/git-sync-all.sh`)는 계획 밖에서 생긴 dirty 변경을 처리해야 하고, PR-only fail-closed 원칙상 base 로 직접 push 하지 않는다. 그러면 그 커밋을 담을 브랜치가 반드시 필요하다. 그것을 `feat/` 로 위장하면 계획된 작업 브랜치와 구분이 사라져 `/cp done` 의 브랜치 소유 판정이 오염되고, `/cc` 는 남의 브랜치 위에서 커밋 허가를 받는다. **이름을 분리하는 것이 옳다.**

예외의 대가로 규율을 더 세게 건다:

- `sync/` 는 **머지(또는 PR 종결) 즉시 삭제**한다. 원격·로컬 둘 다. 재사용하지 않는다 — 실행마다 새로 만든다.
- `sync/` 는 이 규칙에서 **유일하게 이름에 시각을 포함한다**: `sync/YYYY-MM-DD-HHMMSS` (`git-sync-all.sh` 구현). 하루에 여러 번 자동 생성되므로 충돌 회피용 유일성이 필요하다. §3.1 의 "날짜 금지"는 사람이 이름 붙이는 4종에만 적용된다.
- **미머지로 닫힌 `sync/` PR 은 브랜치가 남는다.** 실측: `livevil-research` PR #5(`sync/2026-07-25-215207`)는 CLOSED·미머지이고 base 에 없는 패치 1개를 여전히 갖고 있다. 이 경우 브랜치를 그냥 지우면 그 변경이 사라진다 → **자동 삭제 금지, 사람이 내용을 확인한 뒤 처리**(§5 와 같은 원칙).
- `/cc` 는 `sync/` 브랜치 위에서 task 커밋을 하지 않는다. `sync/` 는 `/cs` 의 것이다.

---

## 4. base 판정

**`main`|`master` 문자 추정을 절대 하지 않는다.** 추정하면 `Returns_ERP_v20`(base=staging, 머지=배포)에서 배포 사고가 난다. 이것이 현재 유일한 배포 사고 경로다.

### 4.1 우선순위 3단

| 순위 | 근거 | 명령 |
| --- | --- | --- |
| ① | `lens.config.json` 의 `baseBranch[<레포 디렉터리명>]` 명시값 | — |
| ② | 현재 브랜치의 upstream (remote 접두사 제거) | `git for-each-ref --format='%(upstream:short)' refs/heads/<current>` |
| ③ | `origin/HEAD` | `git symbolic-ref refs/remotes/origin/HEAD` |

- ②가 ③보다 앞인 이유: `staging` 을 체크아웃해 `origin/staging` 을 추적하는 레포에서 `origin/HEAD` 는 `main` 을 가리킨다(`Returns_ERP_v20` 실측). upstream 이 실제 작업 맥락을 더 정확히 반영한다.
- ①이 맨 앞인 이유: ②는 체크아웃 상태에 따라 흔들린다. 배포와 연결된 레포는 흔들리면 안 되므로 명시값으로 못박는다.
- 세 단계 모두 실패하면 `base = null` 이다. 이때는 **추정하지 않고 그 레포를 브랜치 강제 대상에서 제외하고 사유를 보고**한다(fail-closed). base 를 모르는 상태에서는 커밋도 허용하지 않는다.

### 4.2 `namane-cms` — `main` 과 `master` 공존

- 살아 있는 base 는 `master` 다(§0.3: `origin/main` 은 `origin/master` 의 조상, main 고유 커밋 0개). `origin/HEAD` 와 현재 upstream 도 `master` 를 가리키므로 판정은 지금 그대로 맞다.
- 위험은 누군가 그 레포에서 잔여 `main` 을 체크아웃할 때다. 그러면 ②가 `main` 을 답으로 내고, **완전히 흡수된 잔여 브랜치로 PR 을 열게 된다.**
- 그래서 이 레포는 `lens.config.json` 의 `baseBranch["namane-cms"] = "master"` 로 **명시 고정**한다(①이 ②를 덮으므로 체크아웃 상태와 무관해진다). 잔여 `origin/main` 삭제는 그 레포 소유자의 판단이고 Lens 는 건드리지 않는다.

### 4.3 `docs` — 원격에 base 가 없다

- 실측: 원격은 `github.com/Namane-Mkt/Docs` 이고 **저장소가 비어 있다**(`gh repo view` → `isEmpty: true`, `defaultBranchRef.name: ""`). `git ls-remote --heads origin` 출력이 0줄이다. 로컬 `main` 에는 커밋이 있지만 한 번도 push 되지 않았다.
- 그런데 로컬 `main` 에는 upstream(`origin/main`)이 **설정되어 있다.** 그래서 ②가 `main` 을 답으로 낸다 — **존재하지 않는 ref 를 가리키는 판정**이다. PR 을 만들려 하면 base 가 없어서 실패한다.
- 따라서 base 판정에는 **존재 확인이 붙는다**:

  ```sh
  git rev-parse --verify -q "refs/remotes/origin/<base>" >/dev/null \
    || echo "base ref 원격에 없음 — 브랜치 강제 제외"
  ```

  판정이 이름을 돌려줬더라도 원격에 그 ref 가 없으면 `base = null` 과 같이 취급한다. 그 레포는 브랜치 강제 대상에서 **제외**하고 "원격 base 부재"를 사유로 보고한다. 빈 원격을 초기화하는 것은 Lens 의 일이 아니다.
- 이것은 `resolveBase` 의 실패가 아니다 — 27개 레포 전량에서 판정 실패는 0건이고 `docs` 도 ②로 답을 낸다. **이름 판정과 ref 존재는 별개 층**이며, 존재 확인은 브랜치를 만들거나 PR 을 열기 직전에 한 번 더 한다.

### 4.4 전 레포 판정 재확인

```sh
node -e "
const {resolveBase}=require('./lib/git-branch.js');
const fs=require('fs'), path=require('path');
const root=process.env.GIT_ROOT || (process.env.USERPROFILE||process.env.HOME)+'/Documents/GIT';
for (const d of fs.readdirSync(root)) {
  if (!fs.existsSync(path.join(root,d,'.git'))) continue;
  const r = resolveBase(path.join(root,d));
  console.log(d.padEnd(26), String(r.base).padEnd(9), r.source, '|', r.reason);
}"
```

기대값 3개는 고정이다: `Returns_ERP_v20` = `staging`(source=config), `creeta-lens` = `master`, `livevil-contents` = `main`.

---

## 5. 머지 판정 — 틀리면 코드가 사라진다

GitHub 의 rebase·squash 머지는 커밋을 새로 쓴다. 조상 관계만 보면 **이미 병합된 브랜치가 영원히 미병합으로 보인다.** 두 단계로 판정한다.

```sh
# ① 빠른 경로 — 팁이 base 의 조상인가
git merge-base --is-ancestor origin/<branch> origin/<base>

# ② ①이 실패하면 — base 에 없는 patch 가 남았는가 (rebase·squash 대응)
git cherry origin/<base> origin/<branch> | grep '^+'
```

| 결과 | 판정 | 조치 |
| --- | --- | --- |
| ① 통과 | `merged` | 삭제. 잃을 것이 없다 |
| ① 실패 + ② 출력 없음 | `merged`(patch 동일) | 삭제. 커밋 id 는 달라도 모든 patch 가 base 에 있다 |
| ② 출력 있음 | `unmerged` | **삭제 금지.** 남은 패치 수와 함께 보고 |
| merge-base 없음 | `계보 다름` | **삭제 금지.** 태그 아카이브(§6) |
| 원격 ref 부재 + **로컬 ref 로 내용 증명됨** | `merged-deleted` | 로컬 브랜치만 삭제(원격은 이미 없다). §7.1 의 로컬 삭제 조건을 따른다 |
| 원격 ref 부재 + **내용이 base 에 없음이 증명됨** | `unpushed` | **삭제·머지 판정 금지.** push+PR 제안은 여기서만 한다. upstream 흔적이 있으면 "병합 없이 원격에서 삭제됐을 수 있음" 을 함께 보고 |
| 원격 ref 부재 + **증명 실패** (merge-tree 충돌·git &lt;2.38·로컬 ref 도 없음) | `unknown` | **자동 처리 금지.** 사람 확인. push+PR 을 제안하지 않는다 |

> **`unpushed` 와 `unknown` 의 경계는 증명의 방향이다.** `unpushed` 는 "원격에 없다" 가 아니라 **"내용이 base 에 없음이 실제로 증명됐다"** 는 뜻이다. 증명이 실패하면 `unknown` 이다.
>
> upstream 설정 유무를 판정 근거로 쓰지 않는다 — **`-u` 없이 push 하면 흔적이 남지 않으므로** "흔적 없음" 과 "push 된 적 없음" 은 구분할 수 없다. 그 정보는 `reason` 을 풍부하게 하는 데만 쓴다.
>
> 왜 중요한가: 거짓 "머지됨" 이 ref 를 지우는 것과 대칭으로, **거짓 "미푸시" 는 이미 머지된 작업에 대해 `/cp done` 이 "push 하고 PR 을 여시겠습니까" 를 제안하게 만든다.** 둘 다 만들지 않는다.

> **`merged-deleted` 가 필요한 이유**: 머지 직후 head 브랜치 삭제는 이 문서가 규정한 정상 흐름(§3)이고 GitHub 이 자동으로 하기도 한다. 그러면 `git fetch --prune` 이 `origin/<branch>` 를 지우고, 원격 ref 만 보는 판정은 그것을 **"한 번도 push 안 됨"** 으로 읽는다 — 완료된 작업에 대해 "push 하고 PR 을 또 여시겠습니까" 를 묻게 된다. 그래서 원격 ref 가 없을 때는 **로컬 ref 를 기준으로** 조상 검사 → merge-tree 비교를 한 번 더 돌린다. 증명되면 `merged-deleted`, 증명 안 되면 머지로 올리지 않는다.

### 5.1 PR 을 증거로 쓸 때 — base 자격을 통과한 MERGED 만 인정한다

원격·로컬 ref 가 둘 다 없으면 내용으로 증명할 방법이 없다(→ `unknown`). 이때만 PR 상태를 판정에 되먹인다(`mergedState(..., {prMerged:true})`). 그런데 **`state: MERGED` 라는 사실만으로는 증거가 아니다.**

- **base 자격**: 조회 결과 중 `baseRefName` 이 **그 task 문서 frontmatter 의 `base`** 와 같은 MERGED PR 만 증거 후보다. 조회에 `baseRefName` 을 반드시 포함시킨다(`--json number,state,baseRefName,mergedAt`).
- **왜**: 이름 일치 + MERGED 만 보면 **stacked PR** 이 통과한다 — head 가 그 레포의 base 가 아니라 **다른 작업 브랜치**로 머지되고 head 가 삭제된 경우, `prMerged:true` → `merged-deleted` 가 나와 **그 변경이 계획의 base 에는 없는데도** task 가 완료로 아카이브된다. §2 가 이미 "PR base 는 그 레포의 base 다" 를 못 박았으므로, base 가 다른 MERGED PR 은 그 조항 밖에서 만들어진 것이고 증거 자격이 없다.
- **정확히 1개**일 때만 증거로 쓴다. frontmatter `pr` 에 적는 번호도 그 PR 이다.
- **0개**(MERGED 는 있으나 전부 base 불일치 포함) → `prMerged` 를 주지 않는다. `unknown` 유지, 사람 확인. 보고에 `PR #N 은 MERGED 지만 base 가 <baseRefName> (계획 base <base> 아님) — 증거 불인정` 을 명시해 그 stacked 변경의 행방을 추적할 수 있게 한다.
- **2개 이상** → 같은 브랜치가 두 사이클에 재사용된 흔적(1 task = 1 브랜치 = 1 PR 위반)이다. 어느 머지가 이 task 의 것인지 도구가 특정할 수 없으므로 `unknown` 유지하고 후보 전부(번호·mergedAt)를 보고한다.

같은 자격 검사가 **board 의 In Review 조인**에도 적용된다 — head 이름만으로 붙이면 다른 base 로 향하는 PR 이 카드에 달라붙는다. 다만 board 는 **하위호환을 택한다**: 문서에 `base` 가 없으면(이 규칙 이전에 쓰인 문서) 이름만으로 조인한다. 실측 근거 — 이 레포 39개 문서 중 `base:` 를 가진 것은 1개뿐이라, 엄격하게 가면 좁은 오조인 1건을 막으려고 나머지 전 코퍼스의 In Review 를 조용히 비우게 된다. **`base` 를 적은 적이 없다는 것은 불일치의 증거가 아니다.** base 때문에 붙이지 않은 건수는 상단 바에 표시한다(침묵 금지).

- **`ahead` 커밋 수를 병합 근거로 쓰지 않는다.** 계보가 다르면 ahead 가 수백이어도 병합할 것이 없고, 반대로 계보가 같아도 커밋 수는 남은 작업량을 말해주지 않는다. 실측: `backup/macmini-preIA-20260723` 은 base 에 없는 패치 169개인데 고유 변경은 4파일이다(§0.6).
- **두 검사를 다 통과하지 못하는 브랜치는 자동 삭제하지 않는다.** 리베이스 중 충돌을 해결하면 patch-id 가 바뀌어 이미 병합된 브랜치도 `unmerged` 로 나온다. "도구가 병합을 증명할 수 없다"는 뜻이므로 사람이 내용을 확인한 뒤 지운다. 추측으로 지우지 않는다.
- 구현은 `mergedState(repoPath, branch, base)` 다. 현재 `livevil-research` 실측 출력:

  ```
  sync/2026-07-25-215207              {"state":"unmerged","unmergedPatches":1}
  claude/why-so-many-branches-apcojh  {"state":"unmerged","unmergedPatches":5}
  backup/macmini-preIA-20260723       {"state":"unmerged","unmergedPatches":169}
  ops/pre-renewal-macmini-20260719    {"state":"unmerged","unmergedPatches":2}
  task/community-insight-surface-v3   {"state":"unmerged","unmergedPatches":1}
  ```

  정리 후 남은 4개(+오늘 생긴 `sync/` 1개)가 전부 `unmerged` 인 것은 정상이다 — 병합 증명된 6개는 이미 삭제됐고, 남은 것은 사람의 판단이 필요한 것들이다.

---

## 6. 스냅샷은 브랜치가 아니라 태그다

상태 보존, 갱신 전 백업, 재현용 시점 고정은 **전부 태그**로 남긴다.

태그 이름은 **`archive/<원래-브랜치-전체경로>-<판정SHA12>`** 다. 세 명령은 **`&&` 로 묶인 하나**이고, 쪼개서 실행하지 않는다.

```sh
git tag -a archive/<원래-브랜치-전체경로>-<판정SHA12> <판정SHA> -m '<보존 이유>' \
  && git push origin archive/<원래-브랜치-전체경로>-<판정SHA12> \
  && git push --force-with-lease=refs/heads/<원래-브랜치>:<판정SHA> origin :refs/heads/<원래-브랜치>
```

- **브랜치 전체 경로를 살린다.** 첫 경로 요소를 버리면 `backup/foo` 와 `legacy/foo` 가 **같은 태그 이름**이 된다. 그러면 두 번째 태그 생성은 실패하는데 뒤따르는 삭제는 성공해서, **그 브랜치의 tip 이 어디에도 보존되지 않은 채 사라진다**(throwaway 원격에서 실제로 재현됨). 중첩(`archive/backup/foo-…`)은 유효한 태그 이름이다.
- **접미사는 날짜가 아니라 판정 SHA 다.** 도구는 하루에 여러 번 돌 수 있고, 같은 브랜치의 tip 이 진전된 뒤 재아카이브하면 날짜 접미사는 또 충돌한다. SHA 는 §7.1 의 "태그·lease 는 판정 시점 tip" 계약과 일치하고, 이름 자체가 어느 tip 을 보존했는지 남긴다.
- **태그 push 가 성공해야 삭제한다.** `&&` 가 그 순서를 강제한다. 태그가 안 올라갔는데 삭제만 도는 절차를 문서가 승인해서는 안 된다 — §7.1 의 "lease 없는 삭제 금지" 와 같은 강도의 요구다.
- **로컬 정리는 원격에 아무것도 쓰지 않는다.** `--remote` 를 주지 않은 실행은 로컬 `refs/heads` 만 대상으로 한다. 그런데 안내가 `origin` 을 넣어 원격 삭제를 내보내면, **로컬만 정리하려던 사용자가 블록을 복사 실행하는 순간 원격 브랜치가 사라진다**(재현 확인). 로컬 모드의 형태는 이렇다 — 태그도 **로컬에만** 만들고 push 하지 않는다:

  ```sh
  git tag -a archive/<원래-브랜치-전체경로>-<판정SHA12> <판정SHA> -m '<보존 이유>' \
    && git update-ref -d refs/heads/<원래-브랜치> <판정SHA>
  ```

  - 태그 push 도 원격 쓰기다 — `--remote` 를 안 준 사용자는 그것도 승인한 적이 없다. 지워지는 ref 가 로컬이므로 GC 로부터 보호할 곳도 로컬이고, 같은 이름의 원격 브랜치가 있다면 그 tip 은 원격 브랜치 자체가 계속 보존한다.
  - 원격 모드는 "태그 **push** 성공에 삭제 종속", 로컬 모드는 "태그 **생성** 성공에 삭제 종속" 이다(`&&` 로 동일).
  - ⚠️ `update-ref -d` 는 체크아웃된 브랜치도 지워 HEAD 를 깨뜨린다 — 그 브랜치에서 벗어난 뒤 실행한다(§7.1).
  - 원격까지 정리하려면 `--remote` 로 **재판정**한다. 로컬 실행이 원격을 대신 판단하지 않는다.
- **도구가 출력하는 명령의 동적 값은 셸 인용한다.** git 은 브랜치 이름에 `;`·`$()`·`&`·백틱을 허용한다. 인용하지 않으면 그런 이름의 브랜치가 안내에 그대로 보간되고, 사용자가 블록을 복사해 실행하는 순간 **임의 셸 코드가 돈다**(재현 확인). `/cp done` Phase 4 처럼 같은 형태의 명령을 만드는 경로는 전부 해당된다.

- 태그는 브랜치 목록을 오염시키지 않으면서 커밋을 영구 보존한다. 브랜치 목록은 **지금 진행 중인 작업만** 보여야 한다.
- **병합 의도가 없는 계보를 브랜치로 두지 않는다.** 특히 base 와 공통 조상이 없는 계보는 브랜치로 남겨두면 언젠가 병합 시도의 대상이 되고, 그 병합은 현재 트리를 대량 삭제한다.
- 자동 커밋을 브랜치에 쌓지 않는다. 주기적 측정 결과는 커밋이 아니라 DB 나 `docs/reports/` 의 최종 산출물로 남긴다. 기록이 커밋을 만들어야 한다면 같은 파일을 덮어쓰고 마지막 상태 하나만 커밋한다. 워커·스케줄러가 `git commit` 을 반복 호출하는 경로를 새로 만들지 않는다.

### 6.1 ⚠️ 도구가 결론을 내릴 수 없는 지점 (사람이 판단한다)

**자동 커밋이 쌓인 브랜치는 계보가 base 와 같아서 §5 의 두 검사만으로는 `유지`(살아 있는 작업)가 된다. 그러나 규칙상으로는 태그 아카이브 대상이다.**

실측 `backup/macmini-preIA-20260723`: merge-base 가 존재하므로(`808e5b0`) `계보 다름` 이 아니고, 패치 169개가 남았으므로 `merged` 도 아니다 → `mergedState` 판정은 `unmerged`. 하지만 고유 변경은 4파일뿐이고 나머지는 `ops: record ...` 형태의 반복 커밋이다.

**판정 신호**: `커밋 수 ≫ 변경 파일 수`. `scripts/prune_branches.py` 는 이 신호를 `아카이브 검토` 로 **표면화하고 절대 삭제하지 않는다** — 신호를 놓치지는 않지만 결론은 내리지 않는다. 실측 출력:

```text
backup/macmini-preIA-20260723  아카이브 검토 — 자동커밋 누적 의심 (커밋 169 / 변경 파일 4 = 파일당 42커밋, 삭제 대상 아님)
```

사람이 할 일:

1. 고유 변경 4파일을 확인해 필요한 것만 `feat/`·`ops/` 브랜치로 새로 옮긴다 (`git diff --stat origin/<base>...origin/<branch>`).
2. 원래 브랜치는 `git tag archive/macmini-preIA-20260723` 로 보존하고 삭제한다.

`--apply` 는 이 판정을 지우지 않으므로 사람이 손대지 않으면 계속 남는다 — 실제로 `livevil-research` 에는 현재 `archive/*` 태그가 0개이고 이 브랜치가 그대로 남아 있다(미해결).

---

## 7. 점검·정리

- 한 레포의 원격 브랜치가 **5개를 넘으면** 상태를 판정한다.

  ```sh
  git fetch origin --prune
  python scripts/prune_branches.py --repo <레포경로> --remote origin            # 판정만 (base 는 §4 로 자동 감지)
  python scripts/prune_branches.py --repo-root <워크스페이스루트> --remote origin # 전 레포 일괄 판정
  python scripts/prune_branches.py --repo <레포경로> --remote origin --apply     # 병합 증명된 것만 삭제
  ```

  `--base` 를 직접 주려면 §4 로 감지한 값을 넣는다. `main` 을 기본값으로 가정하지 않는다(옵션을 비우면 도구가 §4 우선순위로 감지한다).

- `--apply` 가 지우는 것은 §5 표의 두 `merged` 판정뿐이다. `계보 다름`(→ 태그 아카이브), `아카이브 검토`(§6.1), `유지`, `판정 불가` 는 지우지 않는다.
- **`--apply` 를 막는 fail-closed 사유 5가지** (판정 전용 실행은 경고만 내고 완주한다 — 아무것도 지우지 않으므로):
  1. **PR 보호 검사 불가** — `gh` 부재·미인증·일시 실패. 열린 PR 의 head 가 병합처럼 보이면 지워진다.
  2. **PR 목록이 한도에 도달** — 잘려 나간 head 는 본 적이 없으므로 검사가 불완전한 것이다.
  3. **PR 조회 대상 레포 미해석** — 선택한 remote 의 URL 에서 GitHub 레포를 못 뽑으면(비 GitHub 호스트 포함) **어느 레포의 PR 을 확인하는지 모른다.** ⚠️ 이건 gh 호출 자체의 가드가 **못 잡는** 종류다 — 레포를 고정하지 않으면 gh 가 제 기본 레포를 골라 **다른 레포의 PR 목록을 "성공" 으로 반환**한다(실측: 원격 2개 + `gh repo set-default` 상태에서 엉뚱한 레포의 PR 55개를 받아왔고, 이 레포의 열린 PR head 는 보호 목록에 없었다). 그래서 조회는 `--repo OWNER/REPO` 로 **못 박는다**.
  4. **원격의 현재 기본 브랜치 조회 실패** — 네트워크·인증·remote 부재·symref 미광고. 복구는 캐시를 고치는 게 아니라 **원격 접근을 복구**하는 것이다.
     - ⚠️ **default 는 로컬 `refs/remotes/<remote>/HEAD` 가 아니라 `git ls-remote --symref <remote> HEAD` 로 라이브 조회한다.** 그 로컬 심볼릭 ref 는 **clone 시점의 캐시**이고 평범한 `fetch` 로 갱신되지 않는다(`git remote set-head` 로만). 원격의 default 가 바뀐 뒤에는 가드가 **"성공" 을 보고하면서 옛 default 를 지키고, 진짜 현재 default 를 삭제 대상으로 흘려보낸다**(실측 재현).
     - 라이브 값과 로컬 캐시가 **다르면 둘 다 `유지`** 로 두고(`stale_default_branch`), 사용자에게 `git remote set-head <remote> --auto` 를 안내한다. **스크립트가 로컬 상태를 대신 고치지 않는다.**
     - 비용: 레포당 네트워크 왕복 1회가 는다. 실측으로 27개 레포 전수 순회가 **27초 → 76초**.
  5. **remote 의 fetch URL 과 push URL 이 다름** — `git remote get-url <remote>` 와 `git remote get-url --push --all <remote>` 의 **실효값**이 하나라도 다르면 차단한다(둘 중 하나라도 못 읽어도 차단). 판정·보호·lease 는 전부 **fetch URL 레포**의 tracking ref 를 근거로 하는데, 삭제는 **push URL 레포**로 나간다 — 검사한 적 없는 레포의 브랜치를 지우는 것이다. 실측 재현: 같은 이름·같은 SHA 의 `feat/x` 를 가진 upstream/fork 구성에서 수정 전 코드가 **fork 의 브랜치를 삭제**했고(SHA 가 같아 lease 도 통과했다), upstream tracking ref 까지 부수적으로 지워졌다.
     - ⚠️ **`--delete-without-pr-check` 로 우회되지 않는다.** 그 플래그는 "PR 목록을 손으로 확인했다"는 증명인데, PR 목록을 아무리 확인해도 **판정 근거 레포와 삭제 대상 레포가 같아지지는 않는다.** default 가드와 같이 override 없는 차단이다.
     - 복구는 플래그가 아니라 remote 설정 교정이다 — `pushurl`(또는 `pushInsteadOf`) 을 해제하거나, push 대상을 **별도 remote 로 등록해 그쪽을 `--remote` 로 재판정**한다. `get-url` 은 `pushInsteadOf` 재작성까지 실효값으로 드러내므로 그 형태도 잡힌다.
     - 실측: 워크스페이스 27개 레포 전수에서 split remote **0개** — 이 가드로 새로 막히는 레포는 없다.
  - 로컬 모드는 `origin` 을 proxy 로 쓴다(3·4 공통). 로컬 모드에는 push 자체가 없으므로 5 는 해당 없음이다. 우회는 `--delete-without-pr-check` 하나뿐이고(사유 5 는 그것으로도 안 열린다), **그것이 명시적·가시적 행위가 되도록** 설계됐다.

### 7.1 삭제하는 방법 — 원자적 lease, check-then-delete 금지

판정은 **로컬 tracking ref** 를 근거로 한다. 다른 머신이 그 사이 원격을 진전시켰으면 그 ref 는 낡은 값이다. 그런데 삭제가 "현재 원격 tip" 을 무조건 지우면 **이 판정이 한 번도 본 적 없는 커밋이 사라진다.** Windows 개발 머신과 Mac Mini 가 같은 레포를 쓰므로 실제로 일어날 수 있다.

`tip 을 비교한 뒤 삭제` 는 이 문제를 막지 못한다 — 비교와 삭제 사이에 창이 남는다. **기대 SHA 를 삭제 명령 자체에 실어 보낸다.**

```sh
# 원격 삭제 — 판정에 쓴 SHA 를 lease 로 실어 보낸다
git push --force-with-lease=refs/heads/<branch>:<판정SHA> origin :refs/heads/<branch>
```

- 원격 tip 이 판정 SHA 와 다르면 git 이 `stale info` 로 **거부**한다. 그때는 **재시도하거나 force 로 전환하지 않는다** — `원격이 진전됨 — fetch 후 재판정` 으로 보고하고 멈춘다.
- `git push origin --delete <branch>` 는 lease 가 없으므로 **쓰지 않는다.** (§6 의 태그 아카이브 예시도 같은 이유로 lease 형태를 쓰는 것이 안전하다 — 아카이브 태그를 밀어둔 뒤라 손실 위험은 낮지만, 두 경로가 다른 문법을 쓰면 다음 구현자가 어느 쪽을 표준으로 볼지 모른다.)
- 이 규칙은 `scripts/prune_branches.py` 와 `/cp done` 의 Phase 4 **양쪽에 동일하게** 적용된다. 한쪽만 원자적이면 다른 쪽이 사고 경로로 남는다.

**로컬 삭제는 조상 검사를 반복하지 않는다.** `patch-merged` 는 squash·rebase 머지에서 나오고, 그 경우 브랜치 tip 이 base 의 조상이 **아닌 것이 정상**이다(커밋이 새로 쓰였으니까). 그래서 `git branch -d` 는 내용 증명이 끝난 뒤에도 **거부**한다 — 그대로 두면 그런 완료마다 로컬 브랜치가 쌓인다.

- **로컬 삭제도 원자적으로 한다** — 원격과 같은 이유다. 판정과 삭제 사이에 다른 프로세스가 로컬 브랜치를 진전시키면 비교-후-삭제는 그 커밋을 지운다.

  ```sh
  git update-ref -d refs/heads/<branch> <판정SHA>
  ```

  기대값이 현재 값과 다르면 git 이 `is at <실제> but expected <기대>` 로 **거부**한다 → "로컬이 진전됨 — 재판정 필요" 로 보고하고 멈춘다.
- **삭제 조건은 그대로 둘 다 참일 때만**: ① `mergedState` 가 `merged`/`patch-merged`/`merged-deleted` (내용 증명) ② 로컬 tip = 판정 SHA (SHA 증명). `unknown`·`unmerged`·판정 SHA 없음은 전부 금지다. `git branch -d` 는 patch 머지를 판정할 능력이 없으므로 이 자리에서 쓰지 않는다.
- ⚠️ **체크아웃된 브랜치는 건너뛰는 게 아니라 먼저 벗어난다.** `update-ref -d` 는 `git branch -D` 와 달리 현재 체크아웃된 브랜치도 **말없이 지워 HEAD 를 깨뜨린다**(git 2.53 실측) — 그건 사실이므로 가드는 유지한다. 그런데 **건너뛰면 더 나쁜 일이 생긴다**: `/cc` 직후 `/cp done` 은 **최빈 경로**이고 그때 task 브랜치는 당연히 체크아웃 상태다. 건너뛰면 이후 완료 기록(history 작성·task 삭제)이 **이미 머지됐고 원격 ref 도 지워진 그 브랜치 위에서** 커밋되어 **base 에 영영 도달하지 못한 채 고립된다.**
  - 순서: **① dirty 검사**(비어 있지 않으면 멈춘다 — 변경을 base 로 끌고 가지 않는다) → **② base 로 checkout** → ③ 원격 lease 삭제 → ④ 로컬 삭제.
  - **이동 검사는 원격 삭제보다 먼저** 한다. 그래야 dirty 로 멈출 때 "원격만 지워진" 어중간한 상태가 안 생긴다.
  - 이동 실패(dirty·checkout 실패)는 **fail-closed** — 아카이브에 진입하지 않는다.
- **로컬 ref 가 아예 없으면 "이미 정리됨"(성공)** 이다. 다른 머신에서 완료 처리하면 머지된 원격 브랜치는 있는데 `refs/heads/<branch>` 는 없다. 없는 tip 은 판정 SHA 와 같을 수 없으므로, 그대로 두면 **사실이 아닌 "미푸시 커밋 있음"** 으로 멈춘다. **ref 존재 + tip ≠ 판정 SHA**(진짜 미푸시 커밋 → 보류)와 명확히 구분한다.
- **PR 상태 조회는 레포를 못 박는다** — `gh pr list --repo <OWNER/REPO>`. remote URL 에서 해석하고, **해석 불가면 조회 불가와 같은 fail-closed**. 이 규칙은 `/cp done` 과 `scripts/prune_branches.py` 와 board 빌더 **세 곳 모두**에 적용된다. 고정하지 않으면 gh 가 제 기본 레포를 골라 **다른 레포의 PR 을 "성공" 으로 반환**하고, 동명 PR 이 거짓 증거가 된다(실측 재현).
- 로컬에 아직 push 되지 않은 커밋이 있으면(tip ≠ 판정 SHA) **보류**한다.
- 즉 열린 것은 "증명이 끝난 브랜치에 대해 중복 조상 검사를 우회하는 것" 하나뿐이고, **증명 없는 강제 삭제는 열리지 않는다.** 반대로 증명된 브랜치를 `-d` 거부만으로 방치하는 것도 금지다.
- **삭제 자동화 없이 생성 자동화를 켜지 않는다.** 브랜치 자동 생성만 도입하면 이미 실측된 누적 문제(§0.5)를 가속한다. `lens.config.json` 의 `requireTaskBranch` 는 ① 선행 정리 1회 완료 ② `prune_branches.py` 가 이 레포에서 동작 — 두 조건이 충족된 뒤 `true` 로 전환한다. 두 조건 없이 `true` 로 켜는 것도, 조건이 갖춰졌는데 `false` 로 방치하는 것도 금지다(정리 수단을 생성 기능과 같은 릴리즈에 넣는다).
- 열린 PR 점검: 내용이 이미 base 에 반영된 PR 은 닫는다. 방치하면 열린 PR 목록이 남은 작업을 반영하지 못한다.
- 관련 설정 키(`lens.config.json`): `baseBranch`(레포별 명시 맵) / `requireTaskBranch` / `autoDeleteMergedBranch` / `branchPrefixes`.
