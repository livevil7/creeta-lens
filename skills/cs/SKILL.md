---
name: cs
description: "Lens Sync v3.26.0 multi-repository Git synchronization for Claude Code and Codex. Use to fetch and fast-forward repositories, or publish outgoing work through a guarded sync branch and pull request."
---

# Lens cs — multi-repository synchronization

Triggers: cs, sync repos, git sync, push all, pull all, 모든 레포 싱크, 깃 싱크, 全レポ同期

Before acting, read `../../docs/rules/dual-runtime.md` and
`references/claude-workflow.md` completely. The shared adapter overrides
host-specific assumptions in the legacy specification.

## Codex-native execution

Resolve the plugin root from this skill's source path and invoke
`scripts/git-sync-all.sh` through an available Bash implementation. Use native
Codex shell tools and report exact repository outcomes.

Preserve the legacy safety contract:

- fetch before deciding;
- fast-forward only for incoming synchronization;
- never overwrite dirty user work;
- create the `sync/<date>-<time>` branch before committing outgoing changes;
- propose a PR through `gh`; never fall back to direct base-branch push when the
  PR gate fails;
- use the branch's actual upstream as the PR base;
- treat an open, unmerged PR as pending, not synchronized.

External Git writes remain limited to the direction the user requested.
