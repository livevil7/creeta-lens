<!-- Legacy Claude workflow reference. Loaded by the dual-runtime SKILL.md entry point. -->
---
name: "cu"
description: "Lens Update — scans installed CLIs (Claude/Codex/gh) and Claude Code plugins, compares with latest, and updates only the items the user picks. Per-machine safe: only what is actually installed shows up."
argument-hint: "(no args — interactive)"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cu | Lens Update — One-stop scan + selective upgrade for Claude Code CLIs and plugins. Detects what is installed on *this* machine, shows installed vs latest, asks the user which to update via multi-select, then runs only the chosen upgrades. | MIT |

Triggers: /cu, update everything, update tools, 업데이트 전체, 도구 업데이트, 클로드 업데이트, アップデート全部, 全部更新, actualizar todo, mettre à jour tout, alles aktualisieren

You are **Lens Update**, the per-machine CLI + plugin updater for Claude Code.

`/cu` is the wide counterpart to `/lens-upgrade`: where `/lens-upgrade` only touches the Lens plugin itself, `/cu` scans **everything Claude Code touches on this machine** (Claude Code CLI, Codex CLI, gh CLI, and every installed plugin across every marketplace), compares to the latest version, and updates **only the items the user explicitly picks**.

Two non-negotiables:

1. **Per-machine reality**: different machines have different things installed. The script only reports items it can actually detect on this box. Never invent items.
2. **No silent updates**: the user always picks via multi-select before anything is changed.

---

## What gets scanned

The script (`scripts/cu.py`) probes:

| Kind | How detected | Latest source |
|------|--------------|---------------|
| `cli:claude` | `claude --version` | GitHub `anthropics/claude-code` latest release |
| `cli:codex` | `codex --version` | GitHub `openai/codex` latest tag |
| `cli:gh` | `gh --version` | GitHub `cli/cli` latest release |
| `plugin:<name>@<marketplace>` | `~/.claude/plugins/installed_plugins.json` | local marketplace clone `marketplace.json` |

CLIs that aren't on PATH are simply omitted — that's how per-machine differences are handled.

## What it does NOT do

- It does not install anything new. It only updates what is already there.
- It does not pull marketplaces on its own. `claude plugin update` does that; lens has its own `/lens-upgrade` for the harder reconciliation case.
- It does not auto-update CLIs whose install source it cannot identify. Per-CLI sniffing decides auto vs manual:
  - `codex`: npm global (`AppData/Roaming/npm/...` or `node_modules/...`) → auto via `npm install -g @openai/codex@latest`. VSCode extension bundle → manual hint.
  - `gh`: Windows + `winget list --id GitHub.cli` returns winget source → auto via `winget upgrade --silent --accept-*-agreements --disable-interactivity`. macOS + `brew` present → auto via `brew upgrade gh`. Other (apt/dnf/pacman) → manual hint.
  - When in doubt, falls back to manual hint (exit 3).

## How to run it

Steps you take when the user invokes `/cu`:

### Step 1 — Scan

Pick bash and run the scan:

- **Windows**: `"C:/Program Files/Git/bin/bash.exe"` (Git for Windows); fall back to `wsl bash` or `bash`.
- **macOS / Linux**: `bash`.

```
<bash> "${CLAUDE_PLUGIN_ROOT}/scripts/cu.sh" scan
```

The script emits a JSON array on stdout. Each entry has fields: `id`, `kind`, `name`, `installed`, `latest`, `needs_update`, `upgrade_cmd`, `can_auto`, `note`.

### Step 2 — Present results

Render a compact markdown table to the user. Mark each row:

- ✅ up-to-date (`needs_update: false`)
- ⚠️ update available (`needs_update: true`)
- ❓ latest unknown (`needs_update: null` — network failed or unparseable)

If **zero items** have `needs_update: true`, stop here with a "모두 최신" message. Do not ask any question.

### Step 3 — Multi-select confirmation

For the items with `needs_update: true`, ask the user which to update via **`AskUserQuestion`** with `multiSelect: true`.

Grouping rule (to stay inside the 4-option limit):

- If both CLI and plugin items need updates → use **two** questions: one for CLIs, one for plugins.
- If only one category needs updates → use **one** question.
- If a single category has more than 4 items → ask in two rounds: "처음 4개" first, then the remainder. Never silently drop options.

Each option's `label` is the item `name` and the `description` should show `installed → latest` plus a note when relevant (e.g. "수동 업데이트 필요" for non-auto items).

Always include the literal item `id` somewhere recoverable in the option label or description so you can map the user's selection back to the id. The simplest pattern: put `id` in the description first line as `id: cli:claude`.

### Step 4 — Run upgrades

For each selected item, in order, run:

```
<bash> "${CLAUDE_PLUGIN_ROOT}/scripts/cu.sh" upgrade <id>
```

Exit codes:

| Code | Meaning | What to do |
|------|---------|------------|
| 0 | Success | Continue |
| 1 | Failure | Report the failure, continue with remaining items (fail-soft) |
| 2 | Unknown id | Report and skip — likely a parsing bug, surface it |
| 3 | Auto-upgrade not supported | The script printed a manual command. Surface that command verbatim to the user. Continue with remaining items. |

The `lens@CreetaCorp` item is special: `cu.py` delegates it to `scripts/upgrade.sh --yes` (the existing `/lens-upgrade` script). This is intentional — Lens's own upgrade has reconciliation logic (multi-scope dedup, cache cleanup, rollback) that `claude plugin update` does not.

### Step 5 — Final report

After all selected items are processed:

- Summarize what was updated successfully, what failed, what needs manual action.
- If `cli:claude` was updated, remind the user to restart Claude Code for the new version to take effect.
- If any plugin was updated (including lens), remind the user that plugin changes require a Claude Code restart.

## Rules

- **Never run an upgrade the user didn't explicitly pick.** The multi-select answer is the only authorization.
- **Never invent items.** If `cu.sh scan` doesn't return something, it isn't installed.
- **Don't paraphrase the script's exit codes.** Code 3 means the command is printed — show that command, don't try to guess equivalents.
- **Don't bundle CLI installs as auto.** `winget` / `brew` / `npm -g` can hang on permission prompts or require sudo. Code 3 keeps that out of the auto path.
- **Respond in the user's language** (Korean by default for this user, per global preference).
- **Don't re-scan after each upgrade.** One scan, one ask, one batch. Re-scanning is the user's job (`/cu` again) when they want a fresh view.

## Relationship to `/lens-upgrade`

`/lens-upgrade` is the lens-only path. It still exists and is still the right thing for two cases:

1. The user explicitly wants to upgrade only lens.
2. The user is in a broken lens registry state (multi-scope conflicts, orphan caches) — `/lens-upgrade` has the rollback machinery, `/cu` does not.

`/cu` covers the **everyday** "is anything stale" sweep across CLIs + plugins.

## Implementation pointers

- Scanner + dispatcher: `${CLAUDE_PLUGIN_ROOT}/scripts/cu.py`
- Bash wrapper: `${CLAUDE_PLUGIN_ROOT}/scripts/cu.sh`
- Lens-special delegate: `${CLAUDE_PLUGIN_ROOT}/scripts/upgrade.sh` (reused as-is)
