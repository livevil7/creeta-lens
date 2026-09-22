#!/usr/bin/env bash
# Regression tests for scripts/codex-review.sh --mode review (v3.48.0).
#
# The defect (H1): right after a commit the review saw an empty worktree diff and
# Codex answered a 37-byte "pass" for a 34-file, +4,681-line commit. The same
# commit reviewed by hand turned up a cross-seller access flaw in Returns ERP.
# The owner's rule is "always commit", so that hole opened on every run.
#
# Codex is replaced by a stub (CODEX_BIN) that records whether it was called and
# the prompt it got — the model is exactly what a test must not spend.
#
#   run:  bash tests/test_codex_review.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX="$ROOT/scripts/codex-review.sh"

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   — $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL — $1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/cr_XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ── codex stub: records the call + prompt, can be made slow ──
export STUB_DIR="$TMP/stub"
mkdir -p "$STUB_DIR"
cat > "$STUB_DIR/codex" <<'EOF'
#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done
cat > "$STUB_DIR/prompt.txt"
echo call >> "$STUB_DIR/calls"
echo "stub stderr: model warming up" >&2
[ -n "${STUB_SLEEP:-}" ] && exec sleep "$STUB_SLEEP"
printf '%s' '{"verdict":"pass","high_findings":[]}' > "$out"
EOF
chmod +x "$STUB_DIR/codex"
export CODEX_BIN="$STUB_DIR/codex"
calls() { [ -f "$STUB_DIR/calls" ] && wc -l < "$STUB_DIR/calls" | tr -d ' ' || echo 0; }

# ── a repo with a real origin, because --base resolves origin/<base> ──
g() { git -C "$W" "$@" >/dev/null 2>&1; }
git init -q --bare -b master "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/w" 2>/dev/null
W="$TMP/w"
g config user.email t@example.com; g config user.name T
echo base > "$W/README.md"; g add -A; g commit -m base; g push -u origin master

echo "== 1. 커밋 뒤 --base 리뷰는 커밋 내용을 본다 =="
g checkout -b fix/x
printf 'function leak(){ return "COMMITTED_MARKER"; }\n' > "$W/app.js"
g add -A; g commit -m "task commit"
before="$(calls)"
(cd "$W" && bash "$CODEX" --mode review --base master --out "$TMP/r1.json" >/dev/null 2>&1); rc=$?
check "exit 0" "[ $rc -eq 0 ]"
check "codex 가 불렸다" "[ \"\$(calls)\" -gt $before ]"
check "프롬프트에 커밋된 변경이 있다" "grep -q COMMITTED_MARKER '$STUB_DIR/prompt.txt'"
check "결과는 codex 판정" "grep -q '\"verdict\":\"pass\"' '$TMP/r1.json'"

echo "== 2. --base 없이도 upstream 보다 앞선 커밋을 본다 =="
g push -u origin fix/x
printf 'AHEAD_MARKER\n' > "$W/second.txt"
g add -A; g commit -m "second"
(cd "$W" && bash "$CODEX" --mode review --out "$TMP/r2.json" >/dev/null 2>&1)
check "프롬프트에 upstream..HEAD 커밋이 있다" "grep -q AHEAD_MARKER '$STUB_DIR/prompt.txt'"
check "이미 push 된 커밋은 다시 싣지 않는다" "! grep -q COMMITTED_MARKER '$STUB_DIR/prompt.txt'"

echo "== 3. 볼 게 없으면 codex 를 부르지 않고 unverified =="
g push origin fix/x
mkdir -p "$W/.lens"; echo '{}' > "$W/.lens/agent-dashboard.json"
before="$(calls)"
(cd "$W" && bash "$CODEX" --mode review --out "$TMP/r3.json" >/dev/null 2>&1); rc=$?
check "exit 0" "[ $rc -eq 0 ]"
check "codex 미호출" "[ \"\$(calls)\" -eq $before ]"
check "verdict unverified · reason empty diff" \
  "grep -q '\"verdict\":\"unverified\"' '$TMP/r3.json' && grep -q '\"reason\":\"empty diff\"' '$TMP/r3.json'"
g checkout master
(cd "$W" && bash "$CODEX" --mode review --base master --out "$TMP/r3b.json" >/dev/null 2>&1)
check "base 와 같은 HEAD(--base) 도 unverified" "grep -q '\"verdict\":\"unverified\"' '$TMP/r3b.json'"
check "여전히 codex 미호출" "[ \"\$(calls)\" -eq $before ]"
check "없는 base 는 usage 오류" \
  "! (cd '$W' && bash '$CODEX' --mode review --base no-such-branch --out '$TMP/r3c.json' >/dev/null 2>&1)"

echo "== 4. 타임아웃은 빈 파일이 아니라 unverified + stderr 로그 =="
g checkout fix/x
echo "dirty" >> "$W/app.js"
(cd "$W" && STUB_SLEEP=10 bash "$CODEX" --mode review --timeout 1 --out "$TMP/r4.json" >/dev/null 2>&1); rc=$?
check "exit 3" "[ $rc -eq 3 ]"
check "결과 파일이 비지 않았다" "[ -s '$TMP/r4.json' ]"
check "verdict unverified · reason timeout 1s" \
  "grep -q '\"verdict\":\"unverified\"' '$TMP/r4.json' && grep -q '\"reason\":\"timeout 1s\"' '$TMP/r4.json'"
check "codex stderr 가 <out>.stderr.log 에 남았다" "grep -q 'model warming up' '$TMP/r4.json.stderr.log'"

echo "== 5. --out 은 기본값을 갖는다 =="
line="$(cd "$W" && bash "$CODEX" --mode review 2>/dev/null)"; rc=$?
path_out="${line#out=}"
check "exit 0" "[ $rc -eq 0 ]"
check "stdout 에 out=<경로>" "[ \"\${line#out=}\" != \"\$line\" ] && [ -s \"\$path_out\" ]"
rm -f "$path_out" "$path_out.stderr.log"

echo "== 6. timeout 명령이 없으면(기본 macOS) codex 를 부르지 않는다 =="
# macOS ships neither `timeout` nor `gtimeout` (coreutils). Without a bound the
# codex call could hang forever, so the lane goes down instead of running bare.
mkdir -p "$TMP/nobin"
BASH_BIN="$(command -v bash)"
before="$(calls)"
(cd "$W" && PATH="$TMP/nobin" "$BASH_BIN" "$CODEX" --mode review --out "$TMP/r6.json" >/dev/null 2>&1); rc=$?
check "exit 2 (cross-verify 가 unavailable 로 읽는 코드)" "[ $rc -eq 2 ]"
check "codex 미호출" "[ \"\$(calls)\" -eq $before ]"
check "verdict unverified · reason no timeout command" \
  "grep -q '\"verdict\":\"unverified\"' '$TMP/r6.json' && grep -q '\"reason\":\"no timeout command\"' '$TMP/r6.json'"

echo
echo "== 결과: $pass 통과 / $fail 실패 =="
[ $fail -eq 0 ]
