---
name: c
description: "Lens v3.26.0 sequential execution engine for Claude Code and Codex. Use when a task should be analyzed, planned, executed one workstream at a time, reviewed, and verified, or when the user explicitly invokes c."
---

# Lens c — sequential execution

Triggers: c, execute, run, do this, 작업 실행, 처리해줘, 실행, やってくれ, ejecutar

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

1. Use the current request as the task text following `$lens:c`.
2. If no task was supplied, show a compact inventory from the skills already
   exposed in the Codex skill catalog. Do not scan `~/.claude`.
3. Analyze scope, risk, dependencies, and relevant installed skills. Record the
   execution phases with `update_plan`.
4. Present the legacy workflow's approval gate when it is materially required.
   Do not ask again for actions the user already authorized.
5. Execute one bounded workstream at a time. When delegation adds value, spawn
   one worker, wait for it, review its output, then continue to the next.
6. Run the Supervisor and QA responsibilities as independent review passes.
   Fix verified defects within scope and re-run the affected checks.
7. Finish only when the requested outcome and verification criteria are met, or
   report a concrete blocker.

Use native Codex skill and tool names in all user-facing text.
