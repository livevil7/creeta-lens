#!/usr/bin/env bash
# Lens — Codex cross-review helper.
#
# Why this exists (v3.34). The audit measured `codex exec review` — the exact
# recipe /cc Phase 4.5 prescribes — at 7 calls across 3,065 transcripts, and 0
# inside /cc runs. Codex itself was in heavy use: 661 Bash invocations. What went
# unused was not the tool, it was the 40 lines of inline plumbing the Leader had
# to retype every time (two mktemps, an inline node resolver, a schema file, a
# four-step fallback). The shapes that did get used were the light ones — model
# + effort + an output file, backgrounded, collected later.
#
# So the plumbing moves here and the skill keeps a one-line contract. Owner
# directive (2026-08-22): Codex review stays, non-negotiable — "그 규칙으로
# 클로드 못 잡은 버그를 아주 많이 잡았어."
#
# Usage:
#   scripts/codex-review.sh --mode review  --out FILE [--timeout 180] [--effort high]
#   scripts/codex-review.sh --mode prompt  --out FILE --prompt-file FILE [...]
#
#   --mode review   structured review of the uncommitted worktree (/cc Phase 4.5)
#   --mode prompt   free-form prompt from a file (/cp P0.5 research, deep D2)
#
# Exit codes:
#   0  Codex ran and wrote $OUT
#   1  bad usage
#   2  Codex not found or not authenticated   → caller decides degrade vs stop
#   3  timed out (partial output may still be in $OUT)
#
# The exit code is the whole interface: this script never decides whether a
# missing Codex is fatal. /cp default and /cc degrade on 2; /cp deep must stop
# and report (deep delta D2). Encoding that policy here would flatten the two.

set -uo pipefail

MODE=review
OUT=""
PROMPT_FILE=""
TIMEOUT=180
EFFORT=high

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)        MODE="${2:-}"; shift 2 ;;
    --out)         OUT="${2:-}"; shift 2 ;;
    --prompt-file) PROMPT_FILE="${2:-}"; shift 2 ;;
    --timeout)     TIMEOUT="${2:-}"; shift 2 ;;
    --effort)      EFFORT="${2:-}"; shift 2 ;;
    -h|--help)     sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ -n "$OUT" ] || { echo "--out is required" >&2; exit 1; }
[ "$MODE" = "prompt" ] && [ -z "$PROMPT_FILE" ] && { echo "--mode prompt needs --prompt-file" >&2; exit 1; }

# ── 1. Detect ────────────────────────────────────────────
# Three-step fallback, same order as docs/rules/codex-integration.md §2.
CODEX_BIN="${CODEX_BIN:-}"
if [ -z "$CODEX_BIN" ]; then
  if command -v codex >/dev/null 2>&1; then
    CODEX_BIN="$(command -v codex)"
  else
    for c in "$HOME/.vscode/extensions"/openai.chatgpt-*/binaries/codex* \
             "$HOME/.cursor/extensions"/openai.chatgpt-*/binaries/codex*; do
      [ -x "$c" ] && { CODEX_BIN="$c"; break; }
    done
  fi
fi
[ -n "$CODEX_BIN" ] && [ -x "$CODEX_BIN" ] || { echo "codex not found" >&2; exit 2; }

# ── 2. Resolve model ─────────────────────────────────────
# Rank order from the local cache, never a hardcoded slug — the leaderboard moves
# and a pinned name silently downgrades the review (codex-integration.md §4 ①).
MODEL_ARG=()
if command -v node >/dev/null 2>&1; then
  CODEX_MODEL="$(node -e "
const p=require('path'),os=require('os');
try{
  const d=require(p.join(os.homedir(),'.codex','models_cache.json'));
  const m=d.models.filter(x=>x.visibility==='list'&&x.supported_in_api!==false)
                   .sort((a,b)=>(a.priority??99)-(b.priority??99))[0];
  if(m&&m.slug)console.log(m.slug);
}catch{}" 2>/dev/null)"
  [ -n "${CODEX_MODEL:-}" ] && MODEL_ARG=(-m "$CODEX_MODEL")
fi
[ ${#MODEL_ARG[@]} -eq 0 ] && echo "⚠️ 모델 resolver 실패 — codex config 기본 모델로 진행" >&2

# ── 3. Run ───────────────────────────────────────────────
: > "$OUT"
rc=0

if [ "$MODE" = "review" ]; then
  # `codex exec review`, not bare `codex review` — the latter does not expose
  # --output-schema/--ephemeral. The schema is what removes PASS/FAIL text
  # parsing from the caller; without it the Leader guesses from prose.
  SCHEMA="$(mktemp "${TMPDIR:-/tmp}/codex_schema_XXXXXX.json")"
  printf '%s' '{"type":"object","properties":{"verdict":{"type":"string","enum":["pass","fail"]},"high_findings":{"type":"array","items":{"type":"string"}}},"required":["verdict","high_findings"]}' > "$SCHEMA"
  timeout "$TIMEOUT" "$CODEX_BIN" exec review --uncommitted \
    "${MODEL_ARG[@]}" -c model_reasoning_effort="$EFFORT" -c service_tier=fast \
    --output-schema "$SCHEMA" --ephemeral --json > "$OUT" 2>/dev/null
  rc=$?
  rm -f "$SCHEMA"

  # Older codex builds have no `exec review`. Fall back to a free-form pass over
  # the diff so an outdated CLI degrades to a weaker review instead of none.
  if [ $rc -ne 0 ] && [ $rc -ne 124 ] && [ ! -s "$OUT" ]; then
    echo "⚠️ codex exec review 미지원 — 자유형 리뷰로 폴백" >&2
    DIFF="$(mktemp "${TMPDIR:-/tmp}/codex_diff_XXXXXX.txt")"
    { git diff; git diff --cached; } > "$DIFF" 2>/dev/null
    timeout "$TIMEOUT" "$CODEX_BIN" exec \
      "${MODEL_ARG[@]}" -c model_reasoning_effort="$EFFORT" -c service_tier=fast \
      -o "$OUT" \
      "다음 코드 변경을 리뷰하세요. 순수 텍스트, 한국어. 각 지적은 [심각도 high/med/low] + 파일:라인 + 무엇이 + 왜. 마지막 줄에 PASS 또는 FAIL 한 단어만.$(printf '\n\n')$(cat "$DIFF")" \
      >/dev/null 2>&1
    rc=$?
    rm -f "$DIFF"
  fi
else
  timeout "$TIMEOUT" "$CODEX_BIN" exec \
    "${MODEL_ARG[@]}" -c model_reasoning_effort="$EFFORT" -c service_tier=fast \
    -o "$OUT" "$(cat "$PROMPT_FILE")" >/dev/null 2>&1
  rc=$?
fi

# 124 is timeout(1)'s signal. Partial output is still worth collecting — the
# caller reports it as "⚠️ 미완 협의" rather than pretending nothing happened.
[ $rc -eq 124 ] && { echo "codex timed out after ${TIMEOUT}s (partial output kept)" >&2; exit 3; }
[ $rc -ne 0 ] && { echo "codex failed (rc=$rc)" >&2; exit 2; }
exit 0
