---
name: cp
description: "Lens Plan v3.26.0 planning and documentation lifecycle for Claude Code and Codex. Use for fast, standard, or deep plans chosen by reversibility and risk, plus plan completion, history, and documentation organization."
---

# Lens cp — plan-first workflow

Triggers: cp, plan, planning, specification, requirements, 계획, 기획, 계획서, 스펙, 企画, 规划

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

1. Parse an explicit `fast`, `standard`, or `deep` grade after `$lens:cp`, or
   infer it from reversibility and impact.
2. Use `update_plan` for the live task state. Create repository plan documents
   only when the requested mode calls for a durable artifact.
3. Keep the legacy What, Why, How, and Review contract, required sections,
   alternatives, risks, non-goals, do-not-change boundaries, and blocking
   question gates.
4. For deep planning on Codex, do not recursively launch the Codex CLI as the
   required Codex review. Use an independent native subagent or a separate
   adversarial review pass, then incorporate its findings.
5. Use the current host's available visualization or browser capabilities for
   conditional prototypes and HTML artifacts.
6. Do not implement the plan unless the user also authorized implementation.
   End at the correct approval or handoff boundary for the selected mode.

In Codex repositories, prefer `AGENTS.md` for durable agent instructions.
Preserve `CLAUDE.md` when the repository also supports Claude Code.
