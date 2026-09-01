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
#   scripts/codex-review.sh --mode review  --out FILE [--timeout 300] [--effort high]
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

  DIFF="$(mktemp "${TMPDIR:-/tmp}/codex_diff_XXXXXX.txt")"
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

  PROMPT="$(mktemp "${TMPDIR:-/tmp}/codex_prompt_XXXXXX.txt")"
  {
    echo "아래 작업트리 변경을 코드리뷰하세요. 근거 확인이 필요하면 파일을 열되 최대 5개까지만 — 레포 전역 grep 은 금지합니다."
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
    >/dev/null 2>&1
  rc=$?
  rm -f "$SCHEMA" "$DIFF" "$PROMPT"
else
  timeout "$TIMEOUT" "$CODEX_BIN" exec --skip-git-repo-check -s read-only \
    "${MODEL_ARG[@]}" -c model_reasoning_effort="$EFFORT" -c service_tier=fast \
    -o "$OUT" - < "$PROMPT_FILE" >/dev/null 2>&1
  rc=$?
fi

# 124 is timeout(1)'s signal. Partial output is still worth collecting — the
# caller reports it as "⚠️ 미완 협의" rather than pretending nothing happened.
[ $rc -eq 124 ] && { echo "codex timed out after ${TIMEOUT}s (partial output kept)" >&2; exit 3; }
[ $rc -ne 0 ] && { echo "codex failed (rc=$rc)" >&2; exit 2; }
exit 0
