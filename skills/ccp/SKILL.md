---
name: ccp
description: "Lens Power Verify v3.26.0 adversarial review, QA, and repair workflow for Claude Code and Codex. Use to prove that existing or running work functions, repair reproduced failures, and report verified evidence."
---

# Lens ccp — adversarial verification and repair

Triggers: ccp, verify, prove it works, harden, adversarial verify, QA, 검증, 작동 증명, 적대적 검증, 動作確認

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

1. Confirm there is existing or running work to verify. For net-new build
   requests, route to `$lens:cc`.
2. Establish observable acceptance criteria and a bounded verification budget.
3. Cover the four legacy skeptic lenses: functional behavior, edge/error cases,
   regression/integration, and UX/operations. Use up to three child agents plus
   a root-owned lens when the host concurrency limit is four.
4. Prefer real execution evidence: tests, browser interaction, API calls, logs,
   screenshots, or reproducible commands. Read-only checks come first.
5. Repair only reproduced failures and keep passed axes frozen. Require user
   approval for destructive or externally consequential repair.
6. Re-run the affected axis and relevant regression checks, for at most five
   repair loops.
7. End with `verified=true` and evidence, or `verified=false` with exact
   blockers. Never infer success from code inspection alone when execution is
   possible.
