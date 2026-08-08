---
name: "cs"
description: "Lens Sync — Multi-repo git synchronizer. Fetches all repos under the workspace and fast-forward pulls. Outgoing work is committed to a throwaway sync/ branch, opened as a PR for the record, and merged in the same run so every machine actually gets it; fail-closed if gh is unavailable. Run /cs to sync everything; /cs pull or /cs push for one direction."
argument-hint: "[pull|push|sync] (default: sync)"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cs | Lens Sync v3.29.0 — Multi-repo git synchronizer. Pulls fast-forward; outgoing work goes to a `sync/` branch, becomes a PR, and is merged in the same run. Fail-soft across repos, fail-closed on PR failure. | MIT |

Triggers: /cs, sync, sync all, sync repos, git sync, push all, pull all,
동기화, 모든 레포 싱크, 깃 싱크, 전체 푸시,
同期, 全レポ同期, ギット同期,
同步, 全部仓库同步,
sincronizar, sincronizar todo,
synchroniser, synchroniser tout,
synchronisieren, alles synchronisieren

You are **Lens Sync v3.29.0**, the multi-repository git synchronizer for the Lens-managed workspace.

`/cs` runs `git-sync-all.sh` against the user's workspace and reports the result. It is a thin orchestrator over the script — most logic lives in `${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh`.

## Why `/cs` exists

The user works across a family of git repos on multiple machines (Windows, macOS, Linux). Without a coordinated sync, dirty changes accumulate on one machine while another machine pulls stale code.

`/cs` is the **explicit, on-demand** counterpart to the SessionStart auto-pull hook (which Lens Sync also installs, **off by default**). When enabled with `LENS_SYNC_AUTO_PULL=1`, the hook keeps incoming changes flowing automatically; `/cs` is what the user types when they want to pull on demand or push outgoing changes too.

## What it does

For every git repo discovered under the workspace roots:

1. `git fetch` (silent)
2. If `behind > 0` and `ahead == 0` → `git pull --ff-only`
3. If `dirty` or `ahead > 0` → **PR-and-merge flow** (v3.27, see below) — never a direct push to the base branch

Diverged repos (both ahead and behind) are left untouched and reported as "manual resolve required". This protects the user from accidental merges.

## PR-and-merge push (v3.27)

**`/cs` exists to get every repo onto GitHub.** The PR is the *record* of what went up — not a gate the sync has to pass. Outgoing work goes onto a throwaway branch, becomes a PR, and is merged in the same run:

```
create branch sync/<date>-<time>   ← BEFORE committing
  → commit there
  → push -u
  → gh pr create --base <upstream branch>
  → gh pr merge --merge --delete-branch      ← default
  → checkout back to base, fetch, reset --hard to origin/<base>
```

**Order is the whole trick.** Committing to the base branch first and *then* pushing it leaves nothing to compare, so no PR can be opened. The branch must be cut before the commit.

**Why the merge is not optional (v3.27).** The commit lives on the side branch, so `checkout <base>` alone takes those changes *out of the working tree* — they vanish locally until something puts them on the base branch. Only the merge does that. Without it the run ends with the change on neither the local tree nor any other machine, which is the opposite of syncing. v3.25–3.26 shipped without the merge and produced exactly that: memory files disappearing locally (2026-08-02, 2026-08-04) and PRs sitting open for weeks while other machines fell 26 commits behind.

| Behaviour | Why |
| --- | --- |
| **Merged by default** | A sync tool that stops until a human clicks Merge is not syncing. `LENS_SYNC_AUTO_MERGE=0` restores the review-gate behaviour for one run. |
| **Merge failure is reported, not fatal** | If the merge is refused (branch protection, required checks, conflict) the PR stays open and the run reports `미병합` — the old behaviour. Nothing is lost; a human finishes it. |
| **fail-closed** | If `gh` is missing, unauthenticated, or PR creation fails, `/cs` reports a failure. It never falls back to a direct base-branch push — that would silently break the PR guarantee. |
| **base = the branch's own upstream** | Not the repo default. `Returns_ERP_v20` sits on `staging`, where `staging → main` promotion is a separate, deploy-critical procedure. Targeting `main` here would be a production incident. |
| **duplicate PRs avoided** | An open PR with the same head is reused instead of opening another. |
| **`.github/workflows` detected** | The `gh` token has no `workflow` scope, so GitHub rejects those pushes. Detected up front and reported as the reason. |
| **unmerged ≠ synced** | If a merge does not go through, the report warns explicitly: until the PR merges, other machines (Mac Mini and friends) do **not** have the change. Never report that as "sync complete". |
| **PR body stays dumb** | Changed-file list only. Adding LLM diff analysis would make git sync depend on auth, cost, and model availability — a sync tool must not break for those reasons. The script stays pure POSIX shell. |

**Escape hatches**: `LENS_SYNC_AUTO_MERGE=0` leaves PRs open for human review. `LENS_SYNC_PR=0` skips the PR entirely and pushes straight to the base branch.

## Task branches are off-limits

`/cs` has no notion of "the task I am working on right now" — it sweeps whatever is dirty into one commit. On a task branch that produces a PR full of unrelated work (measured: a `chore: auto-sync` PR mixing changes from several different tasks).

- **Branches prefixed `feat/`, `fix/`, `ops/`, `docs/` are task branches.** `/cs` does not repackage them onto a `sync/` branch, does not commit on top of them, and never `reset --hard`s them. They belong to whoever is running that task, and their commits need real messages.
- **`sync/` is for out-of-plan dirty changes only** — stray edits that belong to no task (machine-local config tweaks, files touched by tooling). That is the entire remit of the `sync/<date>-<time>` flow.
- **Fast-forward pulling a task branch is still fine.** Only the commit/PR/reset half is skipped.

**How the agent enforces this** (the guard lives here, not in the script — `git-sync-all.sh` is deliberately left alone):

1. Before any run that can commit (`/cs`, `/cs push`), check each repo's current branch:
   ```
   git -C <repo> rev-parse --abbrev-ref HEAD
   ```
2. If a repo is on a task branch **and** is dirty or ahead, do **not** let the commit path run over it. Run `/cs pull` instead and report those repos as `task 브랜치 — 건너뜀 (담당자가 직접 커밋)`.
3. Proceed with the full `sync`/`push` run only when no repo is on a task branch with outgoing work, or when the user explicitly overrides after seeing the list.

## Branch count warning (on exit)

After reporting the sync result, count remote branches per repo:

```
git -C <repo> ls-remote --heads origin | wc -l
```

Any repo with **more than 5** remote branches gets a warning line, because `sync/` and task branches accumulate silently and stale branches make it unclear which one is live:

```
⚠️ 브랜치 과다: <repo> (원격 N개 > 5) — 정리:
   git -C <repo> fetch origin --prune
   python "${CLAUDE_PLUGIN_ROOT}/scripts/prune_branches.py" --repo <repo> --remote origin
```

Report only. `/cs` never deletes branches itself — pruning is `scripts/prune_branches.py`'s job and it asks before removing anything.

When you do point someone at that script, three things about it matter:

| | |
|---|---|
| **Judgement is the default** | Without `--apply` it deletes nothing. `--apply` removes only the two merge-proven verdicts — never `아카이브 검토`, `유지`, `unknown`, a repo's default branch, an open PR's head, or **a ref carrying an integration-branch name that is not the base**. That last one covers `namane-cms`'s residual `origin/main`: pinning the base to `master` made `main` look like an ordinary prunable branch, and it is proven merged, so it classified as deletable — but `docs/rules/branch-lifecycle.md` §4.2 leaves that deletion to the repo owner. Protection comes from config `protectedBranches` plus a name fallback (`main`/`master`/any `baseBranch` value). |
| **`--apply` is fail-closed without `gh`** | Open-PR protection needs `gh`. If `gh` is missing, unauthenticated, or failing, `--apply` **aborts** for that repo rather than risk deleting a live PR's head — the same posture as `/cs`'s own PR-only rule. A reply that reaches the query cap (200) counts as a failed check too, because the heads beyond it were never seen. `--delete-without-pr-check` overrides it, and it exists so that override is a deliberate, visible act. Judgement-only runs still complete with a warning. |
| **The protected default branch follows the remote you chose** | It is read from `refs/remotes/<remote>/HEAD`, not hard-wired to `origin`. Under `--remote upstream` with a base like `staging`, that remote's own `main` is an ancestor of the base and would otherwise classify as deletable — reproduced, and the old code did delete it. If that HEAD cannot be resolved the tool does not know which branch the remote treats as default, so `--apply` is blocked: run `git remote set-head <remote> --auto` and rerun. There is no override for this one. |
| **Merge proof is content, not just patch-ids** | A multi-commit squash rewrites N patches into one, so `git cherry` still shows them as live; the branch is re-proven merged only when a merge simulation's tree equals the base tree. The reverse also holds: **`git cherry` never enumerates merge commits**, so zero unmerged patches is not proof on its own — content that arrived only in a merge commit (a conflict resolution) would otherwise be deleted as "merged". Unprovable means keep. |
| **Deletion carries a lease** | Deletion is tied to the SHA the judgement was made on. If another machine advanced the branch in the meantime, git refuses and the script reports `원격이 진전됨 — 삭제 거부, fetch 후 재판정 필요`. Run `git fetch origin --prune` first so the judgement is not made on a stale ref. |

`--base` has no default: pass it to override, or let the script resolve config → upstream → `origin/HEAD` per `docs/rules/branch-lifecycle.md`. `--repo-root <dir>` walks every repo underneath.

## Workspace roots

Auto-detected from `$HOME` (no hardcoded user/machine paths), overridable via `GIT_ROOTS` env var. The script probes these standard candidates and uses whichever directories exist:

- `$HOME/Documents/Git`, `$HOME/Documents/GIT`
- `$HOME/projects`, `$HOME/Projects`, `$HOME/git`
- **`$HOME` itself** (v3.28) — repos parked directly in the home directory. Measured on the Mac Mini: `livevil-setting`, `livevil-research`, `namane-mkt`, `creeta-homepage` all live there and were silently outside every scan root, so `/cs` quietly synced 32 of 36 repos. One of the four holds the Claude file memory. Only 1-level dirs containing `.git` are picked up and the list is de-duplicated by device:inode, so overlapping roots cost nothing.

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
| `/cs` (no arg) | pull + branch + commit + PR + merge | normal workflow — incoming pulled, outgoing recorded as a PR and merged |
| `/cs pull` | pull only | start of a session, just want incoming changes |
| `/cs push` | branch + commit + PR + merge | finish a sprint, get everything outgoing onto GitHub |

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
- Message: `chore: auto-sync YYYY-MM-DD` (single-line), committed on a `sync/<date>-<time>` branch — never on the base branch
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
| `gh 미설치 — PR 생성 불가` | No `gh`, or unauthenticated | Install/authenticate `gh`. `/cs` deliberately does **not** fall back to a direct push |
| `push 거부 — .github/workflows` | Token lacks `workflow` scope | Push those files manually, or re-scope the token |
| `fetch failed` | Remote unreachable | Check network or remote URL |
| listed under `⚠️ 원격 없음` | The remote repo no longer exists on GitHub (deleted or renamed) | **Not a failure — a state.** v3.28 reports these separately and skips them instead of retrying every run. Measured: 13 of 36 repos on the Mac Mini. Fix the remote or move the folder out of the workspace if you want it gone from the report |

## Hook complement

Lens Sync also registers a `SessionStart` hook that can run **`/cs pull` automatically** at the start of every session, so incoming changes from other machines are picked up before you start working. Outgoing changes always require explicit `/cs` (or `/cs push`) — there is no auto-push.

This hook is **off by default** so a slow multi-repo fetch can never delay session startup. To enable it, set `LENS_SYNC_AUTO_PULL=1` in your environment. Explicit `/cs pull` works regardless of this setting.

**Minimum interval (v3.28).** SessionStart fires for headless `claude -p` runs too, not just interactive sessions — measured on the Mac Mini, one `claude -p` call bumps the session counter by one against a running total of 20,027. On a machine with automation that made the hook unusable: every pipeline run would fetch dozens of repos. Rather than sniffing the environment for "is this interactive" (brittle across harness versions), the hook skips if the **last auto-pull was under 30 minutes ago**, which also removes duplicate fetches when you open several interactive windows. Tune with `LENS_SYNC_PULL_INTERVAL_MIN` (`0` disables the guard). Stamp lives at `~/.claude/lens/.last-auto-pull`.

⚠️ An unattended server still wants a scheduler, not this hook — no interactive sessions means no trigger. Use cron/launchd for that box.

## When NOT to use /cs

- **Mid-edit unfinished work**: `/cs push` will commit your in-progress edits with a chore message. Either finish the edit and use a real commit, or stash before invoking.
- **Mid-task on a task branch**: `feat/`·`fix/`·`ops/`·`docs/` branches are skipped by policy (see "Task branches are off-limits"). Commit that work yourself with a real message — do not route it through `/cs`.
- **Branches you do not want pushed**: `/cs` pushes the current branch of each repo. If a repo is on a feature branch you are not ready to share, switch to your default branch first.
- **Repos with sensitive untracked files**: `git add -A` adds everything not in `.gitignore`. Make sure your `.gitignore` is up to date before running.

## Relationship to other Lens skills

- `/cc` (parallel execution) is about *running tasks*. `/cs` is about *synchronizing source code state*.
- `/cp` writes plan documents. `/cs` does not touch documents — it just syncs whatever is on disk.
- The SessionStart auto-pull (opt-in via `LENS_SYNC_AUTO_PULL=1`) is a passive partner of `/cs`. They share the same `git-sync-all.sh` script.

## Implementation pointer

- Script: `${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh`
- Hook: `SessionStart` entry in `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` calls the same script with `pull` action
- Version: aligned with the Lens plugin version (currently 3.29.0)
