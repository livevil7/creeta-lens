---
name: cu
description: "Lens Update v3.26.0 per-machine CLI and plugin updater for Claude Code and Codex. Use to scan installed tools, compare versions, let the user select targets, and update only those selections."
---

# Lens cu — CLI and plugin updates

Triggers: cu, update everything, update tools, plugin update, 도구 업데이트, 전체 업데이트, 全部更新

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

Resolve the plugin root and run:

```text
python <plugin-root>/scripts/cu.py scan --runtime codex
```

Show only installed items. Mark unknown comparisons as unknown, not stale.
Request a selection only when updates are available. Then run each selected
item with:

```text
python <plugin-root>/scripts/cu.py upgrade <item-id> --runtime codex
```

Codex plugins are refreshed with their configured Git marketplace followed by
`codex plugin add`. Lens itself delegates to `upgrade-codex.py`; it must retain
the official Git marketplace source. Never update unselected items, and do not
pretend that a bundled Codex executable can be upgraded through npm.
