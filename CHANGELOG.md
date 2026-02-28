# Changelog

## [1.7.0] - 2026-02-28

### Added (v1.7.0)

- **`/cp` — Creet Plan**: New skill for plan-first execution. Generates a work plan document (작업계획서) before executing, saves it as a markdown file, presents for user approval, then executes. 7-phase workflow: Scan → Analyze → Generate Plan → Approve → Execute → Post-Exec Update. `skills/cp/SKILL.md`
- **Plan Manager module** — Plan document file naming (`YYYY-MM-DD-slug.md`), state tracking (`plan-state.json`), slug generation (Korean/Japanese/Chinese character support), plan listing and summary. `lib/plan-manager.js`
- **`planDir` config option** — Custom plan file directory override (default: `.creet/plans/`). `creet.config.json`
- **`defaultPlanLanguage` config option** — Force plan document language (default: auto-detect from user). `creet.config.json`
- **`recordPlanCreation()`** — New function in memory-store for tracking plan creation in session memory. `lib/memory-store.js`

### Changed (v1.7.0)

- `hooks/session-start.js` — Now initializes plans directory at session start; loads recent plan history into session context; Quick Commands section includes `/cp`
- `skills/c/SKILL.md` — Added `/cp` cross-reference in Rules section; version → v1.7.0
- `skills/cc/SKILL.md` — Version → v1.7.0
- All version strings unified to v1.7.0 across 8 files

## [1.6.0] - 2026-02-28

### Added (v1.6.0)

- **Agent Dashboard** — Real-time sub-agent lifecycle tracking via `.creet/agent-dashboard.json`. Tracks session ID, agent status (pending/running/done/error), duration, error logs. `lib/agent-tracker.js`
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
- **Stable memory path** — `memory-store.js` was using `process.cwd()` to locate memory file, causing data loss when Claude Code was opened from different directories. Now always writes to `~/.claude/creet/.creet-memory.json` (respects `CLAUDE_HOME` env var).
- **Version string inconsistency** — `hooks.json` and `session-start.js` still showed `v1.3.0` despite v1.4.0 being released. All version strings updated to v1.5.0.

## [1.4.0] - 2026-02-24

### Added (v1.4.0)

- **`/cc` — Creet Multi**: New skill for parallel multi-agent execution. Finds ALL relevant skills for a request, runs them simultaneously as independent Task agents, and synthesizes the results into a unified output. Unlike `/c` which recommends one skill, `/cc` runs the whole team at once.
  - N ≤ 5 matched skills: auto-executes without prompting
  - N > 5 matched skills: confirms via AskUserQuestion before running
  - Locates each skill's SKILL.md via Glob → injects full prompt into a `general-purpose` Task agent
  - Synthesis block highlights agreements, conflicts, and recommended next steps
  - Falls back to `/c` workflow if only 0–1 skills match

### Changed (v1.4.0)

- `session-start.js` Quick Commands section now lists both `/c` and `/cc` with distinct descriptions
- `skills/c/SKILL.md` description updated to v1.4.0; notes `/cc` as the parallel companion

### Removed (v1.4.0)

- `skills/design-council/SKILL.md` — Was incorrectly shipped as an installable skill. Moved to README as a pattern example under "Building Custom Skills with Creet".

## [1.3.0] - 2026-02-22

### Changed (v1.3.0)

- **Zero hardcoded dependencies** — Keyword matcher no longer contains hardcoded skill names. All keyword-to-skill mappings are built dynamically from scanner results at session start.
- **Dynamic keyword map** — `keyword-matcher.js` completely rewritten. Uses each skill's `triggers` field from scanner output instead of a static `DEFAULT_KEYWORD_MAP`.
- **Scan cache** — Session start now saves scan results to `.creet-cache.json` so the `UserPromptSubmit` hook can match keywords without re-scanning.
- **README genericized** — All plugin-specific examples replaced with generic placeholders. Creet is now fully plugin-agnostic in code and documentation.

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
- Creet suggestion line in responses
- `creet.config.json` for configuration

### Changed

- Rebranded from Compass to Creet
- 4-phase workflow: Scan → Recommend → Execute → Discover

## [1.0.0] - 2026-02-20

### Added

- Initial release as Compass
- Basic skill scanning from `skills/` directory
- Simple keyword matching
- Skill recommendation
