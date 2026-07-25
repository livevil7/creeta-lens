---
name: crv
description: "Lens Review v3.26.0 self-modernization audit for Claude Code and Codex. Use inside the Lens repository to classify features against current native capabilities and propose evidence-backed upgrades without auto-deleting code."
---

# Lens crv — capability modernization audit

Triggers: crv, lens audit, modernize lens, self audit, capability audit, 렌즈 감사, 자가 감사, 自己監査

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

Treat the repository as Lens when the capability registry exists and either
`.codex-plugin/plugin.json` or `.claude-plugin/plugin.json` names the plugin
`lens`. Audit both hosts independently:

- probe current Codex tools, plugin/skill contracts, hooks, and CLI help;
- probe Claude Code separately when its CLI or files are available;
- browse current official documentation for web-backed signals;
- classify each capability as KEEP, THIN, OBSOLETE, or UNKNOWN without
  auto-deleting code;
- distinguish host-specific obsolescence from cross-host obsolescence.

When the current host is Codex, a recursive Codex CLI call is not an independent
review. Use a native subagent or separate review pass. Stamp the audit through
`node <plugin-root>/lib/capability-audit.js stamp <repo-root>` only after the
report is complete.
