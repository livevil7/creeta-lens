---
name: cr
description: "Creeta Research v3.26.0 live multi-angle research workflow for Claude Code and Codex. Use for current, source-cited research across the web, repositories, official documentation, communities, video, and feeds."
---

# Lens cr — live research

Triggers: cr, creeta research, live research, deep research, 딥리서치, 라이브 조사, 深度调研, リサーチ

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

1. Refine the topic only when a missing choice materially changes the answer.
2. Use `web.run` and available purpose-built connectors. Current facts and
   source attribution require live browsing.
3. Parallelize independent research angles with native agents when useful, but
   keep source review and synthesis with the root agent.
4. Prefer primary, official, and directly relevant sources. Compare publication
   date with event date and distinguish fact, source claim, and inference.
5. Follow Codex citation and copyright constraints. Cite direct page links near
   supported claims.
6. Return the report in the conversation unless the user asks for a file.

Do not require Claude-only search plugins when native Codex web or connectors
cover the research substrate.
