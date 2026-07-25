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
| 실행 진입 | `/cc` | base 를 fetch·최신화한 뒤 `checkout -b <문서의 branch>`. dirty·diverged·upstream 부재면 실행을 **차단**하고 보고(fail-closed) |
| 실행 중 커밋 | `/cc` | **현재 브랜치가 문서의 `branch` 와 같을 때만 커밋한다.** 그 외는 커밋을 거부하고 보고 — 판정 순서는 §2.1, 구현은 `canCommitTo(repoPath, planBranch)` |
| 완료 처리 | `/cp done` | ① PR 생성/확인 → ② 머지 판정(§5) → ③ 머지됨이 증명되면 history 기록 + 원격·로컬 브랜치 삭제 → ④ **미머지면 history 로 내리지 않고 "In Review" 로 보고** |
| 워크스페이스 스윕 | `/cs` | task 브랜치를 **소유하지 않는다.** task 브랜치는 건너뛴다(재포장·reset 금지). `sync/` 브랜치는 계획 밖 dirty 변경 전용이다(§3.2) |

- 하나의 task 문서가 여러 레포를 건드리면 **레포별로 브랜치와 PR 을 따로 만든다.** 문서는 하나여도 브랜치·PR 은 레포 수만큼 생긴다(frontmatter 에 레포별 항목으로 기록).
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

```sh
git tag archive/<목적>-<YYYYMMDD> <commit>
git push origin archive/<목적>-<YYYYMMDD>
git push origin --delete <원래-브랜치>
```

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
- **삭제 자동화 없이 생성 자동화를 켜지 않는다.** 브랜치 자동 생성만 도입하면 이미 실측된 누적 문제(§0.5)를 가속한다. `lens.config.json` 의 `requireTaskBranch` 는 ① 선행 정리 1회 완료 ② `prune_branches.py` 가 이 레포에서 동작 — 두 조건이 충족된 뒤 `true` 로 전환한다. 두 조건 없이 `true` 로 켜는 것도, 조건이 갖춰졌는데 `false` 로 방치하는 것도 금지다(정리 수단을 생성 기능과 같은 릴리즈에 넣는다).
- 열린 PR 점검: 내용이 이미 base 에 반영된 PR 은 닫는다. 방치하면 열린 PR 목록이 남은 작업을 반영하지 못한다.
- 관련 설정 키(`lens.config.json`): `baseBranch`(레포별 명시 맵) / `requireTaskBranch` / `autoDeleteMergedBranch` / `branchPrefixes`.
