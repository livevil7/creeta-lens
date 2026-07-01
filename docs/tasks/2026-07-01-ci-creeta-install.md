---
planner: cpp
plan_id: ci-creeta-install
date: 2026-07-01
refs: [live-research-substrate]
---

# `/ci` — Creeta Install (설치목록 동기화 스킬)

> 사용자가 "내가 원하는 스킬 목록"을 적어두면, 이 스킬이 실제 설치 상태와 대조해 없으면 깔고 필요없는 건(명시적으로만) 지워 목록에 맞춘다. 누구나 자기 목록을 관리하는 범용 기능.

## 🎯 What — 목표 (사람 언어)

- 사용자가 **"내가 쓰는 스킬/플러그인 목록"을 한 파일**에 적어두면, `/ci` 한 번으로 이 PC가 그 목록에 맞춰진다 — 목록엔 있는데 안 깔린 건 설치, **목록이 "빼라"고 명시한 건** 제거.
- 목록을 **언제든 쉽게 고칠 수 있고**(파일 편집 or `/ci add`·`/ci remove`), **어떤 사용자든** 자기 목록을 갖는다(내 livevil 전용 아님).
- **실수로 남의 플러그인을 지우지 않는다** — 제거는 "빼라"고 명시한 것만, 그것도 항목별 확인 + 백업 후.

**🎬 사용 장면:** 새 PC나 정리 후, 사용자가 `/ci` 입력 → 스킬이 `~/.claude/lens/manifest.json`(내 목록)과 실제 설치현황을 대조해 **미리보기 표**를 띄운다("설치할 것 2 / 제거할 것 1 / 목록밖(그대로 둠) 3 / 이미 맞음 5"). 사용자가 확인 → 마켓플레이스 추가·플러그인 설치가 돌고, 제거 대상은 백업 후 항목별 확인받아 삭제. 끝나면 "목록과 일치" 보고. 목록을 바꾸고 싶으면 `/ci add watch@claude-video` 하면 파일에 추가된다.

**완료의 정의 (Done = ?):**
> `/ci`를 실행하면, manifest에 있으나 미설치인 플러그인이 설치되고, manifest가 excluded로 지정한 설치 플러그인이 (백업+확인 후) 제거되며, manifest에 없지만 설치된 "외부(foreign)" 플러그인은 **건드리지 않고 보고만** 되고, 최종적으로 "일치" 상태가 출력된다.

## ❓ Why — 왜 (6하원칙)

- **왜 지금**: 이번 세션에서 "설치돼 있어야 할 것 vs 실제" 대조를 수동으로 했다(gstack 잔존·agentmemory 소실·understand-anything 드리프트). 이 반복 작업이 **스킬 하나면 1분**이 된다. 멀티머신·재부트스트랩 환경에서 드리프트는 상시 발생.
- **무엇을**: per-user manifest ↔ 실제 설치 diff → 설치/제거(안전) 동기화 + 목록 관리 UX.
- **누구를 위해**: 나(멀티머신) + **Lens를 쓰는 모든 사용자**(각자 자기 목록).
- **어디서**: `~/.claude/lens/manifest.json`(목록, per-user) + `creeta-lens/skills/ci/SKILL.md`(스킬) + `creeta-lens/lib/install-sync.js`(결정론 diff/dry-run).
- **어떻게**: 레포 기존 패턴(`scripts/cu.py`가 `installed_plugins.json`을 읽고 scope/projectPath 보정하는 방식, `lib/*.js` Node 헬퍼) 재사용. 신규 스킬 1 + lib 1.
- **안 하면**: 매번 수동 대조(이번 세션처럼) + 머신마다 드리프트 방치.

## 🧰 실행 전략 & 자원

- **난이도**: medium (신규 스킬 + Node lib + 안전한 파괴적 연산).
- **권장 모델**: sonnet (구현), 제거 승인 게이트는 사람.
- **병렬 실행**: 단일 — lib와 SKILL.md는 강결합, 한 에이전트가 순차.
- **활용 스킬**: 없음(코어). 단 diff 로직은 이 세션서 실측한 `claude plugin list --json`(작동 확인) 계약에 근거.
- **기존 자원·시스템 (Codex 교정 — install-skills.ps1 아님, 이건 livevil-setting 소속)**:
  - `creeta-lens/scripts/cu.py`(497줄) — `installed_plugins.json` 직접 읽기 + `_plugin_scope_info`(scope/projectPath 보정) + `_resolve()`(CLI 절대경로) 패턴 **재사용**.
  - `creeta-lens/lib/board-builder.js`·`capability-audit.js` — Node lib 스타일 벤치마크.
  - `claude plugin list --json`(설치현황, 이 세션 실측 OK) + `claude plugin marketplace add/list` + `install <p>@<mkt> --scope user` + `uninstall` + `prune`.
  - `~/.claude/plugins/installed_plugins.json`(레지스트리, cu.py가 읽는 SoT — list --json 교차검증용).

## 📜 Constitution (이 작업 불변 조항)

1. **파괴적 연산 안전 우선 (Codex 핵심 교정)** — 제거는 **excluded 명시 항목만**. manifest에 없는 "foreign" 플러그인은 **절대 자동 삭제 금지**(보고만). 모든 uninstall은 **항목별 승인 + 백업 후**.
2. **Lens 자기보호** — `lens@CreetaCorp`(자기 자신)은 절대 제거 후보에 넣지 않는다(하드 가드).
3. **범용 (내 전용 아님)** — livevil-setting/skills.json·agentmemory 클라 배선 같은 **개인 특화 로직 금지**. manifest는 사용자가 채우는 빈 틀로 시작.
4. **Surgical** — 기존 스킬·lib 무수정. 신규 `skills/ci/` + `lib/install-sync.js`만 추가. cu.py는 **읽어서 패턴 참고**(수정 아님).
5. **크로스플랫폼** — deps는 OS별(winget/brew/apt). 스킬이 OS 감지해 명령 생성.

## 🛠 How — 빌드레디 실행

### 데이터 계약 — `~/.claude/lens/manifest.json` (per-user)

```jsonc
{
  "$schema": "lens-install-manifest/v1",
  "marketplaces": { "<name>": "<owner/repo>" },      // claude plugin marketplace add
  "plugins": [                                         // 설치되어 있어야 할 것 (managed)
    { "spec": "lens@CreetaCorp", "what": "..." }
  ],
  "deps": { "yt-dlp": { "winget": "...", "brew": "...", "apt": "..." } },
  "excluded": { "<plugin@mkt or name>": "제거 사유" }  // 명시적 제거 대상만
}
```

- [ ] **T1** manifest 스키마 + 로더 (없으면 빈 틀 생성)
      파일: `creeta-lens/lib/install-sync.js`
      변경: `loadManifest()` — `~/.claude/lens/manifest.json` 읽기, 없으면 `{marketplaces:{},plugins:[],deps:{},excluded:{}}` 빈 틀을 **생성**하고 안내. JSON 파싱 실패는 명확한 에러(줄 표기). 경로는 `os.homedir()` 기반(크로스플랫폼).
      검증: `node lib/install-sync.js --manifest-path` → `~/.claude/lens/manifest.json` 출력, 없으면 생성됨
      의존: 없음

- [ ] **T2** 설치현황 수집 (list --json + installed_plugins.json 교차)
      파일: `lib/install-sync.js`
      변경: `readInstalled()` — 1차 `claude plugin list --json`(spawn, this-session 실측 스키마: `[{id,version,scope,enabled,installPath}]`). 실패/빈값이면 2차 `~/.claude/plugins/installed_plugins.json` 직접 파싱(cu.py 방식). `claude` 절대경로는 cu.py `_resolve()` 포팅. marketplaces는 `claude plugin marketplace list` 파싱.
      검증: `node lib/install-sync.js --list-installed` → 현재 설치 플러그인 id 배열 출력(agentmemory@agentmemory 등)
      의존: T1

- [ ] **T3** diff 엔진 — managed / excluded / foreign / ok 4분류 (Codex 안전모델)
      파일: `lib/install-sync.js`
      변경: `diff(manifest, installed)` →
      - `toInstall` = manifest.plugins 중 미설치 (+ 필요한 marketplace 미등록분)
      - `toRemove` = manifest.excluded ∩ 설치됨 (**이것만 제거 후보**)
      - `foreign` = 설치됨 − manifest.plugins − excluded (**보고만, 제거 안 함**)
      - `ok` = manifest.plugins ∩ 설치됨
      - **하드 가드**: `lens@CreetaCorp`는 toRemove/foreign에서 제외(자기보호).
      검증: 단위테스트 `node lib/install-sync.test.js` — foreign 항목이 toRemove에 **절대 안 들어감** 케이스 통과
      의존: T2

- [ ] **T4** dry-run 프리뷰 렌더 (JSON + 사람용 표)
      파일: `lib/install-sync.js`
      변경: `preview(diff)` → `--json`이면 machine JSON, 아니면 표:
      ```
      설치할 것(2):  watch@claude-video, agent-reach@...
      제거할 것(1):  gstack (excluded: "안 씀")   ← 백업+항목별 확인
      목록밖·그대로 둠(3): sentry, foo, bar   ← 지우려면 manifest.excluded에 추가
      이미 맞음(5): lens, context7, playwright, ui-ux-pro-max, agentmemory
      ```
      검증: `node lib/install-sync.js --dry-run` → 4구획 표 출력, exit 0
      의존: T3

- [ ] **T5** SKILL.md — 오케스트레이션 (동기화 흐름)
      파일: `creeta-lens/skills/ci/SKILL.md`
      변경: frontmatter(name: ci, user-invocable, triggers: `/ci`, 동기화, install sync, 설치 동기화, インストール同期, 安装同步…) + 본문 흐름:
      1) `node ${CLAUDE_PLUGIN_ROOT}/lib/install-sync.js --dry-run --json` 실행 → diff 수거.
      2) 사람용 프리뷰 표 출력.
      3) **AskUserQuestion**(header "Creeta Install"): Approve(설치+제거 진행) / Install-only(제거 skip) / Cancel.
      4) toInstall: marketplace add → `claude plugin install <spec> --scope user`(fail-soft, 항목별 OK/경고).
      5) toRemove: **항목별로 다시 확인** + 백업(`~/.claude/lens/removed-backup-<ts>/`로 installPath 복사) 후 `claude plugin uninstall`.
      6) foreign: 목록 + "manifest.excluded에 추가하면 다음 /ci서 제거" 안내(실행 안 함).
      7) 최종 재-diff로 "일치" 확인 보고.
      검증: `claude plugin validate skills/ci` 또는 SKILL.md frontmatter 파싱 OK + 세션 재시작 후 `/ci` 노출
      의존: T4

- [ ] **T6** 목록 관리 UX — `/ci edit` · `/ci add <spec>` · `/ci remove <spec>`
      파일: `skills/ci/SKILL.md` (인자 분기) + `lib/install-sync.js`(`addPlugin`/`removePlugin`/`excludePlugin`)
      변경: `/ci`(동기화) / `/ci edit`(manifest 경로 안내+열기) / `/ci add <spec> [what]`(plugins[]에 추가) / `/ci remove <spec>`(plugins[]서 빼고 excluded로 이동). manifest 편집은 원자적 write(temp→rename).
      검증: `node lib/install-sync.js --add foo@bar` 후 `--list-manifest`에 foo 존재; `--remove foo@bar` 후 excluded로 이동
      의존: T5

- [ ] **T7** 릴리즈 배선 (신규 스킬 = bump-version.sh·START_HERE·CLAUDE·README 등록)
      파일: `scripts/bump-version.sh`(스킬 목록 13→14단계에 skills/ci 추가), `docs/START_HERE.md`(스킬 목록), `CLAUDE.md`(스킬 표), `README.md`(사용법), `CHANGELOG.md`
      변경: `/ci` 스킬을 버전-bearing 목록 + 사용자 문서에 등록. bump-version.sh는 `[N/총]` 카운트도 갱신.
      검증: `bash scripts/bump-version.sh <dryrun 또는 next>` 실행 시 skills/ci/SKILL.md도 버전 치환 대상에 포함
      의존: T5

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: 이번 세션의 수동 대조가 재사용 가능한 도구가 된다. manifest를 livevil-setting/skills.json에서 export하면 내 목록 즉시 이식 가능(별도).
- **⚠️ 주의점 (Codex)**: `claude plugin uninstall`은 되돌리기 번거로움 → **반드시 installPath 백업 선행 + 항목별 확인**. `claude plugin list --json` 스키마는 이 세션 실측이나 Claude Code 버전따라 변할 수 있음 → installed_plugins.json 폴백 필수. bump-version.sh `[N/13]` 카운트 안 늘리면 릴리즈 로그 어긋남.
- **🔀 Side Effect**: 신규 스킬 추가 → 스킬 개수 1↑(세션 스킬표·board). marketplace add가 죽은 마켓플레이스(과거 awesome-claude-code-plugins 등) 재유입 유발 안 하도록 manifest에 **사용자가 넣은 것만** 처리. lens 자기 제거 하드가드 없으면 self-uninstall 재앙 → Constitution 2조로 차단.

## ✅ Review — 검증 (EARS)

**검증 전략**: lib는 단위테스트(`node lib/install-sync.test.js`)로 diff 4분류·foreign 불가침·lens 자기보호 검증. SKILL.md는 dry-run 실제 실행(설치·제거 없이 프리뷰만)으로 확인. 파괴적 경로(uninstall)는 **백업 존재 확인 후**에만. staging/Playwright 불필요(로컬 CLI 도구).

| # | EARS | 확인 방법 | 통과 판정 | 종류 |
|---|------|----------|----------|------|
| 1 | WHEN manifest 없음, THEN 로더는 빈 틀을 SHALL 생성 | `rm 후 node install-sync.js --manifest-path` | 파일 생성됨 | auto |
| 2 | WHEN 설치됐지만 manifest·excluded에 없음, THEN foreign으로 SHALL 분류(제거 안 함) | `node install-sync.test.js` foreign 케이스 | toRemove에 없음 | auto |
| 3 | WHEN lens 자기 자신, THEN 제거후보에서 SHALL 제외 | 테스트: lens를 미등재로 두고 diff | foreign/toRemove 모두 없음 | auto |
| 4 | WHEN `/ci --dry-run`, THEN 4구획 프리뷰를 SHALL 출력하고 아무것도 설치/제거 안 함 | `node install-sync.js --dry-run` + `claude plugin list` 전후 비교 | 목록 불변 | auto |
| 5 | WHEN 제거 승인, THEN uninstall 전에 백업이 SHALL 존재 | 백업 폴더 확인 | `~/.claude/lens/removed-backup-*/` 존재 | manual |
| 6 | WHEN 세션 재시작, THEN `/ci`가 스킬 목록에 SHALL 노출 | 세션 스킬표 | /ci 존재 | manual |

## 🔀 Codex 교차 협의

- **분기→해소**: 내 초안이 `install-skills.ps1`(livevil-setting)을 모델로 삼았으나 **Codex가 "그건 creeta-lens에 없다"고 정확히 지적** → 검증 결과 부재 확인 → 레포 내 `scripts/cu.py`(installed_plugins.json 직접읽기+scope 보정) 모델로 교체.
- **합의(고신뢰)**: (a) manifest 미등재 자동 제거는 위험 → managed/excluded/foreign 분리 + 항목별 승인. (b) `claude plugin list --json` 계약은 레포 코드로 미검증 → installed_plugins.json 폴백 병행(단, 이 세션서 --json 실측 OK라 1차 채택).
- **Codex 신규 리스크**: uninstall 되돌리기 어려움 → 백업 하드요구(반영 T5/EARS5).

## 진행상황
- **마지막 업데이트**: 2026-07-01
- **현재 경로**: 계획 승인 대기
- **재개 포인트**: 승인 시 T1(lib 로더)부터. substrate와 독립(병렬 가능).
