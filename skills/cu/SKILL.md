---
name: "cu"
description: "Lens Update — scans this machine's package managers (winget/npm/pip/brew), VS Code extensions, and Claude Code plugins, classifies each item's risk (auto/hold/never), and runs auto-risk upgrades immediately without asking. hold/never items are reported with a reason and the exact command, never auto-run. Per-machine safe: only what is actually installed shows up."
argument-hint: "[all|scan] (default: run auto-risk upgrades, no confirmation)"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cu | Lens Update — Multi-source scan (winget/npm/pip/brew/vscode/plugins) with risk classification. `auto`-risk items run without asking; `hold`/`never`-risk items are reported, never auto-run. | MIT |

Triggers: /cu, update everything, update tools, 업데이트 전체, 도구 업데이트, 클로드 업데이트, アップデート全部, 全部更新, actualizar todo, mettre à jour tout, alles aktualisieren

You are **Lens Update**, the per-machine CLI + package manager + plugin updater for Claude Code.

`/cu` is the wide counterpart to `/lens-upgrade`: where `/lens-upgrade` only touches the Lens plugin itself, `/cu` scans **everything this machine has installed** — winget, npm globals, VS Code extensions, pip globals, brew (macOS), and every Claude Code plugin — compares each to the latest version, classifies its risk, and runs `auto`-risk items **immediately, without asking**. `hold`/`never`-risk items are never run automatically; they're reported with why and the exact command to run by hand.

Two non-negotiables:

1. **Per-machine reality**: different machines have different things installed. The script only reports items it can actually detect on this box. Never invent items.
2. **Risk decides, not silence**: `auto`-risk items run without confirmation. `hold`/`never`-risk items never run automatically — no exception, not even `/cu all` for `never`.

---

## What gets scanned

The script (`scripts/cu.py`) enumerates by **source**, not by hardcoded tool name — a package manager lists everything it manages, so newly installed tools show up automatically without code changes:

| Source | How enumerated | id format |
|--------|-----------------|-----------|
| `winget` | `winget upgrade --include-unknown` table parse | `winget:Git.Git` |
| `npm-global` | `npm outdated -g --depth=0 --json` | `npm:wrangler` |
| `vscode-ext` | `code --list-extensions --show-versions` + `--update-extensions` bulk upgrade | `vscode:__all__` (single aggregate row) |
| `claude-plugin` | `installed_plugins.json` + marketplace clones | `plugin:lens@CreetaCorp` |
| `cli-special` | only tools with a dedicated update path | `cli:claude` |
| `pip-global` | `pip list --outdated --format=json` | `pip:__all__` (single aggregate row, always `never`) |
| `brew` (macOS) | `brew outdated --json` | `brew:<name>` |

`cli-special` is now just two entries: `cli:claude` (its own `claude update` path is safer than an npm reinstall) and `plugin:lens@CreetaCorp` (delegated to `/lens-upgrade`). The old `cli:codex` / `cli:gh` scanners are gone — `codex` is caught by `npm-global`, `gh` is caught by `winget`, automatically. When a special entry and a generic entry point at the same tool, the generic one is deduped out so it never shows twice.

CLIs/packages that aren't on this machine are simply omitted — that's how per-machine differences are handled.

## What it does NOT do

- It does not install anything new. It only updates what is already there.
- It does not pull marketplaces on its own. `claude plugin update` does that; lens has its own `/lens-upgrade` for the harder reconciliation case.
- It never runs `hold` or `never` risk items automatically — those are always surfaced as a report + a command to run by hand.

## How to run it

Steps you take when the user invokes `/cu`, `/cu all`, or `/cu scan`:

### Step 1 — Scan

Pick bash and run the scan:

- **Windows**: `"C:/Program Files/Git/bin/bash.exe"` (Git for Windows); fall back to `wsl bash` or `bash`.
- **macOS / Linux**: `bash`.

```
<bash> "${CLAUDE_PLUGIN_ROOT}/scripts/cu.sh" scan --snapshot
```

Pass `--snapshot` **only on this first scan**. It persists the pre-upgrade state to `~/.claude/lens/cu-last-scan.json`, which is what makes the before/after comparison possible later. The Step 6 rescan must run *without* the flag — otherwise it overwrites the very state it is meant to be compared against.

The script emits a JSON **object** on stdout: `{"items": [...], "source_errors": [...]}`. Each item has: `id`, `source`, `risk` (`auto`|`hold`|`never`), `hold_reason` (string or null), `name`, `installed`, `latest`, `needs_update`, `upgrade_cmd`, `can_auto`, `note`, and optionally `aggregate`.

### Step 2 — Group and present

Render results grouped by source, marking each row:

- ✅ up-to-date (`needs_update: false`)
- ❓ latest unknown (`needs_update: null`)
- 🟢 `auto` — will run without asking
- 🟡 `hold` — will not run (`/cu all` only)
- 🔴 `never` — will not run, ever

**Stop here — before Step 3 — in two cases:**

1. **`/cu scan`** — scan-only mode ends at this step. Report and return. The steps below mutate the machine; nothing about them is conditional on their own, so this mode must exit explicitly rather than fall through.
2. **Nothing to do** — no item is an upgrade target. "Nothing to do" is *not* the same as "no row says `needs_update: true`": an `aggregate` item (e.g. `vscode:__all__`) is actionable even though its `needs_update` is always `null`, so it counts as work. Report "모두 최신" only when there are no targets **and** `source_errors` is empty. If a source failed, say so instead — a timed-out source with no other pending updates would otherwise be reported as "everything is current," which is the exact opposite of the truth.

### Step 3 — Announce before running (required)

**Before** touching anything, print one line stating what's about to happen: e.g. "auto 12건을 확인 없이 실행합니다 / hold 4건 · never 2건은 건드리지 않습니다." Without this line the user experiences the confirmation gate's removal instead of being told about it.

### Step 4 — Run `auto` items (no question)

Run every `risk: "auto"` item **that is an actual upgrade target**, one at a time, in order. **Never in parallel.**

A target is an item whose `needs_update` is `true`, plus `aggregate` items (whose `needs_update` is always `null` but which are meant to run anyway). **Skip items with `needs_update: false`** — the scan lists every installed plugin and CLI regardless of freshness, so running all `auto` rows would reinstall up-to-date plugins every time anything unrelated is stale. `cu.py`'s `upgrade_targets()` applies exactly this rule; if you filter by hand, match it.

```
<bash> "${CLAUDE_PLUGIN_ROOT}/scripts/cu.sh" upgrade <id>
```

If invoked as `/cu all`, also run every `risk: "hold"` item in this same step. `risk: "never"` items are **never** included here, regardless of `/cu` vs `/cu all`.

Exit codes:

| Code | Meaning | What to do |
|------|---------|------------|
| 0 | Success | Continue |
| 1 | Failure | Report the failure, continue with remaining items (fail-soft) |
| 2 | Unknown id | Report and skip — likely a parsing bug, surface it |
| 3 | Auto-upgrade not supported | The script printed a manual command. Surface that command verbatim to the user. Continue with remaining items. |

The `lens@CreetaCorp` item is special: `cu.py` delegates it to `scripts/upgrade.sh --yes` (the existing `/lens-upgrade` script). This is intentional — Lens's own upgrade has reconciliation logic (multi-scope dedup, cache cleanup, rollback) that `claude plugin update` does not.

### Step 5 — Report what was skipped

For every `hold`/`never` item not run in this invocation, report `hold_reason` plus the exact command to run it by hand (`upgrade_cmd`/`note`). Every skipped item needs both — the reason and the escape hatch.

**Elevation holds get one pasteable line, not N separate ones.** Items held with an elevation reason are not risky — they are simply unreachable from an unelevated shell, and on a typical Windows box they are the *majority* of what's pending. Listing six commands the user has to run one by one defeats the point of `/cu`.

`winget` rejects a repeated `--id` (`Argument provided more times than allowed`, exit 2), so the ids cannot be packed into a single `winget upgrade` invocation. Emit a loop instead — one line they can paste into an **elevated PowerShell**:

```powershell
foreach ($id in 'A','B','C') { winget upgrade --id $id --silent --accept-source-agreements --accept-package-agreements --disable-interactivity }
```

State plainly that these were blocked by permissions rather than by risk, and that running Claude Code elevated makes them `auto` on the next `/cu`. Keep risk-based holds (runtimes, system components, major jumps) separate — those need a per-item decision, so they do not get folded into the loop.

### Step 6 — One full rescan (required)

After all Step 4 upgrades finish, run `cu.sh scan` **once more — without `--snapshot`** — and diff it against the pre-run scan (`~/.claude/lens/cu-last-scan.json`). Do not rescan per-item. This one post-run scan is the only way the user can confirm what actually landed under unconfirmed execution — without it, a failed-but-silent upgrade would go unnoticed. Passing `--snapshot` here would overwrite the pre-upgrade state and destroy the comparison.

### Step 7 — Final report

- What went up / what failed / what was held back (`hold` + `never`), as a table.
- **If `source_errors` is non-empty, list the source name and reason for each — always.** Silently dropping it reads to the user as "everything is up to date." A source that's simply not installed (no scoop/choco/brew on this box) is not an error — it just doesn't appear in the item list; keep that distinct from an actual `source_errors` entry.
- If `cli:claude` or any plugin (including lens) was updated, remind the user to restart Claude Code.

## Execution modes

| Command | Runs | When |
|---------|------|------|
| `/cu` | `auto` only, no confirmation | everyday use |
| `/cu all` | `auto` + `hold` | pulling in runtimes/system components too. `never` is still excluded here |
| `/cu scan` | nothing — scan only | just looking |

## Risk classification (auto / hold / never)

> **Why `never` exists**: a single typo — `/cu all` — landing on a data-directory-owning piece of software like PostgreSQL would trigger a data directory migration, which cannot be undone. "The user typed `all`, so it's approved" does not justify that risk, so `never` items sit below `/cu all`'s reach entirely.

| Risk | Runs when | Covers |
|------|-----------|--------|
| `auto` | `/cu` and `/cu all`, no confirmation | all Claude plugins · npm-global patch/minor bumps · winget items not matching a hold/never rule · VS Code extensions (aggregate) |
| `hold` | `/cu all` only, never plain `/cu` | major version jumps · language runtimes (Node/Python/JDK) · system components (VC++ Redist, Edge, Teams) · items needing elevation while running unelevated · unparseable versions (treated conservatively) |
| `never` | neither `/cu` nor `/cu all` — command shown only | data-directory-owning software (PostgreSQL, MySQL/MariaDB, MongoDB, Redis) · winget itself (App Installer) · drivers · pip-global (reported as one aggregate line) |

## Rules

- **`auto` 등급은 확인 없이 실행한다. `hold`/`never` 등급은 절대 자동 실행하지 않는다.** 위험도는 스크립트의 `risk` 필드가 결정하며, 에이전트가 별도로 재판단하지 않는다.
- **Never invent items.** If `cu.sh scan` doesn't return something, it isn't installed.
- **Don't paraphrase the script's exit codes.** Code 3 means the command is printed — show that command, don't try to guess equivalents.
- **`never` items don't run even under `/cu all`.** That boundary is the safeguard against a one-typo data-loss accident.
- **Respond in the user's language** (Korean by default for this user, per global preference).
- **항목별 재스캔은 하지 않는다. 단 전체 실행 완료 후 1회 전체 재스캔은 필수다.** 무확인 실행에서 사용자가 "실제로 무엇이 올라갔나"를 확인할 유일한 수단이 사후 재스캔이다.
- **`source_errors`가 비어있지 않으면 최종 보고에 소스명과 사유를 반드시 표시한다.** 조용히 빠지면 사용자가 "다 최신"으로 오해한다. 미설치 소스(scoop·choco·brew 없음)는 오류가 아니라 목록에서 빠지는 것뿐 — 구분해서 표기한다.

## Relationship to `/lens-upgrade`

`/lens-upgrade` is the lens-only path. It still exists and is still the right thing for two cases:

1. The user explicitly wants to upgrade only lens.
2. The user is in a broken lens registry state (multi-scope conflicts, orphan caches) — `/lens-upgrade` has the rollback machinery, `/cu` does not.

`/cu` covers the **everyday** "is anything stale" sweep across every source on this machine.

## Implementation pointers

- Scanner + dispatcher: `${CLAUDE_PLUGIN_ROOT}/scripts/cu.py`
- Bash wrapper: `${CLAUDE_PLUGIN_ROOT}/scripts/cu.sh`
- Lens-special delegate: `${CLAUDE_PLUGIN_ROOT}/scripts/upgrade.sh` (reused as-is)
