---
name: ci
description: "Creeta Install v3.26.0 manifest-based plugin synchronizer for Claude Code and Codex. Use to preview, add, exclude, install, or safely remove managed plugins while preserving foreign plugins and Lens itself."
---

# Lens ci — plugin install synchronization

Triggers: ci, install sync, plugin sync, 설치 동기화, 플러그인 동기화, 安装同步, synchroniser installation

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

Resolve the plugin root from this `SKILL.md`, then run the deterministic backend
with `--runtime codex`:

```text
node <plugin-root>/lib/install-sync.js --runtime codex <operation>
```

The Codex manifest lives at `~/.codex/lens/manifest.json` unless `CODEX_HOME`
overrides the home. Preserve the legacy four buckets and safety invariants:

- install managed-but-missing plugins;
- remove only explicitly excluded and currently installed plugins;
- report foreign plugins without touching them;
- never remove any `lens@...` plugin.

Use `codex plugin marketplace add <source>` only for a missing configured
marketplace, `codex plugin add <spec>` for installs, and
`codex plugin remove <spec>` for an approved removal. Preview first. Before
each removal, confirm the exact target and save recoverable metadata or a safe
copy when the listed install path is a standalone directory. Never copy or
delete an entire shared marketplace root as a plugin backup.
