# Lens v3.37.0

**Never wonder which plugin to use again.**

Lens is a skill navigator and multi-agent orchestrator for Claude Code. It scans your installed plugins, finds the best skill for your task, and runs it — all from a single command.

Works with **any** combination of plugins. No hardcoded dependencies.

## The Problem

You installed 10+ plugins. That's 50+ slash commands, MCP tools, and LSP servers. You can't remember them all, and you don't know which combination works best for your task.

## The Solution

```
You: /c build a dashboard with auth

Lens — Skill Scan
| #  | Name          | Type  | Plugin    | Domain   |
|----|---------------|-------|-----------|----------|
| 1  | /auth-setup   | Skill | plugin-a  | Auth     |
| 2  | /ui-builder   | Skill | plugin-b  | Frontend |
| 3  | context7      | MCP   | context7  | Docs     |
| 4  | typescript    | LSP   | ts-tools  | LSP      |
| .. | ...           | ...   | ...       | ...      |

Total: 30 skills, 3 MCP tools, 2 LSP servers from 10 plugins

Lens — Recommendation

> "Build a dashboard with auth"

Which skill should I run?
  /auth-setup (Recommended) — Auth logic for your app
  /ui-builder — Dashboard UI components
  Other
```

Select a skill and Lens runs it immediately.

## Installation

### Option 1: Load directly from GitHub (Recommended)

Clone the repo and load it with `--plugin-dir`:

```bash
git clone https://github.com/livevil7/creeta-lens.git
claude --plugin-dir ./creeta-lens
```

Then use `/lens:cp` inside Claude Code.

### Option 2: Copy to your commands (Quick setup)

Copy a skill file to your user-level commands for a shorter command name:

```bash
mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/cp.md https://raw.githubusercontent.com/livevil7/creeta-lens/main/skills/cp/SKILL.md
```

Restart Claude Code, then use `/cp` directly.

### Option 3: Load as a local plugin

If you already cloned the repo:

```bash
claude --plugin-dir /path/to/lens
```

## Usage

### `/cc` — Leader-Worker-Supervisor-QA Orchestration

```
/cc <what you want to do>
```

`/cc` uses a **Leader-Worker-Supervisor-QA** team pattern to tackle any task — not limited to installed skills. The Leader decomposes the task, Workers execute sub-tasks in parallel, the Supervisor reviews quality, and QA verifies the final output.

```
Leader → Workers (parallel) → Supervisor → QA Verification → Final Report
```

Key behaviors:
- **Works on ANY task** — not limited to installed skills or plugins
- **Mandatory user approval** — the Leader presents a work plan and waits for your approval before Workers execute
- **Max 5 iteration feedback loop** — Supervisor can send work back to Workers up to 5 times until quality standards are met

| You type | What happens |
| --- | --- |
| `/cc build a dashboard with auth` | Leader decomposes → Workers build auth, UI, tests in parallel → Supervisor reviews → QA verifies |
| `/cc review this codebase` | Leader plans review strategy → Workers analyze different areas → Supervisor synthesizes → QA validates |
| `/cc refactor the payment module` | Leader breaks down refactoring → Workers handle each component → Supervisor ensures consistency → QA checks |
| `/cc` (no args) | Shows full skill inventory |

### `/cp` — Plan first, then execute

```
/cp <what you want to do>
```

Unlike `/cc`, which starts building immediately, `/cp` generates a **work plan document** before any execution. Every plan is built on four themes — **What (goal) → Why (the problem/motivation) → How (Plan A/B) → Review (verification)** — with **Why** a required gate so you never finely solve the wrong problem. The plan is saved as a markdown file and presented for your approval. `/cp` is the **fast/standard lane** — quick fixes and standard plans. Grades scale the ceremony to the risk of the task.

**The plan opens on your screen before you are asked to approve it (v3.37).** A saved path is not a report: `/cp` now runs `scripts/show-report.js` right before the approval gate, which opens the rendered plan (`docs/tasks/{id}.html`, or the markdown if there is no deck) in your default application and records that it happened. The approval gate reads that record — no showing, no approval prompt. On an SSH or headless session it refuses to pretend, and falls back to publishing the plan as an Artifact URL you can open from any device. **And the plan itself is written by the top model tier** (currently `fable`): if the session is running on something lower, `/cp` delegates Plan A/B design and the document to a top-tier agent with the full research payload, and records which model wrote it in the plan's `planner_model` frontmatter.

| You type | What happens |
| --- | --- |
| `/cp fix this typo` | Fast tier — concise Goal + checklist + approve (skips Codex/pre-mortem) |
| `/cp build auth with JWT` | Standard tier — full plan, saves to `docs/2026-02-28-jwt-auth.md`, asks for approval |
| `/cp refactor the API layer` | Creates a step-by-step plan, saves to `docs/`, waits for your go-ahead |
| `/cp flow` | FLOW mode — maps user-journey stages ↔ engines/modules ↔ dependencies into one interactive flowchart, saved as `docs/rules/flow.md` + `flow.html` (the project's big-picture Rule) |
| `/cp` (no args) | Shows full skill inventory |

### Grades — `fast` / `standard` / `deep`

```
/cp fast <task>        # explicit grade
/cp standard <task>
/cp deep <task>
/cp <task>             # auto-judged by risk
```

**Grade is chosen by risk, not by length.** Sizing a plan by line count makes length a proxy for quality — a hollow document passes just by being long. The question is *how hard is this to undo*.

| Grade | When | What you get |
| --- | --- | --- |
| `fast` | Small scope, few choices, **easily reversible** | Goal + Why + Plan A checklist + Review |
| `standard` | Multiple components/choices, or user-facing impact | Full flow: Codex dual-track, Plan A/B, pre-mortem, HTML deck |
| `deep` | **Hard to reverse** — deploy, data, multi-system, high uncertainty | Fan-out research (6 axes) · domain deep-spec (UI → ASCII wireframe + states + copy) · **mandatory Codex gate** (stops and reports if Codex is missing) · build-ready tasks (exact path + change + verify + `[P]`/deps) · zero follow-up questions |

**Mismatch guard (both directions).** Even when you name a grade, `/cp` still judges the risk and speaks up if they disagree — but it never overrides you. Aiming **too low** (planning a deploy-critical change as `fast`) gets a strong warning with specific reasons, because that one actually costs you. Aiming **too high** gets a single light note, because over-planning only wastes time. Your override is recorded in the plan either way.

> `/cpp` was folded into `deep` in v3.25 and removed. Its trigger words still route here.

> **Removed in v3.29: `/ccp` (Power Verify).** Its adversarial multi-verify, completeness critic
> and repair loop are now covered by native Claude Code: `/code-review` (and `claude ultrareview`
> for a cloud multi-agent pass), `/security-review`, and the Workflow tool's built-in quality
> patterns. The "prove it really runs" axis stays in `/cc` Phase 6 QA, which executes the
> verification commands directly (Playwright / curl / tests).

### `/cps` — Generate a repo orientation document

```
/cps
```

`/cps` scans a repo's real documentation and generates `docs/START_HERE.md` — a single first-read entry point answering **"Where do I start?"** and **"Which doc answers my question?"** (4 sections: What This Repo Does / What This Repo Is Not / Current First-Read Path / Fast Answer Rules).

| You type | What happens |
| --- | --- |
| `/cps` (fresh repo) | Globs real docs, assembles `docs/START_HERE.md`, injects a one-line pointer into CLAUDE.md if missing |
| `/cps` (START_HERE exists) | Re-derives from current docs, shows a diff, and asks before overwriting (never silently overwrites manual edits) |

### `/cu` — Per-machine updater across every package source

```
/cu          # scan, then upgrade everything safe — no confirmation
/cu all      # also upgrade the held-back items (runtimes, system components, major jumps)
/cu scan     # scan only, change nothing
```

`/cu` is the **wide** counterpart to `/lens-upgrade`. It enumerates by **source** rather than by hardcoded tool name — winget, npm globals, VS Code extensions, pip globals, brew (macOS), and every installed Claude Code plugin — so a newly installed tool shows up without any code change.

Each item gets a **risk** grade, and that grade decides whether it runs:

| Risk | Runs | Covers |
| --- | --- | --- |
| `auto` | `/cu` and `/cu all`, **without asking** | plugins · npm patch/minor · other winget items · VS Code extensions |
| `hold` | `/cu all` only | major version jumps · language runtimes (Node/Python/JDK) · system components · items needing elevation while unelevated |
| `never` | **neither** — command shown only | data-directory software (PostgreSQL, MySQL, MongoDB, Redis) · drivers · winget itself · pip globals |

> **Breaking change in v3.26.0**: `/cu` no longer asks which items to update. It upgrades every `auto` item immediately. The old behaviour was a multi-select prompt on every run; if you were relying on that, use `/cu scan` to look without changing anything.

`never` is refused by `cu.py` itself, not just by the agent — so `/cu all`, or even a hand-typed `cu.sh upgrade winget:PostgreSQL.PostgreSQL.18`, cannot start a database migration you can't undo.

Per-machine safe: items not installed on this box never appear, so different machines get different (correct) results. A source that isn't installed is simply absent; a source that *failed* is reported explicitly, never folded into "all current".

Every run writes a pre-upgrade snapshot to `~/.claude/lens/cu-last-scan.json` and re-scans once afterwards, so what actually landed is verifiable rather than assumed.

### `/ci` — Sync installed plugins to your manifest

```
/ci                     # sync this machine to your wanted-list
/ci add <spec> [what]   # add a plugin to the manifest
/ci remove <spec>       # queue a plugin for removal (moves it to excluded)
/ci edit                # print the manifest path + open it for hand-editing
```

`/ci` (Creeta Install) keeps *this* machine aligned to a **per-user manifest** of plugins you want (`~/.claude/lens/manifest.json`). It diffs the manifest against what's actually installed and sorts every plugin into four buckets: **install** (wanted but missing), **remove** (only what the manifest *explicitly excludes*), **foreign** (installed but not in your manifest — reported, never touched), and **ok** (already matching).

| You type | What happens |
| --- | --- |
| `/ci` (empty manifest) | Creates the template, lists your installed plugins as "foreign", points you to `/ci add` |
| `/ci` (with a manifest) | Shows the 4-bucket preview → asks Approve / Install-only / Cancel → installs missing, then removes excluded (backup + per-item confirm) |
| `/ci add watch@claude-video` | Adds the plugin to your manifest (run `/ci` to actually install it) |
| `/ci remove gstack@old` | Moves it into `excluded` so the next `/ci` removes it |

**Safety**: removal targets are **only** plugins the manifest explicitly excludes; manifest-absent ("foreign") plugins are never auto-removed. Every uninstall is preceded by a per-item confirmation and a backup to `~/.claude/lens/removed-backup-<timestamp>/`. Lens itself is hard-guarded — `/ci` can never uninstall it. Complements `/cu` (which *updates* what's installed) — `/ci` decides *which plugins exist*.

### `/cr` — Creeta Research (live deep research)

```
/cr <topic>    # multi-angle live research on any topic → cited report in the conversation
```

`/cr` researches **any topic live from many angles** — semantic web search (Exa), GitHub repos/issues, YouTube, community reactions (V2EX/Reddit via agent-reach), RSS — cross-checks agreement vs conflict, and **reports back in the conversation with cited sources (URL + date)**. It **saves no files**, never puts your local/private code or secrets into external queries, and has **no scope guard** (runs in any repo). If the live-research tools aren't installed it falls back to `deep-research`/`WebSearch`. For plain general web research, `deep-research` may be a better fit.

### `/crv` — Self-modernization audit

```
/crv            # quick: supply-side audit (native capability drift)
/crv deep       # + demand-side conversation mining → net-new feature proposals
```

`/crv` re-evaluates **every Lens feature** as Claude Code + Codex evolve. It diffs a registry of "assumed native gaps" (`docs/rules/capability-assumptions.json`) against live reality — mostly by **probing the running environment** (`claude --help`, the session's tool surface, `codex --help`), falling back to official changelogs — and classifies each feature **KEEP / THIN / OBSOLETE**, with concrete upgrade vectors and ergonomics improvements. In `deep` mode it also mines your own session transcripts for recurring pains and proposes net-new features. Output is a dated report (md + HTML + board); high-confidence upgrades are handed to `/cp` as task docs. OBSOLETE never auto-deletes anything — it only proposes. A SessionStart nudge reminds you when the audit goes stale (Lens repo only; `capabilityAuditIntervalDays`, default 30).

| You type | What happens |
| --- | --- |
| `/crv` (in the Lens repo) | Probes native capabilities, classifies all features, writes the audit report, hands upgrades to `/cp`, resets the staleness timer |
| `/crv` (elsewhere) | Stops — `/crv` only runs inside the Lens source repo |

**When to use which:**

| | `/cc` | `/cp` | `/cs` |
|---|---|---|---|
| Goal | Build it now, in parallel | Plan before executing | Sync every repo |
| Output | Synthesized multi-agent output | Work plan document + execution | Mirrored repos + invariant report |
| Speed | Slower (parallel agents) | Deliberate (plan → approve → execute) | Fast |
| Use when | The work is clear and splits into independent pieces | You want to review before running | Switching machines |

## How It Works

### `/cc` — Leader-Worker-Supervisor-QA Orchestration
1. **Leader** — Decomposes the task into sub-tasks and presents a work plan for user approval
2. **Workers** — Execute sub-tasks in parallel (any task, not limited to installed skills)
3. **Supervisor** — Reviews Worker outputs for quality; can send back for rework (up to 5 iterations)
4. **QA Verification** — Final quality gate before delivering the result
5. **Final Report** — Unified output with all findings and recommendations

```
Leader --> Workers (parallel) --> Supervisor --> QA --> Final Report
                  ^                    |
                  +--------------------+
                   Feedback (max 5x)
```

### `/cp` — Plan-first execution engine
1. **Goal & Why** — Defines what becomes possible (plain language) and why it matters
2. **Analyze & Match** — Identifies all relevant skills with reasons
3. **Generate Plan** — Creates a work plan document and saves to project `docs/`
4. **Approve** — Presents plan for user approval (Approve / Modify / Cancel)
5. **Execute** — Runs the approved plan (single skill or parallel agents)
6. **Post-Exec Update** — Appends execution results to the plan file

## Features

- **Plan-first execution** — `/cp` generates a work plan document before executing, with user approval
- Plan files saved as `YYYY-MM-DD-slug.md` in project `docs/` (configurable via `planDir`)
- **Zero hardcoded dependencies** — works with any plugin combination
- Cross-vendor double review — Codex reviews the same diff independently of the Claude Supervisor
- Difficulty-based model ladder with a hard cap on top-tier spawns per command
- Agent dashboard — tracks parallel Task agent lifecycle in real-time
- Slash command priority override — `/skill-name` invokes the skill immediately, with no confirmation round-trip
- Responds in your language (EN, KO, JA, ZH, ES, FR, DE, IT)
- Session memory — remembers your most used skills across sessions

> **Additive-only (v3.29).** Lens deliberately does *not* restate rules Claude Code already
> enforces. Orchestration discipline, QA patterns, monitor coverage, honest-reporting rules and
> skill auto-discovery all live in the host now, so they were removed from Lens rather than
> duplicated. What remains is what the host does not do: persistent plan documents, multi-repo
> sync, machine tooling management, cross-vendor review, and model-cost policy. See
> `docs/rules/harness-rules.md` §5.

## Configuration

`lens.config.json`:

```json
{
  "autoRecommend": true,
  "showReport": true,
  "minMatchScore": 5,
  "memoryPath": null,
  "customKeywords": [],
  "planDir": null,
  "defaultPlanLanguage": null,
  "saveSynthesisResults": true,
  "resultsDir": null
}
```

| Option | Default | Description |
| --- | --- | --- |
| `memoryPath` | `null` | Custom path for memory file (null = `~/.claude/lens/`) |
| `planDir` | `null` | Custom plan file directory (null = project `docs/`) |
| `defaultPlanLanguage` | `null` | Force plan document language (null = auto-detect) |
| `saveSynthesisResults` | `true` | Save /cc synthesis results to `.lens/results/` |
| `resultsDir` | `null` | Custom results directory (null = `.lens/results/`) |

## Building Custom Skills with Lens

Lens is a navigator, but you can build your own skills that take advantage of the same multi-agent patterns. Here's an example:

**`design-council`** — A skill that summons all installed design agents in parallel, collects their perspectives, and synthesizes a unified design decision.

```markdown
---
name: design-council
description: "Summons all installed design agents in parallel and synthesizes the optimal design decision."
user-invocable: true
---

## Phase 1 — Scan active design agents
Use Glob to find installed agents under ~/.claude/plugins/cache/.

## Phase 2 — Parallel deliberation
Launch each agent via Task tool simultaneously.
Each agent analyzes the task from their domain perspective.

## Phase 3 — Synthesis
Collect all agent outputs and produce a unified recommendation.
```

This pattern works for any domain: security councils, code review boards, architecture committees. Lens's scanner will automatically detect and list any such skill you install.

## Requirements

- Claude Code v1.0.33+
- 2+ plugins installed (otherwise you don't need a navigator)

## License

MIT
