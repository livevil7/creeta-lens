<!-- Legacy Claude workflow reference. Loaded by the dual-runtime SKILL.md entry point. -->
---
name: "lens-upgrade"
description: "One-stop safe upgrade for the Lens plugin. Syncs the marketplace, cleans stale cache, reconciles registry conflicts, reinstalls, verifies, and rolls back on failure."
argument-hint: "[--dry-run | --yes | --verbose | --version vX.Y.Z]"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| lens-upgrade | One-stop safe upgrade for the Lens plugin. Syncs the marketplace (preserving local changes), cleans cache, reconciles multi-scope registry conflicts, reinstalls, and verifies — with automatic rollback on failure. | MIT |

Triggers: upgrade lens, update lens, lens upgrade, lens update, 렌즈 업데이트, 렌즈 업그레이드, レンズ更新, 更新 lens, actualizar lens, mettre à jour lens, lens aktualisieren, aggiornare lens

You are the **Lens Upgrade** skill. Your job is to upgrade the Lens plugin to the latest version in a single one-stop operation, handling every edge case that previously caused breakage.

## What the script does

1. **Preflight** — verifies git/claude are installed, backs up `installed_plugins.json`
2. **Marketplace sync (safe)** — fetches origin, **stashes local changes instead of `git reset --hard`**, fast-forward pulls, auto-fixes wrong remote URL
3. **Version detection** — reads `marketplace.json`, exits early if already up-to-date with a clean single registry entry
4. **Cache cleanup** — removes **all** old version folders under `cache/CreetaCorp/lens/` (prevents orphan directories)
5. **Registry reconcile + install** — detects multi-scope duplicates in `installed_plugins.json`, asks the user before clearing them, then runs `claude plugin install`
6. **Verify** — re-reads the registry to confirm exactly one entry at the target version, then cross-checks with `claude plugin list`. On any mismatch, rolls back from the backup and exits with code 3.

## Running it

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/upgrade.sh"
```

Options (pass after the script path):

| Flag | Purpose |
|------|---------|
| `--dry-run` | Print every action without touching disk |
| `--yes` / `-y` | Skip confirmation prompts (CI mode) |
| `--verbose` / `-v` | Show extra diagnostics |
| `--version vX.Y.Z` | Request a specific version (marketplace latest is used if pin is unavailable) |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success or already up-to-date |
| 1 | Generic failure |
| 2 | User aborted |
| 3 | Failure after rollback (state restored from backup) |

## Steps you should take

1. Run the script with the user's preferred flags (default: no flags = interactive upgrade).
2. Show the final version and status to the user.
3. Remind the user to **restart Claude Code** to load the new plugin version (the script itself cannot restart the running CLI).
4. If the upgrade fails:
   - Show the exit code and the phase where it failed
   - If exit code 3, mention that `installed_plugins.json` was auto-restored from backup
   - Suggest checks:
     - Internet / `gh auth status`
     - Manual marketplace repair: `cd ~/.claude/plugins/marketplaces/CreetaCorp && git status`
     - Inspect backup: `ls ~/.claude/plugins/installed_plugins.json.bak-*`

## Rules

- Always run the script — never paraphrase its steps or re-implement them inline.
- Never pass `--yes` unless the user explicitly asked for non-interactive mode.
- Respond in the user's language.
- After success, do not suggest reinstalling or "just to be safe" — the script already verifies.
