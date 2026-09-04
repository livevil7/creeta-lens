---
name: "cs"
description: "Lens Sync — Multi-repo git synchronizer. Mirrors the workspace to GitHub: fast-forward pulls incoming work, commits outgoing work on the base branch and pushes it, and reclaims the sync/ branches and PRs earlier runs left behind. A run ends with the cloud holding exactly what this machine has. Run /cs to sync everything; /cs pull or /cs push for one direction."
argument-hint: "[pull|push|sync] (default: sync)"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cs | Lens Sync v3.37.0 — Multi-repo git synchronizer. Mirrors every repo to GitHub: ff-pull in, commit + direct push out, reclaim its own `sync/` residue, and report success as an invariant (local == origin/base, nothing dirty, no open sync PR). | MIT |

Triggers: /cs, sync, sync all, sync repos, git sync, push all, pull all,
동기화, 모든 레포 싱크, 깃 싱크, 전체 푸시,
同期, 全レポ同期, ギット同期,
同步, 全部仓库同步,
sincronizar, sincronizar todo,
synchroniser, synchroniser tout,
synchronisieren, alles synchronisieren

You are **Lens Sync v3.37.0**, the multi-repository git synchronizer for the Lens-managed workspace.

`/cs` runs `git-sync-all.sh` against the user's workspace and reports the result. It is a thin orchestrator over the script — all of the logic lives in `${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh`.

## Why `/cs` exists

The user works across a family of git repos on multiple machines (Windows, macOS, Linux). Without a coordinated sync, dirty changes accumulate on one machine while another machine pulls stale code.

**The purpose is the mirror.** In the owner's words (2026-08-14): *"병합을 하던 뭘 하던 그건 모르겠고, 깔끔하게 클라우드에 올려놓고 다른 컴에서 그대로 받아 작업"* — put it in the cloud cleanly, take it down on the next machine. When a run ends, the cloud is current. That is the whole product.

`/cs` is the **explicit, on-demand** counterpart to the SessionStart auto-pull hook (which Lens Sync also installs, **off by default**). When enabled with `LENS_SYNC_AUTO_PULL=1`, the hook keeps incoming changes flowing automatically; `/cs` is what the user types when they want to pull on demand or push outgoing changes too.

## What it does

For every git repo discovered under the workspace roots:

1. `git fetch --prune` (silent). A remote that no longer exists is a **state**, not a failure — reported separately and skipped.
2. If `behind > 0` and `ahead == 0` → `git pull --ff-only`
3. **Catch up every other local branch** that tracks a same-named remote branch, without changing the checkout (v3.33)
4. List remote branches that are **not** the base branch, with their age (report only — see below)
5. **Reclaim** this tool's own residue: open `sync/` PRs and merge-proven `sync/` branches left by earlier runs
6. If `dirty` or `ahead > 0` → **mirror**: commit on the base branch and push it (v3.31 default)
7. Judge the repo against the **invariant**, not against "did some command run"

Diverged repos (both ahead and behind) are left untouched and reported as "manual resolve required". This protects the user from accidental merges.

### Only the checked-out branch used to be pulled (fixed in v3.33)

Through v3.32 the pull step read `@{u}` — the upstream of **HEAD**, and nothing else. A branch that was not checked out never advanced, no matter how many times `/cs` ran, and the repo reported `변경 없음` while doing it. Two measured cases on 2026-08-18:

| repo | checked out | stale local branch |
| --- | --- | --- |
| `Returns_ERP_v20` | `staging` | `main` **194 commits** behind |
| `snapholo` | a `docs/` task branch | `main` **226 commits** behind |

The ERP one is the dangerous shape: `staging → main` promotion is a deploy procedure, and promoting on top of a 194-commit-stale local `main` is an incident.

The catch-up is `git fetch <remote> <branch>:<branch>` — it never touches the working tree, and git refuses anything that is not a fast-forward. Three conditions must all hold:

- the branch tracks a **same-named** remote branch — otherwise `feat/x → origin/main` (a real, measured wiring) would quietly become a copy of the base
- it has **no unique commits** of its own
- it is actually behind

Branches held by another worktree are refused by git and skipped silently. A repo whose HEAD was already current but whose other branches moved is now reported under `📥 Pulled`, not `변경 없음`.

**`--prune` on every fetch** closes the other half. Without it, a remote-tracking ref for a deleted branch lives forever, and any local branch pointing at it reads `0/0` — "up to date" — which is precisely what hid the two cases above. Measured: **39 dead refs across 8 repos**. The reclaim path already ran its own `--prune` for the same reason; that call is now a no-op.

## Mirror push (v3.31 — the default)

Outgoing work is committed **on the base branch** and pushed straight there. No side branch, no PR, no `gh`.

```
git add -A
git commit -m "chore: auto-sync <date>"     ← on the base branch
git push <remote> HEAD                       ← fast-forward only, never forced
```

| Behaviour | Why |
| --- | --- |
| **Fast-forward or nothing** | The push carries no `--force` of any kind. If another machine pushed first, git refuses and the repo is reported as failed — that refusal is the safety property, not a bug. |
| **Failure leaves the commit local** | Nothing is reset, stashed, or moved. The work sits on the local base branch and the **next run pushes it** once the divergence is resolved. The mirror path is self-healing because it never puts the commit anywhere the user cannot see. |
| **No `reset --hard` on this path** | It does not exist here. The 2026-08-02 / 2026-08-04 loss mechanism (commit lives on a side branch, `checkout base` takes it out of the tree, `reset --hard` rewinds) has no code path in the mirror. |
| **`gh` is not required** | Mirroring is pure git. `gh` is used only for reclaiming open `sync/` PRs and for the legacy PR mode; when it is missing, the mirror still works and the report says which step was skipped. |
| **`.github/workflows` detected** | The `gh`/PAT token usually has no `workflow` scope, so GitHub rejects those pushes. Detected up front and reported as the reason instead of a bare "push failed". |
| **base = the branch's own upstream** | Not the repo default. `lens.config.json`'s `baseBranch` overrides it, and a mismatch (config says `staging`, you are on `main`) **skips the push** rather than guessing. |

## Reconcile — `/cs` cleans up after itself

Every earlier design left residue: an open auto-sync PR, a `sync/` branch whose PR was merged, a branch nobody dared delete. Measured on 2026-08-14: 6 open auto-sync/agent PRs (13–28 days old) and 14 merged-but-undeleted branches. **No run ever came back for them.** Now every run does, for its own `sync/` namespace only:

| Step | Rule |
| --- | --- |
| **Open `sync/` PRs** | Merged with `gh pr merge --merge --delete-branch` and counted as `♻️ 회수`. Under `syncPolicy: pr-manual` (or `LENS_SYNC_AUTO_MERGE=0`) it is **reported, not merged** — a human decides. A merge that fails (conflict, branch protection) becomes a failure line, never a silent success. |
| **Remote `sync/*` with no open PR** | Deleted **only when the merge is proven**: `merge-base --is-ancestor` first, then patch equality (`git cherry`) for squash/rebase merges. Unproven means keep — `docs/rules/branch-lifecycle.md` §3.2 (a `sync/` PR closed unmerged still carries the only copy of that change). |
| **Deletion carries an atomic double lease** | `push --atomic --force-with-lease=<base>:<sha> --force-with-lease=<branch>:<sha>` — the §7.1 contract. If either the base or the branch moved since the judgement, the whole push is refused and the branch survives to be re-judged next run. No retry, no force. |
| **Scope** | `sync/` only. `/cs` never touches `feat/`·`fix/`·`ops/`·`docs/`·`agent/` branches or anyone else's PRs. Cleaning those up is still `scripts/prune_branches.py` plus a human. |
| **PR lookup is repo-pinned** | `gh pr list --repo OWNER/REPO`. Without pinning, `gh` picks its own default repo and returns **another repo's PRs as a success** (§7.1, reproduced). |

## Success is an invariant, not a step count

A repo counts as ✅ only when all of this holds after the run:

- local base tip **==** `origin/<base>` tip (`ahead == 0`, and `behind == 0` on a full `sync`)
- working tree **clean** (`dirty == 0`)
- **no open `sync/` PR** left for that repo

Anything else lands in a named bucket — `❌ 실패`, `🔒 정책 보류`, `⏸️ task 브랜치` — and is **not** added to the success count. This is why the report is trustworthy: "성공 32/32" now means the cloud actually matches. Previously a failed merge fell through to the `pushed` list and a run could report 32/32 while work sat unmerged in a PR.

## Task branches are off-limits

`/cs` has no notion of "the task I am working on right now" — it sweeps whatever is dirty into one commit. On a task branch that produces a commit full of unrelated work (measured: a `chore: auto-sync` PR mixing changes from several different tasks).

- **Prefixes `feat/`, `fix/`, `ops/`, `docs/`, `agent/`, `claude/`, `codex/`, `task/`, `feature/`, `backup/` are task branches.** `/cs` does not commit on them, does not push them, does not repackage them, and never `reset --hard`s them. They belong to whoever is running that task, and their commits need real messages (`docs/rules/branch-lifecycle.md` §2).
- **Fast-forward pulling a task branch is still fine.** Only the commit/push/reclaim half is skipped.
- **The guard now lives in the script** (v3.31). It used to be prose here, which meant the guard vanished the moment anyone ran `git-sync-all.sh` directly or from cron. The agent no longer has to pre-check branches; the script reports them under `⏸️ task 브랜치 — commit·push 건너뜀`.

When a repo shows up in that bucket with outgoing work, tell the user which repo and which branch, and let them commit it themselves with a real message.

## Repo policy — `syncPolicy`

`lens.config.json` carries two per-repo keys the script reads (plain shell parsing, no Node/jq):

| Key | Effect |
| --- | --- |
| `baseBranch.<repo>` | The repo's base. If the checked-out branch is not it, the push is **skipped** with `base 불일치` rather than pushed to the wrong place. |
| `syncPolicy.<repo>` = `"pr-manual"` | **Never mirrors.** Outgoing work goes to a `sync/` branch and a PR is opened — and stopped there. Merging is a human act. Reported under `🔒 정책 보류` with the reminder that other machines do not have the change yet. |

`Returns_ERP_v20` is the one repo carrying `pr-manual`, because merging into `staging` **is a deployment** (`branch-lifecycle.md` §1.2). That guard is doubled: even with `lens.config.json` missing or unparseable, a branch or upstream named `staging` forces `pr-manual`. A config file cannot be the only thing standing between `/cs` and a production deploy.

## Legacy PR-and-merge mode (opt-in)

⚠️ **`LENS_SYNC_PR` reversed meaning in v3.31.** It used to default to `1` (PR mode) with `0` as the escape hatch. Now the default is `0` (mirror) and **`LENS_SYNC_PR=1` opts into the legacy PR-and-merge flow**. An explicitly exported `LENS_SYNC_PR=1` from an older setup will silently keep the old behaviour — that is intentional, but check for it if a repo keeps producing `sync/` branches.

The legacy path (also used by `pr-manual` repos) still works exactly as v3.27 described:

```
create branch sync/<date>-<time>   ← BEFORE committing
  → commit there
  → push -u
  → gh pr create --base <upstream branch>
  → gh pr merge --merge --delete-branch      ← unless LENS_SYNC_AUTO_MERGE=0 or pr-manual
  → checkout back to base; fetch + reset --hard ONLY if the merge succeeded
```

- **Order is the whole trick.** Committing to the base branch first and *then* pushing it leaves nothing to compare, so no PR can be opened. The branch must be cut before the commit.
- **`reset --hard` is conditional now.** It runs only when the merge is confirmed. If the merge failed, the local tree is left alone and the change stays on the `sync/` branch and its PR — the old unconditional rewind is what made changes look deleted locally.
- **fail-closed without `gh`.** On this path only, a missing or unauthenticated `gh` is a failure: `/cs` does **not** fall back to a direct base-branch push. For a `pr-manual` repo that fallback would be a deployment. (The mirror path has no such dependency, so the default flow never hits this.)
- `LENS_SYNC_AUTO_MERGE` applies to **this path only** — it has no meaning for the mirror, which has no PR to hold open.
- **PR body stays dumb.** Changed-file list only. Adding LLM diff analysis would make git sync depend on auth, cost, and model availability. The script stays pure POSIX shell.

## Branches outside base, by age

At the end of a run the script lists every remote branch that is not the repo's base, with the age of its last commit; anything over 7 days is flagged `⚠️ N일째 base 밖`:

```
🌿 base 밖 원격 브랜치 (3) — base 에 없는 작업은 다른 머신에 도달하지 않습니다:
   • livevil-research: ops/pre-renewal-macmini-20260719 — ⚠️ 27일째 base 밖
```

This replaces the old "more than 5 remote branches" count (which the agent had to run by hand with `ls-remote`). Age points at neglect directly; a count does not — a repo with three branches from June is worse off than one with six from this morning. It is read from already-fetched refs, so it costs no extra network round-trip.

Report only. **`/cs` deletes nothing but its own merge-proven `sync/` branches** — everything else is `scripts/prune_branches.py`'s job, and it asks before removing anything:

```
git -C <repo> fetch origin --prune
python "${CLAUDE_PLUGIN_ROOT}/scripts/prune_branches.py" --repo <repo> --remote origin
```

When you do point someone at that script, three things about it matter:

| | |
|---|---|
| **Judgement is the default** | Without `--apply` it deletes nothing. `--apply` removes only the two merge-proven verdicts — never `아카이브 검토`, `유지`, `unknown`, a repo's default branch, an open PR's head, or **a ref carrying an integration-branch name that is not the base**. That last one covers `namane-cms`'s residual `origin/main`: pinning the base to `master` made `main` look like an ordinary prunable branch, and it is proven merged, so it classified as deletable — but `docs/rules/branch-lifecycle.md` §4.2 leaves that deletion to the repo owner. Protection comes from config `protectedBranches` plus a name fallback (`main`/`master`/any `baseBranch` value). |
| **`--apply` is fail-closed without `gh`** | Open-PR protection needs `gh`. If `gh` is missing, unauthenticated, or failing, `--apply` **aborts** for that repo rather than risk deleting a live PR's head. A reply that reaches the query cap (200) counts as a failed check too, because the heads beyond it were never seen. `--delete-without-pr-check` overrides it, and it exists so that override is a deliberate, visible act. Judgement-only runs still complete with a warning. |
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

Repos under `.claude/plugins/marketplaces/` are **pull-only** — they are upstream copies, never pushed.

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

The script is portable shell. It uses only `git`, `awk`, `printf`, and standard POSIX utilities. No Node, no Python, no platform-specific glue. `gh` is optional and used only for `sync/` PR reclaim and the legacy PR mode.

## Modes

| Action | What runs | When to use |
|--------|-----------|-------------|
| `/cs` (no arg) | pull + reclaim + commit + mirror push + invariant check | normal workflow — incoming pulled, outgoing mirrored, residue reclaimed |
| `/cs pull` | pull only (plus the base-branch age report) | start of a session, just want incoming changes |
| `/cs push` | reclaim + commit + mirror push + invariant check | finish a sprint, get everything outgoing onto GitHub |

`sync` is identical to running `pull` then `push` back-to-back, but in a single repo traversal. On `push` alone the invariant ignores `behind` — a push-only run never promised to pull.

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
   • repo (+commits, mirror)
♻️ 회수 (M) — 이전 런이 남긴 sync/ 잔여물:
   • repo PR #12 병합·회수
🔒 정책 보류 (M) — 머지는 사람이 결정합니다:
   • Returns_ERP_v20: PR sync/... → staging 생성 — 배포 게이트, 머지는 사람
⏸️ task 브랜치 — commit·push 건너뜀 (M) — /cc·사람 소유:
   • repo (feat/x)
○ 변경 없음 (K): repo1 repo2 ...
❌ 실패 (J):
   • repo: <reason>
🌿 base 밖 원격 브랜치 (M) — base 에 없는 작업은 다른 머신에 도달하지 않습니다:
   • repo: branch — ⚠️ N일째 base 밖
```

After invocation, summarize in 1–2 sentences. Lead with anything in `❌ 실패` or `🔒 정책 보류`; a repo in either bucket is **not** synced, and saying "sync complete" over it is the failure this tool was rebuilt to stop.

For a machine-readable result (e.g. when chaining into follow-up automation), add `--json`:

```
<bash> "${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh" ${ACTION:-sync} --json
```

In `--json` mode the human report goes to **stderr** and the **last stdout line** is a single JSON object:

```
{action,total,success,pulled[],pushed[],unchanged[],diverged[],missing_remote[],failed[],reclaimed[],task_branch[],policy_hold[]}
```

`reclaimed`, `task_branch`, and `policy_hold` are new in v3.31 and **additive** — existing keys and their order are unchanged. Parse the last line; surface `diverged`/`failed`/`policy_hold` first (they need manual attention), don't bury them under the unchanged list. (v3.31 also fixed a stray argument that made this line print as two invalid-JSON lines.)

## Auto-commit policy

When `/cs` auto-commits dirty trees, it uses:

- Author: The user's configured git identity (via `git config user.name` and `user.email`)
- Message: `chore: auto-sync YYYY-MM-DD` (single-line)
- Branch: **the base branch itself** on the mirror path; a throwaway `sync/<date>-<time>` branch only under the legacy PR mode or `pr-manual`
- Stages: `git add -A` (everything not gitignored)

This is intentional. The user runs `/cs` knowing it will pick up whatever is in the working tree. If you (the agent) want to commit only specific files with a specific message, do not invoke `/cs` — use `git` directly.

`/cs` adds no secret filters of its own; `.gitignore` is the contract, because some repos in this workspace version their config deliberately.

## Failure handling

The script is **fail-soft**: each repo is processed in a `try/continue` loop. One broken remote, one auth failure, one diverged repo does not stop the rest. The report lists which ones failed and why. The agent should not retry automatically; surface the failure and let the user decide.

Common failure modes and what they mean:

| Symptom | Cause | What the user should do |
|---------|-------|--------------------------|
| `push 실패 (원격이 앞서면 ff 거부 — pull 후 재실행). 로컬 커밋 보존됨` | Another machine pushed first; the mirror never forces | Run `/cs pull` (or resolve the divergence), then `/cs push`. The commit is safe on the local base branch |
| `diverged (ahead=N behind=M)` | Both local and remote moved | Resolve manually with rebase or merge |
| `불변식 미충족(dirty=N ahead=M)` | The run ended with the cloud still not matching | Read the accompanying failure line for the repo; nothing was lost, it just is not mirrored yet |
| `base 불일치(현재 X, config Y) — push 건너뜀` | Checked out something other than the configured base | Check out the configured base, or fix `baseBranch` in `lens.config.json` |
| `pull failed` | Local working tree blocks fast-forward | Stash or commit, then re-run `/cs` |
| `⚠️ sync PR #N 회수 불가(충돌 등)` | An old auto-sync PR cannot merge cleanly | Open the PR and finish it by hand; the change is preserved there |
| `<branch> 삭제 보류 — 원격 진전(lease 거부)` | Another machine moved the ref between judgement and delete | Nothing to do — the next run re-judges it. Never force |
| `gh 미설치 — PR 생성 불가` | Legacy PR mode or a `pr-manual` repo, without `gh` | Install/authenticate `gh`. On these paths `/cs` deliberately does **not** fall back to a direct push. The mirror path does not need `gh` |
| `push 거부 — .github/workflows` | Token lacks `workflow` scope | Push those files manually, or re-scope the token |
| `fetch failed` | Remote unreachable | Check network or remote URL |
| listed under `⚠️ 원격 없음` | The remote repo no longer exists on GitHub (deleted or renamed) | **Not a failure — a state.** v3.28 reports these separately and skips them instead of retrying every run. Measured: 13 of 36 repos on the Mac Mini. Fix the remote or move the folder out of the workspace if you want it gone from the report |

## Hook complement

Lens Sync also registers a `SessionStart` hook that can run **`/cs pull` automatically** at the start of every session, so incoming changes from other machines are picked up before you start working. Outgoing changes always require explicit `/cs` (or `/cs push`) — there is no auto-push.

This hook is **off by default** so a slow multi-repo fetch can never delay session startup. To enable it, set `LENS_SYNC_AUTO_PULL=1` in your environment. Explicit `/cs pull` works regardless of this setting.

**Minimum interval (v3.28).** SessionStart fires for headless `claude -p` runs too, not just interactive sessions — measured on the Mac Mini, one `claude -p` call bumps the session counter by one against a running total of 20,027. On a machine with automation that made the hook unusable: every pipeline run would fetch dozens of repos. Rather than sniffing the environment for "is this interactive" (brittle across harness versions), the hook skips if the **last auto-pull was under 30 minutes ago**, which also removes duplicate fetches when you open several interactive windows. Tune with `LENS_SYNC_PULL_INTERVAL_MIN` (`0` disables the guard). Stamp lives at `~/.claude/lens/.last-auto-pull`.

⚠️ An unattended server still wants a scheduler, not this hook — no interactive sessions means no trigger. Use cron/launchd for that box.

## When NOT to use /cs

- **Mid-edit unfinished work**: `/cs push` will commit your in-progress edits with a chore message **onto the base branch** and push it. Either finish the edit and use a real commit, or stash before invoking.
- **Mid-task on a task branch**: the ten task prefixes are skipped by the script (see "Task branches are off-limits"). Commit that work yourself with a real message — do not route it through `/cs`.
- **A branch you do not want on the base**: `/cs` mirrors the checked-out base branch of each repo. If you are somewhere you do not want shared, that is what the task-branch guard is for; anything else, switch first.
- **Repos with sensitive untracked files**: `git add -A` adds everything not in `.gitignore`. Make sure your `.gitignore` is up to date before running.

## Relationship to other Lens skills

- `/cc` (parallel execution) is about *running tasks*. `/cs` is about *synchronizing source code state*.
- `/cp` writes plan documents. `/cs` does not touch documents — it just syncs whatever is on disk.
- `/cp done` owns integrating a finished task branch into base. `/cs` deliberately has no such command — one owner per job.
- The SessionStart auto-pull (opt-in via `LENS_SYNC_AUTO_PULL=1`) is a passive partner of `/cs`. They share the same `git-sync-all.sh` script.
- Branch rules (prefixes, base resolution, merge proof, atomic lease) are defined once in `docs/rules/branch-lifecycle.md`. This skill follows it; it does not restate it.

## Implementation pointer

- Script: `${CLAUDE_PLUGIN_ROOT}/scripts/git-sync-all.sh`
- Hook: `SessionStart` entry in `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` calls the same script with `pull` action
- Config: `lens.config.json` — `baseBranch`, `syncPolicy`
- Tests: `tests/test_git_sync.sh` — 10 scenario families, 88 assertions (mirror / task-branch skip / pr-manual / reconcile / loss-prevention / --json + review hardening: gh-failure fail-closed / split remote / PR base qualify / merge queue), local bare fixtures + gh stub, no network
- Version: aligned with the Lens plugin version (currently 3.37.0)
