# Lens v3.18.0

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

Then use `/lens:c` inside Claude Code.

### Option 2: Copy to your commands (Quick setup)

Copy the skill file to your user-level commands for a shorter `/c` command:

```bash
mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/c.md https://raw.githubusercontent.com/livevil7/creeta-lens/main/skills/c/SKILL.md
```

Restart Claude Code, then use `/c` directly.

### Option 3: Load as a local plugin

If you already cloned the repo:

```bash
claude --plugin-dir /path/to/lens
```

## Usage

### `/c` — Navigate to the best skill

```
/c <what you want to do>
```

| You type | What happens |
| --- | --- |
| `/c build a login page` | Recommends your best auth + frontend skill |
| `/c review my PR` | Recommends your code review skill |
| `/c deploy to production` | Recommends your deployment skill |
| `/c` (no args) | Shows full skill inventory |

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
| `/cc` (no args) | Shows full skill inventory (same as `/c`) |

### `/cp` — Plan first, then execute

```
/cp <what you want to do>
```

Unlike `/c` and `/cc`, `/cp` generates a **work plan document** before any execution. Every plan is built on four themes — **What (goal) → Why (the problem/motivation) → How (Plan A/B) → Review (verification)** — with **Why** a required gate so you never finely solve the wrong problem. The plan is saved as a markdown file and presented for your approval. `/cp` is the **fast/standard lane** — quick fixes and standard plans. Speed tiers (Fast/Standard) scale the ceremony to the task size; for deep build-ready plans, it points you to `/cpp`.

| You type | What happens |
| --- | --- |
| `/cp fix this typo` | Fast tier — concise Goal + checklist + approve (skips Codex/pre-mortem) |
| `/cp build auth with JWT` | Standard tier — full plan, saves to `docs/2026-02-28-jwt-auth.md`, asks for approval |
| `/cp refactor the API layer` | Creates a step-by-step plan, saves to `docs/`, waits for your go-ahead |
| `/cp` (no args) | Shows full skill inventory (same as `/c`) |

### `/cpp` — Power Plan (deep, build-ready)

```
/cpp <what you want to do>
```

`/cpp` (Lens Power Plan) is the **deep lane** — the heavy sibling of `/cp`. It produces a plan so detailed that execution needs **zero follow-up questions**: user-language Goal, fan-out investigation (6 axes, parallel subagents), a domain-adaptive deep spec (UI → ASCII wireframe + element-by-element states/copy/data-binding), a **mandatory Codex cross-coordination gate** (non-negotiable — stops and reports if Codex is missing), and a build-ready task plan (exact path + change + verify + `[P]`/deps). Benchmarked against GitHub Spec Kit, AWS Kiro (EARS), and obra Superpowers. It carries **no length cap** (v3.18) — large work yields a long, fully-itemized checklist, not a compressed summary; the concise, capped lane stays `/cp`.

| You type | What happens |
| --- | --- |
| `/cpp build the inspection-approval screen` | Fan-out research → ASCII wireframe + states + copy → Codex coordination → build-ready tasks |
| `/cpp design the bidding API` | Endpoint contracts + schema + error taxonomy + sequence, verified with Codex |
| `/cpp fix a typo` | Downgrade guard — suggests `/cp` instead (too heavy for trivial work) |

**When to use which**: quick/standard (concise, capped) → `/cp` · deep/large/zero-follow-up (no length cap, full checklist) → `/cpp`.

### `/ccp` — Power Verify (full review + QA + repair)

```
/ccp <what to make sure actually works>
```

`/ccp` (Lens Power Verify) is the **QA/fix partner to `/cc`**: where `/cc` **builds**, `/ccp` takes what was **built or is already running** (a feature, PR, screen, work from another session, or a live service) and runs a **full review → QA → repair**. It **proves it actually works by really running it** — spinning up Playwright, hitting endpoints, observing real behavior — via **4 adversarial skeptics in parallel** (functional, edge/error, regression/integration, UX/ops — UI adds accessibility/responsive, API adds security/permissions), each trying to *refute* that it works. If any reproduces a blocking failure, it does a **minimal repair** (failed axes only, passed axes frozen) and re-verifies — until done, or it honestly reports `verified=false` with the blockers. Safety-gated: read-only first, destructive changes (deploy/DB/payment/mass-delete) require approval; capped at 5 iterations + a budget. Codex-reviewed design.

| You type | What happens |
| --- | --- |
| `/ccp make sure the checkout flow really works` | Runs it via Playwright → 4 skeptics try to break it → repairs blockers → evidence report |
| `/ccp does this PR actually do what it claims` | Independent adversarial audit of existing work, not a rebuild |
| `/ccp build a new screen` | Downgrade guard — suggests `/cc` instead (nothing built yet to verify) |

**The boundary**: `/cc` **builds** (with build-time QA as it goes); `/ccp` independently does a **full review + QA + repair** of something *already built or running*. **The core pair**: `/cc` builds → `/ccp` proves it works & fixes it. (`/cpp` plans → `/cc` builds → `/ccp` verifies.)

### `/cps` — Generate a repo orientation document

```
/cps
```

`/cps` scans a repo's real documentation and generates `docs/START_HERE.md` — a single first-read entry point answering **"Where do I start?"** and **"Which doc answers my question?"** (4 sections: What This Repo Does / What This Repo Is Not / Current First-Read Path / Fast Answer Rules).

| You type | What happens |
| --- | --- |
| `/cps` (fresh repo) | Globs real docs, assembles `docs/START_HERE.md`, injects a one-line pointer into CLAUDE.md if missing |
| `/cps` (START_HERE exists) | Re-derives from current docs, shows a diff, and asks before overwriting (never silently overwrites manual edits) |

### `/cu` — Per-machine CLI + plugin updater

```
/cu
```

`/cu` is the **wide** counterpart to `/lens-upgrade`. It scans every CLI and plugin Claude Code actually touches on *this* machine (Claude Code CLI, Codex CLI, gh CLI, every installed plugin across every marketplace), compares installed vs latest, and updates **only the items you pick** via multi-select.

| You type | What happens |
| --- | --- |
| `/cu` (everything up-to-date) | Reports "all current", asks nothing, exits |
| `/cu` (anything stale) | Renders comparison table → AskUserQuestion multi-select → runs only the picks |

Per-machine safe: items not installed on this box never appear in the list, so different machines get different (correct) results.

Auto-upgrade path: `claude update`, `claude plugin update <name>@<marketplace>`, npm-global codex (`npm install -g @openai/codex@latest`), winget-sourced gh on Windows, brew-sourced gh on macOS, and lens itself delegated to `/lens-upgrade`. When the install source can't be identified (e.g. apt/dnf/pacman, VSCode-bundled codex), the command is printed and the user runs it.

### `/cr` — Self-modernization audit

```
/cr            # quick: supply-side audit (native capability drift)
/cr deep       # + demand-side conversation mining → net-new feature proposals
```

`/cr` re-evaluates **every Lens feature** as Claude Code + Codex evolve. It diffs a registry of "assumed native gaps" (`docs/rules/capability-assumptions.json`) against live reality — mostly by **probing the running environment** (`claude --help`, the session's tool surface, `codex --help`), falling back to official changelogs — and classifies each feature **KEEP / THIN / OBSOLETE**, with concrete upgrade vectors and ergonomics improvements. In `deep` mode it also mines your own session transcripts for recurring pains and proposes net-new features. Output is a dated report (md + HTML + board); high-confidence upgrades are handed to `/cp` as task docs. OBSOLETE never auto-deletes anything — it only proposes. A SessionStart nudge reminds you when the audit goes stale (Lens repo only; `capabilityAuditIntervalDays`, default 30).

| You type | What happens |
| --- | --- |
| `/cr` (in the Lens repo) | Probes native capabilities, classifies all features, writes the audit report, hands upgrades to `/cp`, resets the staleness timer |
| `/cr` (elsewhere) | Stops — `/cr` only runs inside the Lens source repo |

**When to use which:**

| | `/c` | `/cc` | `/cp` |
|---|---|---|---|
| Goal | Best single skill | All relevant skills | Plan before executing |
| Output | One skill's result | Synthesized multi-agent output | Work plan document + execution |
| Speed | Fast | Slower (parallel agents) | Deliberate (plan → approve → execute) |
| Use when | You know what you need | You want comprehensive coverage | You want to review before running |

## How It Works

### `/c` — Single skill navigator
1. **Scan** — Detects all installed skills, MCP tools, and LSP servers
2. **Recommend** — Matches your request to the best skill(s) via AskUserQuestion
3. **Execute** — Runs the chosen skill immediately
4. **Discover** — If no match, suggests installable plugins from registry

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
1. **Scan** — Same as `/c`
2. **Analyze & Match** — Identifies all relevant skills with reasons
3. **Generate Plan** — Creates a work plan document and saves to project `docs/`
4. **Approve** — Presents plan for user approval (Approve / Modify / Cancel)
5. **Execute** — Runs the approved plan (single skill or parallel agents)
6. **Post-Exec Update** — Appends execution results to the plan file

## Features

- Auto-scans all installed plugins at session start
- Detects Skills, MCP tools, and LSP servers from plugin cache
- **Zero hardcoded dependencies** — works with any plugin combination
- Dynamic keyword matching from scanner-extracted triggers
- Interactive skill selection via AskUserQuestion
- Compares overlapping skills and explains the difference
- Recommends execution order for multi-skill workflows
- **Plan-first execution** — `/cp` generates a work plan document before executing, with user approval
- Plan files saved as `YYYY-MM-DD-slug.md` in project `docs/` (configurable via `planDir`)
- Agent dashboard — tracks parallel Task agent lifecycle in real-time
- Slash command priority override — `/skill-name` invokes immediately without re-recommendation
- Max 5 recommendations (no overwhelm)
- Responds in your language (EN, KO, JA, ZH, ES, FR, DE, IT)
- Session memory — remembers your most used skills across sessions
- Plugin Discovery — suggests installable plugins when no match found

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
| `autoRecommend` | `true` | Show skill suggestions in responses |
| `showReport` | `true` | Show Lens tip line when skill matches |
| `minMatchScore` | `5` | Minimum keyword match score for recommendations |
| `memoryPath` | `null` | Custom path for memory file (null = `~/.claude/lens/`) |
| `customKeywords` | `[]` | Additional keyword-to-skill mappings |
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
