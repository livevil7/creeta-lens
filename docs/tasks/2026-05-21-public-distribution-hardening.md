---
name: public-distribution-hardening
plan_id: 2026-05-21-public-distribution-hardening
description: Lens를 범용 공개 배포 가능하게 — 하드코딩 경로/개인정보 제거 + 확인된 cross-platform 버그 수정
status: planned
created: 2026-05-21
---

# Lens 범용 공개 배포 하드닝 (Public Distribution Hardening)

## 🎯 Goal — 이 task 의 결과물

**완료 시점에 존재해야 하는 것:**
- 낯선 사용자가 `claude plugin install` 후 `/cs`를 써도 **본인 git identity로 커밋**되는 `scripts/git-sync-all.sh` (livevil7 강제 제거)
- manifest·README의 모든 repo URL이 **실재 레포 `livevil7/creeta-lens`** 를 직접 가리킴 (redirect 의존 제거)
- macOS(BSD sed)에서도 깨지지 않는 `scripts/bump-version.sh`
- `--dry-run`이 거짓 "nothing to do"를 내지 않는 `scripts/upgrade.py`
- 출하되는 skill/template에 **개인 레포명·개인 경로·끊긴 외부 포인터가 0건** (grep 검증 통과)
- `/cs`가 플러그인 마켓플레이스 clone도 fast-forward pull (read-only)

**성공 기준 (검증 가능):**
- [ ] `grep -rn "livevil7\|/c/Users\|C:/Users\|/Users/user" scripts/ skills/ hooks/ lib/ templates/ .claude-plugin/ README.md` 결과가 **0** (CHANGELOG/docs/history 제외 — 이력 보존)
- [ ] `grep -rn "CreetaCorp/lens" .claude-plugin/ README.md` 결과 **0** (마켓플레이스 *이름* `"name":"CreetaCorp"`·설치키 `lens@CreetaCorp`는 잔존 허용)
- [ ] `grep -rn "livevil-setting\|spotedcrypto\|livevil-contents\|namane" skills/ templates/ scripts/` 결과 **0**
- [ ] `bash -n` + macOS sed 시뮬레이션으로 `bump-version.sh` 양 플랫폼 통과
- [ ] `/cs` 한 번 실행 시 마켓플레이스 clone이 동기화 목록에 포함되어 pull됨
- [ ] 본인 다른 머신/테스트 git config로 `/cs` auto-commit 시 author가 livevil7이 **아님**
- [ ] `/cp` PLAN이 **md만 남기고 끝날 수 없음** — Phase 5.0 게이트가 `{id}.html`+board 부재를 차단(회귀)

**완료의 정의 (Done = ?):**

> 깨끗한 환경에서 `livevil7/creeta-lens`를 clone→install한 가상의 낯선 사용자가 `/c /cc /cp /cs /lens-upgrade`를 모두 실행했을 때, 개인정보 노출·끊긴 포인터·플랫폼 깨짐 없이 동작하고, 위 grep 검증이 전부 0건이면 done.

---

## Plan A — 권장 경로 (3-tier, `/cc` 병렬 실행)

### 왜 이게 1순위인가
- 발견 항목이 **독립적**이라 파일별 병렬 수정이 안전 (skill md / shell / python / config / template 서로 비충돌).
- tier 순서(BLOCKER→MAJOR→MINOR)는 "배포 차단도" 순. tier 1만 끝나도 "안전하게 배포 가능" 상태 도달.
- 모든 수정은 **surgical** — 해당 라인만. 인접 리팩토링/env var 추가 금지(아래 ❌ 참조).

### Tier 1 — 🔴 BLOCKER (정체성 노출 / 설치 깨짐) — 필수

- [ ] **B1. 커밋 작성자 하드코딩 제거** — `scripts/git-sync-all.sh:143`
  - 현재: `git -C "$repo" -c user.name="livevil7" -c user.email="livevil7@gmail.com" commit ...`
  - 수정: `-c user.name/email` 제거 → 사용자 본인 git config 사용. (config 미설정 시 git이 명확히 에러 — 정상)
  - verify: 테스트 git config로 commit 시 author ≠ livevil7
- [ ] **B2. stale `CreetaCorp/lens` repo URL → `livevil7/creeta-lens`** (마켓플레이스 *이름*과 설치키는 유지)
  - `.claude-plugin/plugin.json:8` (`url`), `:10` (`homepage`), `:11` (`repository`)
  - `.claude-plugin/marketplace.json:6` (`url`), `:21` (`homepage`), `:22` (`repository`), `:25` (`source.repo`)
  - `README.md:49` (git clone), `:60` (curl raw)
  - verify: `grep CreetaCorp/lens .claude-plugin README.md` → 0

### Tier 2 — 🟠 MAJOR (확인된 버그)

- [ ] **M1. `/cs`가 마켓플레이스 clone 동기화** — `scripts/git-sync-all.sh` ROOTS
  - `~/.claude/plugins/marketplaces/*` 를 스캔 대상에 추가. **단 read-only(pull-only)** — 플러그인 repo로 auto-commit/push 금지. (clean·non-ahead라 push는 자연히 미발생하나, 안전상 marketplace 경로는 push 스킵 가드 권장)
  - verify: `/cs` 실행 시 `CreetaCorp` clone이 pull 대상에 등장
- [ ] **M2. `bump-version.sh` BSD sed 호환** — `scripts/bump-version.sh:46,50,51,55,59,63,67,71,75,76,80` 등 `sed -i`
  - macOS는 `sed -i ''` 필요 → 현재 Linux 문법이라 Mac에서 깨짐. 플랫폼 분기 or temp-file rewrite로 portable화
  - verify: `bash -n` + macOS 시뮬
- [ ] **M3. `upgrade.py --dry-run` fetch 누락** — `scripts/upgrade.py` Phase 1 (`if not ctx.dry_run: git fetch`)
  - dry-run도 fetch는 수행(읽기 전용) → stale marketplace.json로 거짓 "nothing to do" 방지. pull/merge만 dry-run에서 skip
  - verify: dry-run이 실제 최신 버전 인식
- [ ] **M4. `upgrade.py` 하드코딩 `master` 브랜치** — `scripts/upgrade.py:342` `git pull --ff-only origin master`
  - 현재 브랜치 자동 감지(`rev-parse --abbrev-ref HEAD`)로 → `main` 기본 레포에서도 동작
  - verify: 브랜치명 동적
- [ ] **M5. push 타겟 = upstream remote** — `scripts/git-sync-all.sh:150` `push origin HEAD`
  - pull은 `@{u}`에서, push는 `origin` 고정 → 멀티 remote drift. `@{u}`의 remote(`${upstream%%/*}`)로 push
  - verify: upstream≠origin 레포에서 올바른 remote로 push
- [ ] **M6. 개인 스캔 루트 제거** — `scripts/git-sync-all.sh:35-36`
  - `$HOME/livevil-setting`, `$HOME/spotedcrypto-v2` 삭제 (개인 레포명). 범용 후보(`Documents/Git`, `projects`, `git` 등)만 유지. line 44 주석의 `~/livevil-setting` 예시도 일반화
- [ ] **M7. `/cp` HTML+board가 구조적으로 건너뛰어지는 결함** — `skills/cp/SKILL.md`
  - **근본 원인**: 산출물이 Phase 2.5(md)/2.6(HTML+board) 두 단계로 분리 + "md=SoT, HTML=파생 뷰" 프레이밍 + "필수" 경고 3회 반복(=구조가 강제 못 함의 증상) + Phase 5.0 진입검사에 **html/board 게이트 부재** → 에이전트가 md 만들고 멈추는 게 허용됨 (이번 세션 2회 발생).
  - **수정**: (1) Phase 5.0 "진입 전 자동 검사"에 **산출물 게이트** 추가 — `docs/tasks/{id}.md` + `{id}.html` + `board_<repo>.html` 3종 모두 존재 안 하면 Phase 5 진입 차단, Phase 2.6 회귀. (2) 산출물을 "md+html+board **3종 세트 = 1 deliverable**"로 재정의(생성 직후 atomic). (3) 중복 "필수" 경고는 게이트로 대체되므로 1곳으로 정리.
  - verify: html/board 없이 PLAN 진행 시 Phase 5 게이트가 차단

### Tier 3 — 🟡 MINOR (출하 문서/템플릿의 개인 컨텍스트)

- [ ] **N1. 끊긴 외부 SoT 포인터 제거** — `livevil-setting/docs/rules/coding-principles.md`
  - `skills/c/SKILL.md:77,321` · `skills/cc/SKILL.md:83,414,578` · `skills/cp/SKILL.md:79`
  - 원칙 본문은 이미 skill에 인라인됨 → 외부 포인터는 프로젝트 `docs/rules/coding-principles.md`로 일반화 (낯선 사용자에겐 끊긴 링크)
- [ ] **N2. cs/SKILL.md 개인 컨텍스트 일반화** — `skills/cs/SKILL.md`
  - `:10` "namane / livevil / creeta workspace family" → 일반 문구
  - `:26` 개인 레포 목록(`namane-blog`, `Returns-Homepage`…) → 일반화
  - `:47` 문서상 `$HOME/livevil-setting`, `$HOME/spotedcrypto-v2` → 범용 예시
  - `:102-103` auto-commit author 설명(`livevil7 <...>` 강제) → "사용자 git config 사용"으로 (B1과 일치)
- [ ] **N3. 예시 템플릿 개인 프로젝트명 일반화**
  - `templates/report-plan.example.html:44-45` (`livevil-contents / docs / reports` + 실제 task명)
  - `templates/report-history.example.html:43-44` (동일)
  - `templates/report-shared.css:2` 주석의 `livevil-contents` → `Lens`
- [ ] **N4. 모델 버전 문자열 rot 제거** — `skills/cc/SKILL.md:316` "Codex GPT-5.2" → "Codex" (버전 제거)
- [ ] **N5. codex-integration.md 하드코딩 경로** — `docs/rules/codex-integration.md:41,80`
  - `/c/Users/ADMIN/.vscode/extensions/...` → `$HOME/.vscode/extensions/...`
- [ ] **N6. `{lens}` placeholder 명확화** — `skills/cp/SKILL.md` 다수 (`{lens}/lib/...`, `{lens}/templates/...`)
  - `{lens}`가 정의 없이 쓰여 실행 시 모호 → `${CLAUDE_PLUGIN_ROOT}`로 통일 (하드코딩이 아니라 placeholder 명확화)

### 막힐 수 있는 지점 (→ Plan B 트리거)
- **M1 (마켓플레이스 sync)**: read-only 가드를 안 넣으면 `/cs`가 플러그인 repo에 auto-commit/push할 위험 → 신호: 테스트 `/cs`에서 `CreetaCorp`가 push 목록에 등장 → Plan B로.
- **B2 URL 변경**: marketplace `source.repo` 변경이 설치를 깨면(캐시 키 불일치) → 신호: 변경 후 `/lens-upgrade` 실패 → Plan B로.
- **M3/M4 upgrade.py**: 현재 설치 흐름과 결합도가 높아 수정이 회귀 유발 가능 → 신호: dry-run/real upgrade 회귀.

---

## Plan B — Fallback 경로

### Trigger
Plan A의 **M1에서 `/cs`가 마켓플레이스에 push 시도**, 또는 **B2 후 `/lens-upgrade`가 깨질 때** 즉시 전환.

### 왜 이 대안인가
Plan A는 한 PR(v3.6.4)로 묶어 처리 — 빠르지만 설치/sync 회귀 리스크. Plan B는 **tier별 분리 릴리스**(느리지만 각 단계 검증 후 진행, 회귀 격리).

### 단계
- [ ] Tier 1만 먼저 v3.6.4로 릴리스 → `/lens-upgrade` 정상 확인
- [ ] M1은 push-skip 가드를 명시 구현(marketplace 경로는 pull만) 후 별도 검증
- [ ] Tier 2/3를 v3.6.5로 분리 릴리스

---

## ❌ 범위 제외 (Karpathy Rule 2 — 요청 안 한 speculative 변경 거부)

에이전트 리뷰가 제안했으나 **의도적으로 제외**한 항목 (배포 안전성과 무관한 추측성 유연화):
- 신규 env var 남발: `CLAUDE_MEMORY_PATH`, `LENS_DOCS_DIR`, `LENS_DASHBOARD_DIR`, `LENS_MAX_AGENTS/PLANS`, `LENS_*_TIMEOUT_MS`, `LENS_MD_INLINE_CAP` — 아무도 요청 안 한 "설정 가능성"
- 엔터프라이즈 네트워크 드라이브 / read-only 캐시 대응 — 가상 시나리오
- `memory-store.js` version='1.0.0' 스키마 마이그레이션 신호 — 미래 투기
- `hook-utils.js` tempfile 엔트로피 증가 — pid+time+random 이미 충분
- `sync-pull.js` 다중 드라이브(C~F) 스캔 — `where.exe`+PATH fallback 이미 있어 graceful degrade
- `skill-scanner.js`/`REQUIRED_SECTIONS` 영어 키 — 설계상 의도(다국어 alias 별도)
- Korean 템플릿/Pretendard CDN — 의도된 설계(폰트 fallback 존재)
- `upgrade.py:51` `REPO_URL` 하드코딩 — 이미 실재 레포(`livevil7/creeta-lens`)이고 정본 배포원으로 정상
- `session-start.js` 버전 문자열 — `bump-version.sh`가 관리(M2 수정으로 신뢰성↑)

이력 기록(`CHANGELOG.md`, `docs/history/*`)의 옛 경로/이름 언급은 **과거 사실이므로 보존**.

---

## ⚠️ 사전 리스크 (Pre-mortem)

### Claude Opus 관점 (세션 컨텍스트 기반)
1. **M1이 가장 위험** — 마켓플레이스 clone을 ROOTS에 넣으면, 그 clone이 dirty/ahead가 되는 순간(`/lens-upgrade`가 stash를 남기거나 수동 편집 시) `/cs`가 **플러그인 자기 repo에 auto-commit+push**한다. 반드시 marketplace 경로는 pull-only 가드 필요. → Plan B Trigger와 매칭됨.
2. **B2의 `marketplace.json:source.repo` 변경 회귀** — 마켓플레이스는 `name=CreetaCorp`로 등록됐고 설치 시 `source.repo`를 clone 소스로 쓴다. 이미 로컬 clone remote는 `livevil7/creeta-lens`라 일치시키는 게 맞지만, 변경 직후 `/lens-upgrade`가 캐시 키 불일치로 깨질 가능성 → **변경 후 즉시 dry-run으로 검증**. → Plan B Trigger 매칭됨.
3. **B1 부작용** — git identity 미설정 사용자는 강제 author 제거 후 `/cs` auto-commit이 "commit failed"로 뜬다. 정체성 정확성과의 trade-off로 수용하되, 실패 메시지에 "git config user.email 설정 필요" 힌트 추가 권장 (신규 약점 → Plan A M1/B1 단계에 메시지 보강 추가).
4. **bump 체인 순서 의존** — v3.6.4 릴리스는 `bump-version.sh`로 버전 올리는데, 그 스크립트 자체가 M2 수정 대상. **M2를 먼저 머지·검증한 뒤** 그 고친 스크립트로 bump해야 함(자기 참조 순서).
5. **upgrade.py 회귀 = 자가 업데이트 brick 위험** — M3/M4가 self-update 경로를 건드림. 잘못되면 이후 `/lens-upgrade` 전체가 막힘 → 수정 후 `--dry-run`+실제 1회 안전 검증 필수.
6. **M7 산출물 게이트 과엄격 위험** — Phase 5.0에 html/board 존재 게이트를 넣을 때, board 빌드 실패(node 부재 등)가 PLAN 전체를 막으면 안 됨. → board 빌더 실패는 경고로 강등(html은 필수, board는 best-effort)하거나 node 부재 시 명확한 안내. 이 task md 자체가 게이트 통과 첫 사례(반례 테스트).

### Codex 관점
Codex pre-mortem 생략 — planning 단계 latency 절감. 실행(`/cc`) 진입 시 코드 수정 전 Codex 교차검증 권장(특히 M1/M3/M4 shell·python).

### Trigger 매핑 (Pre-mortem → Plan B 전환점)
- 리스크 1·2는 Plan A "막힐 수 있는 지점" 및 Plan B Trigger와 이미 매칭.
- 리스크 3은 신규 → Plan A의 B1/M1 단계에 "실패 메시지 힌트 보강" 미세 추가로 흡수.
- 리스크 4는 실행 순서 제약(M2 선행)으로 흡수, Plan B 불필요.

## 진행상황
- **마지막 업데이트**: 2026-05-21
- **현재 경로**: Plan A
- **재개 포인트**: Phase 5 사용자 검토 대기 (Approve/Modify/Execute)
