#!/usr/bin/env bash
# Lens — Grok cross-review helper. The third verification lane (v3.36).
#
# Why a third lane exists. The /cc gate was `Supervisor AND Codex`. Two lanes
# look like redundancy but they are correlated: both are frontier reasoning
# models over overlapping corpora, and when they share a blind spot the gate
# passes anyway — silently, which is the expensive kind. Grok is a different
# vendor, a different training set and a different tool loop, so the cases where
# it disagrees are exactly the cases the other two could not see. The owner has
# a Grok Build CLI subscription (session auth, not an API key), so a call costs
# nothing per invocation.
#
# The interface is deliberately byte-identical to codex-review.sh — same flags,
# same exit codes — so cross-verify.sh drives both lanes without special-casing
# either, and so a fourth lane can be added later by copying this file.
#
# Usage:
#   scripts/grok-review.sh --mode review  --out FILE [--timeout 300] [--effort high]
#   scripts/grok-review.sh --mode prompt  --out FILE --prompt-file FILE [...]
#
#   --mode review   structured review of the uncommitted worktree (/cc Phase 4.5)
#   --mode prompt   free-form prompt from a file (/cp P0.5 research, deep D2)
#
# Exit codes (same contract as codex-review.sh):
#   0  Grok ran and wrote $OUT
#   1  bad usage
#   2  Grok not found or not authenticated   → caller decides degrade vs stop
#   3  timed out (partial output may still be in $OUT)

set -uo pipefail

MODE=review
OUT=""
PROMPT_FILE=""
TIMEOUT=300
EFFORT=high

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)        MODE="${2:-}"; shift 2 ;;
    --out)         OUT="${2:-}"; shift 2 ;;
    --prompt-file) PROMPT_FILE="${2:-}"; shift 2 ;;
    --timeout)     TIMEOUT="${2:-}"; shift 2 ;;
    --effort)      EFFORT="${2:-}"; shift 2 ;;
    -h|--help)     sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ -n "$OUT" ] || { echo "--out is required" >&2; exit 1; }
[ "$MODE" = "prompt" ] && [ -z "$PROMPT_FILE" ] && { echo "--mode prompt needs --prompt-file" >&2; exit 1; }

# ── 1. Detect ────────────────────────────────────────────
# PATH first (npm shim), then the bundled binary the installer drops in ~/.grok.
GROK_BIN="${GROK_BIN:-}"
if [ -z "$GROK_BIN" ]; then
  if command -v grok >/dev/null 2>&1; then
    GROK_BIN="$(command -v grok)"
  else
    for c in "$HOME/.grok/bin"/grok.exe "$HOME/.grok/bin"/grok; do
      [ -x "$c" ] && { GROK_BIN="$c"; break; }
    done
  fi
fi
[ -n "$GROK_BIN" ] && [ -x "$GROK_BIN" ] || { echo "grok not found" >&2; exit 2; }

# Auth is a session token in ~/.grok/auth.json, not an API key (there is no
# GROK_API_KEY — the dead one was purged 2026-08-24). Probing the file is free;
# probing the network would cost a round trip on every single call.
AUTH="$HOME/.grok/auth.json"
[ -s "$AUTH" ] || { echo "grok not authenticated (missing or empty $AUTH)" >&2; exit 2; }

# ── 2. Run ───────────────────────────────────────────────
: > "$OUT"
RAW="$(mktemp "${TMPDIR:-/tmp}/grok_raw_XXXXXX.txt")"
rc=0

# Read-only posture, applied to both modes. A reviewer and a researcher both only
# ever need to look; neither needs bash or search_replace. Tool ids come from the
# CLI's own table (~/.grok/README.md), and this is an allowlist rather than a
# denylist on purpose — a typo in an allowlist fails loudly, a typo in a denylist
# silently leaves the dangerous tool enabled.
#
# Deliberately NOT `--sandbox strict`: under it read_file returned
# tool_output_error and the agent retried the failing call until the timeout
# killed it — 300s and zero output, versus 14s and a clean verdict without it
# (measured 2026-09-01). The allowlist is what removes the write/exec surface;
# strict only added a failure mode on top of it.
READONLY=(--tools read_file,grep,list_dir --disable-web-search)

# `</dev/null` on every agent call, without exception. `grok -p` and `codex exec`
# both append piped stdin to the prompt, so under a harness whose stdin is an
# open pipe that never sees EOF they block before the first token — measured at
# 3/3 hangs vs 3/3 successes with the redirect (2026-09-01). This one redirect is
# the difference between a 6-second call and a dead gate.
if [ "$MODE" = "review" ]; then
  # Untracked files are inlined, not just listed. `codex exec review --uncommitted`
  # reads them itself; Grok, given only filenames, answered in 9 seconds with
  # "cannot judge without seeing the file" — as a *high* finding, which under an
  # AND gate blocks the build on the reviewer's own missing input. Ship the bytes.
  DIFF="$(mktemp "${TMPDIR:-/tmp}/grok_diff_XXXXXX.txt")"
  {
    git diff 2>/dev/null
    git diff --cached 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null | while IFS= read -r f; do
      [ -f "$f" ] || continue
      # Symlinks are not followed. One link pointing outside the repo is
      # enough to put an unrelated secret file into an external prompt.
      [ -L "$f" ] && continue
      grep -Iq . "$f" 2>/dev/null || continue   # -I: skip binaries
      echo
      echo "### 새 파일: $f"
      head -c 60000 "$f"
      # Silent truncation lets a reviewer pass a file it only half read.
      [ "$(wc -c < "$f")" -gt 60000 ] && echo "…[잘림: $f 는 앞 60000바이트만 실렸습니다 — 전량 검토되지 않았습니다]"
    done
  } > "$DIFF"

  PROMPT="$(mktemp "${TMPDIR:-/tmp}/grok_prompt_XXXXXX.txt")"
  {
    echo "아래 작업트리 변경을 코드리뷰하세요. 저장소 파일을 직접 열어볼 수 있으니, 근거가 필요하면 열어서 확인하세요."
    echo "high 기준: 정확성 결함·회귀·보안·리소스 누수만. 스타일 취향은 high 가 아닙니다."
    echo "확인된 결함만 high_findings 에 넣으세요. '정보가 부족해 판단 불가' 같은 문장은 지적이 아니므로 넣지 마세요 — 부족하면 파일을 열어 확인하고, 그래도 결함을 특정하지 못하면 지적하지 않습니다."
    echo "verdict 는 high 지적이 하나라도 있으면 fail, 없으면 pass."
    echo "high_findings 의 각 항목은 '파일:라인 — 무엇이 왜 틀렸나' 한 줄로."
    echo
    cat "$DIFF"
  } > "$PROMPT"

  # $READONLY (below) is what makes --always-approve safe here: the diff under
  # review is untrusted input, and auto-approving a tool set that includes bash
  # and search_replace would turn a prompt injection in someone's patch into
  # local code execution. With only read tools in the allowlist, the worst an
  # injection buys is a file read the reviewer was already entitled to.
  timeout "$TIMEOUT" "$GROK_BIN" --prompt-file "$PROMPT" \
    --reasoning-effort "$EFFORT" --always-approve "${READONLY[@]}" \
    --json-schema '{"type":"object","properties":{"verdict":{"type":"string","enum":["pass","fail"]},"high_findings":{"type":"array","items":{"type":"string"}}},"required":["verdict","high_findings"]}' \
    > "$RAW" 2>/dev/null </dev/null
  rc=$?
  rm -f "$DIFF" "$PROMPT"

  # --json-schema implies --output-format json, which wraps the model's answer as
  # a JSON *string* under .text. Unwrap it here so callers read the same
  # {verdict, high_findings} shape from both lanes instead of learning two
  # envelope formats.
  if [ -s "$RAW" ] && command -v node >/dev/null 2>&1; then
    node -e '
const fs=require("fs");
const raw=fs.readFileSync(process.argv[1],"utf8");
let body=raw;
try{ const env=JSON.parse(raw); if(typeof env.text==="string") body=env.text; }catch{}
try{
  const m=body.match(/\{[\s\S]*\}/);
  const o=JSON.parse(m?m[0]:body);
  fs.writeFileSync(process.argv[2],JSON.stringify({verdict:o.verdict,high_findings:o.high_findings||[]}));
}catch{ fs.writeFileSync(process.argv[2],raw); }
' "$RAW" "$OUT" 2>/dev/null || cp "$RAW" "$OUT"
  else
    cp "$RAW" "$OUT" 2>/dev/null
  fi
else
  timeout "$TIMEOUT" "$GROK_BIN" --prompt-file "$PROMPT_FILE" \
    --reasoning-effort "$EFFORT" --always-approve "${READONLY[@]}" --output-format plain \
    > "$OUT" 2>/dev/null </dev/null
  rc=$?
fi

rm -f "$RAW"

[ $rc -eq 124 ] && { echo "grok timed out after ${TIMEOUT}s (partial output kept)" >&2; exit 3; }
[ $rc -ne 0 ] && { echo "grok failed (rc=$rc)" >&2; exit 2; }
exit 0
