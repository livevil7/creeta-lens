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

echo "== 4. v3.48.0 — --out · --base · 빈 diff · stderr 로그 =="

# H1: a lane that had nothing to review answered pass. Its verdict is now
# `unverified`, and it must not vote.
stub codex 0 '{"verdict":"unverified","reason":"empty diff"}'
run_case "빈 diff 레인(unverified)은 통과가 아니다" UNVERIFIED

# H2: codex-review required --out while cross-verify rejected it.
stub codex 0 '{"verdict":"pass","high_findings":[]}'
out="$(cd "$TMP" && bash "$TMP/cross-verify.sh" --mode review --tag t --out "$TMP/o2" 2>/dev/null)"; rc=$?
check "--out 을 받는다 (exit 0)" "[ $rc -eq 0 ]"
check "레인 출력이 --out 폴더에 떨어진다" "[ -s '$TMP/o2/t-codex.out' ] && printf '%s\n' \"\$out\" | grep -q '^VERDICT PASS'"

cat > "$TMP/codex-review.sh" <<EOF
#!/usr/bin/env bash
printf '%s ' "\$@" > "$TMP/args"
out=""
while [ \$# -gt 0 ]; do [ "\$1" = "--out" ] && out="\$2"; shift; done
printf '%s' '{"verdict":"pass","high_findings":[]}' > "\$out"
EOF
printf -- '---\r\nplan_id: x\r\nbase: "staging"\r\n---\r\n\r\n# p\r\n' > "$TMP/plan.md"
(cd "$TMP" && bash "$TMP/cross-verify.sh" --mode review --tag t --out "$TMP/o3" --plan "$TMP/plan.md" >/dev/null 2>&1)
check "--plan frontmatter base 를 레인에 --base 로 넘긴다(따옴표·CRLF 제거)" "grep -q -- '--base staging ' '$TMP/args'"
(cd "$TMP" && bash "$TMP/cross-verify.sh" --mode review --tag t --out "$TMP/o3" --plan "$TMP/plan.md" --base main >/dev/null 2>&1)
check "--base 직접 인자가 계획서보다 우선" "grep -q -- '--base main ' '$TMP/args'"
(cd "$TMP" && bash "$TMP/cross-verify.sh" --mode review --tag t --out "$TMP/o3" >/dev/null 2>&1)
check "base 가 없으면 --base 를 넘기지 않는다" "! grep -q -- '--base' '$TMP/args'"
check "없는 계획서는 usage 오류" \
  "! (cd '$TMP' && bash '$TMP/cross-verify.sh' --mode review --tag t --out '$TMP/o3' --plan '$TMP/nope.md' >/dev/null 2>&1)"

# H3: a timed-out lane left a 0-byte result and its stderr went to /dev/null.
# Real codex-review.sh here, with a codex that never answers.
mkdir -p "$TMP/real"; cp "$CROSS" "$CODEX" "$TMP/real/"
R="$TMP/repo"
git init -q "$R" && git -C "$R" config user.email t@example.com && git -C "$R" config user.name T
echo a > "$R/f.txt"; git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -qm init >/dev/null 2>&1
echo b >> "$R/f.txt"
cat > "$TMP/slowcodex" <<'EOF'
#!/usr/bin/env bash
echo "slow codex: still thinking" >&2
exec sleep 10
EOF
chmod +x "$TMP/slowcodex"
out="$(cd "$R" && CODEX_BIN="$TMP/slowcodex" bash "$TMP/real/cross-verify.sh" --mode review --tag to --out "$TMP/o4" --timeout 1 2>/dev/null)"; rc=$?
check "타임아웃: exit 0 + VERDICT UNVERIFIED" "[ $rc -eq 0 ] && printf '%s\n' \"\$out\" | grep -q '^VERDICT UNVERIFIED'"
check "타임아웃: <out>.stderr.log 에 codex stderr 가 남았다" "grep -q 'still thinking' '$TMP/o4/to-codex.out.stderr.log'"
check "타임아웃: 레인 결과 파일이 비지 않은 unverified" "grep -q '\"verdict\":\"unverified\"' '$TMP/o4/to-codex.out'"

echo
echo "== 결과: $pass 통과 / $fail 실패 =="
[ $fail -eq 0 ]
