---
name: cc
description: "Lens Multi v3.26.0 parallel execution engine for Claude Code and Codex. Use for multi-part work that benefits from independent workers, supervision, QA, and bounded repair loops, or when the user explicitly invokes cc."
---

# Lens cc — parallel execution

Triggers: cc, parallel, multi-agent, orchestrate, run all, 병렬, 동시 실행, 멀티 에이전트, 並列, 并行

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

1. Turn the request following `$lens:cc` into a dependency-aware plan.
2. Keep dependent work sequential. Spawn native Codex agents only for concrete
   workstreams that can proceed independently.
3. Respect the current concurrency limit. The root agent may execute one
   workstream while children handle the others.
4. Use `wait_agent` and `list_agents` for progress; do not create a monitor-only
   agent.
5. Review and integrate all worker results. Run separate Supervisor and QA
   passes, with the root agent retaining ownership of the final result.
6. Send failed work back with precise evidence and a bounded correction request.
   Keep the legacy maximum of five review/repair iterations.
7. Verify the integrated outcome with real checks before reporting completion.

If the task is not meaningfully parallel, say so briefly and execute it through
the sequential `$lens:c` pattern without manufacturing extra agents.
