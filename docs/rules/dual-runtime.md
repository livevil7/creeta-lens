# Lens dual-runtime contract

> Canonical host adapter for every Lens skill.

This file is the runtime adapter shared by every Lens skill. The selected skill's
`SKILL.md` and the user's instructions have already put the requested workflow
in scope.

## 1. Detect the host from capabilities

Use the tools actually exposed to the current agent. Do not detect the host by
running a shell command or checking `PLUGIN_ROOT`:

- **Codex** exposes tools such as `update_plan`, `request_user_input`,
  `collaboration.spawn_agent`, `collaboration.wait_agent`, `web.run`, and
  `apply_patch`.
- **Claude Code** exposes tools such as `TodoWrite`, `AskUserQuestion`, `Task`,
  `TaskOutput`, `Skill`, `WebSearch`, and `Bash`.

If the catalog is mixed, use the native tool that is callable in the current
session. System, developer, and user instructions always outrank this adapter
and the legacy workflow reference.

## 2. Load the behavioral specification

Read the selected skill's `references/claude-workflow.md` completely before
acting. It remains the source of truth for the skill's purpose, gates,
templates, safety invariants, and completion criteria.

On Claude Code, follow that workflow with Claude-native tools.

On Codex, treat Claude-specific tool names, paths, model names, invocation
syntax, and timing rules as abstract roles. Translate them using this table:

| Legacy instruction | Codex-native behavior |
| --- | --- |
| `TodoWrite` | `update_plan`; keep at most one item `in_progress` |
| `AskUserQuestion` | `request_user_input` when available; otherwise ask one concise blocking question |
| `Task` / `Workflow` worker | `collaboration.spawn_agent` with a concrete, bounded task |
| `TaskOutput` / monitor polling | `collaboration.wait_agent`, `list_agents`, or messages to that agent |
| Send work back to a worker | `collaboration.followup_task` or `send_message` |
| `Skill` tool | invoke the installed skill capability directly; do not print a fake tool call |
| `Bash` / `Read` / `Write` / `Edit` | the current Codex shell, file, and patch tools |
| `WebSearch` / `WebFetch` | `web.run`; browse whenever current or cited evidence is required |
| `EnterPlanMode` | use the active collaboration mode and `update_plan`; do not claim to switch modes |
| `/goal` or goal automation | use goal tools only when the user explicitly requested a goal |
| Claude model tiers | inherit the current Codex model unless the user or active policy requires an override |

Do not emit or simulate unavailable Claude tool calls on Codex.

## 3. Invocation and paths

- Claude Code invocation: `/c`, `/cc`, `/cp`, and the other slash commands.
- Codex invocation: `$lens:c`, `$lens:cc`, `$lens:cp`, and the other
  plugin-qualified skills.
- Claude hook commands may use `CLAUDE_PLUGIN_ROOT`.
- Codex hook commands receive `PLUGIN_ROOT` and `PLUGIN_DATA`.
- Ordinary Codex skill shell commands do **not** reliably receive plugin hook
  environment variables. Resolve the plugin root from the absolute source path
  of the active `SKILL.md`: `skills/<name>/SKILL.md` is two directories below
  the root. Never guess a clone path.

## 4. Native Codex orchestration

When the selected Lens workflow calls for subagents, this skill explicitly
authorizes native Codex delegation within the user's requested scope:

1. Give each agent one independent, bounded deliverable and the context it
   needs.
2. Parallelize only independent work. Keep dependent work sequential.
3. Respect the host's concurrency limit; the root agent can own one workstream.
4. Use native status/wait tools instead of inventing a polling loop or spawning
   a monitor-only agent.
5. Review every returned result before integrating it.
6. Do not delegate merely to re-read this adapter or the legacy specification.

If native subagents are unavailable, execute the same phases locally and say so
only when that changes the result.

## 5. Codex safety and communication

- Preserve user changes and inspect repository instructions such as
  `AGENTS.md` before edits.
- Use the host's approval policy. Never weaken sandbox, destructive-action, or
  external-write gates from higher-priority instructions.
- During tool-heavy work, send a concise progress update at least every
  60 seconds.
- Use `apply_patch` for targeted local edits when the host requires it.
- Verify in proportion to risk and lead the final response with the outcome.
- A recursive call from Codex to the Codex CLI is not an independent review.
  When the legacy workflow requires a Codex review and the current host is
  already Codex, use an independent review pass or native subagent instead.

## 6. Host-specific plugin operations

Use only the current host's plugin manager:

- Claude Code: `claude plugin ...`
- Codex: `codex plugin marketplace ...` and `codex plugin add/remove ...`

For Codex, `plugin marketplace upgrade` refreshes the tracked Git snapshot and
`plugin add NAME@MARKETPLACE` installs or refreshes the plugin. Do not replace a
Git marketplace with a local-path marketplace during a normal upgrade, because
that disables the tracked upgrade path.
