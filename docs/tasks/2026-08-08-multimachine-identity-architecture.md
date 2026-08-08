---
planner: cp
grade: deep
date: 2026-08-08
slug: multimachine-identity-architecture
scope: creeta-lens + livevil-setting + agentmemory
refs:
  - docs/rules/coding-principles.md (livevil-setting)
  - claude-code/bootstrap-sjrog.ps1 (livevil-setting)
  - skills/cs/SKILL.md, skills/ci/SKILL.md, skills/cu/SKILL.md
---

# 멀티머신 정체성 아키텍처 — 기록이 섞이고 사라지는 구조를 끊는다

## 🎯 What — 목표 (무엇이 가능해지는가)

**이 작업이 끝나면 가능해지는 것:**

- 어느 컴퓨터에서 물어봐도, 그 컴퓨터의 사실과 다른 컴퓨터의 사실이 **섞이지 않고** 구분되어 나온다.
- 한 컴퓨터에서 정리한 내용이 다른 컴퓨터에서도 **그대로 보인다.** 지금처럼 한쪽에만 있고 다른 쪽엔 아예 없는 일이 없어진다.
- 지운 것이 되살아나지 않는다. "이 플러그인 지웠다"고 하면 어느 컴퓨터에서 무슨 명령을 돌려도 다시 안 깔린다.
- 동기화 작업이 기록을 지워버리는 일이 없어진다.
- 에이전트가 "설정 X가 되어 있습니다"라고 말할 때, 그 말이 실제 파일과 일치한다.

**완료의 정의 (Done = ?):**

> 네 대(ADMIN·user·livev 윈도우 3대 + Mac Mini) 중 아무 두 대를 골라 같은 질문을 던졌을 때, 공통 사실은 양쪽에서 똑같이 나오고 머신 고유 사실은 각자 자기 것만 나온다.

## 🎬 사용 장면 (이게 되면 실제로 이런 장면이 나온다)

사용자가 **Mac Mini에 접속해** Claude Code 세션을 연다. 세션 시작 배너에 메모리 267개가 로드되고, 색인에 윈도우 PC에서 정리한 프로젝트 허브가 그대로 보인다. "Returns ERP 배포 어떻게 하지?"라고 물으면 **공통 규칙**(staging 먼저 → promote)이 나온다. 이어서 "이 컴퓨터 디스크 상태는?"이라고 물으면 **`machine: macmini` 태그가 붙은 메모리만** 근거로 쓰여서 SJ-OMEN의 디스크 이야기가 섞이지 않는다. 그리고 `/ci`를 돌리면 "이미 목록과 일치 — 설치 0건, 제거 0건"이 뜬다. `ponytail`이 다시 설치 후보로 올라오지 않는다.

## 🚧 비목표 (Non-Goals)

- **agentmemory 플러그인 자체를 포크하거나 고치는 것** — 남의 레포(rohitg00/agentmemory)다. 이번엔 공식 환경변수 스위치만 쓴다. 포크하면 업스트림 업데이트마다 재작업이 생긴다.
- **9,725건 관측 기록의 완전 재분류** — 사후 복원이 불가능한 구간이 있다(아래 함정 참조). 이번엔 "앞으로 안 섞이게" + "과거는 출처 표시"까지다.
- **Lens 스킬의 기능 개편** — `/cp`·`/cc`의 계획·실행 로직은 건드리지 않는다. 정체성·동기화 배선만 손댄다.
- **Mac Mini의 서비스 운영 구조 변경** — agentmemory 서버가 Mac Mini 한 대에 있는 단일 장애점 문제는 인지하되 이번 범위 밖.
- **비밀키·인증 재설계** — `AGENTMEMORY_SECRET` 등은 현행 유지.

## ❓ Why — 왜 해야 하는가

**푸는 문제 / 동기 (6하원칙)**

| | |
|---|---|
| **왜 지금** | 오늘 하루만에도 네 가지가 실제로 터졌다 — ① agentmemory 가 서로 다른 PC 두 대를 한 네임스페이스로 합쳐 놓았다(192세션) ② `/cu`가 winget 21건을 통째로 놓치고 "다 최신"처럼 보고했다 ③ `/ci`의 설치 목록에 사용자가 영구 제거한 플러그인 2개가 아직 살아 있어 실행하면 되살아난다 ④ **조사 중 나 자신이 "Mac Mini 메모리 0건"이라 오판**했다 — 메모리 색인이 머신별 실태를 구분하지 않고 서술한 탓이다. 넷 다 "기록이 현실과 다르거나, 어느 머신 것인지 모른다"는 같은 병이다. |
| **무엇을** | 프로젝트와 머신을 식별하는 **단일 규격**을 정하고, 그 규격을 메모리 2층(agentmemory·파일메모리)과 설치목록 4곳에 강제한다. |
| **어떻게** | 새 코드를 최소로. agentmemory는 이미 있는 공식 환경변수 스위치를 쓰고, 파일메모리는 이미 있는 설정 키를 실제로 켜고, 설치목록은 4개 중 1개만 남긴다. |
| **누구를 위해** | 사용자 본인. 그리고 이 기록을 읽고 일하는 모든 에이전트 세션. |
| **어디서** | 윈도우 3대(ADMIN·user·livev) + Mac Mini 1대. 배선의 SoT는 `livevil-setting`, 스킬 코드의 SoT는 `creeta-lens`. |
| **언제** | 지금. 관측 기록이 하루 수십 건씩 잘못된 네임스페이스에 계속 쌓이고 있어, 늦어질수록 마이그레이션 대상만 커진다. |

**안 하면 생기는 비용**

- 에이전트가 다른 컴퓨터의 경로·설치상태·서비스 상태를 이 컴퓨터 것으로 착각해 단언한다. 사용자는 그걸 검증하느라 매번 시간을 쓴다. (오늘 실제로 발생)
- 정리·삭제한 것이 되살아난다. 같은 결정을 반복해서 내려야 한다.
- 머신 고유 사실 130개가 무태그로 섞여 있어, 이 PC에서 물어도 Mac Mini의 디스크·서비스 상태가 근거로 딸려 나온다. 반대도 마찬가지다.
- `/cs` 동기화가 메모리 폴더를 되돌려 기록이 사라진다. (2026-08-02 실제로 17건 소실)

---

## 🔬 조사 보고 (실측)

> **조사 방식 고지**: 이 조사는 서브에이전트 fan-out 없이 **현 세션에서 직접 수행**했다(하네스 정책상 Agent 도구 미사용). Windows 로컬 파일·`~/.claude` 실물·agentmemory 서버 API·Mac Mini SSH 실측을 근거로 한다. 아래 숫자는 전부 오늘(2026-08-08) 측정값이다.

### ① agentmemory — 프로젝트 네임스페이스가 뒤엉켰다 (근본 증거)

프로젝트 키 산출 로직 (`session-start.mjs` `resolveProject()`):

```
1순위: 환경변수 AGENTMEMORY_PROJECT_NAME
2순위: git rev-parse --show-toplevel 의 마지막 폴더명
3순위: cwd 의 마지막 폴더명
```

**머신 차원이 없고, 대소문자 정규화가 없고, 워크스페이스 루트 개념이 없다.** 결과(전체 331세션 / 9,725 관측 전수):

| project 키 | 세션 수 | 실제 cwd | 무슨 일이 벌어졌나 |
|---|---:|---|---|
| `Git` | 119 | `c:\Users\user\Documents\Git` | ← **user PC** |
| `Git` | 61 | `c:\Users\livev\Documents\Git` | ← **livev PC** — 위와 **같은 네임스페이스로 병합됨** |
| `Git` | 11 | `C:\Users\livev\Documents\Git` | 대문자 드라이브 표기만 다른 같은 곳 |
| `Git` | 1 | `C:\Users\user\Documents\Git` | 〃 |
| `GIT` | 70 | `c:\Users\ADMIN\Documents\GIT` | ← **ADMIN PC(이 컴퓨터)** — 폴더명 대소문자 하나 차이로 **혼자 분리됨** |
| `GIT` | 6 | `C:\Users\ADMIN\Documents\GIT` | 〃 |
| `ADMIN` | 19 | `C:\Users\ADMIN` | cwd가 홈이라 **사용자명이 프로젝트명**이 됨 |
| `user` | 11 | `C:\Users\user` | 〃 |
| `livev` | 4 | `C:\Users\livev` | 〃 |
| `Returns_ERP_v20` | 4 | `C:\Users\user\Documents\Git\Returns_ERP_v20` | 하위 레포로 진입하면 또 갈라짐 |
| `Returns_ERP_v20` | 1 | `C:\Users\livev\Documents\Git\Returns_ERP_v20` | 같은 레포인데 머신 구분 없이 섞임 |
| `livevil-research` | 4 | `C:\Users\ADMIN\Documents\GIT\livevil-research` | 〃 |
| `livevil-research` | 2 | `C:\Users\user\Documents\Git\livevil-research` | 〃 |
| `livevil-contents` | 2 + 1 | user PC / ADMIN PC | 〃 |
| `livevil-boost` | 2 | user PC | 〃 |
| `Stage` | 4 | livev PC | 〃 |
| `Returns-Finance` | 1 | user PC | 〃 |
| `creeta-lens` | 1 | ADMIN PC | 〃 |
| `06. 계약서` | 1 | `c:\Users\user\Dropbox\01. Document\07. Returns\06. 계약서` | **Dropbox 계약서 폴더가 프로젝트로 등록** |
| `undefined` | 6 | (없음) | cwd 미기록 |

**두 가지 정반대 고장이 동시에 일어난다.**
- **잘못 합쳐짐**: 물리적으로 다른 컴퓨터 두 대(user·livev)가 `Git` 하나로 병합. 한쪽의 경로·설치상태·SSH 사실이 다른 쪽 회상에 그대로 나온다.
- **잘못 갈라짐**: 같은 논리 워크스페이스인데 `GIT`(ADMIN)과 `Git`(나머지)로 분리. 같은 주제를 물어도 어느 컴퓨터냐에 따라 다른 과거가 나온다.

### ② 파일 메모리 — 내용은 멀쩡, 배선이 머신마다 다르고 머신 구분이 없다

> ⚠️ **이 절은 최초 조사에서 오판했다가 실측으로 정정한 내용이다.** 처음에 `~/.claude/projects/<key>/memory` 를 세어 "Mac Mini 메모리 0건"이라 판단했으나, **그 경로는 `autoMemoryDirectory` 가 대체하는 바로 그 경로**였다. 0건은 고장이 아니라 설정이 정상 동작한 결과다. 정정 근거는 아래 실측표.

| 항목 | 실측 (2026-08-08) |
|---|---|
| 메모리 파일 수 | **267개** — sj-omen · Mac Mini **양쪽 동일** |
| 그중 머신 고유 사실 포함 | **130개 (49%)** — SSH 서버·디스크·launchd·경로·머신명 |
| 메모리 본문의 절대경로 하드코딩 | **0개** ← 걱정과 달리 깨끗하다 |
| Mac Mini `autoMemoryDirectory` | ✅ `"/Users/user/livevil-setting/claude-memory"` — **설정돼 있고 정상 동작** |
| Mac Mini 동기화 | ✅ cron `*/30` `claude-memory-pull.sh`. 18:00 로그: `Already up to date · c8fbc30 · 메모리 267개` |
| **sj-omen `autoMemoryDirectory`** | ❌ **없음** — 이 PC만 구식 `<JUNCTION>` 배선 (`memory` → `livevil-setting\claude-memory`, 2026-05-04 생성) |
| 머신 구분 태그 | ❌ **없음** — 130개 머신 고유 사실이 무태그로 공유 풀에 섞여 있다 |

**따라서 파일 메모리의 실제 문제는 두 가지로 좁혀진다.**

1. **배선 불일치** — Mac Mini·SJ_X1 은 정식 설정(`autoMemoryDirectory`), sj-omen 만 정션. 둘 다 같은 폴더를 가리켜 *결과는 같지만*, 어느 것이 진짜 배선인지 알 수 없고 정션은 `/cs` 의 `reset --hard` 사고 경로에 그대로 노출돼 있다.
2. **머신 구분 부재** — 이게 진짜 아픈 곳이다. 130개(49%)가 "이 머신에서만 참"인 사실인데 태그가 없어, sj-omen에서 물어도 Mac Mini의 디스크·launchd 사실이 근거로 딸려 나온다.

`MEMORY.md` 헤더가 *"정션 불필요"* 라고 단정했던 것도 절반만 맞았다 — Mac Mini·SJ_X1 기준으로는 맞고, **sj-omen 기준으로는 틀렸다.** 머신별 실태를 구분하지 않은 서술이 오해를 만들었다. (이번에 실태 기준으로 수정 완료)

### ③ 플러그인 설치 목록 — SoT가 4개로 갈라졌다

| # | 파일 | 성격 | 현재 내용 |
|---|---|---|---|
| 1 | `livevil-setting/claude-code/skills.json` | 부트스트랩 설치기가 읽음, git 동기화 | lens·context7·playwright·**ui-ux-pro-max**·**watch@claude-video**·agentmemory·insane-search |
| 2 | `livevil-setting/claude-code/settings.json` → `enabledPlugins` | 새 PC에 그대로 복사됨 | lens·context7·playwright·**ui-ux-pro-max**·**watch**·agentmemory (insane-search 없음) |
| 3 | `~/.claude/lens/manifest.json` | `/ci` 전용, **머신 로컬·비동기화** | lens 없음 / agentmemory·context7·insane-search·playwright·**ponytail**·**understand-anything** |
| 4 | `~/.claude/plugins/installed_plugins.json` | 실제 설치 상태 | lens·context7·playwright·agentmemory·insane-search |

**넷이 전부 다르다.** 그리고 3번에는 오늘 사용자 지시로 삭제한 `ponytail`과 2026-07-17에 "재설치·재추천 금지"로 영구 제거한 `understand-anything`이 **아직 살아 있다.** 지금 어느 컴퓨터에서든 `/ci`를 돌리면 둘 다 설치 후보로 올라온다. 제거 경로(`claude plugin uninstall`·`/lens-upgrade`·수동 삭제) 어느 것도 이 파일을 갱신하지 않는다.

### ④ settings.json — 배포본과 실물이 5곳 어긋남

| 키 | 실물(`~/.claude`) | 배포본(`livevil-setting`) |
|---|---|---|
| `env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | **없음** | `"1"` |
| `hooks.SessionStart` | gptaku 업데이트 체크 (절대경로 하드코딩) | **없음** |
| `enabledPlugins` | insane-search **있음**, ui-ux-pro-max·watch **없음** | 정반대 |
| `extraKnownMarketplaces` | CreetaCorp·agentmemory·gptaku-plugins | CreetaCorp만 |
| `switchModelsOnFlag` | `true` | **없음** |

새 컴퓨터를 배포본으로 세팅하면 **지금 이 컴퓨터와 다른 환경이 만들어진다.** 또한 실물의 SessionStart 훅은 `C:\Users\ADMIN\...` 절대경로를 박고 있어 그대로 배포하면 다른 사용자명 머신에서 깨진다.

### ⑤ `/cs` — Mac Mini의 진짜 레포를 못 본다 + 메모리를 되돌린다

스캔 루트 (`git-sync-all.sh`, `GIT_ROOTS` 미설정 시):

```
$HOME/Documents/Git · $HOME/Documents/GIT · $HOME/projects · $HOME/Projects · $HOME/git · $HOME/.claude/plugins/marketplaces
```

Mac Mini 실측: `GIT_ROOTS` 미설정. `~/Documents/GIT`는 존재하지만 안에 든 것은 2026-02월에 멈춘 옛 클론들(`ReturnERP-V1.1`·`Auction`·`ReturnsERP` 등)이다. **실제 작업 레포 4개는 홈 바로 아래**에 있다:

```
~/livevil-setting  (master, c8fbc30 — 오늘자 커밋까지 최신)
~/livevil-research
~/creeta-homepage
~/namane-mkt
```

`$HOME` 자체가 스캔 루트 후보에 없으므로 **`/cs`는 Mac Mini의 실제 작업 레포를 한 개도 못 본다.** 대신 옛 클론 더미를 훑는다.

그리고 `/cs`는 sync 브랜치 정리 과정에서 base 브랜치로 돌아가 `reset --hard origin/<base>`를 한다(`skills/cs/SKILL.md:49`). 그 대상에 `livevil-setting`이 포함되는데, 이 레포가 곧 **메모리 junction의 타깃**이다. 2026-08-02에 라이브 메모리 17개가 이 경로로 소실됐다(기록 있음).

### ⑥ Lens 버전 어긋남

| 머신 | Lens 버전 |
|---|---|
| ADMIN (이 PC) | **3.29.0** (오늘 업그레이드) |
| Mac Mini | **3.28.0** |
| user / livev | 미확인 (원격 접속 미시도) |

버전이 다르면 스킬 본문이 다르고, 규칙이 다르고, `/cu`·`/cs`의 동작이 다르다.

### ⑦ 하드코딩 — 예상과 다른 결과

- **creeta-lens 스킬 소스**: 하드코딩 **없음**. `${CLAUDE_PLUGIN_ROOT}` 치환을 쓴다(cp 20곳·ci 9곳·cs 6곳·cu 5곳). 세션에 보이는 `C:/Users/ADMIN/...` 경로는 런타임 치환 결과지 소스에 박힌 값이 아니다.
- **메모리 본문**: 절대경로 하드코딩 **0건**.
- **실제 하드코딩 지점**: ① `~/.claude/settings.json`의 SessionStart 훅 명령 ② `livevil-setting/claude-code/manifest.json`의 `workspaceDefault`가 `%USERPROFILE%\Documents\GIT`인데 프로젝트 `CLAUDE.md`는 `D:\GIT\`라고 적어 서로 모순.

---

## 🧰 실행 전략 & 자원

- **난이도**: **large** — 4대 머신 × 3개 레포(creeta-lens·livevil-setting·agentmemory 설정) × 2개 메모리 계층. 되돌리기 어려운 데이터 이동 포함.
- **권장 모델**: 설계·마이그레이션 판정은 **TOP**(현재 `fable`, 없으면 `opus`). 파일 편집·스크립트 작성 같은 기계적 단계는 **sonnet**. 단순 확인은 **haiku**.
- **병렬 실행**: **금지 구간 있음.** 메모리·설치목록을 만지는 단계는 **반드시 단일 직렬**. 과거에 `/cc` 병렬 워커가 git 인덱스를 공유해 서로의 미커밋분을 날린 실측 사고가 있다. 머신별 배포(P3)만 머신 단위 병렬 허용.
- **활용 스킬**: `/cs`(배포 후 동기화 검증) · `/cu`(버전 정렬 확인) · `/ci`(설치목록 수렴 검증). Playwright·context7 불필요.
- **기존 자원 재사용**:
  - `AGENTMEMORY_PROJECT_NAME` — agentmemory가 **이미 지원하는 공식 환경변수.** 포크 불필요. 이번 해법의 핵심 지렛대.
  - `autoMemoryDirectory` — Claude Code가 이미 지원하는 설정 키. 켜기만 하면 된다.
  - `livevil-setting/claude-code/install-skills.{ps1,sh}` — 양 OS 설치기가 이미 있다. `skills.json` 하나만 고치면 양쪽 반영.
  - `GIT_ROOTS` — `/cs`가 이미 지원하는 오버라이드. Mac Mini는 이것만 설정하면 해결.

## 🚫 DO NOT CHANGE

| 대상 | 왜 |
|---|---|
| `~/.claude/plugins/cache/agentmemory/**` | 남의 플러그인 소스. 고치면 업데이트마다 날아간다. 환경변수로만 제어. |
| `creeta-lens/skills/cp/**`, `skills/cc/**`의 계획·실행 로직 | 이번 작업은 정체성·동기화 배선 문제다. 계획 엔진은 정상 동작 중. |
| `AGENTMEMORY_SECRET` / `AGENTMEMORY_URL` 값 | 인증·서버 주소는 현행 유지. 이번 범위 밖. |
| 기존 267개 메모리 **본문** | 프론트매터에 필드 1개 추가만. 본문 재작성 금지 — 재작성은 사실 왜곡 위험. |
| `~/.claude/projects/**/*.jsonl` (트랜스크립트) | 470MB지만 정리는 별건. 이번 작업에서 건드리면 원인 분석이 불가능해진다. |
| Mac Mini `~/Documents/GIT` 옛 클론 더미 | 안 쓰는 건 맞지만 삭제는 별도 승인 사안. 이번엔 스캔 대상에서 빼기만 한다. |

---

## 🛠 How — 어떻게

### 핵심 설계 — 정체성 2축 규격

지금 고장난 이유는 **"어느 프로젝트인가"와 "어느 컴퓨터인가"를 한 개의 문자열로 표현하려 했기 때문**이다. 두 축을 분리한다.

```
workspace_id  = 논리 워크스페이스 (경로·대소문자·사용자명과 무관)
machine_id    = 물리 컴퓨터 (안정적 고정 식별자)
scope         = global | workspace | machine   ← 이 사실이 어디까지 참인가
```

**machine_id 표준 (신규 제정 — 이게 없어서 전부 어긋났다)**

| machine_id | 정체 | 사용자명 | 워크스페이스 경로 |
|---|---|---|---|
| `sj-omen` | 이 PC (Windows 11 Pro) | ADMIN | `C:\Users\ADMIN\Documents\GIT` |
| `sj-rog` | Windows 노트북 | user | `C:\Users\user\Documents\Git` |
| `sj-x1` | Windows 노트북 | livev | `C:\Users\livev\Documents\Git` |
| `macmini` | Mac Mini (중앙 서버) | user | `/Users/user` (홈 직속) |

**workspace_id 표준**: `livevil` 하나. 네 머신 모두 같은 레포 군을 다루므로 논리 워크스페이스는 하나다.

**두 메모리 계층에 역할을 다르게 준다** — 이게 이번 설계의 결정이다.

| 계층 | 역할 | 키 | 왜 |
|---|---|---|---|
| **agentmemory** | 머신별 **작업 로그** (자동 수집·양 많음·정제 안 됨) | `livevil@<machine_id>` | 머신을 키에 넣어 **섞임을 원천 차단**. 자동 수집분은 대부분 그 머신에서만 참이다. |
| **파일 메모리** | 머신 공통 **정제된 사실** (수동 큐레이션·양 적음) | 단일 풀 + `machine` 프론트매터 태그 | 공통 지식은 공유하되 머신 고유분은 태그로 필터. 이쪽이 진짜 SoT. |

Codex 교차 협의에서 나온 두 대안(A=키에 머신 포함 / B=키는 논리, 머신은 태그)을 **계층별로 나눠 적용**한 것이다. 양쪽 단점을 서로가 메운다 — agentmemory는 태그 누락 위험이 없고(키라서 강제됨), 파일 메모리는 공통 지식 중복이 없다(단일 풀이라서).

### Plan A — 권장 경로

#### 왜 이게 1순위인가

새로 만드는 코드가 거의 없다. `AGENTMEMORY_PROJECT_NAME`·`autoMemoryDirectory`·`GIT_ROOTS`는 **전부 이미 존재하는 스위치**다. 지금 상태는 "기능이 없어서"가 아니라 **"있는 스위치를 안 켜고 부트스트랩 스크립트로 우회했기 때문에"** 고장났다. 우회를 걷어내고 정식 스위치로 옮기는 것이 최소 변경이면서 플랫폼 중립이다.

#### 단계

**P0 — 동결 및 백업 (되돌릴 수 없는 것부터 보호)**

- [ ] P0-1: 네 머신 모두에서 마이그레이션 중 **새 세션 시작 금지** 공지. agentmemory 쓰기가 계속되면 건수 대조가 불가능해진다. (Codex 지적)
- [ ] P0-2: `livevil-setting/claude-memory` 267개를 타임스탬프 폴더로 통째 백업. junction 타깃이므로 **복사본은 반드시 junction 밖 경로**에 둔다.
- [ ] P0-3: agentmemory 서버 DB 스냅샷 (Mac Mini). 건수 기록: 331세션 / 9,725관측.
- [ ] P0-4: 네 머신의 `~/.claude/settings.json` · `~/.claude/lens/manifest.json` · `installed_plugins.json` 백업.
- [ ] 검증: 백업 폴더에서 파일 수 267 / 세션 331 / 관측 9,725 재확인.

**P1 — 규격 문서화 (SoT 먼저, 코드 나중)**

- [ ] P1-1: `livevil-setting/docs/rules/machine-identity.md` 신규 작성. 위 machine_id 표 + workspace_id + scope 3값 + "새 머신 추가 절차"를 담는다. 이 문서가 이후 모든 배선의 근거.
- [ ] P1-2: `MEMORY.md` 헤더의 거짓 문장 정정 — "`autoMemoryDirectory`가 가리키고 정션 불필요"를 실제 배선으로 교체.
- [ ] P1-3: 메모리 `claude-memory-multimachine-sync.md`를 실측 기준으로 재작성 (현재 내용이 미실현 설계를 실현된 것처럼 기술).
- [ ] 검증: 두 문서를 처음 보는 사람이 읽고 "내 컴퓨터의 machine_id는 무엇인가"에 답할 수 있는가 (수동).

**P2 — agentmemory 네임스페이스 정상화**

- [ ] P2-1: 각 머신 `~/.claude/settings.json`의 `env`에 `AGENTMEMORY_PROJECT_NAME` 추가. 값은 머신별로 다름: `livevil@sj-omen` / `livevil@sj-rog` / `livevil@sj-x1` / `livevil@macmini`.
- [ ] P2-2: 이 머신(sj-omen)에서 새 세션 1회 시작 → `memory_sessions`로 새 project 키가 `livevil@sj-omen`으로 찍히는지 확인.
- [ ] P2-3: 과거 331세션은 **재키잉하지 않는다.** 대신 서버에 `legacy-namespace` 표시를 남기고, 회상 시 "구 네임스페이스(신뢰도 낮음)"로 구분되게 한다. (재키잉 불가 이유는 아래 함정 참조)
- [ ] 검증: 네 머신에서 각 1세션 시작 후 project 키 4종이 각각 정확히 찍히는가 (auto).

**P3 — 파일 메모리 정식 배선 전환 (정션 → autoMemoryDirectory)**

> **범위 축소 (실측 반영)**: Mac Mini·SJ_X1 은 2026-08-05 에 이미 `autoMemoryDirectory` 로 전환돼 정상 동작 중이다(Mac Mini 267개 실측·cron pull 정상). **남은 것은 sj-omen 한 대**와 미확정 Windows 1대뿐이다. 즉 이 단계는 "새 방식 도입"이 아니라 **"이미 검증된 방식으로 뒤처진 1대를 따라붙이기"** 다 — 리스크가 크게 낮다.

- [ ] P3-1: **sj-omen** `~/.claude/settings.json` 에 `autoMemoryDirectory` 추가 — 값 `C:\Users\ADMIN\Documents\GIT\livevil-setting\claude-memory`.
- [ ] P3-2: 새 세션에서 메모리 267개가 잡히는지 **확인한 뒤에만** sj-omen 의 `<JUNCTION>` 제거. **순서 엄수** — 정션을 먼저 지우면 그 순간 메모리가 사라진다. (인접한 `memory.backup` 폴더는 건드리지 않는다)
- [ ] P3-3: `bootstrap-sjrog.ps1` Phase 5(junction) 삭제하고 settings.json 주입으로 대체. mac/linux 설치기에도 동등 로직 추가 — 새 머신이 다시 정션으로 세팅되는 것을 막는다.
- [ ] P3-4: 미확정 Windows 1대(`user`)가 온라인이 되면 동일 적용. 그 전까지는 현행 유지.
- [ ] 검증: **sj-omen 새 세션에서 메모리 파일 수 = 267** 이고 정션이 사라졌는가 (auto).

**P4 — 메모리에 머신 태그 부여**

- [ ] P4-1: 267개 프론트매터에 `metadata.machine` 필드 추가. 기본값 `global`.
- [ ] P4-2: 머신 고유 130개를 분류. **자동 분류 금지** — Codex 지적대로 오분류 위험이 크다. 파일명·제목에 머신명이 명시된 것(`ssh-server-sj-omen`·`ssh-server-sj-rog`·`ssh-server-sj-x1`·`macmini-*` 등)만 기계적으로 태깅하고, **애매한 것은 `unknown`으로 격리**한 뒤 사용 시점에 하나씩 판정한다.
- [ ] P4-3: `MEMORY.md` 색인 줄에 머신 태그 표기 규칙 반영.
- [ ] 검증: `machine: global` + `machine: <id>` + `machine: unknown` 합계 = 267, 본문 변경 0바이트 (auto — 해시 대조).

**P5 — 설치 목록 SoT 단일화**

- [ ] P5-1: `livevil-setting/claude-code/skills.json`을 **유일한 SoT**로 선언. 현 실제 설치 상태(lens·context7·playwright·agentmemory·insane-search)로 갱신하고 ui-ux-pro-max·watch@claude-video는 실제 사용 여부를 사용자에게 확인 후 반영.
- [ ] P5-2: `settings.json`의 `enabledPlugins`를 `skills.json`에서 **생성**하도록 변경 (수기 관리 중단).
- [ ] P5-3: `~/.claude/lens/manifest.json`을 `skills.json`에서 생성되는 **파생물**로 강등. 즉시 `ponytail`·`understand-anything` 제거하고 `excluded`로 이동(재설치 차단).
- [ ] P5-4: `/ci` 스킬에 "manifest가 skills.json보다 오래되면 경고" 가드 추가.
- [ ] 검증: 네 머신에서 `/ci` 드라이런 시 `toInstall`·`toRemove` 모두 0 (auto).

**P6 — `/cs` 안전화 및 커버리지 수정**

- [ ] P6-1: `/cs`에 **메모리 타깃 보호 가드** 추가 — `autoMemoryDirectory`가 가리키는 레포는 `reset --hard` 대상에서 제외하거나, 실행 전 해당 폴더를 별도 백업.
- [ ] P6-2: Mac Mini에 `GIT_ROOTS="/Users/user"` 설정하거나, `git-sync-all.sh`의 후보 목록에 `$HOME` 1레벨 스캔 추가.
- [ ] P6-3: Mac Mini `~/Documents/GIT` 옛 클론 더미를 스캔 대상에서 제외 (삭제 아님).
- [ ] 검증: Mac Mini `/cs` 실행 시 `livevil-setting`·`livevil-research`·`creeta-homepage`·`namane-mkt` 4개가 목록에 나오는가 (auto).

**P7 — 배포본·실물 수렴 및 버전 정렬**

- [ ] P7-1: `livevil-setting/claude-code/settings.json`을 실물 기준으로 갱신하되, **머신 의존 값은 렌더 시 치환되는 토큰으로** (메모리 디렉터리 절대경로 · agentmemory 프로젝트명 · SessionStart 훅 경로 3개). 토큰 표기는 `%%NAME%%` 형식을 쓴다.
- [ ] P7-2: SessionStart 훅의 `C:\Users\ADMIN` 절대경로를 `$HOME` 기반으로 교체.
- [ ] P7-3: `manifest.json`의 `workspaceDefault`와 프로젝트 `CLAUDE.md`의 `D:\GIT\` 모순 해소.
- [ ] P7-4: 네 머신 Lens를 동일 버전으로 정렬 (현재 sj-omen 3.29.0 / macmini 3.28.0).
- [ ] 검증: 배포본으로 신규 세팅한 환경과 현 sj-omen의 settings.json 차이가 템플릿 변수 항목뿐인가 (수동 diff).

#### 막힐 수 있는 지점 (→ Plan B 트리거)

| 지점 | 증상 | 대응 |
|---|---|---|
| P3-1 | `autoMemoryDirectory`를 넣어도 Claude Code가 무시하고 기존 기본 경로를 계속 씀 | → Plan B-1 |
| P3-4 | sj-omen 정션 제거 후 메모리 267개가 안 잡힘 | → Plan B-1 (정션 원복) |
| P2-1 | `AGENTMEMORY_PROJECT_NAME`이 SessionStart 훅에 전달 안 됨 (settings.json env가 훅 환경에 미주입) | → Plan B-2 |
| P4-2 | 머신 고유 130개 중 자동 판정 불가분이 절반 넘음 | → Plan B-3 |
| P0-1 | 다른 머신 사용자가 동결을 못 지켜 마이그레이션 중 쓰기 발생 | → 즉시 중단, P0 백업에서 재시작 |

### Plan B — Fallback 경로

#### Trigger

**P3-1 또는 P3-4에서 `autoMemoryDirectory`가 실제로 동작하지 않을 때** 즉시 전환. 판정 기준: 설정 주입 + 재시작 후 새 세션에서 메모리 파일 수가 267이 아니면 실패로 본다.

#### 왜 이 대안인가

`autoMemoryDirectory`는 Claude Code 2.1.74+ 에서만 동작한다. Mac Mini·SJ_X1 에서는 **이미 프로덕션 검증됐지만**, sj-omen 의 CLI 가 조건을 못 맞추거나 Windows 경로 표기에서 걸릴 가능성은 남는다. 정션은 검증된 동작이지만 Windows 전용이라 4대 통일이 불가능하고 `/cs` 사고 경로에 노출된다 — 그래서 1순위가 아니다.

#### 단계 (Plan B-1: 정션 유지 + mac 심링크)

- [ ] B1-1: Windows 3대는 현행 junction 유지.
- [ ] B1-2: Mac Mini는 `ln -s ~/livevil-setting/claude-memory ~/.claude/projects/<key>/memory` 심링크로 동등 배선. 키는 그 머신의 실제 프로젝트 키를 실측해서 정한다.
- [ ] B1-3: 머신마다 프로젝트 키가 다르므로 **머신별 심링크 목록**을 `machine-identity.md`에 명시.
- [ ] B1-4: `/cs` 보호 가드(P6-1)는 **필수** — 정션 방식에서는 reset --hard 사고가 이미 실증됐다.
- 트레이드오프: 플랫폼별 배선이 갈라지고, 워크스페이스 경로가 바뀌면 매번 다시 걸어야 한다. 자동화 유지비가 계속 든다.

#### 단계 (Plan B-2: 환경변수가 훅에 안 먹을 때)

- [ ] B2-1: `AGENTMEMORY_PROJECT_NAME`을 OS 사용자 환경변수(`setx` / `~/.zshrc`)로 승격.
- 트레이드오프: settings.json 한 곳에서 안 보이고, 새 머신 세팅 절차가 한 단계 늘어난다.

#### 단계 (Plan B-3: 머신 태그 자동 분류 실패 시)

- [ ] B3-1: 130개 전부 `machine: unknown`으로 두고, **회상 시점에 판정**하는 방식으로 전환. 판정된 것만 확정 태그로 승격.
- 트레이드오프: 완전 정리가 늦어지지만, 오분류로 잘못된 사실이 굳는 것보다 안전하다.

## 🔀 검토된 대안 (Alternatives Considered)

**대안 A — agentmemory를 포크해서 project key 로직 자체를 고친다**
- *Good, because* 환경변수 설정 누락 위험이 없다. 로직으로 강제되므로 새 머신에서도 자동으로 옳게 동작한다.
- *Bad, because* 남의 레포다. 업스트림이 업데이트될 때마다 재적용해야 하고, `/cu`가 업데이트를 자동 실행하므로 **조용히 원복된다.** 유지비가 무한하다.
- **기각** — `AGENTMEMORY_PROJECT_NAME`이라는 공식 스위치가 이미 있는데 포크할 이유가 없다.

**대안 B — agentmemory를 버리고 파일 메모리 한 층으로 통합한다**
- *Good, because* 계층이 하나면 정체성 문제도 하나다. 가장 단순하다.
- *Bad, because* agentmemory의 자동 수집(9,725건)이 사라진다. 파일 메모리는 수동 큐레이션이라 "무엇을 했는지" 로그 역할을 못 한다. 그리고 Mac Mini 서버·MCP 도구 20여 개가 이미 배선돼 있어 철거 비용이 크다.
- **기각** — 두 계층의 역할이 실제로 다르다(로그 vs 정제된 사실). 문제는 계층 수가 아니라 정체성 규격 부재다.

**대안 C — project key에 전체 경로를 그대로 쓴다 (agentmemory도 파일 메모리처럼)**
- *Good, because* 절대 안 섞인다. 구현이 가장 쉽다.
- *Bad, because* 지금 파일 메모리가 겪는 문제를 agentmemory에도 복제한다 — 머신마다 완전 격리되어 공통 지식 공유가 0이 된다. 대소문자·사용자명 문제도 그대로 남는다.
- **기각** — 한쪽 고장을 다른 쪽에 옮기는 것.

**대안 D — workspace_id를 레포 단위로 잘게 나눈다 (`livevil-contents@sj-omen` 등)**
- *Good, because* 회상 정밀도가 올라간다. 레포별로 깔끔히 분리된다.
- *Bad, because* 지금 이미 그렇게 되어 있고(하위 레포 진입 시 자동 분리), **그게 문제의 일부**다 — 같은 작업이 루트에서 열었냐 하위에서 열었냐에 따라 갈린다. 그리고 레포 개수 × 머신 개수 = 100개 넘는 네임스페이스가 생긴다.
- **기각** — 정밀도보다 일관성이 먼저다. 레포 구분은 태그·검색으로 충분하다.

### 🔀 Codex 교차 협의 (S4 — 하드 게이트, 통과)

호출: `codex exec`, 모델 = 순위표 1등 동적 선택, `reasoning_effort=high`, `service_tier=fast`, 상한 600초, 백그라운드. **RC=0, 본문 3,011바이트 정상 수거.**

**합의 (고신뢰 — 그대로 lock):**

- **근본 결함 지목이 일치했다.** Codex: *"프로젝트·머신 정체성에 대한 단일 규격과 SoT가 없다는 점. agentmemory는 basename만 사용해 서로 다른 머신을 합치거나 대소문자로 분리하고, 파일 메모리는 전체 경로로 머신별 분리된다. 동일한 사실을 두 계층이 서로 다른 범위로 해석하므로 혼합·유실·오귀속이 구조적으로 발생한다."*
- 대안 A(키에 머신 포함) / 대안 B(키는 논리 + 머신 태그)의 trade-off 분석이 일치.
- ⚠️ *"Mac의 메모리 0건은 Windows 전용 배선에 따른 플랫폼별 동작 불일치"* — Codex 는 **내가 준 잘못된 전제(0건)를 그대로 받아 추론**했다. 실측 결과 Mac Mini 는 267개 정상. Codex 의 잘못이 아니라 **입력 사실이 틀렸던 것**이며, 이는 "협의 상대에게 검증 안 된 사실을 주면 그 위에 정교한 오답이 쌓인다"는 교훈으로 남긴다. 나머지 지적은 전제와 무관하게 유효.
- *"네 SoT 중 어느 것이 생성·삭제 권한을 갖는지 정하지 않으면 제거한 플러그인이 계속 부활한다"* — P5 설계 근거 강화.

**분기 → 해소:**

- Codex는 A/B 중 **하나를 고르라**는 전제로 답했다. 이 계획은 **계층별로 나눠 적용**(agentmemory=A, 파일메모리=B)한다. 근거: Codex가 지적한 각 대안의 단점이 계층 특성과 정확히 상보적이다 — A의 단점("공통 지식 중복")은 자동 수집 로그에서는 문제가 아니고, B의 단점("태그 누락 한 번으로 재오염")은 수동 큐레이션 267건에서는 관리 가능한 규모다. 채택.

**Codex가 추가로 제기한 리스크 (이 계획에 반영됨):**

| Codex 지적 | 반영 위치 |
|---|---|
| 마이그레이션 중 쓰기 허용하면 누락·중복 발생. 쓰기 동결·원본 보존·건수/해시 대조·롤백 지점 필요 | P0 전체 |
| junction 타깃을 git 정리 대상에 둔 채 작업하면 다시 삭제될 수 있음 | P0-2(백업은 junction 밖), P6-1 |
| 태그 없는 머신 고유 130개 자동 분류는 위험. 수동 검토 또는 "출처 불명" 격리 필요 | P4-2, Plan B-3 |
| `Git`/`GIT`을 무조건 합치면 논리적으로 다른 작업까지 섞임 | P2-3 (재키잉 안 함) |
| 기존 키만으로 원래 머신을 항상 복원 불가 — 홈디렉터리 키·undefined는 확정 분리 불가 | 아래 "마이그레이션 함정" |
| 중복 observation 병합 시 시점 다른 사실·수정 기록·상충 기록이 하나로 합쳐져 이력 손실 | 비목표 (관측 병합 안 함) |
| 중앙 agentmemory 장애 시 네 머신이 동시에 기억 상실 — 단일 장애점 | 비목표에 명시, 후속 과제 |
| 동시 기록의 순서·충돌 해결 규칙 부재 → 최신 사실 판정이 비결정적 | ⚠️ 리스크 R6 |
| 경로 이동·repo rename·worktree·동일 basename 저장소가 새 분리/충돌 유발 | ⚠️ 리스크 R7 |
| 삭제·오염이 백업·동기화를 통해 전파될 수 있음 | ⚠️ 리스크 R3 |

### ⚠️ 사전 리스크 (Pre-mortem — Claude TOP)

**가장 크게 실패할 지점: P3(정션 → autoMemoryDirectory 전환) 순서 사고.**
정션을 먼저 지우고 설정이 안 먹으면 267개가 그 순간 사라진다. P0-2 백업이 junction **밖**에 있어야 하는 이유가 이것이다. 백업을 `livevil-setting` 안에 두면 백업과 원본이 같은 운명을 맞는다.

**두 번째: P5에서 `enabledPlugins` 생성으로 바꾸는 순간 현재 쓰는 플러그인이 빠질 수 있다.**
`skills.json`에 ui-ux-pro-max·watch가 있는데 실제로는 안 깔려 있다. 생성 방향을 잘못 잡으면(skills.json → 실물) 안 쓰는 플러그인 2개가 네 머신에 설치된다. **먼저 skills.json을 실물 기준으로 정정**한 뒤 생성으로 전환해야 한다.

**세 번째: 동결(P0-1)이 현실적으로 안 지켜진다.** 사용자가 네 머신을 동시에 쓰는 습관이면 마이그레이션 중 쓰기가 반드시 발생한다. 그래서 P2-3에서 과거 재키잉을 포기하는 설계가 오히려 안전하다 — 과거를 안 건드리면 동시 쓰기가 과거를 오염시킬 수 없다.

**Plan B 트리거 매핑**: 위 3개 모두 Plan A의 "막힐 수 있는 지점" 표와 매칭됨. 신규 트리거 추가 불필요.

### 마이그레이션 함정 (P2-3에서 과거를 재키잉하지 않는 이유)

| 대상 | 세션 | 복원 가능? | 판정 |
|---|---:|---|---|
| `Git` 192건 | user PC + livev PC 혼재 | cwd로 분리 **가능** (`\user\` vs `\livev\`) | 분리 가능하지만 안 함 — 아래 참조 |
| `GIT` 76건 | ADMIN PC | 단일 머신, **명확** | 〃 |
| `ADMIN`/`user`/`livev` 34건 | 홈디렉터리 세션 | 머신은 알지만 **어느 프로젝트인지 불명** | **복원 불가** |
| `undefined` 6건 | cwd 미기록 | **아무것도 모름** | **복원 불가** |
| `06. 계약서` 1건 | Dropbox | 프로젝트 아님 | 폐기 대상 |

40건(12%)이 원리적으로 복원 불가다. 그리고 재키잉은 9,725건 관측의 외래키를 전부 다시 쓰는 작업이라 실패 시 되돌리기가 매우 어렵다. **얻는 것(과거 회상 정밀도 소폭 향상) 대비 잃을 수 있는 것(9,725건 전체)이 비대칭이다.** 과거는 `legacy` 표시만 하고 신뢰도를 낮춰 다루는 것이 합리적이다.

---

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

**💡 시사점**

- 이 문제의 본질은 "동기화가 안 된다"가 아니라 **"무엇이 같은 것이고 무엇이 다른 것인지 정의한 적이 없다"** 이다. 규격(`machine-identity.md`)이 생기면 이후 새 머신 추가·새 도구 배선이 전부 이 문서 하나를 참조하면 된다.
- `AGENTMEMORY_PROJECT_NAME`·`autoMemoryDirectory`·`GIT_ROOTS` 세 스위치가 **이미 다 있었다.** 즉 이 고장은 도구의 한계가 아니라 배선 선택의 결과다. 앞으로도 "우회 스크립트를 짜기 전에 정식 스위치가 있는지 먼저 본다"가 원칙이 된다.
- 두 메모리 계층에 **다른 역할**을 명시적으로 준 것이 이번 설계의 핵심이다. 지금까지는 둘 다 "메모리"라고만 불러서 어느 쪽에 무엇을 넣을지 규칙이 없었다.
- **이번 조사 자체가 문제의 실례를 만들었다.** 나는 `~/.claude/projects/<key>/memory` 를 세어 "Mac Mini 0건"이라 단언했는데, 그 경로는 `autoMemoryDirectory` 가 대체하는 바로 그 경로였다. 머신별 실태를 구분하지 않은 색인 서술 + 검증 경로를 잘못 고른 조합이다. **"메모리 유무는 설정값이 가리키는 실제 폴더에서 센다"** 를 규격 문서에 못박았다.

**⚠️ 주의점**

- P3-2(정션 제거)는 **되돌리기 어려운 단계**다. P3-1 검증이 통과하기 전에는 절대 실행하지 않는다.
- P0-1 동결이 안 지켜지면 건수 대조가 무의미해진다. 지킬 수 없다면 P2-3(과거 미변경) 설계 덕분에 치명상은 아니지만, P4(태그 부여) 중 쓰기는 충돌을 만든다.
- 네 머신의 Claude Code 버전이 다르면 `autoMemoryDirectory` 지원 여부가 갈린다. P7-4(버전 정렬)를 P3보다 **먼저** 하는 것이 안전하다.
- 마이그레이션 전 구간에서 `/cs`를 돌리지 않는다. reset --hard 가드(P6-1)가 들어가기 전까지는 위험 구간이다.

**🔀 Side Effect (파급 범위)**

| 건드리면 영향받는 것 |
|---|
| **네 머신 전부의 `~/.claude/settings.json`** — 세션 시작 동작이 바뀐다 |
| **agentmemory 서버의 project 네임스페이스** — 기존 MCP 도구 20여 개의 회상 결과가 달라진다 |
| **267개 메모리의 프론트매터** — recall 필터링 동작이 바뀐다 |
| **`/ci`·`/cs`·`/cu` 세 스킬의 동작** — 기존 습관대로 돌리면 다른 결과가 나온다 |
| **`bootstrap-sjrog.ps1`** — 새 PC 세팅 절차가 바뀐다. 문서 갱신 필수 |
| **`livevil-setting` 레포** — 4대가 공유하므로 커밋 하나가 전 머신에 퍼진다 |

## ⚠️ 리스크 레지스터

| ID | 리스크 | 트리거 | 영향 | 대응 | 중단 조건 |
|---|---|---|---|---|---|
| R1 | 정션 제거 순서 사고로 메모리 267개 소실 | P3-2를 P3-1 검증 전에 실행 | **높음** (되돌리기 불가) | P0-2 백업을 junction 밖에 이중 보관 + P3-1 검증 통과를 하드 게이트로 | 백업 위치가 junction 안이면 즉시 중단 |
| R2 | `skills.json` 정정 전에 생성 전환 → 안 쓰는 플러그인 4대에 설치 | P5-2를 P5-1 전에 실행 | 중간 | P5 단계 순서 엄수, 드라이런 필수 | 드라이런 `toInstall`에 ui-ux-pro-max/watch가 뜨면 중단 |
| R3 | 오염된 메모리가 git 동기화로 4대에 전파 | P4 태그 오분류 후 커밋·푸시 | 중간 | 태그 변경은 별도 브랜치 → diff 검토 → 머지 | diff에 본문 변경이 1바이트라도 있으면 중단 |
| R4 | 마이그레이션 중 다른 머신에서 쓰기 발생 | 동결 미준수 | 중간 | P2-3 설계로 과거 오염 차단. P4 구간만 재시도 | 건수 대조 불일치 시 P0 백업에서 재시작 |
| R5 | `autoMemoryDirectory`가 특정 머신 CLI 버전에서 미지원 | P3-1 후 검증 실패 | 중간 | Plan B-1(정션·심링크)로 전환 | 두 머신 이상에서 실패하면 Plan A 전체 재검토 |
| R6 | 동시 기록 충돌 규칙 부재 → 최신 사실 판정 비결정적 (Codex 지적) | 두 머신이 같은 메모리 파일을 동시 수정 | 중간 | 메모리 수정은 git 머지로 해소. `/cs`의 PR 경로 강제 | 충돌 해소 없이 force push가 발생하면 중단 |
| R7 | repo rename·worktree·동일 basename이 새 분리/충돌 유발 (Codex 지적) | 향후 레포 이름 변경 시 | 낮음 | `machine-identity.md`에 "workspace_id는 경로·레포명과 무관하게 고정" 명시 | — |
| R8 | agentmemory 서버(Mac Mini) 장애 시 4대 동시 기억 상실 (Codex 지적) | 서버 다운 | 중간 | 이번 범위 밖 — **후속 과제로 등록**. 파일 메모리가 git에 있어 SoT는 살아남음 | — |

## ❓ 미해결 질문

**차단 (답이 없으면 실행 불가)**

- (없음) — 조사로 전부 해소됨.

**비차단 (가정을 두고 진행)**

- **ui-ux-pro-max와 watch@claude-video를 계속 쓸 것인가?** `skills.json`에는 있고 실제 설치는 안 돼 있다. **가정**: 안 쓰는 것으로 보고 `skills.json`에서 뺀다. **확인 시점**: P5-1 직전에 사용자에게 1회 확인.
- **sj-rog·sj-x1의 실제 상태는?** 원격 접속을 시도하지 않아 Lens 버전·설정·메모리 상태 미확인. **가정**: sj-omen과 유사하되 버전은 더 낮을 수 있다. **확인 시점**: P7-4 착수 시 SSH로 실측.
- **Mac Mini `~/Documents/GIT`의 옛 클론 더미(20개)를 삭제할 것인가?** **가정**: 이번엔 스캔 제외만 하고 보존. **확인 시점**: 이 계획 완료 후 별건으로 제안.
- **`06. 계약서` 등 Dropbox 폴더에서 세션을 여는 습관이 계속될 것인가?** **가정**: 드문 일. **확인 시점**: P2 이후 새 네임스페이스에 잡폴더가 다시 등장하면 재검토.

## ✅ Review — 검증

**검증 전략 (어디까지 · 어떻게 · 보고)**

- **범위**: 네 머신 전부. sj-omen은 로컬 직접, macmini는 SSH 원격, sj-rog·sj-x1은 SSH 원격(접속 가능 시) 또는 사용자 대행.
- **수단**: ① 파일 존재·내용은 로컬/SSH 셸 명령 ② agentmemory는 MCP `memory_sessions` 실호출 ③ 메모리 수는 파일 카운트 ④ 설치 목록은 `/ci --dry-run --json` ⑤ 본문 무변경은 sha256 대조.
- **보고**: 각 단계 통과/실패를 대화에 남긴다. 실패는 숫자와 함께 그대로 보고하고, 실패를 통과로 반올림하지 않는다.
- **금지**: 코드를 읽고 "됐을 것"으로 판정하지 않는다. 반드시 실행 결과로 판정한다.

| # | EARS (WHEN 트리거, THEN 주체 SHALL 응답) | 확인 방법 | 통과 판정 | 종류 |
|---|---|---|---|---|
| 1 | WHEN 네 머신 각각에서 새 세션을 시작하면, THEN agentmemory SHALL 서로 다른 4개의 project 키(`livevil@sj-omen`/`@sj-rog`/`@sj-x1`/`@macmini`)를 기록한다 | MCP `memory_sessions` 호출 후 최근 4세션의 project 필드 확인 | 4개 키가 정확히 일치, 중복 0 | auto |
| 2 | WHEN sj-omen 이 정식 배선으로 전환되면, THEN 파일 메모리 SHALL 267개 전부 로드되고 정션은 남지 않는다 | 새 세션 후 메모리 수 + `dir /AL` 로 정션 부재 확인 | `267` · JUNCTION 0개 | auto |
| 3 | WHEN 메모리 태깅(P4)이 끝나면, THEN 267개 파일의 본문 SHALL 단 1바이트도 변하지 않는다 | 태깅 전후 본문(프론트매터 제외) sha256 대조 | 불일치 0건 | auto |
| 4 | WHEN 어느 머신에서든 `/ci` 드라이런을 실행하면, THEN 결과 SHALL `toInstall` 0건 · `toRemove` 0건이다 | `node lib/install-sync.js --dry-run --json` | `toInstall:[] , toRemove:[]` | auto |
| 5 | WHEN `/ci` 드라이런을 실행하면, THEN 결과 SHALL `ponytail`·`understand-anything`을 설치 후보로 제시하지 않는다 | 위 JSON에서 두 이름 grep | 0건 | auto |
| 6 | WHEN Mac Mini에서 `/cs`를 실행하면, THEN 스캔 목록 SHALL 실제 작업 레포 4개(livevil-setting·livevil-research·creeta-homepage·namane-mkt)를 포함한다 | `/cs` 출력 또는 `--json` | 4개 모두 존재 | auto |
| 7 | WHEN `/cs`가 base 브랜치를 정리하면, THEN 메모리 디렉터리 SHALL 파일 수가 줄지 않는다 | 실행 전후 메모리 파일 수 비교 | 실행후 ≥ 실행전 | auto |
| 8 | WHEN 새 PC를 배포본으로 세팅하면, THEN 생성된 settings.json SHALL 현 sj-omen과 머신 의존 3개 항목만 다르다 | 배포본 렌더 결과 vs 실물 diff | 차이가 `%%NAME%%` 치환 항목 3개뿐 | manual |
| 9 | WHEN sj-omen에서 "Mac Mini의 SSH 설정"을 물으면, THEN 회상 SHALL `machine: macmini` 태그가 붙은 메모리만 머신 고유 사실로 제시한다 | 실제 질문 후 응답 내 출처 확인 | 다른 머신 사실이 macmini 것으로 단언되지 않음 | manual |
| 10 | WHEN 네 머신의 Lens 버전을 조회하면, THEN 전부 SHALL 동일 버전이다 | 각 머신 `claude plugin list` | 4개 버전 문자열 일치 | auto |

## 진행상황

- **마지막 업데이트**: 2026-08-08
- **현재 경로**: Plan A
- **완료**: P0(백업) · P1(규격 SoT) · P2(네임스페이스, 접속 가능 2대) · P3-1/P3-3 · P4(머신 태그 253개) · P5(설치목록 SoT 단일화) · P6 · P7
- **재개 포인트**: **P3-2 — sj-omen 정션 제거.** Claude Code 재시작 후 ① agentmemory project 키가 `livevil@sj-omen` 으로 찍히는지 ② 메모리 267개가 그대로 잡히는지 확인하고, **둘 다 통과해야만** 정션을 지운다.
- **설계 변경 (사용자 지시)**: machine_id 중앙 명단 폐기 → 각 머신이 자기 호스트명에서 스스로 도출. 접속 불가 머신 2대는 할 일이 아니라 현황으로만 기록.
- **범위에서 빠진 것**: P6-1(`/cs` reset 가드)은 v3.29.0 소스 실측 결과 **이미 안전**해서 불필요로 판정. P2-3(과거 331세션 재키잉)은 설계상 하지 않는다.
