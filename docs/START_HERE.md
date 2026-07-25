# Start Here

This is the first document to read for `creeta-lens`.

## What This Repo Does

`creeta-lens` is the **source repository of the Lens plugin** for Claude Code
and Codex. It ships 11 user-invocable workflows through one dual-runtime skill
tree:

- `/c` — single skill navigator (scan → recommend → execute)
- `/cc` — parallel multi-agent execution (Leader → Workers → Supervisor → QA)
- `/cp` — plan-first execution + documentation lifecycle (PLAN / DONE / ORGANIZE / CONVERT / FLOW — `/cp flow` 는 프로젝트 전체 그림(단계↔엔진↔종속) 플로우차트를 `docs/rules/flow.md`+`flow.html` Rule 로 생성)
- `/cps` — generates `docs/START_HERE.md`, a repo orientation + question-routing entry point
- `/cs` — multi-repo git synchronizer
- `/ci` — per-user plugin install synchronizer (manifest ↔ installed; installs missing, removes only excluded, reports foreign)
- `/ccp` — adversarial review, real QA, and bounded repair
- `/cr` — live multi-angle research with citations
- `/crv` — Lens self-modernization audit
- `/cu` — per-machine CLI and plugin updater
- `/lens-upgrade` — one-stop safe plugin upgrade

Both hosts discover `skills/*/SKILL.md`. Each short entry point loads
`docs/rules/dual-runtime.md` plus its complete
`references/claude-workflow.md`; Codex UI metadata lives in
`skills/*/agents/openai.yaml`.

## What This Repo Is Not

This repo is **not the installed/runtime copy**. Claude Code loads from
`~/.claude/plugins/cache/CreetaCorp/lens/<version>/`; Codex loads from
`~/.codex/plugins/cache/CreetaCorp/lens/<version>/`. Editing either cache does
not release anything. Release through bump → commit → tag → push, then use the
host's Lens upgrade skill.

This repo is not a content or application project. It is plugin tooling: skills (markdown), hooks (Node.js), and `lib/` helpers.

## Current First-Read Path

Read these before making claims about how Lens behaves:

1. `AGENTS.md` (Codex) or `CLAUDE.md` (Claude Code) - repository instructions.
2. `README.md` - user-facing overview of each skill and when to use which.
3. `docs/rules/dual-runtime.md` - host detection, tool translation, paths, and plugin operations.
4. `docs/rules/release-guide.md` - SemVer rules + exact release procedure.
5. `docs/rules/codex-integration.md` - legacy heterogeneous-model review from Claude Code.
6. `docs/rules/document-conventions.md` and `docs/rules/documentation-guide.md` - doc writing standards Lens itself follows.
7. `docs/rules/live-research.md` — 라이브리서치 substrate(/cp deep·/cr 참조): agent-reach·insane-search 호출법 + 미설치 폴백 규칙.
8. `CHANGELOG.md` - version history (newest at top).

## Fast Answer Rules

- If the user asks what a skill does or how it behaves, read its
  `skills/<name>/SKILL.md`, `docs/rules/dual-runtime.md`, and
  `skills/<name>/references/claude-workflow.md`.
- If the user asks how to sync installed plugins to a wanted-list (install missing / remove excluded), use `/ci` — spec in `skills/ci/SKILL.md`, deterministic backend `lib/install-sync.js`.
- If the user asks how to cut a new version / release, use `docs/rules/release-guide.md` (bump + tag + push), then `docs/rules/publishing-guide.md` for marketplace registration.
- If the user asks about Codex host behavior, use `docs/rules/dual-runtime.md`.
  Use `docs/rules/codex-integration.md` only for Claude-to-Codex external review.
- If the user asks how Lens-generated docs should be written, use `docs/rules/document-conventions.md` and `docs/rules/documentation-guide.md`.
- If the user asks what work is in progress, look in `docs/tasks/`; for completed work, `docs/history/`.
- If a change does not appear after upgrading, compare this repo's source against the installed cache and check whether a tag was pushed (see `docs/rules/release-guide.md`).
