---
name: "cs"
description: "Lens Sync — Multi-repo git synchronizer. Fetches all repos under the workspace, fast-forward pulls, auto-commits dirty trees, pushes ahead changes. Run /cs to sync everything; /cs pull or /cs push for one direction."
argument-hint: "[pull|push|sync] (default: sync)"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cs | Lens Sync v3.23.0 — Multi-repo git synchronizer for any multi-repo workspace. Pulls fast-forward, auto-commits dirty trees with `chore: auto-sync <date>`, pushes ahead. Fail-soft: one repo failure does not stop the others. | MIT |

Triggers: /cs, sync, sync all, sync repos, git sync, push all, pull all,
동기화, 모든 레포 싱크, 깃 싱크, 전체 푸시,
同期, 全レポ同期, ギット同期,
同步, 全部仓库同步,
sincronizar, sincronizar todo,
synchroniser, synchroniser tout,
synchronisieren, alles synchronisieren

You are **Lens Sync v3.23.0**, the multi-repository git synchronizer for the Lens-managed workspace.

`/cs` runs `git-sync-all.sh` against the user's workspace and reports the result. It is a thin orchestrator over the script — most logic lives in `${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh`.

## Why `/cs` exists

The user works across a family of git repos on multiple machines (Windows, macOS, Linux). Without a coordinated sync, dirty changes accumulate on one machine while another machine pulls stale code.

`/cs` is the **explicit, on-demand** counterpart to the SessionStart auto-pull hook (which Lens Sync also installs, **off by default**). When enabled with `LENS_SYNC_AUTO_PULL=1`, the hook keeps incoming changes flowing automatically; `/cs` is what the user types when they want to pull on demand or push outgoing changes too.

## What it does

For every git repo discovered under the workspace roots:

1. `git fetch` (silent)
2. If `behind > 0` and `ahead == 0` → `git pull --ff-only`
3. If `dirty` → stage all + auto-commit (`chore: auto-sync YYYY-MM-DD`)
4. If `ahead > 0` after step 3 → `git push origin HEAD`

Diverged repos (both ahead and behind) are left untouched and reported as "manual resolve required". This protects the user from accidental merges.

## Workspace roots

Auto-detected from `$HOME` (no hardcoded user/machine paths), overridable via `GIT_ROOTS` env var. The script probes these standard candidates and uses whichever directories exist:

- `$HOME/Documents/Git`, `$HOME/Documents/GIT`
- `$HOME/projects`, `$HOME/Projects`, `$HOME/git`

`$HOME` resolves correctly on macOS, Linux, and Windows (Git Bash), so the same defaults work everywhere. If your workspace lives elsewhere, set `GIT_ROOTS="/path/one /path/two"` before invoking.

## How to invoke

User typing `/cs`, `/cs pull`, or `/cs push` triggers this skill. The agent should:

1. Resolve which Bash to call:
   - **Windows**: `"C:/Program Files/Git/bin/bash.exe"` (Git for Windows). If missing, fall back to `wsl bash` or `bash`.
   - **macOS / Linux**: `bash`
2. Invoke the script with the user's argument (default `sync`):
   ```
   <bash> "${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh" ${ACTION:-sync}
   ```
3. Capture the report and present it to the user.

The script is portable shell. It uses only `git`, `awk`, `printf`, and standard POSIX utilities. No Node, no Python, no platform-specific glue.

## Modes

| Action | What runs | When to use |
|--------|-----------|-------------|
| `/cs` (no arg) | pull + auto-commit + push | normal workflow — leave the workspace synced when done |
| `/cs pull` | pull only | start of a session, just want incoming changes |
| `/cs push` | auto-commit + push | finish a sprint, send everything outgoing |

`sync` is identical to running `pull` then `push` back-to-back, but in a single repo traversal.

## Output

The skill should display the script's output verbatim — it already produces a clean report:

```
╔══════════════════════════════════════════════╗
║  git-sync-all.sh — sync
║  시간: YYYY-MM-DD HH:MM
║  대상: N repos
╚══════════════════════════════════════════════╝
✅ 성공: N / N

📥 Pulled (M):
   • repo (+commits)
📤 Pushed (M):
   • repo (+commits)
○ 변경 없음 (K): repo1 repo2 ...
❌ 실패 (J):
   • repo: <reason>
```

After invocation, summarize in 1–2 sentences if any repos diverged or failed; otherwise just confirm the count.

For a machine-readable result (e.g. when chaining into follow-up automation), add `--json`:

```
<bash> "${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh" ${ACTION:-sync} --json
```

In `--json` mode the human report goes to **stderr** and the **last stdout line** is a JSON object: `{action,total,success,pulled[],pushed[],unchanged[],diverged[],failed[]}`. Parse that line; surface `diverged`/`failed` first (they need manual attention), don't bury them under the unchanged list.

## Auto-commit policy

When `/cs` auto-commits dirty trees, it uses:

- Author: The user's configured git identity (via `git config user.name` and `user.email`)
- Message: `chore: auto-sync YYYY-MM-DD` (single-line)
- Stages: `git add -A` (everything not gitignored)

This is intentional. The user runs `/cs` knowing it will pick up whatever is in the working tree. If you (the agent) want to commit only specific files with a specific message, do not invoke `/cs` — use `git` directly.

## Failure handling

The script is **fail-soft**: each repo is processed in a `try/continue` loop. One broken remote, one auth failure, one diverged repo does not stop the rest. The report lists which ones failed and why. The agent should not retry automatically; surface the failure and let the user decide.

Common failure modes and what they mean:

| Symptom | Cause | What the user should do |
|---------|-------|--------------------------|
| `diverged (ahead=N behind=M)` | Both local and remote moved | Resolve manually with rebase or merge |
| `pull failed` | Local working tree blocks fast-forward | Stash or commit, then re-run `/cs` |
| `push failed` | Auth or network | Re-run `/cs push` after fixing |
| `fetch failed` | Remote unreachable | Check network or remote URL |

## Hook complement

Lens Sync also registers a `SessionStart` hook that can run **`/cs pull` automatically** at the start of every session, so incoming changes from other machines are picked up before you start working. Outgoing changes always require explicit `/cs` (or `/cs push`) — there is no auto-push.

This hook is **off by default** so a slow multi-repo fetch can never delay session startup. To enable it, set `LENS_SYNC_AUTO_PULL=1` in your environment. Explicit `/cs pull` works regardless of this setting.

## When NOT to use /cs

- **Mid-edit unfinished work**: `/cs push` will commit your in-progress edits with a chore message. Either finish the edit and use a real commit, or stash before invoking.
- **Branches you do not want pushed**: `/cs` pushes the current branch of each repo. If a repo is on a feature branch you are not ready to share, switch to your default branch first.
- **Repos with sensitive untracked files**: `git add -A` adds everything not in `.gitignore`. Make sure your `.gitignore` is up to date before running.

## Relationship to other Lens skills

- `/c` (single execution) and `/cc` (parallel execution) are about *running tasks*. `/cs` is about *synchronizing source code state*.
- `/cp` writes plan documents. `/cs` does not touch documents — it just syncs whatever is on disk.
- The SessionStart auto-pull (opt-in via `LENS_SYNC_AUTO_PULL=1`) is a passive partner of `/cs`. They share the same `git-sync-all.sh` script.

## Implementation pointer

- Script: `${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh`
- Hook: `SessionStart` entry in `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` calls the same script with `pull` action
- Version: aligned with the Lens plugin version (currently 3.23.0)
