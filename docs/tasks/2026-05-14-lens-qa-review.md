# Lens 플러그인 코드 리뷰 + QA 보고서

## 목표

- [ ] CRITICAL 2건 해결 → hook 무한 대기 + fs 에러로 인한 session-block 위험 제거
- [ ] MAJOR 3건 해결 → version drift, bump-version 일관성, source-format 호환성 fix
- [ ] MINOR 4건 정리 → context 비용, 에러 처리 일관성, KNOWN_PLUGINS 표기 통일
- [ ] 각 fix에 대해 회귀 테스트 (lens-upgrade dry-run + version verify)

## 발견 사항 (총 9건, 영향도순)

### 🔴 CRITICAL — Session 차단 위험

#### #1. stdin blocking read in 4 hooks
**위치**: `hooks/post-tool-task.js:77`, `hooks/pre-tool-task.js:64`, `hooks/stop.js:61`, `hooks/session-start.js:25`

```js
const data = fs.readFileSync(0, 'utf-8');  // ← Claude Code가 stdin 안 보내면 무한 대기
```

**영향**: Claude Code의 hook timeout(5s)이 안전망이지만, timeout 발생 자체가 매 hook 실행마다 5초 지연. session-start면 startup이 5초 이상 느려짐.

**Fix**: stdin이 TTY면 즉시 종료, 아니면 read.
```js
if (process.stdin.isTTY) process.exit(0);
const data = fs.readFileSync(0, 'utf-8');
```

#### #2. fs.* operations without try/catch
**위치**: `hooks/session-start.js:25,44`, `lib/agent-tracker.js:38,99,123,129`, `lib/keyword-matcher.js:34,46`, `lib/memory-store.js:35,53,55`, `lib/plan-manager.js:47,123,129,154,171,341`

**영향**: 권한 문제 / disk full / 파일 corrupt 시 hook 통째로 throw → Claude Code가 hook을 "broken" 표기 → 매 session에서 에러 표시. 이번 세션에 본 `Hook UserPromptSubmit error` 패턴과 동일 메커니즘.

**Fix**: 각 fs call을 try/catch로 감싸고 graceful degradation. sync-pull.js의 fail-soft 패턴(`log(err); process.exit(0)`)을 다른 hooks에도 적용.

---

### 🟡 MAJOR — 기능 결함 / 유지보수성

#### #3. bump-version.sh 버그 4종 (이번 세션에서 모두 확인)
**위치**: `scripts/bump-version.sh`

- **(a) sed pattern mismatch**: `Lens v$CURRENT` 패턴이 `v3.2.1` 형식인데, SKILL.md 본문엔 `Lens v3.1` (patch 없는 minor)으로만 표기. → SKILL.md 변경 0건.
- **(b) CHANGELOG.md prepend sed failure**: multi-line substitution이 git bash sed에서 실패 (`unterminated 's' command`).
- **(c) grep -P locale issue**: Windows Git Bash에서 `grep: -P supports only unibyte and UTF-8 locales`. `LC_ALL=C.UTF-8` 명시 필요.
- **(d) verify 단계가 unbumped drift를 못 잡음**: 현재 `CLAUDE.md`에 `Current: **v3.1.0**`이 남아있음 (실제는 v3.2.2). v3.2.1→v3.2.2만 검증해서 v3.1.0의 stale 표기를 누락.

**Fix**: 
1. SKILL.md 본문도 `v3.2.2` full patch 형식으로 통일하거나, sed pattern을 `v[0-9]+\.[0-9]+\(\.[0-9]+\)\?`로 유연화
2. Python으로 CHANGELOG prepend (sed multi-line 회피)
3. 스크립트 첫 줄에 `export LC_ALL=C.UTF-8` 추가
4. verify 단계에 `git grep -E "v[0-9]+\.[0-9]+\.[0-9]+"` 후 NEW_VERSION 외 모든 version 잔재 경고

#### #4. plugin-registry.js의 source 형식이 Claude Code marketplace lookup과 충돌
**위치**: `lib/plugin-registry.js`

```js
source: 'ccplugins/awesome-claude-code-plugins',  // GitHub repo path
```

Claude Code 내부 코드가 이 source를 parse할 때 owner (`ccplugins`)를 marketplace ID로 잘못 해석 → `brand-guardian@ccplugins` 같은 합성 ID 생성 → marketplace에서 lookup 실패 → DEBUG 로그 + 잠재 hook 에러.

**Fix**: source를 구조화된 객체로 변경.
```js
source: { 
  marketplace: 'awesome-claude-code-plugins', 
  github: 'ccplugins/awesome-claude-code-plugins',
  pluginName: 'brand-guardian' 
}
```
또는 단순화: marketplace ID만 표기하고 GitHub URL은 별도 필드.

#### #5. upgrade.sh의 cache cleanup이 사용자 backup 삭제 위험
**위치**: `scripts/upgrade.sh` Phase 3

> "removes **all** old version folders under `cache/CreetaCorp/lens/`"

junction(`3.2.1 → 3.2.2`)이나 사용자가 의도적으로 만든 `.disabled` 백업도 함께 삭제될 가능성.

**Fix**: cleanup 대상에서 `.disabled` 접미사 폴더 + symlink/junction 제외. `find ... -not -name "*.disabled" -not -type l` 형식.

---

### 🟢 MINOR — 개선 기회

#### #6. skills/cc/SKILL.md 686줄 (context cost)
**위치**: `skills/cc/SKILL.md`, `skills/c/SKILL.md` (654줄)

매 session마다 Claude system prompt에 로드. 4개 skill (c/cc/cp/cs) 합계 ~2000줄. 자주 안 쓰는 패턴은 외부 docs로 분리하고 SKILL.md는 trigger + 핵심 명령 위주로 슬림화.

#### #7. sync-pull.js의 findBash() hardcoded paths
**위치**: `hooks/sync-pull.js`

Git for Windows의 표준 설치 경로 4개만 시도. 사용자 정의 경로(`scoop`, `chocolatey`, portable 등)는 못 찾음. `which bash` (Node `which` package) 또는 `process.env.GIT_BASH` env 우선.

#### #8. error handling 일관성 부족
**현재**: sync-pull.js는 fail-soft 명시. 다른 hooks는 throw가 가능.

**Fix**: 모든 hook 입구에 `process.on('uncaughtException', (err) => { console.error(err); process.exit(0); })` 패턴 통일.

#### #9. plugin-registry.js의 design-council source 표기 비일관
**위치**: `lib/plugin-registry.js`

```js
{ name: 'design-council', source: 'lens/skills/design-council', ... }
{ name: 'superpowers', source: 'travisvn/claude-code-superpowers', ... }
```

design-council은 lens 본체 내장 skill인데 외부 plugin 같은 표기. `source: { internal: true }` 또는 별도 `BUILTIN_SKILLS` 배열로 분리하면 #4 fix와도 일관성.

---

## 기술적 접근

### 우선순위

1. **즉시 fix (CRITICAL)**: #1 stdin guard + #2 try/catch — hook 안정성 즉각 개선
2. **이번 release (MAJOR)**: #3 bump-version 4종 일괄, #4 source 형식, #5 cleanup 안전화
3. **다음 release (MINOR)**: #6 context 슬림화, #7 bash detection, #8 일관성, #9 source 분리

### Test 전략

- 각 fix는 별도 commit
- bump-version.sh fix 후 dry-run으로 sed 패턴 매칭 검증 (실제 파일 변경 전)
- session-start hook fix 후 timeout 1초로 줄여서 stdin guard 동작 확인

### 회귀 방지

- `scripts/verify-version.sh` 추가: 모든 version 표기 grep해서 일관성 확인. CI에서도 실행.
- `tests/hooks/` 디렉토리 추가: 각 hook을 stub stdin과 stub Claude Code env로 실행해 throw 안 나는지 확인.

## ⚠️ 사전 리스크

### Claude Opus 관점 (세션 컨텍스트 기반)

**우려 1 — #4 source 형식 변경의 backward compatibility**: 기존 KNOWN_PLUGINS 사용자(installCmd 카피해서 직접 install하는 사용자)가 string source에 의존하면 깨짐. **완화**: 변경 시 새 필드 추가(`marketplaceId`)로 처리하고 기존 `source` 필드는 deprecated로 유지.

**우려 2 — #1 stdin guard의 부작용**: TTY 검사가 일부 환경(WSL, Conductor)에서 false negative 가능. **완화**: `isTTY` 외에 `process.env.CLAUDE_HOOK_DATA` 같은 명시 env가 있으면 stdin 안 읽도록 이중 가드.

**우려 3 — #5 cleanup 변경의 lens-upgrade 회귀**: junction 보존 후 다음 install이 "version already exists" 에러 가능. **완화**: lens-upgrade의 Phase 4(reinstall)가 `claude plugin install` force option을 쓰는지 확인.

**우려 4 — #3(b) Python 의존성**: bump-version.sh가 Python 호출 시 Windows에서 PATH 확인 필요. 사용자 메모리상 Python 3.13 설치되어 있어서 OK이지만 다른 환경 고려 필요.

### Codex GPT-5.2 관점

Codex 미호출 — 시간 절약 위해 본 세션에선 Opus 단독 pre-mortem. 필요 시 별도 phase에서 `codex exec` 호출하여 독립 분석 추가 가능.

## 진행상황

- **마지막 업데이트**: 2026-05-14
- 코드 리뷰 완료. 9개 이슈 식별.
- 사용자 검토 대기 중.

## 재개 포인트

다음 세션에서 이것부터:
- [ ] CRITICAL #1 stdin guard 4개 hook에 적용 (가장 빠른 안정성 향상)
- [ ] CRITICAL #2 fs.* try/catch 일관 적용 (lib/agent-tracker.js부터)
- [ ] MAJOR #3 bump-version.sh 패턴 통합 fix
