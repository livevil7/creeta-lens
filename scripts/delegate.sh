#!/usr/bin/env bash
# Lens — external-engine task dispatcher (v3.38).
#
# Why this exists. `/cc` had exactly one Claude-shaped lane for work: an `Agent`
# subagent, billed in Claude tokens, for every sub-task including the ones that
# only ever read. Meanwhile two other engines were already installed, already
# authenticated and already flat-rate — Codex (the model cache's priority-1 slug,
# currently gpt-6-astra) and Grok Build CLI — but the skill only reached for them
# at the review gate (Phase 4.5). Reading a repo is the bulk of what a /cc run
# spends, and spending it on the one metered engine was the whole cost problem.
#
# So this is cross-verify.sh's sibling: same ergonomics lesson (v3.34 measured a
# 40-line inline recipe at 0 uses inside /cc), same one-line contract, but N
# heterogeneous tasks instead of one shared prompt across lanes.
#
# READ-ONLY, deliberately. Both helpers run their engine with a read-only
# posture, and this script does not add a write mode. Two reasons, in order:
#   1. If Codex writes code, Codex can no longer be an independent reviewer of
#      that code in Phase 4.5 — the triple gate silently collapses to a double
#      one, and that gate is the thing the owner said catches the bugs Claude
#      misses. Saving tokens by weakening it is a bad trade.
#   2. Nothing in Lens observes an external write: no PreToolUse gate, no agent
#      tracker, no gate ledger entry.
# Writing stays on the Claude lane. What moves here is reading, and reading is
# where the tokens were going.
#
# Usage:
#   scripts/delegate.sh --task recon:grok:.lens/delegate/recon.txt \
#                       --task audit:codex:.lens/delegate/audit.txt \
#                       [--timeout 420] [--effort high] [--dir .lens/delegate]
#
#   --task ID:ENGINE:PROMPT_FILE   repeatable. ENGINE = codex | grok.
#                                  Split on the FIRST two colons, so a Windows
#                                  prompt path like C:/tmp/p.txt still parses.
#   --dir DIR                      where task outputs land (default .lens/delegate)
#
# Output — one TASK line per task, then one DISPATCH line. Parse those; open a
# task's `out=` file to read what the engine actually produced.
#
#   TASK recon engine=grok  status=ok     elapsed=14s  out=.lens/delegate/recon.out
#   TASK audit engine=codex status=empty  elapsed=91s  out=.lens/delegate/audit.out
#   DISPATCH DONE ok=1 down=1
#
# Exit codes:
#   0  dispatched (read the TASK lines to learn what came back)
#   1  bad usage
#
# Exit status deliberately does NOT encode task success — same reasoning as
# cross-verify.sh. A non-zero exit for "one engine was unavailable" is
# indistinguishable from "the dispatcher itself broke", and a caller that cannot
# tell those apart degrades on infrastructure noise.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TIMEOUT=420
EFFORT=high
DIR=".lens/delegate"
IDS=(); ENGINES=(); PROMPTS=(); PAIRS=()

# A value-taking flag left without its value would otherwise spin forever:
# `shift 2` with one argument remaining neither shifts nor exits, because this
# script deliberately does not run under `set -e`.
need_val() { [ $# -ge 2 ] || { echo "missing value for $1" >&2; exit 1; }; }

while [ $# -gt 0 ]; do
  case "$1" in
    --task)
      need_val "$@"; spec="$2"; shift 2
      id="${spec%%:*}"; rest="${spec#*:}"
      eng="${rest%%:*}"; file="${rest#*:}"
      [ -n "$id" ] && [ -n "$eng" ] && [ -n "$file" ] && [ "$file" != "$rest" ] \
        || { echo "bad --task (want ID:ENGINE:PROMPT_FILE): $spec" >&2; exit 1; }
      # The id names a file. An unconstrained id could walk out of --dir.
      case "$id" in
        *[!A-Za-z0-9_.-]*) echo "bad --task id (allowed: A-Za-z0-9_.-): $id" >&2; exit 1 ;;
      esac
      case "$eng" in
        codex|grok) ;;
        *) echo "unknown engine: $eng (want codex|grok)" >&2; exit 1 ;;
      esac
      [ -f "$file" ] || { echo "prompt file not found: $file" >&2; exit 1; }
      # id+engine names the output file, so a repeat would have two concurrent
      # tasks writing one path — both would report ok and one answer would be
      # delivered for both requests. The same id on two different engines is
      # fine (that is "ask both"), and lands in two distinct files.
      #
      # Compared case-insensitively because the output path is what actually
      # collides, and this runs on Windows where `A-grok.out` and `a-grok.out`
      # are one file. A case-sensitive check would wave `A:grok` and `a:grok`
      # through into exactly the clobber it exists to stop.
      key="$(printf '%s:%s' "$id" "$eng" | tr '[:upper:]' '[:lower:]')"
      for seen in ${PAIRS[@]+"${PAIRS[@]}"}; do
        [ "$seen" = "$key" ] && { echo "duplicate --task target: $id:$eng" >&2; exit 1; }
      done
      PAIRS+=("$key")
      IDS+=("$id"); ENGINES+=("$eng"); PROMPTS+=("$file")
      ;;
    --timeout) need_val "$@"; TIMEOUT="$2"; shift 2 ;;
    --effort)  need_val "$@"; EFFORT="$2";  shift 2 ;;
    --dir)     need_val "$@"; DIR="$2";     shift 2 ;;
    -h|--help) sed -n '2,51p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ ${#IDS[@]} -gt 0 ] || { echo "at least one --task is required" >&2; exit 1; }
mkdir -p "$DIR" || { echo "cannot create $DIR" >&2; exit 1; }

# ── Launch every task at once ────────────────────────────
# Backgrounded here rather than left to the caller for the same reason
# cross-verify.sh does it: N engines are only worth having if they cost one
# engine's wall clock. A Leader that awaits them one at a time has bought
# nothing but latency.
PIDS=(); RCFS=(); OUTS=(); STARTS=()
for i in "${!IDS[@]}"; do
  case "${ENGINES[$i]}" in
    codex) script="$HERE/codex-review.sh" ;;
    grok)  script="$HERE/grok-review.sh" ;;
  esac
  [ -f "$script" ] || { echo "missing engine script: $script" >&2; exit 1; }

  OUTS[$i]="$DIR/${IDS[$i]}-${ENGINES[$i]}.out"
  RCFS[$i]="$(mktemp "${TMPDIR:-/tmp}/task_rc_XXXXXX")"
  STARTS[$i]="$(date +%s)"

  # Truncate before launching. A helper that exits at its detect/auth step never
  # reaches its own `: > $OUT`, so the previous run's answer would still be
  # sitting at this path — and a stale answer read as a fresh one is worse than
  # no answer, because it looks like the delegation working.
  : > "${OUTS[$i]}"

  # The finish time is stamped inside the subshell, not in the report loop. That
  # loop runs after `wait` on every task, so a clock read there hands each task
  # the *slowest* task's wall clock — a 14-second Grok answer would be filed as
  # 400 seconds beside a slow Codex one, and knowing which engine is worth
  # waiting for is most of what these numbers are for.
  ( bash "$script" --mode prompt --prompt-file "${PROMPTS[$i]}" --out "${OUTS[$i]}" \
      --timeout "$TIMEOUT" --effort "$EFFORT" >/dev/null 2>&1 </dev/null
    rc=$?; echo "$rc $(date +%s)" > "${RCFS[$i]}" ) &
  PIDS[$i]=$!
done

for i in "${!IDS[@]}"; do wait "${PIDS[$i]}" 2>/dev/null; done

# ── Report ───────────────────────────────────────────────
ok=0; down=0
for i in "${!IDS[@]}"; do
  rc=2; fin=""
  read -r rc fin < "${RCFS[$i]}" 2>/dev/null || rc=2
  rm -f "${RCFS[$i]}"
  # A subshell killed before it could stamp leaves a short or empty file; treat
  # either field as unusable rather than letting an empty string reach $(( )).
  case "${rc:-}"  in ""|*[!0-9]*) rc=2 ;; esac
  case "${fin:-}" in ""|*[!0-9]*) fin="$(date +%s)" ;; esac
  el=$(( fin - ${STARTS[$i]} ))

  case "$rc" in
    0) status=ok ;;
    3) status=timeout ;;
    *) status=unavailable ;;
  esac

  # rc 0 with an empty file is its own status, not an ok. An engine that ran and
  # returned nothing has told the Leader nothing, and a Worker prompted with an
  # empty briefing is worse off than one told to go look for itself.
  [ "$status" = "ok" ] && [ ! -s "${OUTS[$i]}" ] && status=empty

  if [ "$status" = "ok" ]; then ok=$((ok+1)); else down=$((down+1)); fi

  printf 'TASK %s engine=%s status=%s elapsed=%ss out=%s\n' \
    "${IDS[$i]}" "${ENGINES[$i]}" "$status" "$el" "${OUTS[$i]}"
done

echo "DISPATCH DONE ok=$ok down=$down"
exit 0
