#!/usr/bin/env bash
# Regression tests for the external-engine dispatcher (v3.38).
#
# Same discipline as test_cross_verify.sh: stub the engines, because the
# expensive part — calling a model — is exactly what a test must not do. Every
# assertion below is a failure mode that would let /cc believe it received a
# briefing it did not receive.
#
#   run:  bash tests/test_delegate.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEL="$ROOT/scripts/delegate.sh"

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   — $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL — $1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "== 1. 정적 계약 =="

# Read-only is the design, not an accident: a writing Codex cannot also be an
# independent Phase 4.5 reviewer of what it wrote.
check "delegate.sh: 엔진을 --mode prompt (읽기 전용) 로만 부른다" \
  "grep -q -- '--mode prompt' '$DEL' && ! sed 's/#.*//' '$DEL' | grep -q -- '--mode review'"

# The launch loop must truncate before spawning, or a helper that dies at its
# auth step leaves the previous run's answer at the same path.
check "delegate.sh: 실행 전에 out 파일을 비운다" \
  "grep -q ': > \"\${OUTS\[\$i\]}\"' '$DEL'"

# stdin: `codex exec` and `grok -p` both append piped stdin to the prompt and
# block forever under a harness pipe that never reaches EOF.
check "delegate.sh: 엔진 호출이 stdin 을 닫는다" \
  "grep -q '</dev/null' '$DEL'"

echo "== 2. 인자 검증 =="

TMP="$(mktemp -d "${TMPDIR:-/tmp}/dl_XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
echo "prompt body" > "$TMP/p.txt"

check "--task 없이 호출하면 usage 오류" \
  "! bash '$DEL' --dir '$TMP/o' >/dev/null 2>&1"
check "알 수 없는 엔진은 거부한다" \
  "! bash '$DEL' --task 'a:gemini:$TMP/p.txt' --dir '$TMP/o' >/dev/null 2>&1"
check "없는 프롬프트 파일은 거부한다" \
  "! bash '$DEL' --task \"a:grok:$TMP/nope.txt\" --dir '$TMP/o' >/dev/null 2>&1"
# The id names an output file; an unconstrained one walks out of --dir.
check "경로 문자가 든 id 는 거부한다 (디렉토리 탈출)" \
  "! bash '$DEL' --task \"../esc:grok:$TMP/p.txt\" --dir '$TMP/o' >/dev/null 2>&1"
check "PROMPT_FILE 가 빠지면 거부한다" \
  "! bash '$DEL' --task 'a:grok' --dir '$TMP/o' >/dev/null 2>&1"
# `shift 2` with one argument left neither shifts nor exits (no `set -e`), so a
# flag given without its value used to spin the parse loop forever. A hang is the
# worst shape of failure here: the caller sees no output and no exit code.
check "값 없는 플래그는 무한루프 대신 즉시 거절한다" \
  "! timeout 10 bash '$DEL' --task \"a:grok:$TMP/p.txt\" --timeout >/dev/null 2>&1"
# id+engine names the output file. Allowing a repeat put two concurrent tasks
# on one path: both reported ok and one answer was served for both requests.
check "같은 id:engine 을 두 번 주면 거부한다 (산출물 덮어쓰기)" \
  "! bash '$DEL' --task \"a:grok:$TMP/p.txt\" --task \"a:grok:$TMP/p.txt\" --dir '$TMP/o' >/dev/null 2>&1"
# Case-insensitively, because the collision is on the output path and Windows
# treats A-grok.out and a-grok.out as one file.
check "대소문자만 다른 id 도 거부한다 (Windows 파일시스템)" \
  "! bash '$DEL' --task \"A:grok:$TMP/p.txt\" --task \"a:grok:$TMP/p.txt\" --dir '$TMP/o' >/dev/null 2>&1"

echo "== 3. 디스패치 (스텁 엔진) =="

# Stub both helpers next to a copy of the dispatcher so HERE resolves to them.
cp "$DEL" "$TMP/delegate.sh"
stub() { # $1=engine $2=exit code $3=payload
  cat > "$TMP/$1-review.sh" <<EOF
#!/usr/bin/env bash
out=""
while [ \$# -gt 0 ]; do [ "\$1" = "--out" ] && out="\$2"; shift; done
printf '%s' '$3' > "\$out"
exit $2
EOF
}

run() { bash "$TMP/delegate.sh" --dir "$TMP/o" "$@" 2>/dev/null; }
statusof() { printf '%s\n' "$1" | sed -n "s/^TASK $2 .*status=\([a-z]*\) .*/\1/p"; }

stub codex 0 'codex briefing'
stub grok  0 'grok briefing'
OUT="$(run --task "a:codex:$TMP/p.txt" --task "b:grok:$TMP/p.txt")"
check "두 엔진 동시 디스패치 → 둘 다 ok" \
  "[ \"\$(statusof \"\$OUT\" a)\" = ok ] && [ \"\$(statusof \"\$OUT\" b)\" = ok ]"
check "DISPATCH 집계가 맞는다" \
  "printf '%s' \"\$OUT\" | grep -q 'DISPATCH DONE ok=2 down=0'"
check "산출물이 --dir 에 남는다" \
  "grep -q 'codex briefing' '$TMP/o/a-codex.out'"

# The same id on two engines is a legitimate "ask both": distinct files, no clobber.
OUT="$(run --task "a:grok:$TMP/p.txt" --task "a:codex:$TMP/p.txt")"
check "같은 id 라도 엔진이 다르면 두 파일로 갈라진다" \
  "[ -s '$TMP/o/a-grok.out' ] && [ -s '$TMP/o/a-codex.out' ] && printf '%s' \"\$OUT\" | grep -q 'ok=2'"

# The defect this guards: rc 0 with an empty file counted as a delivered
# briefing, so a Worker got prompted with nothing and the Leader never knew.
stub grok 0 ''
OUT="$(run --task "b:grok:$TMP/p.txt")"
check "rc 0 인데 산출물이 비면 empty (ok 가 아니다)" \
  "[ \"\$(statusof \"\$OUT\" b)\" = empty ] && printf '%s' \"\$OUT\" | grep -q 'ok=0 down=1'"

stub grok 3 'partial'
OUT="$(run --task "b:grok:$TMP/p.txt")"
check "rc 3 = timeout" "[ \"\$(statusof \"\$OUT\" b)\" = timeout ]"

stub grok 2 ''
OUT="$(run --task "b:grok:$TMP/p.txt")"
check "rc 2 = unavailable" "[ \"\$(statusof \"\$OUT\" b)\" = unavailable ]"

# Stale output: a helper that dies before its own truncate would otherwise leave
# the last run's answer sitting at the same path, and the Leader would read it
# as this round's briefing.
stub grok 0 'round one'
run --task "b:grok:$TMP/p.txt" >/dev/null
stub grok 2 ''
OUT="$(run --task "b:grok:$TMP/p.txt")"
check "직전 실행 산출물이 다음 실행에 남지 않는다" \
  "[ \"\$(statusof \"\$OUT\" b)\" = unavailable ] && [ ! -s '$TMP/o/b-grok.out' ]"

# A down engine must not take the healthy one with it — partial delegation is
# still worth having, and /cc degrades per task.
stub codex 0 'codex briefing'

OUT="$(run --task "a:codex:$TMP/p.txt" --task "b:grok:$TMP/p.txt")"
check "한 엔진이 죽어도 다른 엔진 결과는 살아 돌아온다" \
  "[ \"\$(statusof \"\$OUT\" a)\" = ok ] && [ \"\$(statusof \"\$OUT\" b)\" = unavailable ]"
check "디스패처는 태스크 실패를 종료 코드로 인코딩하지 않는다" \
  "run --task \"b:grok:$TMP/p.txt\" >/dev/null"

# elapsed was read in the report loop, which runs only after every task is
# waited on — so a fast engine was filed with the slowest engine's wall clock.
# These numbers are how a caller learns which engine is worth waiting for.
stub codex 0 'fast'
cat > "$TMP/grok-review.sh" <<'SLOW'
#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do [ "$1" = "--out" ] && out="$2"; shift; done
sleep 3; printf slow > "$out"; exit 0
SLOW
OUT="$(run --task "a:codex:$TMP/p.txt" --task "b:grok:$TMP/p.txt")"
elapsed_of() { printf '%s' "$1" | sed -n "s/^TASK $2 .*elapsed=\([0-9]*\)s .*/\1/p"; }
check "빠른 엔진이 느린 엔진의 벽시계를 뒤집어쓰지 않는다" \
  "[ \"\$(elapsed_of \"\$OUT\" a)\" -lt \"\$(elapsed_of \"\$OUT\" b)\" ]"

echo
echo "== 결과: $pass 통과 / $fail 실패 =="
[ $fail -eq 0 ]
