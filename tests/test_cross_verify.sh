#!/usr/bin/env bash
# Regression tests for the cross-verification lane (v3.36; Grok lane removed v3.41).
#
# Every assertion here corresponds to a defect that actually shipped and cost a
# working gate. They are cheap static checks plus one functional check of the
# merge logic, because the expensive part — calling the models — is exactly what
# a test must not do.
#
#   run:  bash tests/test_cross_verify.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX="$ROOT/scripts/codex-review.sh"
CROSS="$ROOT/scripts/cross-verify.sh"

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   — $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL — $1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/xv_XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "== 1. 호출 불변식 (docs/rules/codex-integration.md §1.5) =="

# ① stdin. The defect: `codex exec` appends piped stdin to the prompt, so under a
# harness whose stdin never reaches EOF it hung before the first token — 83% of
# all Lens codex calls died this way and read as "the model is slow".
# Every timeout-wrapped agent invocation must close stdin, either from
# /dev/null or from a prompt file (a file delivers EOF, so it is equally safe).
bare="$(grep -n 'timeout "\$TIMEOUT"' "$CODEX" | wc -l)"
closed="$(grep -c '</dev/null\|< "\$PROMPT' "$CODEX")"
check "codex-review.sh: agent 호출 $bare 개 전부 stdin 을 닫는다" "[ $closed -ge $bare ]"

# Comments in these scripts quote the very patterns the rules forbid, in order to
# explain why they are forbidden. Strip them before asserting, or the explanation
# fails the test it exists to justify.
code_only() { sed 's/#.*//' "$1"; }

# ② argv. 214KB on argv = rc 126 "Argument list too long" in 0s.
check "codex-review.sh: 프롬프트를 argv 로 넘기지 않는다" \
  "! code_only '$CODEX' | grep -q 'exec.*\"\\\$(cat '"

# The schema server-validates: without additionalProperties:false it 400s.
check "codex-review.sh: 스키마에 additionalProperties:false 가 있다" \
  "grep -q '\"additionalProperties\":false' '$CODEX'"

# read-only sandbox — the diff under review is untrusted input and the owner's
# config.toml defaults to danger-full-access.
check "codex-review.sh: -s read-only 로 샌드박스를 좁힌다" \
  "grep -q -- '-s read-only' '$CODEX'"

echo "== 2. 제거된 레인 (v3.41) =="

# The owner cancelled the Grok subscription (2026-09-15). A caller still asking
# for that lane must fail loudly — not run half a gate and report its verdict.
check "grok-review.sh 가 없다" "[ ! -e '$ROOT/scripts/grok-review.sh' ]"
check "cross-verify.sh: --lanes grok 은 usage 오류" \
  "! (cd '$TMP' && bash '$CROSS' --mode review --tag t --lanes grok --dir '$TMP/g' >/dev/null 2>&1)"

echo "== 3. cross-verify 판정 병합 (스텁 레인) =="

# The merge logic is where "a lane that did not vote" must not read as a pass.
# Stub lanes let us assert that without spending a model call.
cp "$CROSS" "$TMP/cross-verify.sh"

stub() { # $1=lane $2=exit code $3=payload
  cat > "$TMP/$1-review.sh" <<EOF
#!/usr/bin/env bash
out=""
while [ \$# -gt 0 ]; do [ "\$1" = "--out" ] && out="\$2"; shift; done
printf '%s' '$3' > "\$out"
exit $2
EOF
}

run_case() { # $1=desc $2=expected VERDICT token
  out="$(cd "$TMP" && bash "$TMP/cross-verify.sh" --mode review --tag t --dir "$TMP/o" 2>/dev/null)"
  got="$(printf '%s\n' "$out" | sed -n 's/^VERDICT \([A-Z]*\).*/\1/p')"
  if [ "$got" = "$2" ]; then ok "$1 → $2"; else bad "$1 → 기대 $2, 실제 '$got'"; fi
}

stub codex 0 '{"verdict":"pass","high_findings":[]}'
run_case "레인 pass" PASS
lanes="$(printf '%s\n' "$out" | grep -c '^LANE ')"
if [ "$lanes" = 1 ] && printf '%s\n' "$out" | grep -q '^LANE codex '; then
  ok "기본 레인은 codex 하나"
else
  bad "기본 레인은 codex 하나 — LANE 줄 $lanes 개"
fi

stub codex 0 '{"verdict":"fail","high_findings":["x.ts:1 — bad"]}'
run_case "레인 fail" FAIL

# The defect: rc=0 with unreadable output was counted into lanes_ok, so a lane
# that produced nothing parseable could carry the gate to PASS on its own.
stub codex 0 'not json at all'
run_case "판정 불가" UNVERIFIED

stub codex 2 ''
run_case "레인 다운" UNVERIFIED

# The defect: a helper that dies at detect/auth never reaches its own truncate,
# so last run's verdict stayed on disk and a stale FAIL read as a fresh one.
stub codex 0 '{"verdict":"fail","high_findings":["stale"]}'
run_case "직전 실행 결과 적재" FAIL
stub codex 2 ''
run_case "다음 실행에서 낡은 FAIL 이 남지 않는다" UNVERIFIED

echo
echo "== 결과: $pass 통과 / $fail 실패 =="
[ $fail -eq 0 ]
