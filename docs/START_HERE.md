# Start Here

This is the first document to read for `creeta-lens`.

## What This Repo Does

`creeta-lens` is the **source repository of the Lens plugin** for Claude Code — a skill navigator + plan-first execution engine + multi-repo git sync. It ships six user-invocable skills:

- `/c` — single skill navigator (scan → recommend → execute)
- `/cc` — parallel multi-agent execution (Leader → Workers → Supervisor → QA)
- `/cp` — plan-first execution + documentation lifecycle (PLAN / DONE / ORGANIZE / CONVERT)
- `/cps` — generates `docs/START_HERE.md`, a repo orientation + question-routing entry point
- `/cs` — multi-repo git synchronizer
- `/lens-upgrade` — one-stop safe plugin upgrade

The plugin is distributed through a Claude Code marketplace and auto-discovers skills from `skills/*/SKILL.md` (`plugin.json` → `"skills": "./skills/"`).

## What This Repo Is Not

This repo is **not the installed/runtime copy**. The version Claude actually loads lives in the plugin cache (`~/.claude/plugins/cache/CreetaCorp/lens/<version>/`). Editing the cache does not release anything — releasing goes through bump → commit → tag → push, then `/lens-upgrade` on each machine (see `docs/rules/release-guide.md`).

This repo is not a content or application project. It is plugin tooling: skills (markdown), hooks (Node.js), and `lib/` helpers.

## Current First-Read Path

Read these before making claims about how Lens behaves:

1. `CLAUDE.md` - AI briefing: version, skills table, hooks (5), libraries (`lib/`), folder structure, config.
2. `README.md` - user-facing overview of each skill and when to use which.
3. `docs/rules/release-guide.md` - SemVer rules + exact release procedure (why editing the cache is not a release).
4. `docs/rules/codex-integration.md` - how `/cp` and `/cc` use Codex CLI for heterogeneous-model dual verification.
5. `docs/rules/document-conventions.md` and `docs/rules/documentation-guide.md` - doc writing standards Lens itself follows.
6. `CHANGELOG.md` - version history (newest at top).

## Fast Answer Rules

- If the user asks what a skill does or how it behaves, read `skills/{c|cc|cp|cps|cs|lens-upgrade}/SKILL.md` — the SKILL.md is the executable spec.
- If the user asks how to cut a new version / release, use `docs/rules/release-guide.md` (bump + tag + push), then `docs/rules/publishing-guide.md` for marketplace registration.
- If the user asks about Codex, pre-mortem, or dual verification, use `docs/rules/codex-integration.md`.
- If the user asks how Lens-generated docs should be written, use `docs/rules/document-conventions.md` and `docs/rules/documentation-guide.md`.
- If the user asks what work is in progress, look in `docs/tasks/`; for completed work, `docs/history/`.
- If a change does not appear after upgrading, compare this repo's source against the installed cache and check whether a tag was pushed (see `docs/rules/release-guide.md`).
