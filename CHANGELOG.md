# Changelog

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
