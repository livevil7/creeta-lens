#!/usr/bin/env bash
# Lens — triple verification driver (v3.36).
#
# Lane 1 is the Claude Supervisor, which runs inside the session and needs no
# plumbing. This script owns lanes 2 and 3 — Codex and Grok — and exists so the
# Leader types one line instead of orchestrating two backgrounded scripts, two
# output paths and two verdict formats by hand.
#
# That ergonomic point is the whole lesson of v3.34: the 40-line inline recipe
# for a single Codex call was measured at 7 uses across 3,065 transcripts and 0
# inside /cc. Doubling the lanes doubles the plumbing, so the plumbing has to
# disappear entirely or the third lane will go the way of the second.
#
# Usage:
#   scripts/cross-verify.sh --mode review --tag p45 [--timeout 420] [--effort high]
#   scripts/cross-verify.sh --mode prompt --tag p05 --prompt-file FILE [...]
#
#   --lanes codex,grok   which lanes to run (default both; a missing CLI is
#                        reported as unavailable, never fatal)
#   --dir DIR            where lane outputs land (default .lens/verify, gitignored)
#
# Output — one LANE line per lane, one FINDING line per high finding, one VERDICT
# line. Parse the VERDICT line; read a lane's `out=` file only when you want the
# detail behind it.
#
# Exit codes:
#   0  ran (read VERDICT to learn pass/fail) — including the all-lanes-down case
#   1  bad usage
#
# Exit status deliberately does NOT encode the verdict. A non-zero exit would be
# indistinguishable from "the script itself broke", and a review gate that cannot
# tell those apart fails open on infrastructure errors.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE=review
TAG=""
PROMPT_FILE=""
TIMEOUT=420
EFFORT=high
LANES="codex,grok"
DIR=".lens/verify"

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)        MODE="${2:-}"; shift 2 ;;
    --tag)         TAG="${2:-}"; shift 2 ;;
    --prompt-file) PROMPT_FILE="${2:-}"; shift 2 ;;
    --timeout)     TIMEOUT="${2:-}"; shift 2 ;;
    --effort)      EFFORT="${2:-}"; shift 2 ;;
    --lanes)       LANES="${2:-}"; shift 2 ;;
    --dir)         DIR="${2:-}"; shift 2 ;;
    -h|--help)     sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ -n "$TAG" ] || { echo "--tag is required (names the output files)" >&2; exit 1; }
[ "$MODE" = "prompt" ] && [ -z "$PROMPT_FILE" ] && { echo "--mode prompt needs --prompt-file" >&2; exit 1; }
mkdir -p "$DIR" || { echo "cannot create $DIR" >&2; exit 1; }

# ── Run the lanes concurrently ───────────────────────────
# Backgrounded and waited on here rather than left to the caller: two lanes are
# only worth having if they cost one lane's wall clock.
declare -A PID RCF OUTF START
for lane in ${LANES//,/ }; do
  case "$lane" in
    codex) script="$HERE/codex-review.sh" ;;
    grok)  script="$HERE/grok-review.sh" ;;
    *) echo "unknown lane: $lane" >&2; exit 1 ;;
  esac
  [ -f "$script" ] || { echo "missing lane script: $script" >&2; exit 1; }

  OUTF[$lane]="$DIR/$TAG-$lane.out"
  RCF[$lane]="$(mktemp "${TMPDIR:-/tmp}/lane_rc_XXXXXX")"
  START[$lane]="$(date +%s)"

  # Truncate before launching. A helper that exits at the detect/auth step never
  # reaches its own `: > $OUT`, so last run's verdict would still be sitting at
  # this path — and a stale FAIL read as a fresh one is the worst kind of wrong,
  # because it looks like the gate working.
  : > "${OUTF[$lane]}"

  if [ "$MODE" = "prompt" ]; then
    ( bash "$script" --mode prompt --prompt-file "$PROMPT_FILE" --out "${OUTF[$lane]}" \
        --timeout "$TIMEOUT" --effort "$EFFORT" >/dev/null 2>&1 </dev/null
      echo $? > "${RCF[$lane]}" ) &
  else
    ( bash "$script" --mode review --out "${OUTF[$lane]}" \
        --timeout "$TIMEOUT" --effort "$EFFORT" >/dev/null 2>&1 </dev/null
      echo $? > "${RCF[$lane]}" ) &
  fi
  PID[$lane]=$!
done

for lane in ${LANES//,/ }; do wait "${PID[$lane]}" 2>/dev/null; done

# ── Read each lane's verdict ─────────────────────────────
# Both review lanes are supposed to write {verdict, high_findings}, but a lane
# that timed out mid-stream leaves an event log or a fragment. The extractor
# takes the last well-formed object it can find and reports `unknown` rather than
# guessing — an unreadable lane must not silently read as pass.
EXTRACT='
const fs=require("fs");
let raw=""; try{ raw=fs.readFileSync(process.argv[1],"utf8"); }catch{}
const pick=o=>o&&typeof o==="object"&&typeof o.verdict==="string"?o:null;
let hit=null;
try{ hit=pick(JSON.parse(raw)); }catch{}
if(!hit){
  for(const line of raw.split(/\r?\n/)){
    if(!line.trim()) continue;
    let o=null; try{ o=JSON.parse(line); }catch{ continue }
    const cand=pick(o)||pick(o.item)||(o.item&&typeof o.item.text==="string"?safe(o.item.text):null);
    if(cand) hit=cand;
  }
}
if(!hit){
  const m=raw.match(/\{[^{}]*"verdict"[\s\S]*?\}/g);
  if(m) for(const s of m){ const c=safe(s); if(c) hit=c; }
}
function safe(s){ try{ const m=s.match(/\{[\s\S]*\}/); return pick(JSON.parse(m?m[0]:s)); }catch{ return null } }
if(!hit){ console.log("unknown"); process.exit(0); }
const f=Array.isArray(hit.high_findings)?hit.high_findings:[];
console.log(hit.verdict==="fail"||f.length?"fail":"pass");
f.forEach(x=>console.log("F "+String(x).replace(/[\r\n]+/g," ")));
'

any_fail=0; lanes_ok=0; lanes_down=0
SUMMARY="$(mktemp "${TMPDIR:-/tmp}/lane_sum_XXXXXX")"

for lane in ${LANES//,/ }; do
  rc="$(cat "${RCF[$lane]}" 2>/dev/null || echo 2)"; rm -f "${RCF[$lane]}"
  out="${OUTF[$lane]}"
  el=$(( $(date +%s) - ${START[$lane]} ))

  case "$rc" in
    0) status=ok ;;
    3) status=timeout ;;
    *) status=unavailable ;;
  esac

  # Only a lane that actually finished gets read. A timed-out lane can leave a
  # half-written file, and an unavailable one leaves the empty file truncated
  # above; parsing either would attribute a verdict to a lane that never voted.
  verdict="-"; findings=0
  if [ "$status" = "ok" ] && [ -s "$out" ]; then
    if [ "$MODE" = "review" ] && command -v node >/dev/null 2>&1; then
      res="$(node -e "$EXTRACT" "$out" 2>/dev/null)"
      verdict="$(printf '%s\n' "$res" | head -1)"
      findings="$(printf '%s\n' "$res" | grep -c '^F ' || true)"
      printf '%s\n' "$res" | sed -n "s/^F /FINDING $lane /p" >> "$SUMMARY"
    elif [ "$MODE" = "prompt" ]; then
      verdict="collected"
    fi
  fi

  # A lane that is down does not vote, and neither does one whose output could
  # not be parsed. Counting either as a passing vote would weaken the gate at
  # exactly the moment a tool breaks — which is the failure this change set is
  # about, so it must not be reintroduced one layer up.
  case "$status:$verdict" in
    ok:pass|ok:fail|ok:collected) lanes_ok=$((lanes_ok+1)) ;;
    *) lanes_down=$((lanes_down+1)); [ "$status" = "ok" ] && status=unparsable ;;
  esac
  [ "$verdict" = "fail" ] && any_fail=1

  echo "LANE $lane status=$status verdict=$verdict findings=$findings elapsed=${el}s out=$out"
done

cat "$SUMMARY"; rm -f "$SUMMARY"

if [ "$MODE" = "prompt" ]; then
  echo "VERDICT COLLECTED lanes_ok=$lanes_ok lanes_down=$lanes_down"
elif [ "$any_fail" = "1" ]; then
  echo "VERDICT FAIL lanes_ok=$lanes_ok lanes_down=$lanes_down"
elif [ "$lanes_ok" = "0" ]; then
  echo "VERDICT UNVERIFIED lanes_ok=0 lanes_down=$lanes_down"
else
  echo "VERDICT PASS lanes_ok=$lanes_ok lanes_down=$lanes_down"
fi
exit 0
