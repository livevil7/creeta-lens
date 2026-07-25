---
name: cps
description: "Lens Start v3.26.0 repository orientation generator for Claude Code and Codex. Use to derive docs/START_HERE.md from real project documentation, show changes, and safely maintain the first-read pointer."
---

# Lens cps — repository orientation

Triggers: cps, start here, onboarding, orientation, first read, 진입 문서, 어디부터, 入門, guía de inicio

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

Scan the repository's real documentation and derive `docs/START_HERE.md` using
the legacy four-section contract. Do not invent files, commands, or ownership.

If the file exists, show a meaningful diff and obtain approval before replacing
manual content. On Codex, add the one-line first-read pointer to `AGENTS.md` when
that file exists and lacks it. If only `CLAUDE.md` exists, preserve the legacy
behavior. In a dual-host repository, keep both instruction files consistent
without replacing either one wholesale.
