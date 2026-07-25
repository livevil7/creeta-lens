# Lens repository instructions for Codex

Lens is a dual-runtime plugin. Current release: **v3.26.0**.

## Runtime layout

- `.codex-plugin/plugin.json` is the Codex manifest.
- `.claude-plugin/plugin.json` is the Claude Code manifest.
- `skills/<name>/SKILL.md` is the canonical short entry point for both hosts.
- `docs/rules/dual-runtime.md` defines host detection and tool translation.
- `skills/<name>/references/claude-workflow.md` preserves the full behavioral
  specification and Claude-native workflow.
- `skills/<name>/agents/openai.yaml` contains Codex UI metadata.

Keep the shared safety invariants and behavioral specifications aligned. Do not
copy Claude tool names into the Codex path without a native mapping, and do not
replace the tracked Git marketplace with a local path in an upgrade workflow.

## Editing rules

- Read the selected skill entry point, shared runtime adapter, and relevant
  workflow reference before changing behavior.
- Preserve both host manifests and update both for every release.
- Treat `scripts/upgrade.py` as Claude Code's updater and
  `scripts/upgrade-codex.py` as Codex's updater.
- Keep plugin operations host-specific: `claude plugin ...` for Claude Code;
  `codex plugin marketplace ...` plus `codex plugin add/remove ...` for Codex.
- Follow the repository's detailed release and architecture guidance in
  `CLAUDE.md` where it is host-neutral.

## Required validation

Run these checks after relevant changes:

```text
node lib/install-sync.test.js
node lib/capability-audit.test.js
node lib/skill-scanner.test.js
python -m unittest scripts/cu_test.py scripts/upgrade_codex_test.py
python scripts/upgrade-codex.py --dry-run --yes
node --check hooks/session-start.js
node --check scripts/user-prompt-handler.js
python <skill-creator>/scripts/quick_validate.py skills/<name>
python <plugin-creator>/scripts/validate_plugin.py .
```

Also parse all JSON/YAML files, run `bash -n` on shell scripts, and test skill
discovery in a new Codex process before release.
