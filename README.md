# Creet

**Never wonder which plugin to use again.**

Creet is a skill navigator for Claude Code by [Creeta](https://www.creeta.com). It scans your installed plugins, finds the best skill for your task, and runs it — all from a single command.

## The Problem

You installed 10+ plugins. That's 50+ slash commands. You can't remember them all, and you don't know which combination works best for your task.

## The Solution

```
You: /creet:c build a login page with social auth

Creet — Skill Scan
┌────┬──────────────────┬──────────┬─────────────────────┐
│ #  │ Skill            │ Domain   │ What it does        │
├────┼──────────────────┼──────────┼─────────────────────┤
│ 1  │ /frontend-design │ Frontend │ High-quality UI     │
│ 2  │ /bkend-auth      │ Backend  │ Auth & security     │
│ 3  │ /code-review     │ Quality  │ PR code review      │
│ .. │ ...              │ ...      │ ...                 │
└────┴──────────────────┴──────────┴─────────────────────┘
Total: 12 skills from 4 plugins

Creet — Recommendation

> "Build a login page with social auth"

│ Order │ Skill            │ Reason              │
│ 1st   │ /bkend-auth      │ Social auth logic   │
│ 2nd   │ /frontend-design │ Login page UI       │

Proceed with /bkend-auth? (y/n)
```

Type `y` and Creet runs the skill immediately.

## Installation

### Option 1: Load directly from GitHub (Recommended)

Clone the repo and load it with `--plugin-dir`:

```bash
git clone https://github.com/Creeta-creet/creet.git
claude --plugin-dir ./creet
```

Then use `/creet:c` inside Claude Code.

### Option 2: Copy to your commands (Quick setup)

Copy the skill file to your user-level commands for a shorter `/c` command:

```bash
mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/c.md https://raw.githubusercontent.com/Creeta-creet/creet/main/skills/c/SKILL.md
```

Restart Claude Code, then use `/c` directly.

### Option 3: Load as a local plugin

If you already cloned the repo:

```bash
claude --plugin-dir /path/to/creet
```

## Usage

```
/creet:c <what you want to do>
```

Or if installed as a user command:

```
/c <what you want to do>
```

### Examples

| You type | Creet recommends |
|----------|-------------------|
| `/c build a dashboard` | /frontend-design |
| `/c review my PR` | /code-review → /commit-push-pr |
| `/c deploy to production` | /phase-9-deployment + /sentry-setup-tracing |
| `/c I'm new, where do I start?` | /first-claude-code |
| `/c set up error tracking` | /sentry |

## How It Works

1. **Scan** — Lists all installed skills in the current session
2. **Recommend** — Matches your request to the best skill(s)
3. **Execute** — Runs the chosen skill on your confirmation

## Features

- Auto-scans all installed plugins at session start via SessionStart hook
- Auto-recommends skills based on keyword matching (8 languages)
- Works with ANY combination of installed plugins
- Compares overlapping skills and explains the difference
- Recommends execution order for multi-skill workflows
- Max 5 recommendations (no overwhelm)
- Responds in your language (EN, KO, JA, ZH, ES, FR, DE, IT)
- Session memory — remembers your most used skills across sessions

## Requirements

- Claude Code v1.0.33+
- 2+ plugins installed (otherwise you don't need a navigator)

## License

MIT
