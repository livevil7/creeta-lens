---
plan_id: 2026-08-14-cs-mirror-invariant
planner: cp
grade: deep
created: 2026-08-14
status: planned
repo: creeta-lens
base: master
branch: feat/cs-mirror-invariant
pr: null
refs:
  - docs/rules/branch-lifecycle.md
  - docs/history/2026-07-20-lens-plan-engine-overhaul.md
---

# /cs 미러 개편 — "런이 끝나면 클라우드가 곧 최신"을 불변식으로

## 🎯 What — 목표 (무엇이 가능해지는가, 사람 언어)

- **어느 컴퓨터에서든 `/cs` 한 번이면, 내 작업 전부가 클라우드(GitHub)에 올라가 있고 다른 컴퓨터는 받기만 하면 되는 상태가 된다.**
- `/cs`가 스스로 만든 찌꺼기(열린 자동 PR, 병합 끝난 브랜치)를 **다음 실행이 알아서 치운다** — 몇 주씩 쌓여 사람이 청소하러 들어가는 일이 없어진다.
- "성공 32/32" 같은 보고가 **진짜 깨끗함을 의미한다** — 올라가다 만 작업이 성공으로 집계되는 일이 없다.

**완료의 정의 (Done = ?):**

> 아무 레포나 지저분하게 만들어 놓고 `/cs`를 한 번 돌린 뒤, 다른 컴퓨터에서 pull만 했을 때 그 작업이 그대로 보이고 — GitHub에는 열린 자동 PR도, 병합 끝난 잔여 브랜치도 남아 있지 않다.

## 🎬 사용 장면

대표가 Windows에서 작업을 끝내고 `/cs`를 친다. 보고에 "✅ 깨끗함 30 · 📤 미러 2 · ⚠️ 확인 필요 1(ERP — 배포 게이트라 사람 결정)"이 뜬다. Mac Mini에서 `/cs pull`을 치면 방금 작업이 전부 내려온다. 어디에도 열린 auto-sync PR이 없다.

## 🚧 비목표 (Non-Goals)

- **`prune_branches.py`의 /cs 통합·흡수** — prune은 전 접두사 대상 판정 도구로 남는다. /cs는 **자기 소유(`sync/`) 잔여물만** 회수한다. 남의 브랜치 정리는 계속 prune+사람 몫 (소유권 분리 원칙 유지)
- **task 브랜치(feat/fix/ops/docs)·agent/ 브랜치의 자동 머지** — 내용을 모르는 작업을 자동으로 base에 넣지 않는다. 보고·에스컬레이션까지만
- **SessionStart 자동 pull 정책 변경** — 30분 가드 그대로
- **`/cp done`·`/cc`의 브랜치 라이프사이클 변경** — 그쪽 판정 로직(lib/git-branch.js)은 건드리지 않는다

## ❓ Why — 왜 해야 하는가

- **푸는 문제**: 소유자의 목적은 처음부터 "미러"였다 — *"병합을 하던 뭘 하던 그건 모르겠고, 깔끔하게 클라우드에 올려놓고 다른 컴에서 그대로 받아 작업"* (2026-08-14 대표 발언). 그런데 현행 /cs는 PR 의식(儀式)을 거치며 **실패 지점마다 잔여물을 남기고, 그 잔여물을 어떤 런도 회수하지 않는다.** 실측: auto-sync PR 13~21일 방치 3건 + agent PR 10~28일 3건 + 병합 끝난 브랜치 14개(금일 수동 정리). base 밖에 있는 커밋은 다른 머신에 **도달하지 않으므로**, 잔여물 방치 = 동기화 실패다.
- **설계 이력이 증명하는 방향**: v3.25가 "PR 보장"을 도입할 때조차 사용자 원선택은 "PR+자동머지"였고(Codex 반박이 뒤집음 → v3.27 CHANGELOG가 "그 반박 채택이 잘못"이라고 자인), 이번 발언으로 **"PR 기록" 요구 자체가 철회**됐다. 남은 것은 미러 결과뿐이다.
- **안 하면**: 사고 기전이 현행 코드에 살아 있다 — **머지 실패 시 `reset --hard`가 여전히 실행돼 로컬에서 변경이 사라진 것처럼 보인다**(2026-08-02 메모리 17개 소실과 동일 기전, 원격 PR에만 잔존). 미병합이 "성공"으로 집계돼 겉보기 32/32 뒤에 유실이 숨는다. 잔여물은 계속 쌓인다.

## 🧰 실행 전략 & 자원

- **난이도**: medium-large — 셸 스크립트 1개 중심이지만 멀티머신·데이터 유실 리스크가 크고 테스트가 0개인 영역
- **권장 모델**: 구현 Worker=중간 티어(sonnet) · 리뷰/사고분석=TOP(**fable**) 1기 — 셸 로직은 Medium, lease·경합 검증은 Hard
- **병렬 실행**: T1~T3 [P] 병렬 가능(같은 파일이므로 실제로는 순차 커밋 권장), T7 테스트는 T1-T5 후
- **활용 스킬**: 없음(순수 셸+git). 검증은 bash 테스트 하네스
- **기존 자원**: `lib/git-branch.js`의 판정 원칙(재사용은 원칙만 — /cs는 "No Node" 유지가 기본, 검토된 대안 참조) · `prune_branches.py`의 atomic lease 패턴(§7.1) · 기존 `LENS_SYNC_PR=0` 직push 코드 경로(:181-195, 이미 실재)

## 🚫 DO NOT CHANGE

- `lib/git-branch.js` — `/cp done`·`/cc`가 소비하는 판정 로직. 이번 범위 밖
- `scripts/prune_branches.py` — 독립 도구로 유지. 원칙 동기화만 확인
- `hooks/sync-pull.js`의 30분 간격 가드·기본 OFF — 헤드리스 폭주 방지 실측 픽스
- `docs/rules/branch-lifecycle.md`의 §7.1 atomic lease 계약 본문 — 개정은 §3.2·§8의 /cs 관련 조항만
- 각 레포의 `.gitignore` 신뢰 원칙 — /cs는 시크릿 필터를 추가하지 않는다(사용자가 의도적으로 시크릿을 버전관리하는 레포 존재)

## 🛠 How — 어떻게

### Plan A — 미러 기본 + 자기 잔여물 회수 + 불변식 보고

#### 왜 이게 1순위인가
실패가 잔여물을 만드는 구조(PR 의식) 자체를 제거하면 회수 대상이 원천 감소한다. 직push(미러)는 실패 시 **로컬에 커밋이 그대로 남아** 다음 런이 재시도한다 — 자기치유. PR 경로는 이미 죽은 요구("PR 보장")를 위해 gh 의존·왕복 API·reset --hard·잔여물 리스크를 지불하고 있다. 기존 `LENS_SYNC_PR=0` 코드가 이미 있어 전환 비용이 낮다.

#### 단계 (빌드레디 태스크)

- [ ] **T1 미러 기본 전환 + 직push 경로 강화**
      파일: `scripts/git-sync-all.sh:181` (기본값), `:183-195` (직push 경로), `:201-205` (wf 감지 이식)
      변경: `${LENS_SYNC_PR:-1}` → `${LENS_SYNC_PR:-0}` (env 명시 시 기존 우선 존중). 직push 경로에 ① `.github/workflows` 사전 감지(현재 PR 경로에만 있는 :201-205 로직 이식 — 실패 시 사유 명시) ② push는 ff 전제(`git push` 기본 — force 계열 금지, 원격이 앞서면 거부→failed 보고) ③ 성공 시 `pushed+=("$name (+N, mirror)")`
      검증: 테스트 레포에서 dirty 상태로 실행 → base 직커밋·push, sync/ 브랜치 0개 생성, 로컬==원격 → pass
      의존: 없음
- [ ] **T2 config 인식 — base 대조 가드 + 레포별 정책**
      파일: `scripts/git-sync-all.sh` (push 케이스 진입부, :164 직후), `lens.config.json` (+`syncPolicy` 키)
      변경: `lens.config.json`에서 `baseBranch.<repo>`·`syncPolicy.<repo>` 를 셸 파싱(sed/grep — Node 불사용 원칙 유지, 키 구조 단순). ① config baseBranch가 있는데 현재 브랜치와 다르면 push skip + `⚠️ base 불일치` 보고(예: ERP에서 main 체크아웃 상태) ② `syncPolicy: "pr-manual"` 레포(초기값: Returns_ERP_v20)는 미러 금지 — 기존 PR 경로로 PR 생성까지만, 머지는 사람(현행 branch-lifecycle §1.2 준수)
      검증: ERP 모의 레포(config에 pr-manual)에서 dirty 실행 → 직push 0회, sync/ PR 생성, 머지 시도 0회 → pass
      의존: 없음
- [ ] **T3 task 브랜치 가드를 스크립트로 이관**
      파일: `scripts/git-sync-all.sh` (push 케이스 진입부)
      변경: 현재 브랜치가 `feat/|fix/|ops/|docs/|agent/|claude/|codex/|task/|feature/|backup/` 접두사면 commit·push 전체 skip, `task-branch` 버킷으로 보고(ff pull은 수행). 현재 이 가드는 SKILL.md prose(에이전트 지시)에만 존재 — 스크립트가 단독 실행돼도 지켜지게
      검증: feat/x 체크아웃+dirty 레포 실행 → 커밋 0·push 0·보고에 "task 브랜치 — 건너뜀" → pass
      의존: 없음
- [ ] **T4 reconcile — 자기 잔여물 회수 단계 신설**
      파일: `scripts/git-sync-all.sh` (push 케이스, dirty 계산 :174 이전) + 배열 선언부(:82 부근) `reclaimed=()`
      변경: 레포당 ① `gh pr list --state open` 중 `headRefName`이 `sync/`로 시작하는 PR: `pr-manual` 레포면 보고만, 그 외엔 `gh pr merge --merge --delete-branch` 시도 → 성공 `reclaimed+=`, 실패(충돌 등) `⚠️ 회수 불가` 보고 ② 원격 `sync/*` 브랜치 중 PR 없는 것: base 포함 여부를 `git merge-base --is-ancestor`→`git cherry` 2단으로 판정, **증명된 것만** atomic 이중 lease(`--force-with-lease=base:SHA --force-with-lease=branch:SHA`)로 삭제. 미증명·미머지 CLOSED PR의 브랜치는 절대 자동 삭제 금지(branch-lifecycle §3.2:213). gh 부재 시 이 단계 skip+보고(회수만 gh 의존, 미러는 무의존)
      검증: 열린 sync PR 1 + 병합증명 잔여 sync 브랜치 1 + 미증명 1을 심은 모의 원격 → 런 후 PR 0·증명 브랜치 삭제·미증명 잔존 → pass
      의존: T1 (버킷·보고 구조)
- [ ] **T5 불변식 보고 — 성공의 재정의 + 유실 기전 제거**
      파일: `scripts/git-sync-all.sh:245-255` (미병합 분류), `:270-277` (reset 조건), `:297-` (리포트), `:336-356` (--json)
      변경: ① 레포 "성공" 판정 = `로컬 base==origin/base && dirty 0 && 열린 sync PR 0` — 미충족은 ✅에 세지 않고 사유 버킷으로 ② pr-manual 경로에서 `gh pr merge` 실패 시 `repo_err` 세팅(현재 else 없음 — 조용히 pushed 집계) ③ **`reset --hard`를 `$merged=true`일 때만 실행** — 미병합 시 로컬 워킹트리 되감기 금지(사고 기전 제거; 미러 경로엔 reset 자체가 없음) ④ `--json`의 stray `\n` 인자 버그 수정(:356 — 현재 무효 JSON 2줄 출력, 실측) + `reclaimed`·`task_branch`·`policy_hold` 필드 추가(기존 필드 유지 — additive)
      검증: 머지 실패 모의 → failed 버킷+로컬 커밋 보존 확인. `--json` 출력 마지막 줄 `python -m json.tool` 통과 → pass
      의존: T1, T4
- [ ] **T6 비-base 작업 가시화 — 방치 에스컬레이션**
      파일: `scripts/git-sync-all.sh` (리포트 단계), `skills/cs/SKILL.md` (5개 초과 경고 절 대체)
      변경: 런 말미 레포별 원격 비-base 브랜치를 마지막 커밋 날짜와 함께 나열(`ls-remote`+`git log -1 --format=%cr`), 7일 초과는 `⚠️ N일째 base 밖` 표시. 현재 "5개 초과 카운트"(에이전트 수동 수행)를 스크립트 출력으로 흡수 — 나이 기반이라 방치를 직접 가리킨다
      검증: 오래된 브랜치가 있는 레포 실행 → 보고에 나이 표시 → pass
      의존: 없음
- [ ] **T7 시나리오 테스트 신설 (현재 0개)**
      파일: `tests/test_git_sync.sh` (신규), `tests/fixtures/` (모의 gh 스텁)
      변경: 로컬 bare 원격 fixture로 6시나리오 — 미러 push / task 브랜치 skip / pr-manual 정책 / reconcile 회수·미증명 보존 / 미병합 시 로컬 보존(reset 금지) / --json 유효성. gh는 PATH 앞에 스텁 셸 함수로 주입
      검증: `bash tests/test_git_sync.sh` exit 0, 6/6 → pass
      의존: T1~T5
- [ ] **T8 문서·버전 동기화**
      파일: `skills/cs/SKILL.md` (전면 개정 — 모드 표·불변식·정책·플래그 의미 반전 명시), `docs/rules/branch-lifecycle.md` §3.2·§8 (/cs 조항 개정 + **2026-08-14 대표 결정으로 "PR 보장" 전제 철회 이력 병기**), `CHANGELOG.md` (v3.31.0 breaking), `skills/cc/SKILL.md:203` (git-sync 주석 인용 갱신 확인), `.claude-plugin/plugin.json` (버전)
      변경: 위 내용. LENS_SYNC_PR 의미가 반전됨(1=레거시 PR 모드 opt-in)을 breaking으로 명시
      검증: 문서 3곳 grep으로 "직접 push 로 우회하지 않음" 류 구조항 잔존 0 → pass
      의존: T1~T6
- [ ] **T9 배포 + 현존 부채 일소 (1회성 운영)**
      파일: 없음(운영). 대상: 이 머신+Mac Mini `/lens-upgrade`, 열린 PR 6개, ops/task 잔여 브랜치 4개
      변경: ① 양 머신 업그레이드(버전 라벨≠배포 실측 있으므로 스크립트 해시로 확인) ② 새 /cs 1회 실행 → sync/ PR 3건 자동 회수 확인(ERP 2건은 pr-manual이라 보고로 남음 → 내용 확인 후 대표 결정) ③ agent/ PR 3건·ops/task 브랜치 4건: 내용 요약 보고 후 개별 결정(자동 처리 금지) ④ snapholo `docs/` PR #6(금일, 타 세션 소유)은 건드리지 않음
      검증: 전 레포 `gh pr list` sync/ 0건 · 불변식 보고 ✅ 판정 → pass
      의존: T8

#### 막힐 수 있는 지점 (→ Plan B 트리거)
- T2 셸 JSON 파싱이 config 구조 변화에 취약 → 파싱 실패 실측 시
- T4 reconcile의 gh 의존이 무인 환경에서 매번 skip → 회수가 실질 동작 안 하면
- T7 gh 스텁이 실제 gh 동작과 괴리 → 테스트 통과·실환경 실패 발생 시

### Plan B — Fallback

#### Trigger
T2에서 셸 파싱이 config 확장(중첩 키)에 깨지거나, T4/T7에서 gh 스텁 괴리로 실환경 회귀가 2회 이상 발생 시.

#### 왜 이 대안인가
"No Node" 원칙을 접고 `node -e`로 `lib/git-branch.js`·JSON.parse를 직접 쓰면 파싱·판정이 견고해진다. 대가: /cs가 Node 런타임에 의존(Claude Code 플러그인 환경엔 항상 있으므로 실질 비용 낮음 — 원칙 개정을 CHANGELOG에 명시).

#### 단계
- [ ] B1: config 읽기를 `node -e "JSON.parse"` 원라이너로 교체
- [ ] B2: reconcile 병합증명을 `lib/git-branch.js mergedState()` 호출로 교체(판정 로직 단일화)
- [ ] B3: SKILL.md "No Node, no Python" 조항 개정 + CHANGELOG 기록

### 🔀 듀얼 합성 (Claude ‖ Codex)

**합의 (고신뢰):**
- 진단 일치 — "생성은 자동, 회수는 수동" 비대칭이 근본 원인. 병합 실패가 success로 집계되고 reset --hard가 유실감을 만든다는 코드 지점(:245-250, :277)까지 동일 특정
- 부채 일소(1회) → 불변식 중심 재설계 → 같은 런에서 잔여물 정리, 의 3단 구조
- 안전장치(atomic 이중 lease·ERP staging 게이트·내용 기반 병합 증명) 유지

**분기 → 해소:**
- Codex "mirror는 현재 브랜치를 그대로 push(task 브랜치 포함)" vs branch-lifecycle §2 "/cs는 task 브랜치를 소유하지 않는다" → **후자 채택**(T3): task 브랜치 push는 /cc·사람 소유. 무관 작업이 섞인 chore PR 실측 사고가 근거
- Codex "mirror/integrate 2단 명령 분리" vs Claude "한 런 내 단계화" → **후자 채택**: integrate(완료 작업의 base 병합)는 이미 `/cp done`의 소관 — /cs에 새 명령을 만들면 소유권이 중복된다

### ⚠️ 사전 리스크 (Pre-mortem — Claude TOP)

1. 미러 직push 경합: 두 머신이 동시에 push → ff 거부로 한쪽 failed(안전) — force 계열 절대 금지로 담보
2. dirty 스윕에 의도치 않은 파일 — 기존과 동일 리스크(gitignore 신뢰), 변화 없음을 명시
3. reconcile이 타 머신이 검토 중인 PR을 삼킴 → sync/ 접두사 한정 + pr-manual 제외로 차단
4. ERP: config 미배포 머신에서 syncPolicy 미인식 → T2가 config **부재 시 보수 동작**(pr-manual로 폴백 아님 — upstream==staging 감지 시 미러 금지 하드코드 이중화)
5. --json 소비 자동화가 새 필드에 놀람 → additive만, 기존 키 불변
6. Mac Mini 배포 시차(버전 라벨≠실배포 실측) → T9가 스크립트 해시 대조
7. 테스트의 gh 스텁 괴리 → Plan B 트리거로 연결
8. LENS_SYNC_PR 의미 반전을 모르는 과거 문서·습관 → T8 breaking 명시+구 조항 grep 제거
9. sync/ 미머지 CLOSED PR 브랜치 오삭제 → §3.2:213 규칙을 T4 판정에 명시 반영(증명 없으면 보존)
10. diverged 영구 방치(기존 결함) — 이번 범위선 보고 강화(T6)까지, 자동 해소는 비목표

## 🔀 검토된 대안 (Alternatives Considered)

**대안 A — PR-and-merge 유지 + reconcile만 추가**
- *Good, because* 변경 최소, "fail-closed PR 보장" 조항 무수정
- *Bad, because* 실패 지점마다 잔여물 생성 구조가 그대로(회수로 뒷청소만), reset --hard 유실 기전 존속, gh 없으면 동기화 불능, 그리고 **그 PR 보장이라는 전제 자체가 사용자 발언으로 철회됨**
- **기각** — 목적(미러)에 의식(PR)을 계속 종속시키는 안

**대안 B — 전면 직push (예외 없음)**
- *Good, because* 가장 단순
- *Bad, because* ERP staging 직push=배포 사고(branch-lifecycle이 "현재 유일한 배포 사고 경로"로 명시)
- **기각** — 안전 조항 위반

**대안 C — 미러 기본 + 레포별 pr-manual 예외 + reconcile + 불변식 (채택)**
- *Good, because* 목적 직결·자기치유·ERP 게이트 유지·기존 직push 코드 재사용
- *Bad, because* LENS_SYNC_PR 의미 반전이라는 breaking, 문서 동기화 부담
- **채택**

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: "성공"의 정의가 문서가 아니라 스크립트 출력에 박힌다 — 이후 어떤 머신·버전에서 돌려도 불변식 미충족은 숨을 수 없다. agent/ 브랜치처럼 오너십 밖 이물질도 나이와 함께 매 런 노출된다
- **⚠️ 주의점**: T9 부채 일소에서 ERP sync PR 2건은 **머지=배포**다 — 내용(변경 파일) 보고 후 대표 결정 없이 절대 머지하지 않는다. agent/ PR 3건도 동일(내용 미상 작업)
- **🔀 Side Effect**: `/cs` 보고 포맷 변경 → 이를 파싱하는 쪽은 --json뿐(additive 유지로 무영향). branch-lifecycle §3.2의 "sync/는 PR로 제안" 서술 개정 필요(T8). SessionStart pull 훅은 pull 전용이라 무영향

## ⚠️ 리스크 레지스터

| ID | 리스크 | 트리거 | 영향 | 대응 | 중단 조건 |
|---|---|---|---|---|---|
| R1 | ERP에 미러 직push되어 배포 사고 | syncPolicy 미인식(config 부재/파싱 실패) | 높음 | T2 이중 방어(config+upstream 이름 staging 하드가드)+T7 테스트 | 테스트에서 ERP 모의 직push 1회라도 관측되면 T2 재설계 전까지 배포 중단 |
| R2 | reconcile이 미증명 브랜치 삭제 | 2단 판정 버그 | 높음 | 증명 실패=보존 기본값, atomic 이중 lease, §3.2:213 준수 | 모의 테스트에서 미증명 삭제 1건이라도 발생 시 T4 롤백 |
| R3 | 머지 실패 유실 기전 잔존 | reset 조건 수정 누락 | 높음 | T5 ③ + T7 "로컬 보존" 시나리오 고정 | 테스트 실패 시 배포 금지 |
| R4 | 멀티머신 구버전 혼재로 동작 상이 | 한쪽만 업그레이드 | 중간 | T9 해시 대조 배포 확인 | Mac Mini 해시 불일치 방치 시 T9 미완료 처리 |
| R5 | --json 스키마 회귀 | 필드 삭제/개명 | 낮음 | additive-only + json.tool 검증 | — |

## ❓ 미해결 질문

**차단 (답이 없으면 실행 불가)**
- (없음) — 메커니즘은 대표가 명시 위임("병합을 하던 뭘 하던"), 안전 예외(ERP)는 기존 규칙 준용

**비차단 (가정을 두고 진행)**
- agent/ 열린 PR 3건과 ops/task 브랜치 4건의 생사 — **가정**: T9에서 내용 요약 후 개별 결정(자동 처리 안 함) · **확인 시점**: T9
- ERP sync PR 2건(13·21일 전 chore)의 머지 여부 — **가정**: 변경 파일 목록 보고 후 대표 결정 · **확인 시점**: T9
- 레거시 PR 모드(LENS_SYNC_PR=1)를 쓰는 곳이 남아 있나 — **가정**: 없음(문서 grep으로 확인) · **확인 시점**: T8

## ✅ Review — 검증 (EARS)

**검증 전략**: 로컬 bare-remote fixture 기반 자동 테스트(T7)가 1차, 실워크스페이스 32레포 1회 실행+`gh pr list` 전수 조회가 2차. 결과는 명령 출력으로 대화에 남긴다.

| # | EARS | 확인 방법 | 통과 판정 | 종류 |
|---|---|---|---|---|
| 1 | WHEN base 브랜치가 dirty인 레포에서 /cs 실행, THEN 스크립트 SHALL base에 커밋 후 직push하고 sync/ 브랜치를 만들지 않는다 | T7 시나리오1 + 실레포 1회 | sync/ 생성 0·로컬==원격 | auto |
| 2 | WHEN push·머지 실패, THEN 스크립트 SHALL 로컬 커밋을 보존하고(reset 금지) failed로 보고한다 | T7 시나리오5 | 로컬 log에 커밋 잔존+failed 집계 | auto |
| 3 | WHEN 열린 sync/ PR이 있는 레포에서 실행, THEN 스크립트 SHALL 회수(머지+lease 삭제)하거나 사유와 함께 보고한다 | T7 시나리오4 + 실환경 T9 | 런 후 sync PR 0 또는 사유 표기 | auto |
| 4 | WHEN Returns_ERP_v20이 dirty, THEN 스크립트 SHALL 직push하지 않고 PR 생성까지만 수행한다 | T7 시나리오3 | 직push 0회 관측 | auto |
| 5 | WHEN task/agent 접두사 브랜치가 체크아웃된 레포, THEN 스크립트 SHALL commit·push 없이 건너뛰고 보고한다 | T7 시나리오2 | 커밋 0·버킷 보고 | auto |
| 6 | WHEN --json 실행, THEN 마지막 stdout 줄 SHALL 유효한 JSON이다 | `... --json \| tail -1 \| python -m json.tool` | exit 0 | auto |
| 7 | WHEN 전 태스크 완료 후 실워크스페이스에서 /cs 1회, THEN 보고 SHALL 불변식 기준 ✅/사유를 레포별로 표시하고 열린 sync PR 0이다 | T9 실행 로그 | 대표 육안+gh 전수 0건 | manual |

## 진행상황
- **작업 브랜치**: feat/cs-mirror-invariant (레포 `creeta-lens`, 생성 2026-08-14 23:4x KST, 시작 SHA `a55b41e`)
- **마지막 업데이트**: 2026-08-15
- **현재 경로**: Plan A — T1~T8 완료·검증 통과, T9(배포+부채 일소) 진행
- **Goal 달성**: 3/3 ✓ (QA verified=true, auto 전 항목 — EARS7 실워크스페이스 런만 manual 잔여)
- **재개 포인트**: T9 — 릴리즈(머지·태그 v3.31.0) → 양 머신 업그레이드 → 실런 1회 → 부채 PR 대표 결정

### 편차 기록 (계획 ↔ 실제)
- 테스트 6시나리오 → **10계열 88단언**으로 확대 (Codex 리뷰 high 5·med 3 반영: PR base 자격·gh 실패 fail-closed·split remote·merge queue 상태 확인·회수 후 로컬 ff — 계획에 없던 안전 보강)
- reconcile ②를 "gh 무의존 동작" → **gh 부재/조회실패 시 삭제 보류(fail-closed)**로 강화 (Supervisor·Codex 합치 지적)
- branch-lifecycle 개정 범위가 §3.2·§8 외 §2 표·§7 키 색인까지 — 목적 정합적 초과(Supervisor 판정: 위반 아님)
- bump-version.sh가 수동 선행 bump와 충돌 → plugin.json 되돌린 후 정식 경로 재실행으로 해소

### 실행 지표
- **추가 질문 수**: 0 (실행 중 사용자 되물음 없음)
- **편차 건수**: 4 (전부 상기 기록)
- **게이트**: 통과 (구조 valid·차단질문 0·Supervisor 93 PASS·Codex FAIL→수정 반영 재검증·QA verified=true)
