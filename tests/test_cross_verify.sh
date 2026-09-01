#!/usr/bin/env bash
# Regression tests for the cross-verification lanes (v3.36).
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
GROK="$ROOT/scripts/grok-review.sh"
CROSS="$ROOT/scripts/cross-verify.sh"

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   — $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL — $1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "== 1. 호출 불변식 (docs/rules/codex-integration.md §1.5) =="

# ① stdin. The defect: `codex exec` appends piped stdin to the prompt, so under a
# harness whose stdin never reaches EOF it hung before the first token — 83% of
# all Lens codex calls died this way and read as "the model is slow".
for f in "$CODEX" "$GROK"; do
  name="$(basename "$f")"
  # Every timeout-wrapped agent invocation must close stdin, either from
  # /dev/null or from a prompt file (a file delivers EOF, so it is equally safe).
  bare="$(grep -n 'timeout "\$TIMEOUT"' "$f" | wc -l)"
  closed="$(grep -c '</dev/null\|< "\$PROMPT' "$f")"
  check "$name: agent 호출 $bare 개 전부 stdin 을 닫는다" "[ $closed -ge $bare ]"
done

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

echo "== 2. Grok 레인 =="

# --sandbox strict made read_file fail and the agent retried to the timeout:
# 300s/0 bytes vs 14s/clean verdict without it.
check "grok-review.sh: --sandbox strict 를 쓰지 않는다" \
  "! code_only '$GROK' | grep -q -- '--sandbox strict'"

# Allowlist, not denylist — a typo in an allowlist fails loudly.
check "grok-review.sh: 읽기 전용 툴 허용목록을 쓴다" \
  "grep -q -- '--tools read_file,grep,list_dir' '$GROK'"

check "grok-review.sh: codex-review.sh 와 같은 종료 코드 계약" \
  "grep -q 'exit 3' '$GROK' && grep -q 'exit 2' '$GROK'"

echo "== 3. cross-verify 판정 병합 (스텁 레인) =="

# The merge logic is where "a lane that did not vote" must not read as a pass.
# Stub lanes let us assert that without spending a model call.
TMP="$(mktemp -d "${TMPDIR:-/tmp}/xv_XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
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
stub grok  0 '{"verdict":"pass","high_findings":[]}'
run_case "두 레인 pass" PASS

stub grok 0 '{"verdict":"fail","high_findings":["x.ts:1 — bad"]}'
run_case "한 레인 fail" FAIL

# The defect: rc=0 with unreadable output was counted into lanes_ok, so a lane
# that produced nothing parseable could carry the gate to PASS on its own.
stub codex 0 'not json at all'
stub grok  2 ''
run_case "판정 불가 + 레인 다운" UNVERIFIED

# The defect: a helper that dies at detect/auth never reaches its own truncate,
# so last run's verdict stayed on disk and a stale FAIL read as a fresh one.
stub codex 0 '{"verdict":"fail","high_findings":["stale"]}'
stub grok  0 '{"verdict":"pass","high_findings":[]}'
run_case "직전 실행 결과 적재" FAIL
stub codex 2 ''
run_case "다음 실행에서 낡은 FAIL 이 남지 않는다" PASS

echo
echo "== 결과: $pass 통과 / $fail 실패 =="
[ $fail -eq 0 ]
