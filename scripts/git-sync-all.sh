#!/bin/bash
# =============================================
# git-sync-all.sh — 모든 독립 repo 일괄 동기화
# =============================================
# 용도: Dropbox처럼 모든 기기에서 자동 sync
# 호출: git-sync-all.sh [pull|push|sync]
#   pull : 모든 repo fetch + fast-forward pull (behind 해소)
#   push : 모든 repo 자동 commit + push (dirty, ahead 해소)
#   sync : pull + push (기본값)
#
# 스캔 루트: GIT_ROOTS 환경변수가 우선. 없으면 $HOME 기준 표준 후보를
# 자동 탐지(존재하는 디렉터리만 채택). 사용자명/머신 의존 없음.
#
# 기본은 미러(v3.31): base 에 직접 commit + push. LENS_SYNC_PR=1 은 레거시
# PR 경로 opt-in. 레포별 정책은 lens.config.json 의 syncPolicy (pr-manual).
# =============================================

set -uo pipefail

# 인자 파싱: [pull|push|sync] 와 --json 을 위치 무관하게 받음.
ACTION="sync"
JSON_MODE=0
for _arg in "$@"; do
  case "$_arg" in
    --json) JSON_MODE=1 ;;
    pull|push|sync) ACTION="$_arg" ;;
  esac
done
DATE_ISO=$(date +%Y-%m-%d)
DATE_READABLE=$(date "+%Y-%m-%d %H:%M")

# ── 스캔 루트 자동 감지 ─────────────────────
# GIT_ROOTS 가 명시되어 있으면 그것을 사용.
# 그렇지 않으면 $HOME 기준 표준 후보들 — 머신/사용자명에 무관.
# 존재하는 디렉터리만 아래 수집 루프에서 실제로 처리됨.
# $HOME 은 macOS / Linux / Windows(Git Bash) 모두에서 사용자 홈을 가리킴.
if [ -n "${GIT_ROOTS:-}" ]; then
  ROOTS=($GIT_ROOTS)
else
  ROOTS=(
    "$HOME/Documents/Git"
    "$HOME/Documents/GIT"
    "$HOME/projects"
    "$HOME/Projects"
    "$HOME/git"
    # 홈 바로 밑에 둔 repo 도 잡는다 (v3.28.0). 실측: Mac Mini 는 livevil-setting·
    # livevil-research·namane-mkt·creeta-homepage 4개가 홈 직하라 스캔에서 통째로
    # 빠져 있었다 — 그중 livevil-setting 은 Claude 파일 메모리가 사는 repo 다.
    # 수집 루프가 .git 있는 1레벨만 담고 device:inode 로 dedup 하므로 겹쳐도 안전.
    "$HOME"
    "$HOME/.claude/plugins/marketplaces"
  )
fi

# ── repo 목록 수집 (중첩 제외, .git 있는 1레벨 하위만) ─────
REPOS=()
for root in "${ROOTS[@]}"; do
  [ -d "$root" ] || continue
  # 루트 자체가 repo일 수도 있음
  if [ -d "$root/.git" ]; then
    REPOS+=("$root")
  fi
  for d in "$root"/*/; do
    [ -d "$d/.git" ] && REPOS+=("${d%/}")
  done
done

# 중복 제거 — device:inode 로 dedup 하여 Windows 케이스 무차별 / 심볼릭 링크
# 같은 가짜 중복까지 흡수. GNU stat (Linux/Git Bash) 와 BSD stat (macOS) 모두 지원.
_dedup=()
declare -A _seen_id=()
for p in "${REPOS[@]}"; do
  id=$(stat -c '%d:%i' "$p" 2>/dev/null || stat -f '%d:%i' "$p" 2>/dev/null || echo "$p")
  if [ -z "${_seen_id[$id]:-}" ]; then
    _seen_id[$id]=1
    _dedup+=("$p")
  fi
done
REPOS=("${_dedup[@]}")

# ── lens.config.json 읽기 (T2) ─────────────
# 스크립트 기준 ../lens.config.json 에서 레포별 정책을 읽는다. 셸 파싱만
# (No Node/jq — 단순 평면 구조 전제). 파일 부재·파싱 실패는 "없음"과 동일
# 취급하고 보수 동작한다 — staging 하드가드는 config 와 무관하게 항상 작동.
CFG_FILE="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/lens.config.json"
[ -f "$CFG_FILE" ] || CFG_FILE=""

# _cfg_get <맵키> <레포명> → 값 (없으면 빈 문자열)
# 예: _cfg_get baseBranch Returns_ERP_v20 → staging
_cfg_get() {
  [ -n "$CFG_FILE" ] || return 0
  sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*{\(.*\)}.*/\1/p' "$CFG_FILE" 2>/dev/null \
    | tr ',' '\n' \
    | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

# gh 가용성 — 회수(T4①)·PR 경로만 gh 를 쓴다. 미러 push 는 gh 무의존.
if command -v gh >/dev/null 2>&1; then GH_OK=1; else GH_OK=0; fi

# ── 로그 함수 ─────────────────────────────
total=${#REPOS[@]}
success=0
failed=()
missing_remote=()   # 원격이 사라진 repo — 고장이 아니라 상태 (v3.28.0)
pulled=()
pushed=()
unchanged=()
reclaimed=()        # 이전 런이 남긴 sync/ 잔여물 회수 (v3.31 T4)
task_branch=()      # task 브랜치 체크아웃 — commit·push 건너뜀 (v3.31 T3)
policy_hold=()      # PR 생성까지만, 머지는 사람 (pr-manual 등, v3.31 T2)
nonbase=()          # base 밖 원격 브랜치 — 사람 리포트 전용 (v3.31 T6)

# --json 모드에선 사람용 출력은 전부 stderr 로, stdout 은 마지막 JSON 한 줄만.
log() { if [ "$JSON_MODE" = 1 ]; then printf "%s\n" "$*" >&2; else printf "%s\n" "$*"; fi; }
hr() { log "────────────────────────────────────────"; }

log ""
log "╔══════════════════════════════════════════════╗"
log "║  git-sync-all.sh — $ACTION"
log "║  시간: $DATE_READABLE"
log "║  대상: $total repos"
log "╚══════════════════════════════════════════════╝"

# ── 각 repo 처리 ──────────────────────────
for repo in "${REPOS[@]}"; do
  name=$(basename "$repo")
  branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ -z "$branch" ]; then
    failed+=("$name: detached HEAD or bad repo")
    continue
  fi

  # upstream 없으면 스킵
  upstream=$(git -C "$repo" rev-parse --abbrev-ref @{u} 2>/dev/null || echo "")
  if [ -z "$upstream" ]; then
    unchanged+=("$name (no upstream)")
    continue
  fi

  did_pull=false
  did_push=false
  merged=false
  repo_err=""
  tb_branch=""       # T3: task 브랜치면 그 이름
  hold_msg=""        # T2/T5: 사람 결정 대기 사유 (pr-manual 등)
  rec_fail=""        # T4: 회수 실패·보류 사유
  push_ran=0         # T5: push 케이스가 실제 판정 대상인지

  # ── PULL 단계 ─────────────────────────
  if [ "$ACTION" = "pull" ] || [ "$ACTION" = "sync" ]; then
    # fetch — 원격이 사라진 repo 를 "실패" 와 분리한다 (v3.28.0).
    # GitHub 에서 지워진 옛 repo 를 매번 실패로 쌓으면 진짜 문제가 노이즈에 묻히고
    # 재시도 비용도 계속 든다. 실측: Mac Mini 36개 중 13개가 이 상태였다.
    fetch_out=$(git -C "$repo" fetch --quiet 2>&1 | head -5); fetch_rc=$?
    if [ "$fetch_rc" != "0" ]; then
      if printf '%s' "$fetch_out" | grep -qiE 'repository not found|does not exist|could not read from remote repository'; then
        missing_remote+=("$name")
        continue
      fi
      repo_err="fetch failed"
    else
      behind=$(git -C "$repo" rev-list --count HEAD..@{u} 2>/dev/null || echo "0")
      ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

      if [ "$behind" != "0" ]; then
        if [ "$ahead" != "0" ]; then
          repo_err="diverged (ahead=$ahead behind=$behind, 수동 해결 필요)"
        else
          # fast-forward 안전
          if git -C "$repo" pull --ff-only --quiet 2>&1; then
            pulled+=("$name (+$behind)")
            did_pull=true
          else
            repo_err="pull failed"
          fi
        fi
      fi
    fi
  fi

  # PULL 실패면 해당 repo는 여기서 끝
  if [ -n "$repo_err" ]; then
    failed+=("$name: $repo_err")
    continue
  fi

  # ── T6: 비-base 원격 브랜치 수집 (사람 리포트 전용) ──
  # base 에 없는 작업은 다른 머신에 도달하지 않는다 — 나이와 함께 노출한다.
  # fetch 된 refs 만 본다(네트워크 왕복 없음). base 추정: config → upstream
  # (task/sync 브랜치 체크아웃이면 upstream 은 base 가 아니므로 origin/HEAD).
  _t6_base=$(_cfg_get baseBranch "$name")
  if [ -z "$_t6_base" ]; then
    _t6_base="${upstream#*/}"
    case "$_t6_base" in
      feat/*|fix/*|ops/*|docs/*|agent/*|claude/*|codex/*|task/*|feature/*|backup/*|sync/*)
        _t6_base=$(git -C "$repo" symbolic-ref -q "refs/remotes/${upstream%%/*}/HEAD" 2>/dev/null | sed 's#.*/##')
        ;;
    esac
  fi
  if [ -n "$_t6_base" ]; then
    # 패턴은 glob 이 아니라 prefix — for-each-ref 의 `*` 는 슬래시를 넘지
    # 않아 sync/x 같은 중첩 이름을 놓친다 (실측). prefix 는 하위 전부 매칭.
    _t6_list=$(git -C "$repo" for-each-ref \
      --format='%(refname:short) %(committerdate:unix)' \
      "refs/remotes/${upstream%%/*}" 2>/dev/null || true)
    _now_ts=$(date +%s)
    if [ -n "$_t6_list" ]; then
      while read -r _rn _ct; do
        [ -n "$_rn" ] || continue
        case "$_rn" in */*) ;; *) continue ;; esac   # origin/HEAD 의 short "origin" 제외
        _short=${_rn#*/}
        [ "$_short" = "$_t6_base" ] && continue
        [ "$_short" = "HEAD" ] && continue
        _days=$(( (_now_ts - ${_ct:-$_now_ts}) / 86400 ))
        if [ "$_days" -gt 7 ]; then
          nonbase+=("$name: $_short — ⚠️ ${_days}일째 base 밖")
        else
          nonbase+=("$name: $_short (${_days}일)")
        fi
      done <<EOF
$_t6_list
EOF
    fi
  fi

  # ── PUSH 단계 ─────────────────────────
  if [ "$ACTION" = "push" ] || [ "$ACTION" = "sync" ]; then
    # marketplace repos는 PULL-ONLY (push 건너뜀)
    case "$repo" in
      */.claude/plugins/marketplaces/*)
        # marketplace는 fetch + pull만 수행, push는 안 함
        ;;
      *)
        # ── 미러 푸시 (v3.31 기본) ────────────────────────────────
        # 기본은 base 직push 미러다 — 런이 끝나면 "원격 base == 로컬,
        # 잔여물 0" 이 불변식이다. PR 경로는 ① LENS_SYNC_PR=1 (레거시
        # opt-in, v3.31 에서 의미 반전) ② syncPolicy=pr-manual (배포 게이트
        # 레포) 두 경우만 탄다.
        push_ran=1

        # T3: task 브랜치 가드 — task 브랜치는 /cc·사람 소유다
        # (branch-lifecycle §2 — /cs 는 task 브랜치를 소유하지 않는다).
        # commit·push·회수 전부 건너뛴다. ff pull 은 위에서 이미 수행됐다.
        case "$branch" in
          feat/*|fix/*|ops/*|docs/*|agent/*|claude/*|codex/*|task/*|feature/*|backup/*)
            tb_branch="$branch"
            ;;
        esac

        if [ -z "$tb_branch" ]; then
          upstream_remote="${upstream%%/*}"
          base_branch="${upstream#*/}"

          # T2: 레포별 정책 (lens.config.json) + 하드가드 이중화 — config
          # 부재·파싱 실패와 무관하게 staging 은 미러 직push 금지
          # (ERP 는 staging 머지=배포다. branch-lifecycle §1.2)
          cfg_base=$(_cfg_get baseBranch "$name")
          cfg_policy=$(_cfg_get syncPolicy "$name")
          if [ "$branch" = "staging" ] || [ "$base_branch" = "staging" ]; then
            cfg_policy="pr-manual"
          fi

          if [ -n "$cfg_base" ] && [ "$cfg_base" != "$branch" ]; then
            # config 가 지정한 base 가 아닌 브랜치 체크아웃 — push 전체 skip
            repo_err="base 불일치(현재 $branch, config $cfg_base) — push 건너뜀"
          else
            # ── T4: reconcile — 이전 런이 남긴 sync/ 잔여물 회수 ──
            # ① 열린 sync/ PR: 병합·회수. pr-manual·AUTO_MERGE=0 은 보고만.
            #    조회·머지는 --repo 로 레포를 못 박는다 (branch-lifecycle §7.1
            #    — gh 가 기본 레포를 오인하면 남의 PR 이 "성공"으로 돌아온다).
            sync_pr_heads=""
            did_reclaim=0
            if [ "$GH_OK" = 1 ]; then
              gh_repo=$(git -C "$repo" remote get-url "$upstream_remote" 2>/dev/null \
                | sed -n -e 's/\.git$//' -e 's#^git@github\.com:##p' -e 's#^https://github\.com/##p')
              if [ -n "$gh_repo" ]; then
                sync_pr_list=$(gh pr list --repo "$gh_repo" --state open \
                  --json number,headRefName \
                  --jq '.[] | select(.headRefName | startswith("sync/")) | "\(.number) \(.headRefName)"' \
                  2>/dev/null </dev/null || true)
                if [ -n "$sync_pr_list" ]; then
                  while read -r _prn _prh; do
                    [ -n "$_prn" ] || continue
                    sync_pr_heads="$sync_pr_heads $_prh"
                    if [ "$cfg_policy" = "pr-manual" ]; then
                      hold_msg="${hold_msg:+$hold_msg; }sync PR #$_prn 대기 — 배포 게이트, 머지는 사람"
                    elif [ "${LENS_SYNC_AUTO_MERGE:-1}" = "0" ]; then
                      hold_msg="${hold_msg:+$hold_msg; }sync PR #$_prn 대기 — LENS_SYNC_AUTO_MERGE=0"
                    elif gh pr merge "$_prn" --repo "$gh_repo" --merge --delete-branch >/dev/null 2>&1 </dev/null; then
                      reclaimed+=("$name PR #$_prn 병합·회수")
                      did_reclaim=1
                    else
                      rec_fail="${rec_fail:+$rec_fail; }⚠️ sync PR #$_prn 회수 불가(충돌 등) — 수동 확인"
                    fi
                  done <<EOF
$sync_pr_list
EOF
                fi
              fi
            fi

            # ② 열린 PR 이 없는 원격 sync/* 브랜치: base 포함이 **증명된
            #    것만** 삭제한다. 판정 직전 fetch 한 SHA 로 atomic 이중 lease
            #    (§7.1) — base 쪽은 no-op refspec 이고, 어느 쪽이든 원격이
            #    진전됐으면 push 전체가 거부된다(재시도·force 금지).
            #    미증명·미머지는 절대 삭제하지 않는다 (§3.2 — CLOSED 미머지
            #    PR 의 브랜치 보존).
            if [ "$ACTION" = "push" ] || [ "$did_reclaim" = 1 ]; then
              # sync 액션은 PULL 단계가 방금 fetch 했다 — push 단독 실행과
              # ①의 회수 직후만 tracking ref 를 갱신한다.
              git -C "$repo" fetch -q "$upstream_remote" 2>/dev/null || true
            fi
            base_sha=$(git -C "$repo" rev-parse -q --verify "refs/remotes/$upstream_remote/$base_branch" 2>/dev/null || echo "")
            if [ -n "$base_sha" ]; then
              for _sbref in $(git -C "$repo" for-each-ref --format='%(refname)' "refs/remotes/$upstream_remote/sync/*" 2>/dev/null); do
                _sbname=${_sbref#refs/remotes/$upstream_remote/}
                case " $sync_pr_heads " in *" $_sbname "*) continue ;; esac
                _sb_sha=$(git -C "$repo" rev-parse -q --verify "$_sbref" 2>/dev/null) || continue
                # 병합 증명 2단 (§5): ① 조상 → ② patch 동등 (git cherry)
                _proven=0
                if git -C "$repo" merge-base --is-ancestor "$_sb_sha" "$base_sha" 2>/dev/null; then
                  _proven=1
                elif _cherry=$(git -C "$repo" cherry "$base_sha" "$_sb_sha" 2>/dev/null); then
                  printf '%s\n' "$_cherry" | grep -q '^+' || _proven=1
                fi
                if [ "$_proven" = 1 ]; then
                  if git -C "$repo" push --atomic \
                       --force-with-lease="refs/heads/$base_branch:$base_sha" \
                       --force-with-lease="refs/heads/$_sbname:$_sb_sha" \
                       "$upstream_remote" "$base_sha:refs/heads/$base_branch" ":refs/heads/$_sbname" \
                       >/dev/null 2>&1; then
                    reclaimed+=("$name $_sbname 삭제(병합 증명)")
                  else
                    rec_fail="${rec_fail:+$rec_fail; }$_sbname 삭제 보류 — 원격 진전(lease 거부), 다음 런 재판정"
                  fi
                fi
              done
            fi

            # ── dirty·ahead 해소 ──
            dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
            ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

            if [ "$dirty" != "0" ] || [ "$ahead" != "0" ]; then
              use_pr=0
              [ "${LENS_SYNC_PR:-0}" != "0" ] && use_pr=1   # 레거시 PR 모드 opt-in
              [ "$cfg_policy" = "pr-manual" ] && use_pr=1   # 정책 — 미러 금지

              # workflow 스코프 사전 감지: .github/workflows 변경이 끼면 토큰에
              # workflow 스코프가 없을 때 GitHub 이 push 를 거부한다 (사유 표기용).
              wf=$( { git -C "$repo" status --porcelain 2>/dev/null | awk '{print $NF}';
                      git -C "$repo" diff --name-only "@{u}..HEAD" 2>/dev/null; } \
                    | grep -c '^\.github/workflows/' || true )

              if [ "$use_pr" = 0 ]; then
                # ── T1 미러(기본): base 에 직접 commit + push — 1급 경로 ──
                # push 는 ff 전제. force 계열 절대 금지 — 원격이 앞서면 거부되고
                # failed 로 보고된다. 로컬 커밋은 그대로 남아 다음 런이 재시도
                # 한다(자기치유). 이 경로엔 reset 이 없다 — 유실 기전 원천 부재.
                if [ "$dirty" != "0" ]; then
                  git -C "$repo" add -A
                  git -C "$repo" commit -m "chore: auto-sync $DATE_ISO" --quiet 2>/dev/null \
                    || repo_err="commit failed (git user.name/email 미설정 확인)"
                fi
                ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
                if [ -z "$repo_err" ] && [ "$ahead" != "0" ]; then
                  if git -C "$repo" push --quiet "$upstream_remote" HEAD >/dev/null 2>&1; then
                    pushed+=("$name (+$ahead, mirror)"); did_push=true
                  elif [ "$wf" -gt 0 ]; then
                    repo_err="push 거부 — .github/workflows 변경 포함 (gh 토큰에 workflow 스코프 없음). 로컬 커밋 보존됨"
                  else
                    repo_err="push 실패 (원격이 앞서면 ff 거부 — pull 후 재실행). 로컬 커밋 보존됨"
                  fi
                fi
              elif [ "$GH_OK" = 0 ]; then
                # fail-closed — PR 경로(opt-in·pr-manual)는 gh 없이 직접 push 로
                # 우회하지 않는다 (배포 게이트 우회 금지).
                repo_err="gh 미설치 — PR 생성 불가 (직접 push 로 우회하지 않음)"
              else
                # ── PR 경로 — 레거시 opt-in(LENS_SYNC_PR=1) 또는 pr-manual ──
                # 순서가 핵심: **커밋 전에** 브랜치를 만든다. 기본 브랜치에
                # 먼저 커밋하고 push 한 뒤 PR 을 만들면 비교할 변경이 없다.
                sync_branch="sync/$DATE_ISO-$(date +%H%M%S)"
                if ! git -C "$repo" checkout -q -b "$sync_branch" 2>/dev/null; then
                  repo_err="브랜치 생성 실패 ($sync_branch)"
                else
                  if [ "$dirty" != "0" ]; then
                    git -C "$repo" add -A
                    git -C "$repo" commit -m "chore: auto-sync $DATE_ISO" --quiet 2>/dev/null \
                      || repo_err="commit failed (git user.name/email 미설정 확인)"
                  fi

                  if [ -z "$repo_err" ]; then
                    if git -C "$repo" push -q -u "$upstream_remote" "$sync_branch" 2>/dev/null; then
                      # 중복 PR 방지 — 같은 head 로 열린 PR 이 있으면 재사용
                      pr=$(git -C "$repo" rev-parse --show-toplevel >/dev/null 2>&1 && \
                           (cd "$repo" && gh pr list --head "$sync_branch" --state open \
                              --json number --jq '.[0].number' 2>/dev/null) || true)
                      if [ -z "$pr" ] || [ "$pr" = "null" ]; then
                        (cd "$repo" && gh pr create --base "$base_branch" --head "$sync_branch" \
                            --title "chore: auto-sync $DATE_ISO" \
                            --body "\`/cs\` 자동 동기화. base: \`$base_branch\`

변경 파일:
$(git -C "$repo" diff --name-only "$upstream_remote/$base_branch..$sync_branch" 2>/dev/null | sed 's/^/- /' | head -50)

> ⚠️ **병합 전까지 다른 머신은 이 변경을 받지 못합니다.**" >/dev/null 2>&1) \
                          || repo_err="PR 생성 실패 (gh 인증/권한 확인)"
                      fi
                      if [ -z "$repo_err" ]; then
                        # 머지 여부: 기본은 같은 런에서 병합(잔여물 0). pr-manual
                        # 은 머지를 시도하지 않는다 — 배포 게이트, 머지는 사람.
                        do_merge=1
                        [ "${LENS_SYNC_AUTO_MERGE:-1}" = "0" ] && do_merge=0
                        [ "$cfg_policy" = "pr-manual" ] && do_merge=0
                        if [ "$do_merge" = 1 ]; then
                          if [ -z "$pr" ] || [ "$pr" = "null" ]; then
                            pr=$( (cd "$repo" && gh pr list --head "$sync_branch" --state open \
                                     --json number --jq '.[0].number' 2>/dev/null) || true )
                          fi
                          if [ -n "$pr" ] && [ "$pr" != "null" ]; then
                            if (cd "$repo" && gh pr merge "$pr" --merge --delete-branch >/dev/null 2>&1); then
                              merged=true
                            else
                              # T5②: 병합 실패를 조용히 pushed 로 집계하지 않는다
                              repo_err="PR #$pr 병합 실패 — 수동 확인 필요 (변경은 sync 브랜치·원격 PR 에 보존)"
                            fi
                          else
                            repo_err="병합할 PR 번호 조회 실패"
                          fi
                        fi
                        if [ -z "$repo_err" ]; then
                          if $merged; then
                            pushed+=("$name (PR #$pr → $base_branch, 병합됨)")
                          elif [ "$cfg_policy" = "pr-manual" ]; then
                            hold_msg="${hold_msg:+$hold_msg; }PR $sync_branch → $base_branch 생성 — 배포 게이트, 머지는 사람"
                          else
                            hold_msg="${hold_msg:+$hold_msg; }PR $sync_branch → $base_branch 생성 — LENS_SYNC_AUTO_MERGE=0, 머지 보류"
                          fi
                          did_push=true
                        fi
                      fi
                    else
                      if [ "$wf" -gt 0 ]; then
                        repo_err="push 거부 — .github/workflows 변경 포함 (gh 토큰에 workflow 스코프 없음)"
                      else
                        repo_err="브랜치 push 실패"
                      fi
                    fi
                  fi

                  # 원래 브랜치로 복귀. T5③: reset --hard 는 **병합이 확인됐을
                  # 때만** 실행한다 — 미병합·실패 시 로컬 워킹트리를 원격 기준
                  # 으로 되감지 않는다 (2026-08-02 유실 기전 제거. 커밋은 sync
                  # 브랜치와 원격 PR 에 보존되어 있다).
                  git -C "$repo" checkout -q "$base_branch" 2>/dev/null || true
                  if [ -z "$repo_err" ] && $merged; then
                    # 병합됐으면 base 를 원격에서 당겨온다 — 방금 올린 변경이
                    # 로컬 워킹트리에 그대로 남는다(되감기 없음).
                    git -C "$repo" fetch -q "$upstream_remote" 2>/dev/null || true
                    git -C "$repo" reset -q --hard "$upstream_remote/$base_branch" 2>/dev/null || true
                  fi
                fi
              fi
            fi
          fi
        fi
        ;;
    esac
  fi

  if [ -n "$repo_err" ]; then
    failed+=("$name: $repo_err")
    continue
  fi

  # ── 버킷 분류 (T2/T3/T4) — 성공(✅)으로 세지 않는다 ──
  if [ -n "$tb_branch" ]; then
    task_branch+=("$name ($tb_branch)")
    continue
  fi
  if [ -n "$rec_fail" ]; then
    failed+=("$name: $rec_fail")
    continue
  fi
  if [ -n "$hold_msg" ]; then
    policy_hold+=("$name: $hold_msg")
    continue
  fi

  # ── T5①: 불변식 — 성공 = 로컬 base tip == origin/base tip && dirty 0.
  #    열린 sync PR 은 위 hold/rec_fail 버킷이 이미 걸렀다 (gh 가능 시).
  #    push 케이스가 실제로 돈 레포만 판정하고, behind 는 sync 액션에서만
  #    본다 — push 단독 실행은 pull 을 약속하지 않는다.
  if [ "$push_ran" = 1 ]; then
    inv=""
    inv_dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    inv_ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
    [ "$inv_dirty" != "0" ] && inv="dirty=$inv_dirty"
    [ "$inv_ahead" != "0" ] && inv="${inv:+$inv }ahead=$inv_ahead"
    if [ "$ACTION" = "sync" ]; then
      inv_behind=$(git -C "$repo" rev-list --count HEAD..@{u} 2>/dev/null || echo "0")
      [ "$inv_behind" != "0" ] && inv="${inv:+$inv }behind=$inv_behind"
    fi
    if [ -n "$inv" ]; then
      failed+=("$name: 불변식 미충족($inv) — 원격 base == 로컬이 아직 아님")
      continue
    fi
  fi

  if ! $did_pull && ! $did_push; then
    unchanged+=("$name")
  fi
  success=$((success+1))
done

# ── 요약 리포트 ───────────────────────────
hr
log "✅ 성공: $success / $total"
if [ ${#pulled[@]} -gt 0 ]; then
  log ""
  log "📥 Pulled (${#pulled[@]}):"
  for x in "${pulled[@]}"; do log "   • $x"; done
fi
if [ ${#pushed[@]} -gt 0 ]; then
  log ""
  log "📤 Pushed (${#pushed[@]}):"
  for x in "${pushed[@]}"; do log "   • $x"; done
fi
if [ ${#reclaimed[@]} -gt 0 ]; then
  log ""
  log "♻️ 회수 (${#reclaimed[@]}) — 이전 런이 남긴 sync/ 잔여물:"
  for x in "${reclaimed[@]}"; do log "   • $x"; done
fi
if [ ${#policy_hold[@]} -gt 0 ]; then
  log ""
  log "🔒 정책 보류 (${#policy_hold[@]}) — 머지는 사람이 결정합니다:"
  for x in "${policy_hold[@]}"; do log "   • $x"; done
  log "   ⚠️ 머지 전까지 다른 머신은 이 변경을 받지 못합니다."
fi
if [ ${#task_branch[@]} -gt 0 ]; then
  log ""
  log "⏸️ task 브랜치 — commit·push 건너뜀 (${#task_branch[@]}) — /cc·사람 소유:"
  for x in "${task_branch[@]}"; do log "   • $x"; done
fi
if [ ${#missing_remote[@]} -gt 0 ]; then
  log ""
  log "⚠️ 원격 없음 (${#missing_remote[@]}) — GitHub 에 저장소가 없습니다. 고장이 아니라 상태입니다:"
  log "   $(printf '%s ' ${missing_remote[@]+"${missing_remote[@]}"})"
  log "   로컬 전용 아카이브이거나 원격이 삭제·이름변경된 repo 입니다."
fi
if [ ${#failed[@]} -gt 0 ]; then
  log ""
  log "❌ 실패 (${#failed[@]}):"
  for x in "${failed[@]}"; do log "   • $x"; done
  log ""
  log "⚠️ 실패한 repo는 수동으로 확인하세요."
fi
if [ ${#unchanged[@]} -gt 0 ] && [ ${#unchanged[@]} -lt 20 ]; then
  log ""
  log "○ 변경 없음 (${#unchanged[@]}): ${unchanged[*]}"
fi
# ── T6: base 밖 원격 브랜치 — 방치 가시화 (사람 리포트 전용) ──
if [ ${#nonbase[@]} -gt 0 ]; then
  log ""
  log "🌿 base 밖 원격 브랜치 (${#nonbase[@]}) — base 에 없는 작업은 다른 머신에 도달하지 않습니다:"
  for x in "${nonbase[@]}"; do log "   • $x"; done
fi
if [ "$GH_OK" = 0 ] && [ "$ACTION" != "pull" ]; then
  log ""
  log "⚠️ gh 미설치 — 열린 sync PR 회수(T4①)를 건너뜀. 미러 push 는 정상 동작."
fi
hr

# ── --json: 마지막 한 줄로 구조화 결과 (consumer 가 stdout 파싱) ──────────
if [ "$JSON_MODE" = 1 ]; then
  # bash 배열 → JSON 배열 (따옴표/역슬래시 이스케이프)
  _json_arr() {
    local first=1 out="[" x esc
    for x in "$@"; do
      esc=${x//\\/\\\\}; esc=${esc//\"/\\\"}
      if [ $first = 1 ]; then first=0; else out+=","; fi
      out+="\"$esc\""
    done
    printf '%s]' "$out"
  }
  # failed 에서 diverged 를 분리 (수동 해결 필요 vs 진짜 실패). set -u 하에서
  # 빈 배열 확장이 터지지 않도록 ${arr[@]+"${arr[@]}"} 방어형 사용 (bash 3.2 대비).
  diverged=(); real_failed=()
  for x in ${failed[@]+"${failed[@]}"}; do
    case "$x" in *diverged*) diverged+=("$x") ;; *) real_failed+=("$x") ;; esac
  done
  # printf 인자 수 == %s 수 (12개). 과거 stray `\n` 인자가 끼어 포맷이 재사용돼
  # 무효 JSON 2줄이 나오던 결함 수정 (T5④). 신규 3필드는 additive — 기존
  # 필드·순서 불변.
  printf '{"action":"%s","total":%s,"success":%s,"pulled":%s,"pushed":%s,"unchanged":%s,"diverged":%s,"missing_remote":%s,"failed":%s,"reclaimed":%s,"task_branch":%s,"policy_hold":%s}\n' \
    "$ACTION" "$total" "$success" \
    "$(_json_arr ${pulled[@]+"${pulled[@]}"})" \
    "$(_json_arr ${pushed[@]+"${pushed[@]}"})" \
    "$(_json_arr ${unchanged[@]+"${unchanged[@]}"})" \
    "$(_json_arr ${diverged[@]+"${diverged[@]}"})" \
    "$(_json_arr ${missing_remote[@]+"${missing_remote[@]}"})" \
    "$(_json_arr ${real_failed[@]+"${real_failed[@]}"})" \
    "$(_json_arr ${reclaimed[@]+"${reclaimed[@]}"})" \
    "$(_json_arr ${task_branch[@]+"${task_branch[@]}"})" \
    "$(_json_arr ${policy_hold[@]+"${policy_hold[@]}"})"
fi
