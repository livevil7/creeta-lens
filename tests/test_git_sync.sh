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
#     놓은 셸 스텁이라 실제 GitHub·gh 호출은 0회다. gh 를 타는 경로(회수)는 스크립트
#     가 원격 URL 로 레포를 식별하므로 URL 만 github 형태(scp)로 두고, 전송은
#     GIT_SSH_COMMAND/core.sshCommand 를 가짜 ssh 스텁으로 바꿔 같은 fixture 의 로컬
#     bare 로 돌린다 — 진짜 ssh 는 실행되지 않는다.
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
#   S7 fail-closed gh 조회 실패 → 병합증명 sync/ 도 삭제 안 함·성공 미집계         (EARS 3)
#   S8 split remote pushurl≠fetchurl → 삭제 skip (증명한 서버와 지울 서버가 다름)  (EARS 3)
#   S9 PR base 자격 baseRefName 불일치 PR 은 머지 0회·head 보존                    (EARS 3/4)
#   S10 merge queue gh merge exit 0 이어도 state≠MERGED 면 회수 미집계             (EARS 3)
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
# `pr merge` 는 GH_STUB_MERGE_EFFECT=1 이면 **실제 병합 효과까지 모의**한다 —
# 원격 bare 에서 base 를 PR head 로 전진시키고 head ref 를 지운다. 종료코드만
# 흉내 내면 "병합 뒤 스크립트가 상태를 어떻게 다시 읽는가"(ff 전진·prune·재확인)
# 를 검증할 수 없기 때문이다.
STUB_DIR="$ROOT/bin"
mkdir -p "$STUB_DIR"
cat > "$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
# 테스트용 gh 스텁 — 호출 인자를 $GH_STUB_LOG 에 기록하고 canned 응답만 낸다.
printf '%s\n' "$*" >> "${GH_STUB_LOG:-/dev/null}"

_arg_after() { # $1=플래그 → 그 뒤 인자 (없으면 빈 문자열)
  local want="$1" prev="" a; shift
  for a in "$@"; do [ "$prev" = "$want" ] && { printf '%s' "$a"; return 0; }; prev="$a"; done
}

case "$1 $2" in
  "pr list")
    # 호출부 2곳을 구분: --head 는 PR 생성 직전 중복확인, 나머지는 회수(T4①) 조회
    case " $* " in
      *" --head "*) cat "${GH_STUB_PR_HEAD:-/dev/null}" 2>/dev/null; exit 0 ;;
      *)            cat "${GH_STUB_PR_LIST:-/dev/null}" 2>/dev/null
                    exit "${GH_STUB_LIST_RC:-0}" ;;
    esac ;;
  "pr create") exit "${GH_STUB_CREATE_RC:-0}" ;;
  "pr view")
    # 병합 확정 재확인용. --jq/-q 가 붙으면 값만, 아니면 JSON 객체로 답한다.
    case " $* " in
      *" --jq "*|*" -q "*) printf '%s\n' "${GH_STUB_VIEW_STATE:-MERGED}" ;;
      *) printf '{"state":"%s"}\n' "${GH_STUB_VIEW_STATE:-MERGED}" ;;
    esac
    exit "${GH_STUB_VIEW_RC:-0}" ;;
  "pr merge")
    _rc="${GH_STUB_MERGE_RC:-0}"
    if [ "$_rc" = 0 ] && [ "${GH_STUB_MERGE_EFFECT:-0}" = 1 ]; then
      # --repo 로 bare 를 찾고, PR 번호로 head 브랜치를 canned 목록에서 역인용
      _repo=$(_arg_after --repo "$@")
      _bare="${GH_STUB_REMOTES:-/nonexistent}/$(basename "${_repo:-none}").git"
      _head=$(awk -v n="$3" '$1==n{print $2}' "${GH_STUB_PR_LIST:-/dev/null}" 2>/dev/null)
      _base=$(git -C "$_bare" symbolic-ref --short HEAD 2>/dev/null)
      _sha=$(git -C "$_bare" rev-parse -q --verify "refs/heads/${_head:-none}" 2>/dev/null)
      if [ -n "$_sha" ] && [ -n "$_base" ]; then
        git -C "$_bare" update-ref "refs/heads/$_base" "$_sha" \
          && git -C "$_bare" update-ref -d "refs/heads/$_head"
      fi
    fi
    exit "$_rc" ;;
esac
exit 0
STUB
chmod +x "$STUB_DIR/gh"

# ── 가짜 ssh: github 형태 URL 의 전송만 로컬 bare 로 돌린다 ──
# gh 를 타는 경로는 원격 URL 이 github 형태여야 스크립트가 레포를 식별한다.
# 그렇다고 전송을 막아 버리면 "삭제되지 않아야 한다" 류 단언이 공허해진다 —
# 전송이 불가능해서 통과하는 것과, 전송이 열려 있는데 스크립트가 삭제를 안 해서
# 통과하는 것은 전혀 다르다. 그래서 실제 ssh 대신 이 스텁을 물려 같은 fixture 의
# 로컬 bare 로 연결한다 (실 네트워크 0회 — 진짜 ssh 는 호출되지 않는다).
cat > "$STUB_DIR/fakessh" <<'SSHSTUB'
#!/usr/bin/env bash
# 호출: fakessh <remotes_dir> [ssh 옵션...] <host> "git-upload-pack '<경로>'"
remotes="$1"; shift
[ "${1:-}" = "-G" ] && exit 255       # git 의 ssh 변종 탐지 프로브 — 응답하지 않음
cmd=${!#}                             # 마지막 인자 = 원격에서 실행할 명령
prog=${cmd%% *}                       # git-upload-pack | git-receive-pack
path=${cmd#* }; path=${path//\'/}     # lens-fixture/<repo>.git
exec git "${prog#git-}" "$remotes/$(basename "$path")"
SSHSTUB
chmod +x "$STUB_DIR/fakessh"

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
# 어느 버킷인지까지는 못 박지 않고 "조용히 사라지지 않았다"만 본다 (버킷 선택은 구현 자유)
bucket_has_any() { # $1=json $2=찾을 문자열 $3.. = 후보 버킷들
  local j="$1" needle="$2" b; shift 2
  for b in "$@"; do bucket_has "$j" "$b" "$needle" && return 0; done
  return 1
}
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

gh_remote() { # $1=fixture $2=repo명 — 원격 URL 을 github 형태로 바꾸고 전송은 로컬 bare 로
  # 스크립트는 `git remote get-url` 로 레포를 식별한다(gh --repo 인자). insteadOf 는
  # get-url 이 그대로 펼쳐 버려 쓸 수 없어서, URL 은 scp 형태로 두고 core.sshCommand
  # 만 가짜 ssh 로 바꾼다. fakessh 가 경로 basename 으로 같은 fixture 의 bare 를 찾는다.
  git -C "$1/work/$2" remote set-url origin "git@github.com:lens-fixture/$2.git" \
    && git -C "$1/work/$2" config core.sshCommand "$STUB_DIR/fakessh $1/remotes"
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
    GH_STUB_LIST_RC="${GH_LIST_RC:-0}" \
    GH_STUB_VIEW_STATE="${GH_VIEW_STATE:-MERGED}" \
    GH_STUB_MERGE_EFFECT="${GH_MERGE_EFFECT:-0}" \
    GH_STUB_REMOTES="$fx/remotes" \
    GIT_SSH_COMMAND="$STUB_DIR/fakessh $fx/remotes" \
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
# S4b reconcile ① — 열린 sync PR 회수 (병합 효과 모의 + 로컬 ff 전진) (EARS 3)
# =============================================
scenario "S4b reconcile: 열린 sync PR → 병합·회수 + 로컬 base 가 원격까지 따라붙음"
FX=$(new_fx s4pr) || die "fixture 생성 실패"
mkrepo "$FX" reconpr master || die "S4b repo 생성 실패"
W="$FX/work/reconpr"; B="$FX/remotes/reconpr.git"
BASE_TIP=$(git -C "$W" rev-parse HEAD)
# PR head 는 base 보다 1커밋 앞이다 — 병합이 원격 base 를 실제로 전진시켜야
# "회수한 커밋이 로컬 base 에도 도착했는가"를 물을 수 있다 (전진이 없으면
# 그 런은 자기가 방금 회수한 커밋 때문에 behind 로 끝난다).
git -C "$W" checkout -q -b tmp-pr \
  && printf 'pr work\n' > "$W/pr.txt" \
  && git -C "$W" add -A \
  && git -C "$W" commit -qm "pr work" \
  && git -C "$W" push -q origin "tmp-pr:refs/heads/sync/openpr" \
  && git -C "$W" checkout -q master \
  && git -C "$W" branch -qD tmp-pr \
  && git -C "$W" fetch -q origin || die "S4b 준비 실패"
PR_HEAD=$(git -C "$B" rev-parse refs/heads/sync/openpr)
gh_remote "$FX" reconpr || die "S4b 원격 전환 실패"
printf '5 sync/openpr master\n' > "$FX/gh-pr-list.txt"

GH_MERGE_EFFECT=1 run_cs "$FX" push --json

t_true "S4b gh pr merge 가 --repo 를 못 박아 호출됨" \
       grep -qE '^pr merge 5 .*--repo lens-fixture/reconpr' "$FX/gh.log"
t_true "S4b 병합 뒤 state 를 재확인한다 (exit 0 만 믿지 않음)" \
       grep -qE '^pr view 5 ' "$FX/gh.log"
t_true "S4b JSON reclaimed 버킷에 repo"             bucket_has "$RUN_JSON" reclaimed reconpr
t_true "S4b JSON failed 버킷 비었음"                bucket_empty "$RUN_JSON" failed
t_ne   "S4b 원격 base 가 병합으로 전진했다"          "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_eq   "S4b 로컬 base tip == 원격 base tip (회수분 ff 전진)" \
       "$(git -C "$B" rev-parse refs/heads/master)" "$(git -C "$W" rev-parse refs/heads/master)"
t_eq   "S4b 회수한 PR 커밋이 로컬 base 에 도착"      "$PR_HEAD" "$(git -C "$W" rev-parse refs/heads/master)"
t_false "S4b 병합된 head 는 원격에서 사라짐"         git -C "$B" rev-parse -q --verify refs/heads/sync/openpr
t_eq   "S4b 로컬 트래킹 ref 도 prune 됨 (T6 방치 오인 없음)" \
       "" "$(git -C "$W" for-each-ref --format='%(refname)' refs/remotes/origin/sync/ 2>/dev/null)"
t_eq   "S4b success 1 (회수 후 불변식 충족)"         "1" "$(jnum "$RUN_JSON" success)"

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

# =============================================
# S7 fail-closed — gh 조회 실패 시 원격 sync/ 삭제 금지 (EARS 3)
# =============================================
# 삭제는 "이 브랜치에 열린 PR 이 없다"를 전제로 한다. 조회가 실패하면 그 전제가
# 미상이지 거짓이 아니다 — 미상일 때 지우면 열린 PR 의 head 가 사라져 PR 이 닫힌다.
scenario "S7 fail-closed: gh pr list 실패 → 병합증명 sync/ 도 삭제하지 않음"
FX=$(new_fx s7ghfail) || die "fixture 생성 실패"
mkrepo "$FX" ghfail master || die "S7 repo 생성 실패"
W="$FX/work/ghfail"; B="$FX/remotes/ghfail.git"
FIRST=$(git -C "$W" rev-parse HEAD)
printf 'second\n' > "$W/two.txt"
git -C "$W" add -A && git -C "$W" commit -qm second && git -C "$W" push -q origin master || die "S7 준비 실패"
BASE_TIP=$(git -C "$W" rev-parse HEAD)
# 병합 증명됨(master 의 조상) — 조회만 성공했다면 삭제됐을 브랜치다
git -C "$W" push -q origin "$FIRST:refs/heads/sync/proven" || die "S7 proven 준비 실패"
gh_remote "$FX" ghfail || die "S7 원격 전환 실패"
git -C "$W" fetch -q origin || die "S7 fetch 실패"

GH_LIST_RC=1 run_cs "$FX" push --json

t_true  "S7 gh pr list 호출은 관측됨"                grep -q '^pr list ' "$FX/gh.log"
t_true  "S7 조회 실패 시 병합증명 sync/ 원격 보존"    git -C "$B" rev-parse -q --verify refs/heads/sync/proven
t_eq    "S7 원격 base 무변경"                        "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_false "S7 reclaimed 에 이 repo 없음"               bucket_has "$RUN_JSON" reclaimed ghfail
t_true  "S7 보류가 보고 버킷에 남는다 (조용히 넘어가지 않음)" \
        bucket_has_any "$RUN_JSON" ghfail failed policy_hold
t_eq    "S7 success 0 (상태 미상은 ✅ 아님)"          "0" "$(jnum "$RUN_JSON" success)"

# =============================================
# S8 split remote — fetch URL ≠ push URL 이면 삭제 금지 (EARS 3)
# =============================================
# 우리가 증명에 쓴 refs 는 fetch 쪽 서버의 것이다. push 쪽이 다른 서버면 "거기서도
# 병합됐다"는 증거가 없다. pushmirror 는 fetch 원격의 완전 복제라 스크립트가
# 삭제를 강행하면 lease 가 맞아 실제로 지워진다 — 이 단언이 공허하지 않은 이유.
scenario "S8 split remote: pushurl ≠ fetchurl → 병합증명 sync/ 도 삭제 skip"
FX=$(new_fx s8split) || die "fixture 생성 실패"
mkrepo "$FX" splitrm master || die "S8 repo 생성 실패"
W="$FX/work/splitrm"; B="$FX/remotes/splitrm.git"; PM="$FX/remotes/pushmirror.git"
FIRST=$(git -C "$W" rev-parse HEAD)
printf 'second\n' > "$W/two.txt"
git -C "$W" add -A && git -C "$W" commit -qm second && git -C "$W" push -q origin master || die "S8 준비 실패"
git -C "$W" push -q origin "$FIRST:refs/heads/sync/proven" || die "S8 proven 준비 실패"
git clone -q --bare "$B" "$PM" || die "S8 push 미러 준비 실패"
gh_remote "$FX" splitrm || die "S8 원격 전환 실패"
git -C "$W" remote set-url --push origin "git@github.com:lens-fixture/pushmirror.git" || die "S8 pushurl 설정 실패"
git -C "$W" fetch -q origin || die "S8 fetch 실패"

run_cs "$FX" push --json

t_true  "S8 fetch 쪽 원격에 sync/proven 보존"        git -C "$B" rev-parse -q --verify refs/heads/sync/proven
t_true  "S8 push 쪽 원격에도 sync/proven 보존 (삭제 강행 없음)" \
        git -C "$PM" rev-parse -q --verify refs/heads/sync/proven
t_false "S8 reclaimed 에 이 repo 없음"               bucket_has "$RUN_JSON" reclaimed splitrm
t_true  "S8 보류가 보고 버킷에 남는다"                bucket_has_any "$RUN_JSON" splitrm failed policy_hold
t_eq    "S8 success 0"                              "0" "$(jnum "$RUN_JSON" success)"

# =============================================
# S9 PR base 자격 — base 가 다른 sync PR 은 회수하지 않음 (EARS 3/4)
# =============================================
# base 가 다른 PR 을 자동 머지하면 배포 게이트가 통째로 우회된다. head 는 병합
# 증명 상태(=base 조상)로 두었다 — 자격 미달로 건너뛰더라도 "열린 PR 의 head" 라서
# ② 삭제 대상에서도 빠져야 한다(제외가 없으면 지워지므로 단언이 실효적이다).
scenario "S9 PR base 자격: baseRefName 불일치 → merge 0회 · head 보존"
FX=$(new_fx s9prbase) || die "fixture 생성 실패"
mkrepo "$FX" prbase master || die "S9 repo 생성 실패"
W="$FX/work/prbase"; B="$FX/remotes/prbase.git"
BASE_TIP=$(git -C "$W" rev-parse HEAD)
git -C "$W" push -q origin "HEAD:refs/heads/sync/otherbase" || die "S9 head 준비 실패"
gh_remote "$FX" prbase || die "S9 원격 전환 실패"
git -C "$W" fetch -q origin || die "S9 fetch 실패"
printf '11 sync/otherbase release-1.0\n' > "$FX/gh-pr-list.txt"   # PR 의 base 가 master 가 아니다

GH_MERGE_EFFECT=1 run_cs "$FX" push --json

t_false "S9 base 불일치 PR 은 gh pr merge 호출 0회"   grep -q '^pr merge ' "$FX/gh.log"
t_true  "S9 원격 sync/otherbase 보존 (열린 PR head 는 삭제 대상 아님)" \
        git -C "$B" rev-parse -q --verify refs/heads/sync/otherbase
t_eq    "S9 원격 base 무변경"                        "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_false "S9 reclaimed 에 이 repo 없음"               bucket_has "$RUN_JSON" reclaimed prbase
t_true  "S9 보고 버킷에 남는다 (조용히 무시하지 않음)" bucket_has_any "$RUN_JSON" prbase policy_hold failed
t_eq    "S9 success 0"                              "0" "$(jnum "$RUN_JSON" success)"

# =============================================
# S10 merge queue — exit 0 ≠ 병합 완료 (EARS 3)
# =============================================
# gh pr merge 는 merge queue 에 넣기만 해도 0 을 낸다. 그 0 을 병합으로 세면
# 아직 base 에 없는 변경이 "회수됨" 으로 보고되고, 다음 런은 그 브랜치를 또 만난다.
scenario "S10 merge queue: pr merge exit 0 + state=OPEN → 회수 미집계"
FX=$(new_fx s10queue) || die "fixture 생성 실패"
mkrepo "$FX" mqueue master || die "S10 repo 생성 실패"
W="$FX/work/mqueue"; B="$FX/remotes/mqueue.git"
BASE_TIP=$(git -C "$W" rev-parse HEAD)
git -C "$W" push -q origin "HEAD:refs/heads/sync/queued" || die "S10 head 준비 실패"
gh_remote "$FX" mqueue || die "S10 원격 전환 실패"
git -C "$W" fetch -q origin || die "S10 fetch 실패"
printf '9 sync/queued master\n' > "$FX/gh-pr-list.txt"

GH_VIEW_STATE=OPEN run_cs "$FX" push --json     # 머지는 0 을 내지만 아직 큐에 있다

t_true  "S10 gh pr merge 호출 관측"                  grep -q '^pr merge 9 ' "$FX/gh.log"
t_true  "S10 gh pr view 로 병합 확정을 재확인"        grep -qE '^pr view 9 ' "$FX/gh.log"
t_false "S10 reclaimed 미집계 (state 가 MERGED 아님)" bucket_has "$RUN_JSON" reclaimed mqueue
t_true  "S10 원격 head 잔존 (미병합 head 를 지우지 않음)" \
        git -C "$B" rev-parse -q --verify refs/heads/sync/queued
t_eq    "S10 원격 base 무변경"                       "$BASE_TIP" "$(git -C "$B" rev-parse refs/heads/master)"
t_true  "S10 대기 상태가 보고 버킷에 남는다"          bucket_has_any "$RUN_JSON" mqueue policy_hold failed
t_eq    "S10 success 0 (대기는 ✅ 아님)"              "0" "$(jnum "$RUN_JSON" success)"

# ── 요약 ──
printf '\n────────────────────────────────────────\n'
if [ "$FAILED" -eq 0 ]; then
  printf '%s/%s PASS\n' "$PASSED" "$TOTAL"
  exit 0
fi
printf '%s/%s PASS — 실패 %s건:\n%s' "$PASSED" "$TOTAL" "$FAILED" "$FAILED_LIST"
exit 1
