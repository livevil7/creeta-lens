#!/usr/bin/env bash
# =============================================
# tests/test_git_sync.sh — scripts/git-sync-all.sh 미러 불변식 시나리오 테스트
# =============================================
# 실행: bash tests/test_git_sync.sh      (어느 디렉터리에서 실행해도 됨 — 경로는 $0 기준)
# 종료: 전부 통과 0 / 하나라도 실패 1
#
# 전제
#   - git (>= 2.28, `git init -b`) · bash
#   - JSON 검증기: python `-m json.tool` 우선, 없으면 node 폴백
#   - 네트워크 불필요: 원격은 전부 mktemp 로 만든 로컬 bare repo, gh 는 PATH 앞에
#     놓은 셸 스텁이라 실제 GitHub·gh 호출은 0회다. gh 를 타는 경로(회수)만 원격 URL
#     을 github 형태로 두는데, 그 repo 는 `protocol.https.allow=never` 로 막아 두어
#     스크립트가 실수로 네트워크를 타면 즉시 거부된다.
#   - fixture repo 이름은 lens.config.json 의 baseBranch/syncPolicy 맵에 없는 이름만
#     쓴다 — 설정 파일 내용에 결합하지 않기 위함(정책 경로는 staging 하드가드로 검증).
#
# 커버 범위 — docs/tasks/2026-08-14-cs-mirror-invariant.md 의 EARS 1~6
#   S1 미러       base dirty → base 직커밋·push, sync/ 0개, 로컬 tip == 원격 tip  (EARS 1)
#   S2 task 브랜치 feat/x 체크아웃+dirty → 커밋 0·push 0, task_branch 버킷        (EARS 5)
#   S3 pr-manual  staging 하드가드 → 직push 0회, PR 생성만, merge 호출 0회        (EARS 4)
#   S4 reconcile  병합증명 sync/ 삭제·미증명 보존·base 무변경 / 열린 PR 회수      (EARS 3)
#   S5 유실 방지   비-ff push 거부·PR 머지 실패에도 로컬 커밋 보존(reset 없음)     (EARS 2)
#   S6 --json     마지막 줄이 유효 JSON 1줄 + 신규 필드 존재                      (EARS 6)
#
# 단언 원칙: 리포트 문구가 아니라 구조적 사실(git ref·워킹트리 상태·JSON 버킷 소속·
#            gh 호출 인자)만 본다. 보고 문구를 바꿔도 이 테스트는 깨지지 않아야 한다.
# =============================================

set -u
unset GIT_DIR GIT_WORK_TREE 2>/dev/null || true

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/scripts/git-sync-all.sh"
[ -f "$SCRIPT" ] || { printf 'FATAL: 대상 스크립트 없음: %s\n' "$SCRIPT"; exit 2; }

ORIG_PATH="$PATH"
ROOT=$(mktemp -d) || { printf 'FATAL: mktemp 실패\n'; exit 2; }
case "$ROOT" in
  *" "*) printf 'FATAL: 임시 경로에 공백이 있으면 GIT_ROOTS 분리에 실패한다: %s\n' "$ROOT"; exit 2 ;;
esac
trap 'rm -rf "$ROOT"' EXIT

# 격리 HOME — 개발자 전역 gitconfig(insteadOf·gpgsign·pull.rebase 등)의 간섭 차단
export HOME="$ROOT/home"
mkdir -p "$HOME"
printf '[user]\n\tname = lens test\n\temail = test@lens.local\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n' > "$HOME/.gitconfig"

# ── JSON 검증기 선택 (EARS 6 은 python -m json.tool 이 1순위) ──
JSON_VALIDATOR=""
for _c in python3 python py; do
  command -v "$_c" >/dev/null 2>&1 || continue
  if printf '{}' | "$_c" -m json.tool >/dev/null 2>&1; then JSON_VALIDATOR="$_c -m json.tool"; break; fi
done
if [ -z "$JSON_VALIDATOR" ] && command -v node >/dev/null 2>&1; then
  # 인자에 공백이 없어 비따옴표 확장이 안전하다(아래 json_valid 참조)
  JSON_VALIDATOR="node -e JSON.parse(require('fs').readFileSync(0,'utf8'))"
fi

# ── gh 스텁: 실 호출 0회 + 호출 기록 + canned 응답 ──
STUB_DIR="$ROOT/bin"
mkdir -p "$STUB_DIR"
cat > "$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
# 테스트용 gh 스텁 — 호출 인자를 $GH_STUB_LOG 에 기록하고 canned 응답만 낸다.
printf '%s\n' "$*" >> "${GH_STUB_LOG:-/dev/null}"
case "$1 $2" in
  "pr list")
    # 호출부 2곳을 구분: --head 는 PR 생성 직전 중복확인, 나머지는 회수(T4①) 조회
    case " $* " in
      *" --head "*) cat "${GH_STUB_PR_HEAD:-/dev/null}" 2>/dev/null ;;
      *)            cat "${GH_STUB_PR_LIST:-/dev/null}" 2>/dev/null ;;
    esac
    exit 0 ;;
  "pr create") exit "${GH_STUB_CREATE_RC:-0}" ;;
  "pr merge")  exit "${GH_STUB_MERGE_RC:-0}" ;;
esac
exit 0
STUB
chmod +x "$STUB_DIR/gh"

# ── 집계 ──
TOTAL=0; PASSED=0; FAILED=0; FAILED_LIST=""
ok() { PASSED=$((PASSED+1)); printf '  [PASS] %s\n' "$1"; }
ng() {
  FAILED=$((FAILED+1))
  FAILED_LIST="${FAILED_LIST}  - $1
"
  printf '  [FAIL] %s\n' "$1"
  [ $# -gt 1 ] && printf '         %s\n' "$2"
  return 0
}
t_eq()    { TOTAL=$((TOTAL+1)); if [ "$2" = "$3" ]; then ok "$1"; else ng "$1" "기대=[$2] 실제=[$3]"; fi; }
t_ne()    { TOTAL=$((TOTAL+1)); if [ "$2" != "$3" ]; then ok "$1"; else ng "$1" "같으면 안 됨=[$2]"; fi; }
t_true()  { local d="$1"; shift; TOTAL=$((TOTAL+1)); if "$@" >/dev/null 2>&1; then ok "$d"; else ng "$d" "참이어야 할 명령이 실패: $*"; fi; }
t_false() { local d="$1"; shift; TOTAL=$((TOTAL+1)); if "$@" >/dev/null 2>&1; then ng "$d" "거짓이어야 할 명령이 성공: $*"; else ok "$d"; fi; }
scenario() { printf '\n== %s\n' "$1"; }

# ── JSON 헬퍼 (한 줄 평면 JSON 전제 — 배열 안에 대괄호 없음) ──
jbucket() { printf '%s' "$1" | sed -n 's/.*"'"$2"'":\(\[[^]]*\]\).*/\1/p'; }   # 배열 원문
jnum()    { printf '%s' "$1" | sed -n 's/.*"'"$2"'":\([0-9][0-9]*\).*/\1/p'; }
bucket_has()   { case "$(jbucket "$1" "$2")" in *"$3"*) return 0 ;; *) return 1 ;; esac; }
bucket_empty() { [ "$(jbucket "$1" "$2")" = "[]" ]; }
key_exists()   { [ -n "$(jbucket "$1" "$2")" ]; }
json_valid()   { [ -n "$JSON_VALIDATOR" ] && printf '%s' "$1" | $JSON_VALIDATOR >/dev/null 2>&1; }

# ── fixture 헬퍼 ──
new_fx() { # $1=이름 → fixture 경로 출력 (시나리오마다 독립)
  local fx
  fx=$(mktemp -d "$ROOT/$1.XXXXXX") || return 1
  mkdir -p "$fx/work" "$fx/remotes" || return 1
  : > "$fx/gh.log"; : > "$fx/gh-pr-list.txt"; : > "$fx/gh-pr-head.txt"
  printf '%s' "$fx"
}

mkrepo() { # $1=fixture $2=repo명 $3=base 브랜치 — 로컬 bare 원격 + 워킹 repo
  local fx="$1" name="$2" br="$3"
  local bare="$fx/remotes/$name.git" work="$fx/work/$name"
  git init -q --bare "$bare" \
    && git init -q -b "$br" "$work" \
    && git -C "$work" config user.email test@lens.local \
    && git -C "$work" config user.name "lens test" \
    && printf 'init\n' > "$work/README" \
    && git -C "$work" add -A \
    && git -C "$work" commit -qm init \
    && git -C "$work" remote add origin "$bare" \
    && git -C "$work" push -qu origin "$br" \
    && git -C "$bare" symbolic-ref HEAD "refs/heads/$br"
}

die() { printf 'FATAL: %s\n' "$1"; exit 2; }

sync_branches() { # $1=repo(작업 또는 bare) → refs/heads/sync/ 하위 브랜치 목록
  # 패턴은 glob 이 아니라 리터럴 prefix — for-each-ref 의 `*` 는 슬래시를 넘지 않는다
  git -C "$1" for-each-ref --format='%(refname:short)' refs/heads/sync/ 2>/dev/null
}

run_cs() { # $1=fixture, 나머지=스크립트 인자 → RUN_OUT / RUN_JSON / $fx/stderr.log
  local fx="$1"; shift
  RUN_OUT=$(
    HOME="$HOME" \
    GIT_ROOTS="$fx/work" \
    PATH="$STUB_DIR:$ORIG_PATH" \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_TERMINAL_PROMPT=0 \
    GH_STUB_LOG="$fx/gh.log" \
    GH_STUB_PR_LIST="$fx/gh-pr-list.txt" \
    GH_STUB_PR_HEAD="$fx/gh-pr-head.txt" \
    GH_STUB_MERGE_RC="${GH_MERGE_RC:-0}" \
    GH_STUB_CREATE_RC="${GH_CREATE_RC:-0}" \
    LENS_SYNC_PR="${CS_PR_MODE:-0}" \
    LENS_SYNC_AUTO_MERGE=1 \
    bash "$SCRIPT" "$@" 2>"$fx/stderr.log"
  )
  RUN_JSON=$(printf '%s\n' "$RUN_OUT" | tail -1)
}

printf 'git-sync-all.sh 시나리오 테스트\n'
printf '  대상  : %s\n' "$SCRIPT"
printf '  JSON  : %s\n' "${JSON_VALIDATOR:-없음 (python/node 미설치 — S6 실패 처리)}"

# =============================================
# S1 미러 (EARS 1) — base dirty → base 직커밋·push, sync/ 0, 로컬 tip == 원격 tip
# =============================================
scenario "S1 미러: base dirty → 직커밋·push, sync/ 잔여물 0"
FX=$(new_fx s1mirror) || die "fixture 생성 실패"
mkrepo "$FX" mirror1 master || die "S1 repo 생성 실패"
W="$FX/work/mirror1"; B="$FX/remotes/mirror1.git"
printf 'new work\n' > "$W/new.txt"
BEFORE=$(git -C "$W" rev-parse HEAD)

run_cs "$FX" sync --json

t_ne  "S1 로컬에 새 커밋이 생겼다"            "$BEFORE" "$(git -C "$W" rev-parse HEAD)"
t_eq  "S1 원격 base tip == 로컬 tip (미러 불변식)" \
      "$(git -C "$W" rev-parse HEAD)" "$(git -C "$B" rev-parse refs/heads/master)"
t_eq  "S1 워킹트리 dirty 0"                   "" "$(git -C "$W" status --porcelain)"
t_eq  "S1 원격에 sync/ 브랜치 미생성"          "" "$(sync_branches "$B")"
t_eq  "S1 로컬에 sync/ 브랜치 미생성"          "" "$(sync_branches "$W")"
t_eq  "S1 원격 브랜치는 base 하나뿐"           "master" "$(git -C "$B" for-each-ref --format='%(refname:short)' refs/heads/)"
t_true "S1 JSON pushed 버킷에 repo 집계"       bucket_has "$RUN_JSON" pushed mirror1
t_true "S1 JSON failed 버킷 비었음"            bucket_empty "$RUN_JSON" failed
t_eq  "S1 success 1 (불변식 충족)"             "1" "$(jnum "$RUN_JSON" success)"

# =============================================
# S2 task 브랜치 skip (EARS 5) — 커밋 0·push 0·task_branch 버킷
# =============================================
scenario "S2 task 브랜치: feat/x 체크아웃+dirty → commit·push 건너뜀"
FX=$(new_fx s2task) || die "fixture 생성 실패"
mkrepo "$FX" taskbr master || die "S2 repo 생성 실패"
W="$FX/work/taskbr"; B="$FX/remotes/taskbr.git"
git -C "$W" checkout -qb feat/x && git -C "$W" push -qu origin feat/x || die "S2 feat/x 준비 실패"
printf 'wip\n' > "$W/dirty.txt"
BEFORE=$(git -C "$W" rev-parse HEAD)
REMOTE_BEFORE=$(git -C "$B" rev-parse refs/heads/feat/x)

run_cs "$FX" sync --json

t_eq   "S2 로컬 커밋 0 (HEAD 그대로)"          "$BEFORE" "$(git -C "$W" rev-parse HEAD)"
t_ne   "S2 dirty 유지 (스윕 안 함)"            "" "$(git -C "$W" status --porcelain)"
t_eq   "S2 원격 feat/x 무변경 (push 0)"        "$REMOTE_BEFORE" "$(git -C "$B" rev-parse refs/heads/feat/x)"
t_eq   "S2 원격에 sync/ 브랜치 미생성"          "" "$(sync_branches "$B")"
t_true "S2 JSON task_branch 버킷에 repo"       bucket_has "$RUN_JSON" task_branch taskbr
t_true "S2 JSON pushed 버킷 비었음"            bucket_empty "$RUN_JSON" pushed
t_eq   "S2 success 0 (task 브랜치는 ✅ 아님)"   "0" "$(jnum "$RUN_JSON" success)"

# =============================================
# S3 pr-manual 정책 (EARS 4) — staging 하드가드: 직push 0회, PR 생성만
# =============================================
scenario "S3 pr-manual: staging 하드가드 → 직push 0회 · PR 생성만 · merge 0회"
FX=$(new_fx s3prmanual) || die "fixture 생성 실패"
mkrepo "$FX" erpstg staging || die "S3 repo 생성 실패"
W="$FX/work/erpstg"; B="$FX/remotes/erpstg.git"
printf 'hotfix\n' > "$W/hotfix.txt"
REMOTE_BEFORE=$(git -C "$B" rev-parse refs/heads/staging)

run_cs "$FX" sync --json
SB=$(sync_branches "$W" | head -1)

t_eq   "S3 원격 staging 무변경 (직push 0회)"    "$REMOTE_BEFORE" "$(git -C "$B" rev-parse refs/heads/staging)"
t_ne   "S3 원격에 sync/ PR 헤드 생성됨"         "" "$(sync_branches "$B")"
t_true "S3 gh pr create 호출 관측"              grep -q '^pr create ' "$FX/gh.log"
t_false "S3 gh pr merge 호출 0회 (머지는 사람)"  grep -q '^pr merge' "$FX/gh.log"
t_true "S3 JSON policy_hold 버킷에 repo"        bucket_has "$RUN_JSON" policy_hold erpstg
t_true "S3 JSON pushed 버킷 비었음"             bucket_empty "$RUN_JSON" pushed
t_eq   "S3 로컬은 base 브랜치로 복귀"            "staging" "$(git -C "$W" rev-parse --abbrev-ref HEAD)"
t_ne   "S3 로컬 sync 브랜치에 작업 커밋 보존"    "" "$(git -C "$W" log --oneline "refs/heads/${SB:-none}" ^refs/heads/staging 2>/dev/null)"
t_eq   "S3 success 0 (보류는 ✅ 아님)"           "0" "$(jnum "$RUN_JSON" success)"

# =============================================
# S4a reconcile ② — 병합증명 sync/ 삭제 · 미증명 보존 · base 무변경 (EARS 3)
# =============================================
scenario "S4a reconcile: 병합증명 sync/ 만 삭제, 미증명 보존, base 무변경"
FX=$(new_fx s4lease) || die "fixture 생성 실패"
mkrepo "$FX" recon master || die "S4a repo 생성 실패"
W="$FX/work/recon"; B="$FX/remotes/recon.git"
FIRST=$(git -C "$W" rev-parse HEAD)
printf 'second\n' > "$W/two.txt"
git -C "$W" add -A && git -C "$W" commit -qm second && git -C "$W" push -q origin master || die "S4a 준비 실패"
BASE_TIP=$(git -C "$W" rev-parse HEAD)
# ① 병합 증명됨: master 의 조상
git -C "$W" push -q origin "$FIRST:refs/heads/sync/proven" || die "S4a proven 준비 실패"
# ② 미증명: master 에 없는 패치
git -C "$W" checkout -q -b tmp-unproven \
  && printf 'extra\n' > "$W/extra.txt" \
  && git -C "$W" add -A \
  && git -C "$W" commit -qm extra \
  && git -C "$W" push -q origin "tmp-unproven:refs/heads/sync/unproven" \
  && git -C "$W" checkout -q master \
  && git -C "$W" branch -qD tmp-unproven || die "S4a unproven 준비 실패"

run_cs "$FX" push --json

t_false "S4a 병합증명 sync/proven 원격에서 삭제됨" git -C "$B" rev-parse -q --verify refs/heads/sync/proven
t_true  "S4a 미증명 sync/unproven 원격에 보존됨"   git -C "$B" rev-parse -q --verify refs/heads/sync/unproven
t_eq    "S4a 원격 base 무변경 (no-op refspec)"     "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_true  "S4a JSON reclaimed 버킷에 repo"           bucket_has "$RUN_JSON" reclaimed recon
t_true  "S4a JSON reclaimed 에 삭제 브랜치명"       bucket_has "$RUN_JSON" reclaimed sync/proven
t_true  "S4a JSON failed 버킷 비었음"              bucket_empty "$RUN_JSON" failed

# =============================================
# S4b reconcile ① — 열린 sync PR 회수 (gh merge 호출 관측) (EARS 3)
# =============================================
scenario "S4b reconcile: 열린 sync PR → gh pr merge 호출 + reclaimed 집계"
FX=$(new_fx s4pr) || die "fixture 생성 실패"
mkrepo "$FX" reconpr master || die "S4b repo 생성 실패"
W="$FX/work/reconpr"; B="$FX/remotes/reconpr.git"
BASE_TIP=$(git -C "$W" rev-parse HEAD)
git -C "$W" push -q origin "HEAD:refs/heads/sync/openpr" && git -C "$W" fetch -q origin || die "S4b 준비 실패"
# gh 가 레포를 식별하려면 원격 URL 이 github 형태여야 한다. 전송은 막아 둔다 —
# 스크립트가 이 repo 로 실제 네트워크를 타면 즉시 거부되고 테스트에 드러난다.
git -C "$W" remote set-url origin "https://github.com/lens-fixture/reconpr.git"
git -C "$W" config protocol.https.allow never
printf '5 sync/openpr\n' > "$FX/gh-pr-list.txt"

run_cs "$FX" push --json

t_true "S4b gh pr merge 가 --repo 를 못 박아 호출됨" \
       grep -qE '^pr merge 5 .*--repo lens-fixture/reconpr' "$FX/gh.log"
t_true "S4b JSON reclaimed 버킷에 repo"             bucket_has "$RUN_JSON" reclaimed reconpr
t_true "S4b JSON failed 버킷 비었음"                bucket_empty "$RUN_JSON" failed
t_eq   "S4b 원격 base 무변경"                       "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_true "S4b 열린 PR 의 브랜치는 lease 삭제 대상 아님" \
       git -C "$B" rev-parse -q --verify refs/heads/sync/openpr

# =============================================
# S5a 유실 방지 — 비-ff push 거부 시 로컬 커밋 보존 · 원격 무변조 (EARS 2)
# =============================================
scenario "S5a 유실 방지: 비-ff push 거부 → 로컬 커밋 보존 · failed 집계 · 원격 무변조"
FX=$(new_fx s5nonff) || die "fixture 생성 실패"
mkrepo "$FX" nonff master || die "S5a repo 생성 실패"
W="$FX/work/nonff"; B="$FX/remotes/nonff.git"
# 다른 머신이 먼저 원격을 전진시킨 상황
git clone -q "$B" "$FX/other" \
  && git -C "$FX/other" config user.email test@lens.local \
  && git -C "$FX/other" config user.name "lens test" \
  && printf 'remote side\n' > "$FX/other/r.txt" \
  && git -C "$FX/other" add -A \
  && git -C "$FX/other" commit -qm remote-side \
  && git -C "$FX/other" push -q origin master || die "S5a 원격 전진 실패"
REMOTE_TIP=$(git -C "$FX/other" rev-parse HEAD)
printf 'local side\n' > "$W/l.txt"
git -C "$W" add -A && git -C "$W" commit -qm local-side || die "S5a 로컬 커밋 실패"
LOCAL_TIP=$(git -C "$W" rev-parse HEAD)

run_cs "$FX" push --json

t_eq   "S5a 로컬 커밋 보존 (reset·되감기 없음)"  "$LOCAL_TIP" "$(git -C "$W" rev-parse HEAD)"
t_true "S5a 로컬 커밋 객체 살아 있음"            git -C "$W" cat-file -e "$LOCAL_TIP"
t_eq   "S5a 원격 무변조 (force 안 함)"           "$REMOTE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_true "S5a JSON failed 버킷에 repo"             bucket_has "$RUN_JSON" failed nonff
t_true "S5a JSON pushed 버킷 비었음"             bucket_empty "$RUN_JSON" pushed
t_eq   "S5a success 0"                          "0" "$(jnum "$RUN_JSON" success)"

# =============================================
# S5b 유실 방지 — 레거시 PR 경로에서 머지 실패 시 reset 미실행 (EARS 2)
# =============================================
scenario "S5b 유실 방지: PR 머지 실패 → reset 미실행 · sync 브랜치에 커밋 보존"
FX=$(new_fx s5mergefail) || die "fixture 생성 실패"
mkrepo "$FX" legacy master || die "S5b repo 생성 실패"
W="$FX/work/legacy"; B="$FX/remotes/legacy.git"
# base 에 아직 원격에 없는 커밋을 얹어 둔다 — `reset --hard origin/base` 가 조건 없이
# 돌면 이게 증발한다(2026-08-02 유실 기전). 이 fixture 가 그 되감기의 탐지기다.
printf 'ahead\n' > "$W/ahead.txt"
git -C "$W" add -A && git -C "$W" commit -qm ahead || die "S5b ahead 커밋 실패"
LOCAL_TIP=$(git -C "$W" rev-parse HEAD)
printf 'work\n' > "$W/w.txt"
BASE_TIP=$(git -C "$B" rev-parse refs/heads/master)
printf '7\n' > "$FX/gh-pr-head.txt"    # 열린 PR #7 재사용 → 머지 단계까지 진입
GH_MERGE_RC=1 CS_PR_MODE=1 run_cs "$FX" push --json
SB=$(sync_branches "$W" | head -1)

t_true "S5b gh pr merge 호출 관측"               grep -q '^pr merge 7 ' "$FX/gh.log"
t_ne   "S5b 로컬 sync 브랜치 존재"               "" "$SB"
t_ne   "S5b sync 브랜치에 커밋 보존 (reset 없음)" \
       "" "$(git -C "$W" log --oneline "refs/heads/${SB:-none}" ^refs/heads/master 2>/dev/null)"
t_eq   "S5b 로컬은 base 브랜치로 복귀"            "master" "$(git -C "$W" rev-parse --abbrev-ref HEAD)"
t_eq   "S5b base 의 미푸시 커밋 보존 (reset --hard 되감기 없음)" \
       "$LOCAL_TIP" "$(git -C "$W" rev-parse refs/heads/master)"
t_eq   "S5b 원격 base 무변경 (직push 없음)"       "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_ne   "S5b 원격 sync 브랜치에 변경 보존"         "" "$(sync_branches "$B")"
t_true "S5b JSON failed 버킷에 repo"             bucket_has "$RUN_JSON" failed legacy
t_true "S5b JSON pushed 버킷 비었음 (조용한 성공 집계 없음)" bucket_empty "$RUN_JSON" pushed

# =============================================
# S6 --json 유효성 (EARS 6)
# =============================================
scenario "S6 --json: 마지막 줄 유효 JSON 1줄 + 신규 필드(reclaimed/task_branch/policy_hold)"
FX=$(new_fx s6json) || die "fixture 생성 실패"
mkrepo "$FX" jsonclean master || die "S6 repo 생성 실패"
mkrepo "$FX" jsondirty master || die "S6 repo 생성 실패"
printf 'change\n' > "$FX/work/jsondirty/c.txt"

run_cs "$FX" sync --json

t_eq   "S6 stdout 은 JSON 한 줄 (stray 개행 회귀 없음)" "1" "$(printf '%s\n' "$RUN_OUT" | wc -l | tr -d ' ')"
t_true "S6 마지막 줄이 유효 JSON (json.tool exit 0)"    json_valid "$RUN_JSON"
t_true "S6 신규 필드 reclaimed 존재"                    key_exists "$RUN_JSON" reclaimed
t_true "S6 신규 필드 task_branch 존재"                  key_exists "$RUN_JSON" task_branch
t_true "S6 신규 필드 policy_hold 존재"                  key_exists "$RUN_JSON" policy_hold
t_true "S6 기존 필드 유지 (pushed/failed/unchanged)" \
       bash -c 'for k in pushed failed unchanged pulled diverged missing_remote; do
                  printf "%s" "$0" | grep -q "\"$k\":\[" || exit 1; done' "$RUN_JSON"
t_eq   "S6 total 은 스캔한 repo 수"                     "2" "$(jnum "$RUN_JSON" total)"
t_eq   "S6 action 반영"                                 "sync" "$(printf '%s' "$RUN_JSON" | sed -n 's/.*"action":"\([a-z]*\)".*/\1/p')"

# ── 요약 ──
printf '\n────────────────────────────────────────\n'
if [ "$FAILED" -eq 0 ]; then
  printf '%s/%s PASS\n' "$PASSED" "$TOTAL"
  exit 0
fi
printf '%s/%s PASS — 실패 %s건:\n%s' "$PASSED" "$TOTAL" "$FAILED" "$FAILED_LIST"
exit 1
