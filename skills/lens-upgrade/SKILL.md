---
name: lens-upgrade
description: "Lens v3.26.0 safe self-upgrade workflow for Claude Code and Codex. Use to refresh the official CreetaCorp Git marketplace, reinstall Lens, verify the active version and source, and preserve rollback information."
---

# Lens self-upgrade

Triggers: lens upgrade, update lens, upgrade lens, 렌즈 업데이트, 렌즈 업그레이드, レンズ更新

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

Resolve the plugin root from this skill's absolute source path and run:

```text
python <plugin-root>/scripts/upgrade-codex.py [--dry-run] [--yes] [--verbose]
```

The updater must:

1. verify that `lens@CreetaCorp` is backed by the official Git marketplace;
2. refresh `CreetaCorp` with `codex plugin marketplace upgrade`;
3. reinstall or refresh with `codex plugin add lens@CreetaCorp`;
4. verify the installed version, enabled state, marketplace, and Git source;
5. leave Claude Code's installation and files untouched.

Do not convert the marketplace to a local path. Codex does not currently expose
a pinned plugin-install flag, so reject the legacy `--version` option with a
clear explanation instead of silently installing a different revision. Ask the
user to start a new Codex task after a successful upgrade so the new skills are
loaded.
