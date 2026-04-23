# Changelog

## [3.1.0] - 2026-04-23

### Added (v3.1.0)

- **`/cp` PLAN 모드 Phase 2.5 Pre-mortem** — 계획 문서 저장 직후 Opus + Codex GPT-5.2 병렬 pre-mortem 실행. 결과를 계획 문서의 `## ⚠️ 사전 리스크` 섹션에 출처(Claude Opus / Codex GPT-5.2)를 병기해 저장. Codex CLI 미설치 환경에서는 Opus 단독 fallback + 명시 표기. `skills/cp/SKILL.md`
- **Supervisor 조건부 opus 승격** — `/c`, `/cc` Phase 4 Supervisor가 Worker 할당에 `opus`가 포함된 경우 자동으로 `sonnet → opus`로 승격. Worker (Hard) = opus인데 Supervisor = sonnet이었던 역전 구조 해소. 단순 태스크는 비용 절약을 위해 sonnet 유지. Supervisor 프롬프트에 "당신의 모델은 {assigned_model}" 자기인식 명시. `skills/c/SKILL.md`, `skills/cc/SKILL.md`
- **Worker 스킬 강제 할당 (Skill Enforcement)** — Worker 프롬프트의 기존 "할당된 Skill (있는 경우)" 참고 블록을 "필수 실행 스킬 (SKIP 금지)" 명령문으로 교체. 첫 액션 = Skill invoke 강제, 완료 보고 첫 줄에 `Skill invoked: /{skill_name}` 필수. `skills/c/SKILL.md`, `skills/cc/SKILL.md`
- **Supervisor 감사 조항** — Supervisor 프롬프트에 "스킬 호출 감사" 섹션 추가. Worker 완료 보고에서 `Skill invoked:` 라인 존재 여부를 grep으로 검증, 스킬 할당됐는데 누락 시 해당 서브태스크 **점수 0점** + 재작업 지시. `general`로 명시된 일반 태스크는 감사 제외. JSON 출력 스키마에 `skill_audit` 필드 추가. `skills/c/SKILL.md`, `skills/cc/SKILL.md`
- **Codex CLI 통합 규칙** — 신규 `docs/rules/codex-integration.md` 문서. Codex CLI 감지 로직(PATH/VSCode 확장 경로/fallback), 인증 확인, 표준 호출 패턴(`codex exec --skip-git-repo-check`), 응답 파싱 규칙(`codex` ~ `tokens used` 본문 추출), pre-mortem 프롬프트 템플릿, 에러 처리, 비용/성능 가이드

### Changed (v3.1.0)

- **`/cp` 계획 문서 템플릿** — `## 기술적 접근`과 `## 진행상황` 사이에 `## ⚠️ 사전 리스크` 섹션 placeholder 자동 추가. Phase 2.5에서 채움. Phase 2와 2.5를 분리된 Write 작업으로 처리해 원자성 보장 (Phase 2.5 실패해도 계획 문서 이미 저장됨). `skills/cp/SKILL.md`
- **Model Assignment Table** — `/c`, `/cc` 모두 Supervisor 행을 `sonnet` → `sonnet (default) / opus (when any Worker uses opus)`로 갱신
- **버전 동기화** — 9곳 버전 문자열 `v3.0.0` → `v3.1.0`: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (2곳), `hooks/hooks.json`, `hooks/session-start.js` (4곳), `skills/c/SKILL.md` (2곳), `skills/cc/SKILL.md` (2곳), `skills/cp/SKILL.md` (2곳), `CLAUDE.md`
- **docs/history/ 정리** — v3.0.0 릴리스 시 완료됐으나 `docs/tasks/`에 남아있던 3개 task 파일을 `docs/history/`로 이관

## [3.0.0] - 2026-04-11

### Added (v3.0.0)

- **`/c` v3.0 — Sequential task execution engine** — Complete rewrite from skill navigator to full execution engine. 6-phase workflow: Leader analyzes → Approval → Worker (sequential) → Supervisor → QA → Report. `skills/c/SKILL.md`
- **`/cc` v3.0 — Parallel task execution engine** — Complete rewrite with unified architecture. Same 6-phase workflow as /c, but Phase 3 deploys N workers in parallel. `skills/cc/SKILL.md`
- **`/cp` v3.0 — Documentation management engine** — Auto-detects mode: plan tasks, record completions, organize project docs. Three modes: Plan (task description given), Done (no args + completed tasks), Organize (no args + messy docs). `skills/cp/SKILL.md`
- **Model assignment system** — Workers assigned haiku/sonnet/opus based on task difficulty. Leader uses current model, Supervisor uses sonnet, QA and Monitor use haiku
- **Monitor agent** — Background haiku agent reports progress every 5 minutes during execution. Auto-terminates when all workers complete
- **Task approval system** — Mandatory AskUserQuestion before any execution showing task table with assigned skills, models, and difficulty levels
- **docs/ document structure** — New project-wide documentation convention: `docs/tasks/` (active work), `docs/history/` (completed records), `docs/rules/` (project rules). Folder location = status
- **TodoWrite integration** — All /c and /cc executions create and update TodoWrite entries for real-time progress tracking
- **Worker skill reporting** — Leader reports which gstack/installed skill is assigned to each worker before execution starts

### Changed (v3.0.0)

- **`/c` completely rewritten** — From 82-line skill navigator to 600-line sequential execution engine with Supervisor/QA pipeline
- **`/cc` completely rewritten** — From 368-line orchestration to 627-line parallel execution engine with unified architecture matching /c
- **`/cp` completely rewritten** — From 208-line planning tool to 378-line documentation management engine with auto mode detection
- **CLAUDE.md slimmed** — Removed Release Checklist (55 lines), Publishing section, Recent Changes. Added fixed pointers to docs/tasks/, docs/history/, docs/rules/. 213 → 128 lines
- **docs/ restructured** — DOCUMENTATION-GUIDE, DOCUMENT-CONVENTIONS, RELEASE-GUIDE, PUBLISHING-GUIDE moved to `docs/rules/`. Analysis reports and work plans moved to `docs/history/`. New `docs/tasks/` for active work
- **Version strings** — All 9 locations bumped from v2.0.0 to v3.0.0

### Removed (v3.0.0)

- **`/c` skill navigator mode** — Replaced by full execution engine (skill inventory still available with `/c` no args)
- **`.lens/results/` save path** — Replaced by `docs/` structure
- **CreetaDocs/ folder** — Replaced by `docs/tasks/` for /cp output
- **CLAUDE.md bloat** — Release checklist, publishing guide, change log sections removed (moved to docs/rules/ or CHANGELOG.md)

## [2.0.0] - 2026-04-06

### Added (v2.0.0)

- **gstack skill priority matching** — `/c` now prioritizes gstack skills over other plugins when matching user requests. 12 common mappings (QA→/qa, debug→/investigate, review→/review, etc.)
- **Agent skill assignment** — `/cc` Leader assigns gstack skills to Workers, Supervisors, and QA agents based on sub-task domain. Mapping table for Worker/Supervisor/QA roles
- **Recommended Skills table in plans** — `/cp` generates a skill-to-step mapping table in every planning document, showing which gstack skill matches each step

### Changed (v2.0.0)

- `/c` Matching Rules section expanded with gstack priority rule
- `/cc` Core Principle section expanded with "Skill Assignment — gstack Priority" subsection
- `/cp` Technical Approach section expanded with "Recommended Skills" subsection
- Version bump: 1.9.0 → 2.0.0 (MAJOR — core matching logic change)

## [1.9.0] - 2026-03-31

### Changed (v1.9.0)

- **`/cc` completely rewritten** — Leader-Worker-Supervisor-QA team orchestration replacing the previous parallel multi-agent approach
- **General-purpose Workers** — Workers are now general-purpose agents, not limited to installed skills
- **Mandatory user approval** — User approval required before execution (Phase 1.3)
- **QA Verification phase** — Phase 5 added with actual testing via Playwright/Bash/curl
- **Supervisor quality review** — Scoring system introduced (80+ = pass)
- **Max 5 iteration feedback loop** — Failed sub-tasks re-dispatched with Supervisor feedback
- **English-only** — All output and documentation switched to English for international distribution
- **Rebranded** — Repository moved from `Creeta-creet/creet` to `CreetaCorp/lens`

## [1.7.1] - 2026-03-02

### Fixed (v1.7.1)

- **Storage path consistency** — Unified all documentation references to `docs/` (was mixed `.lens/plans/` and `docs/`). Code already used `docs/` correctly; docs now match.
- **`cancelled` status support** — Added `cancelled` to `validStatuses` in `updatePlanStatus()` with `cancelledAt` timestamp tracking. Was missing despite being documented in DOCUMENT-CONVENTIONS.md.
- **Regex safety in `updatePlanStatus()`** — Rewrote to extract YAML frontmatter first before replacement, preventing greedy regex from matching body content.
- **8-language plan headers** — Added Spanish, French, German, Italian section headers to `generatePlanContent()` (was only EN/KO/JA/ZH).
- **YAML frontmatter parser** — Added null/boolean/integer type conversion in `parsePlanFrontmatter()`.
- **JSON parse safety** — `savePlanState()` now gracefully resets on corrupted `plan-state.json` instead of crashing.
- **CLAUDE.md exports list** — Updated from 5 to 15 exported functions including `getStatePath()`.

### Changed (v1.7.1)

- All version strings unified to v1.7.1 across plugin.json, marketplace.json, hooks.json, CLAUDE.md
- `skills/cp/SKILL.md` save location simplified to 2-tier priority (planDir → docs/)
- `docs/DOCUMENT-CONVENTIONS.md` updated with correct storage paths, slug rules, folder structure
- `README.md` added `saveSynthesisResults` and `resultsDir` config options

## [1.7.0] - 2026-02-28

### Added (v1.7.0)

- **`/cp` — Lens Plan**: New skill for plan-first execution. Generates a work plan document (작업계획서) before executing, saves it as a markdown file, presents for user approval, then executes. 7-phase workflow: Scan → Analyze → Generate Plan → Approve → Execute → Post-Exec Update. `skills/cp/SKILL.md`
- **Plan Manager module** — Plan document file naming (`YYYY-MM-DD-slug.md`), state tracking (`plan-state.json`), slug generation (Korean/Japanese/Chinese character support), plan listing and summary. `lib/plan-manager.js`
- **`planDir` config option** — Custom plan file directory override (default: project `docs/`). `lens.config.json`
- **`defaultPlanLanguage` config option** — Force plan document language (default: auto-detect from user). `lens.config.json`
- **`recordPlanCreation()`** — New function in memory-store for tracking plan creation in session memory. `lib/memory-store.js`

### Changed (v1.7.0)

- `hooks/session-start.js` — Now initializes plans directory at session start; loads recent plan history into session context; Quick Commands section includes `/cp`
- `skills/c/SKILL.md` — Added `/cp` cross-reference in Rules section; version → v1.7.0
- `skills/cc/SKILL.md` — Version → v1.7.0
- All version strings unified to v1.7.0 across 8 files

## [1.6.0] - 2026-02-28

### Added (v1.6.0)

- **Agent Dashboard** — Real-time sub-agent lifecycle tracking via `.lens/agent-dashboard.json`. Tracks session ID, agent status (pending/running/done/error), duration, error logs. `lib/agent-tracker.js`
- **PreToolUse hook (Task)** — Registers each Task agent as "running" in the dashboard before execution. `hooks/pre-tool-task.js`
- **PostToolUse hook (Task)** — Marks Task agent as "done" or "error" after completion, records duration. `hooks/post-tool-task.js`
- **Stop hook** — Records final session state on exit, marks orphaned agents as error. `hooks/stop.js`
- **Slash command priority override** — When user explicitly types `/skill-name`, UserPromptSubmit injects highest-priority instruction to execute it immediately instead of re-recommending. `scripts/user-prompt-handler.js`
- **design-council registry entry** — Added to plugin-registry as a built-in multi-agent orchestration pattern. `lib/plugin-registry.js`

### Changed (v1.6.0)

- `hooks/hooks.json` — Expanded from 2 hooks (SessionStart, UserPromptSubmit) to 5 hooks (+PreToolUse, +PostToolUse, +Stop)
- `hooks/session-start.js` — Now initializes agent dashboard via `initSession()` at startup; dashboard path included in hook output
- All version strings unified to v1.6.0 across 7 files

### Documentation (v1.6.0)

- Added `docs/DOCUMENTATION-GUIDE.md` — Documentation standards and structure definition
- Rewrote `CLAUDE.md` following documentation guide (200-line limit, table-first)
- Updated `README.md` — Removed internal architecture details, removed hardcoded version numbers
- Added v1.6.0 entry to `CHANGELOG.md` (this entry)

## [1.5.0] - 2026-02-25

### Fixed (v1.5.0)

- **Cross-platform stdin** — `user-prompt-handler.js` was using `fs.readFileSync('/dev/stdin')` which is Unix-only. Replaced with `fs.readFileSync(0, 'utf-8')` (file descriptor 0) which works on Windows, Mac, and Linux. The `UserPromptSubmit` hook was completely non-functional on Windows before this fix.
- **Dynamic plugin cache path** — `skill-scanner.js` PLUGINS_CACHE_DIR was hardcoded. Replaced with 4-level env var resolution: `CLAUDE_PLUGIN_CACHE_DIR` → inferred from `CLAUDE_PLUGIN_ROOT` → `CLAUDE_HOME/plugins/cache` → `~/.claude/plugins/cache`.
- **Stable memory path** — `memory-store.js` was using `process.cwd()` to locate memory file, causing data loss when Claude Code was opened from different directories. Now always writes to `~/.claude/lens/.lens-memory.json` (respects `CLAUDE_HOME` env var).
- **Version string inconsistency** — `hooks.json` and `session-start.js` still showed `v1.3.0` despite v1.4.0 being released. All version strings updated to v1.5.0.

## [1.4.0] - 2026-02-24

### Added (v1.4.0)

- **`/cc` — Lens Multi**: New skill for parallel multi-agent execution. Finds ALL relevant skills for a request, runs them simultaneously as independent Task agents, and synthesizes the results into a unified output. Unlike `/c` which recommends one skill, `/cc` runs the whole team at once.
  - N ≤ 5 matched skills: auto-executes without prompting
  - N > 5 matched skills: confirms via AskUserQuestion before running
  - Locates each skill's SKILL.md via Glob → injects full prompt into a `general-purpose` Task agent
  - Synthesis block highlights agreements, conflicts, and recommended next steps
  - Falls back to `/c` workflow if only 0–1 skills match

### Changed (v1.4.0)

- `session-start.js` Quick Commands section now lists both `/c` and `/cc` with distinct descriptions
- `skills/c/SKILL.md` description updated to v1.4.0; notes `/cc` as the parallel companion

### Removed (v1.4.0)

- `skills/design-council/SKILL.md` — Was incorrectly shipped as an installable skill. Moved to README as a pattern example under "Building Custom Skills with Lens".

## [1.3.0] - 2026-02-22

### Changed (v1.3.0)

- **Zero hardcoded dependencies** — Keyword matcher no longer contains hardcoded skill names. All keyword-to-skill mappings are built dynamically from scanner results at session start.
- **Dynamic keyword map** — `keyword-matcher.js` completely rewritten. Uses each skill's `triggers` field from scanner output instead of a static `DEFAULT_KEYWORD_MAP`.
- **Scan cache** — Session start now saves scan results to `.lens-cache.json` so the `UserPromptSubmit` hook can match keywords without re-scanning.
- **README genericized** — All plugin-specific examples replaced with generic placeholders. Lens is now fully plugin-agnostic in code and documentation.

### Removed (v1.3.0)

- `DEFAULT_KEYWORD_MAP` in `keyword-matcher.js` — Was hardcoding 10 specific skill names from bkit and other plugins.

## [1.2.0] - 2026-02-22

### Added (v1.2.0)

- **MCP tool detection** — Scanner now detects `.mcp.json` files and lists MCP tool servers
- **LSP server detection** — Scanner reads `lspServers` from `plugin.json` for language servers
- **Hybrid plugin support** — Plugins with both Skills and MCP are marked with `hasMcp` flag
- **Type column** in scan output — Each entry shows its type: Skill, MCP, or LSP
- **`mcpServers` wrapper format** — Handles both direct `{"server": {...}}` and wrapped `{"mcpServers": {"server": {...}}}` formats
- **Language extraction** for LSP entries from `extensionToLanguage` mappings
- **`readPluginDescription()`** helper for MCP/LSP entries without skill metadata
- **`parseMcpFile()`** and **`parseLspPlugin()`** functions in skill-scanner.js

### Changed

- `scanInstalledSkills()` now returns entries with `type` field (`'skill'`, `'mcp'`, `'lsp'`)
- `formatSkillTable()` shows Type column and breakdown summary (e.g. "48 skills, 4 MCP tools, 2 LSP servers")
- `commands/` directory scanning — Previously only scanned `skills/`, now scans both
- `extractFullDescription()` — Fixed YAML block scalar parsing for empty lines
- `extractTriggers()` — Improved regex to handle multi-line triggers and YAML keys
- `yamlValue()` — Stops at `Triggers:` and `argument-hint:` to avoid polluting descriptions
- Domain detection expanded from 14 to 24 patterns (added Workflow, Fullstack, Database, Storage, QA, Branding, Enterprise, Navigator, Config, Schema, SDK)

### Fixed

- Triggers were always empty (0/48) due to YAML block scalar regex not handling empty lines
- `commands/*.md` files were not being scanned (only `skills/*/SKILL.md` was scanned)
- Domain misclassification (e.g. `/dynamic` classified as Auth instead of Fullstack)

## [1.1.0] - 2026-02-21

### Added

- Session hooks (SessionStart, UserPromptSubmit)
- Multilingual keyword matching (EN, KO, JA, ZH, ES, FR, DE, IT)
- Session memory persistence
- Plugin discovery registry
- Lens suggestion line in responses
- `lens.config.json` for configuration

### Changed

- Rebranded from Compass to Lens
- 4-phase workflow: Scan → Recommend → Execute → Discover

## [1.0.0] - 2026-02-20

### Added

- Initial release as Compass
- Basic skill scanning from `skills/` directory
- Simple keyword matching
- Skill recommendation
