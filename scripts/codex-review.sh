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
#   scripts/codex-review.sh --mode review [--base BRANCH] [--out FILE] [--timeout 300] [--effort high]
#   scripts/codex-review.sh --mode prompt --prompt-file FILE [--out FILE] [...]
#
# Arguments — the same table heads scripts/cross-verify.sh; keep the two in step:
#   --mode review|prompt  review = structured review of the change set (/cc Phase 4.5)
#                         prompt = free-form prompt from a file (/cp P0.5, deep D2)
#   --prompt-file FILE    prompt mode input
#   --base BRANCH         review: also review the commits since
#                         merge-base(origin/BRANCH, HEAD) — local BRANCH when there
#                         is no origin/BRANCH. Without it: uncommitted changes, or,
#                         when there are none, the commits ahead of the upstream.
#   --out PATH            here: the result file (default: a temp file). The path is
#                         printed as `out=PATH`; codex's stderr goes to PATH.stderr.log
#                         cross-verify: the lane output folder (default .lens/verify)
#   --timeout SEC         here 300 · cross-verify 420
#   --effort LEVEL        default high
#   (cross-verify only: --tag NAME · --plan MD · --lanes codex · --dir = --out)
#
# Review scope (v3.48.0): the owner's rule is "always commit", so a review that
# read only the worktree saw nothing right after every commit — measured: a
# 34-file, +4,681-line commit got a 37-byte "pass", and the same commit reviewed
# by hand had a cross-seller access flaw. `.lens/` runtime state is never part of
# the diff. Nothing left to review → {"verdict":"unverified","reason":"empty
# diff"} and Codex is not called: silence is not a pass.
#
# Exit codes:
#   0  Codex ran and wrote $OUT — or the diff was empty ($OUT says unverified)
#   1  bad usage (including a --base that resolves to no ref)
#   2  Codex not found or not authenticated   → caller decides degrade vs stop
#   3  timed out — $OUT keeps partial output, or {"verdict":"unverified",
#      "reason":"timeout <sec>s"} when there was none (never an empty file)
#
# Two hard-won invariants live in the call itself, not in the caller:
#   * `</dev/null` — `codex exec` appends piped stdin to the prompt. Under a
#     harness whose stdin is an open pipe that never reaches EOF it blocks
#     before the first token. Measured 2026-09-01: 3/3 hangs without the
#     redirect, 3/3 successes at 6-8s with it. This was ~83% of all Lens codex
#     timeouts and it looked like a slow model, not a plumbing bug.
#   * a bounded review prompt — see the review branch below.
#
# The exit code is the whole interface: this script never decides whether a
# missing Codex is fatal. /cp default and /cc degrade on 2; /cp deep must stop
# and report (deep delta D2). Encoding that policy here would flatten the two.

set -uo pipefail

MODE=review
OUT=""
PROMPT_FILE=""
TIMEOUT=300
EFFORT=high
BASE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)        MODE="${2:-}"; shift 2 ;;
    --out)         OUT="${2:-}"; shift 2 ;;
    --prompt-file) PROMPT_FILE="${2:-}"; shift 2 ;;
    --timeout)     TIMEOUT="${2:-}"; shift 2 ;;
    --effort)      EFFORT="${2:-}"; shift 2 ;;
    --base)        BASE="${2:-}"; shift 2 ;;
    -h|--help)     sed -n '2,47p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[ "$MODE" = "prompt" ] && [ -z "$PROMPT_FILE" ] && { echo "--mode prompt needs --prompt-file" >&2; exit 1; }

# --base must resolve before anything runs: a base that silently resolved to
# nothing would shrink the review back to the worktree — the defect above.
MERGE_BASE=""
if [ "$MODE" = "review" ] && [ -n "$BASE" ]; then
  BASE_REF="origin/$BASE"
  git rev-parse --verify -q "$BASE_REF^{commit}" >/dev/null 2>&1 || BASE_REF="$BASE"
  git rev-parse --verify -q "$BASE_REF^{commit}" >/dev/null 2>&1 \
    || { echo "base not found: origin/$BASE or $BASE" >&2; exit 1; }
  MERGE_BASE="$(git merge-base "$BASE_REF" HEAD 2>/dev/null)" \
    || { echo "no merge-base between $BASE_REF and HEAD" >&2; exit 1; }
fi

# A caller without --out used to get "--out is required" and no review (/cp deep
# D2 calls it that way). Default to a temp file and say where it is.
[ -n "$OUT" ] || OUT="$(mktemp "${TMPDIR:-/tmp}/codex_out_XXXXXX.txt")" || exit 1
echo "out=$OUT"
# A timeout used to leave a 0-byte result and no trace of why (p05, 420s).
LOG="$OUT.stderr.log"
: > "$LOG"

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
  # Why this is no longer `codex exec review --uncommitted` (v3.36). That recipe
  # is git-aware and needs no diff injection, but the CLI refuses `--uncommitted`
  # together with a [PROMPT] — so there is no way to tell it how far it may
  # explore. Measured on this repo 2026-09-01: 300s of wall clock, 22 shell tool
  # calls (repo-wide rg, PowerShell), 644KB of JSONL, and no verdict. The gate
  # died in exactly the case it exists for. Injecting the diff into a plain
  # `codex exec` keeps --output-schema — the caller still parses a verdict rather
  # than prose — and lets the prompt cap the exploration.
  SCHEMA="$(mktemp "${TMPDIR:-/tmp}/codex_schema_XXXXXX.json")"
  printf '%s' '{"type":"object","additionalProperties":false,"properties":{"verdict":{"type":"string","enum":["pass","fail"]},"high_findings":{"type":"array","items":{"type":"string"}}},"required":["verdict","high_findings"]}' > "$SCHEMA"

  # Whole tree from the top, minus Lens runtime state at any depth.
  PATHS=(-- ':(top)' ':(top,exclude,glob)**/.lens/**')
  DIFF="$(mktemp "${TMPDIR:-/tmp}/codex_diff_XXXXXX.txt")"
  WORK="$(mktemp "${TMPDIR:-/tmp}/codex_work_XXXXXX.txt")"
  COMMITTED="$(mktemp "${TMPDIR:-/tmp}/codex_committed_XXXXXX.txt")"
  {
    git diff "${PATHS[@]}" 2>/dev/null
    git diff --cached "${PATHS[@]}" 2>/dev/null
    git ls-files --others --exclude-standard "${PATHS[@]}" 2>/dev/null | while IFS= read -r f; do
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
  } > "$WORK"

  # Committed changes: since the merge-base with --base, or — only when nothing
  # is uncommitted — since the merge-base with the upstream HEAD is ahead of.
  FROM="$MERGE_BASE"
  if [ -z "$BASE" ] && [ ! -s "$WORK" ] \
     && [ "$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)" -gt 0 ]; then
    FROM="$(git merge-base '@{u}' HEAD 2>/dev/null)"
  fi
  [ -n "$FROM" ] && git diff "$FROM" HEAD "${PATHS[@]}" > "$COMMITTED" 2>/dev/null
  {
    if [ -s "$COMMITTED" ]; then
      echo "### 커밋된 변경: ${FROM:0:12}..HEAD"
      cat "$COMMITTED"
      echo
    fi
    cat "$WORK"
  } > "$DIFF"
  rm -f "$WORK" "$COMMITTED"

  if [ ! -s "$DIFF" ]; then
    printf '%s' '{"verdict":"unverified","reason":"empty diff"}' > "$OUT"
    rm -f "$SCHEMA" "$DIFF"
    echo "nothing to review — codex not called" >&2
    exit 0
  fi

  PROMPT="$(mktemp "${TMPDIR:-/tmp}/codex_prompt_XXXXXX.txt")"
  {
    echo "아래 변경을 코드리뷰하세요. 근거 확인이 필요하면 파일을 열되 최대 5개까지만 — 레포 전역 grep 은 금지합니다."
    echo "high 기준: 정확성 결함·회귀·보안·리소스 누수만. 스타일 취향은 high 가 아닙니다."
    echo "확인된 결함만 high_findings 에 넣으세요. '정보 부족으로 판단 불가' 는 지적이 아닙니다."
    echo "verdict 는 high 지적이 하나라도 있으면 fail, 없으면 pass."
    echo "high_findings 의 각 항목은 '파일:라인 — 무엇이 왜 틀렸나' 한 줄로."
    echo
    cat "$DIFF"
  } > "$PROMPT"

  # -o writes only the final message, so $OUT is the {verdict, high_findings}
  # object itself rather than an event stream the caller would have to mine.
  # The prompt goes in on stdin, not argv. A worktree diff plus inlined new files
  # runs to hundreds of KB and `codex exec "$(cat …)"` dies at the OS limit —
  # measured 2026-09-01: 214KB on argv = rc 126 "Argument list too long" in 0s,
  # the same bytes on stdin = rc 0 in 6s. `-` tells codex to take the prompt from
  # stdin, and a file redirect delivers EOF, so this does not reintroduce the hang
  # the </dev/null redirects elsewhere exist to prevent.
  # -s read-only: the diff is untrusted input and can carry a prompt injection,
  # while the owner's config.toml defaults to sandbox_mode = danger-full-access.
  timeout "$TIMEOUT" "$CODEX_BIN" exec --skip-git-repo-check -s read-only \
    "${MODEL_ARG[@]}" -c model_reasoning_effort="$EFFORT" -c service_tier=fast \
    --output-schema "$SCHEMA" --ephemeral -o "$OUT" - < "$PROMPT" \
    >/dev/null 2>>"$LOG"
  rc=$?
  rm -f "$SCHEMA" "$DIFF" "$PROMPT"
else
  timeout "$TIMEOUT" "$CODEX_BIN" exec --skip-git-repo-check -s read-only \
    "${MODEL_ARG[@]}" -c model_reasoning_effort="$EFFORT" -c service_tier=fast \
    -o "$OUT" - < "$PROMPT_FILE" >/dev/null 2>>"$LOG"
  rc=$?
fi

# 124 is timeout(1)'s signal. Partial output is still worth collecting — the
# caller reports it as "⚠️ 미완 협의" rather than pretending nothing happened.
if [ $rc -eq 124 ]; then
  [ -s "$OUT" ] || printf '{"verdict":"unverified","reason":"timeout %ss"}' "$TIMEOUT" > "$OUT"
  echo "codex timed out after ${TIMEOUT}s (partial output kept, stderr: $LOG)" >&2
  exit 3
fi
[ $rc -ne 0 ] && { echo "codex failed (rc=$rc, stderr: $LOG)" >&2; exit 2; }
exit 0
