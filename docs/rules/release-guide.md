# Lens Release Guide

버전 업데이트 시 반드시 이 문서를 따른다.

## 1. SemVer 규칙

`MAJOR.MINOR.PATCH` (예: 1.7.1)

| 변경 유형 | 버전 | 예시 |
|-----------|------|------|
| 하위호환 깨는 변경 | MAJOR 올림 | 스킬 이름 변경, 훅 인터페이스 변경, 설정 키 삭제 |
| 새 기능 추가 | MINOR 올림 | 새 스킬 (`/cp`), 새 훅, 새 lib 모듈, 새 config 옵션 |
| 버그 수정, 문서 개선 | PATCH 올림 | 정규식 수정, 오타 수정, 경로 통일, 기존 기능 보강 |

### 판단 기준

- 새 파일 추가 → MINOR 이상
- 기존 파일만 수정 → PATCH
- `plugin.json`이나 `hooks.json` 구조 변경 → MAJOR
- CHANGELOG에 "Added" 섹션이 있으면 → MINOR 이상
- CHANGELOG에 "Fixed"/"Changed"만 있으면 → PATCH

## 2. 버전이 기록된 파일 (`scripts/bump-version.sh` 일괄 처리)

**두 호스트의 매니페스트와 현재 배너를 동시에 같은 버전으로
업데이트해야 한다.** 수동 대신
**`bash scripts/bump-version.sh <X.Y.Z>`** 를 사용한다.

| # | 파일 | 위치 | 형식 |
|---|------|------|------|
| 1 | `.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | JSON value |
| 2 | `.codex-plugin/plugin.json` | `"version": "X.Y.Z"` | JSON value |
| 3 | `.claude-plugin/marketplace.json` | `"version": "X.Y.Z"` + `"ref": "vX.Y.Z"` | JSON value |
| 4 | `hooks/hooks.json` | `"description": "Lens vX.Y.Z ..."` | 문자열 |
| 5 | `hooks/session-start.js` | `Lens vX.Y.Z` | 문자열 |
| 6 | `skills/*/SKILL.md` | canonical dual-runtime entry version | YAML/Markdown |
| 7 | selected `references/claude-workflow.md` | Claude current banners | Markdown |
| 8 | `CLAUDE.md` | `Current: **vX.Y.Z**` + date | Markdown |
| 9 | `AGENTS.md` | `Current release: **vX.Y.Z**` | Markdown |
| 10 | `README.md` | `# Lens vX.Y.Z` | Markdown |
| 11 | `CHANGELOG.md` | newest release section | Markdown |

### 검색 명령어 (빠뜨린 곳 확인)

```bash
# 현재 버전 문자열이 모든 파일에 있는지 확인
grep -rn "v1.7.1" --include="*.json" --include="*.js" --include="*.md" .

# 매니페스트 버전 일치
grep -n '"version"' .claude-plugin/plugin.json .codex-plugin/plugin.json
```

## 3. 릴리스 절차 (Step by Step)

### Step 1: 코드 변경 완료

모든 기능 구현/버그 수정을 먼저 커밋한다. 버전 범프 커밋과 코드 변경 커밋을 **분리**한다.

```bash
# 코드 변경 커밋 (예시)
git add lib/plan-manager.js skills/cp/SKILL.md
git commit -m "fix: updatePlanStatus regex safety"
```

### Step 2: CHANGELOG.md 작성

파일 **맨 위**에 새 버전 섹션을 추가한다.

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added (vX.Y.Z)
- (MINOR일 때만) 새로 추가된 기능

### Changed (vX.Y.Z)
- 기존 기능의 변경사항

### Fixed (vX.Y.Z)
- 수정된 버그

### Removed (vX.Y.Z)
- (있을 때만) 삭제된 기능
```

규칙:
- 각 항목은 **굵은 제목** + 설명 + 해당 파일명
- Added/Changed/Fixed/Removed 순서
- 해당 없는 섹션은 생략

### Step 3: 이중 런타임 버전 범프 (자동 권장)

`bash scripts/bump-version.sh <X.Y.Z>` 로 위 표를 일괄 업데이트한다.

**주의사항**:
- `marketplace.json`은 `version`과 `source.ref` 2곳 모두 변경
- `session-start.js`는 4곳 (`activated` 메시지 2개 + `Session Startup` 제목 2개)
- canonical SKILL과 보존된 Claude reference 배너를 함께 갱신
- `CLAUDE.md`와 `AGENTS.md`의 현재 버전을 함께 갱신

### Step 4: 버전 범프 커밋

```bash
git add -A
git commit -m "chore: bump version to vX.Y.Z"
```

커밋 메시지 규칙: `chore: bump version to vX.Y.Z` (항상 이 형식)

### Step 5: Git 태그

```bash
git tag vX.Y.Z
```

- 접두사 `v` 필수 (v1.7.1, v2.0.0)
- 태그는 반드시 버전 범프 커밋에 생성

### Step 6: Push

```bash
git push origin master --tags
```

- `--tags` 플래그 필수. 없으면 태그가 remote에 안 올라감
- 커밋과 태그를 한 번에 push

### Step 7: GitHub Release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — 릴리스 제목" \
  --latest \
  --notes "$(cat <<'EOF'
## Added
- ...

## Fixed
- ...

**Released**: YYYY-MM-DD
EOF
)"
```

규칙:
- `--latest` 플래그: 최신 릴리스로 마킹 (가장 최근 버전에만)
- Release notes는 CHANGELOG.md의 해당 버전 섹션과 동일
- 릴리스 제목: `vX.Y.Z — 핵심 기능 요약` (예: `v1.7.0 — /cp Plan-First Execution`)

## 4. 과거 실수 사례 & 방지책

| 실수 | 결과 | 방지책 |
|------|------|--------|
| 태그 안 만듦 | 원격에 버전 추적 불가 | Step 5 필수 |
| `--tags` 빼고 push | 태그가 로컬에만 존재 | Step 6 명령어 복사해서 사용 |
| GitHub Release 안 만듦 | 유저가 변경사항 확인 불가 | Step 7 필수 |
| `session-start.js` 누락 | 세션 시작 시 구버전 표시 | 4곳 모두 grep으로 확인 |
| `marketplace.json` ref 미갱신 | 유저가 구버전 설치 | `source.ref` 확인 |
| 코드 변경과 버전 범프 한 커밋 | 태그가 코드 변경+범프 섞임 | 분리 커밋 |

## 5. 캐시 관련 주의사항

Claude Code와 Codex는 **버전 번호**로 플러그인 캐시를 관리한다.

- 코드를 변경했지만 버전을 안 올리면 → 기존 유저는 **변경사항을 못 봄**
- 캐시 경로: `~/.claude/plugins/cache/CreetaCorp/lens/{version}/`
- Codex 캐시 경로: `~/.codex/plugins/cache/CreetaCorp/lens/{version}/`
- 수동 캐시 삭제: `rm -rf ~/.claude/plugins/cache/CreetaCorp/lens/`
- 개발 중에는 `claude --plugin-dir ./lens`으로 캐시 우회

Codex의 normal install은 local path가 아니라 Git marketplace여야 한다.
릴리스 후 `codex plugin marketplace upgrade CreetaCorp`와
`codex plugin add lens@CreetaCorp`로 검증한다.

## 6. 버전 검증 체크리스트

릴리스 후 아래를 확인한다:

```bash
# 1. 로컬 태그 확인
git tag -l | tail -3

# 2. 원격 태그 확인
gh api repos/CreetaCorp/lens/tags --jq '.[].name' | head -5

# 3. GitHub Releases 확인
gh release list | head -5

# 4. origin과 동기화 확인
git status

# 5. Codex marketplace + install source/version 확인
codex plugin marketplace upgrade CreetaCorp --json
codex plugin add lens@CreetaCorp --json
codex plugin list --json

# 6. 두 host manifest 검증
claude plugin validate .claude-plugin/plugin.json
python ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```
