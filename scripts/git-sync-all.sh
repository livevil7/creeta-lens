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

# ── 로그 함수 ─────────────────────────────
total=${#REPOS[@]}
success=0
failed=()
missing_remote=()   # 원격이 사라진 repo — 고장이 아니라 상태 (v3.28.0)
pulled=()
pushed=()
unchanged=()

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

  # ── PUSH 단계 ─────────────────────────
  if [ "$ACTION" = "push" ] || [ "$ACTION" = "sync" ]; then
    # marketplace repos는 PULL-ONLY (push 건너뜀)
    case "$repo" in
      */.claude/plugins/marketplaces/*)
        # marketplace는 fetch + pull만 수행, push는 안 함
        ;;
      *)
        # ── PR-only 푸시 (v3.25) ──────────────────────────────────
        # 기본 브랜치로 직접 push 하지 않는다. 변경은 임시 브랜치로 옮겨
        # PR 로 제안하고 **같은 실행에서 병합한다** (v3.27). PR 은 "무엇을
        # 올렸는지"의 기록이지 통과 게이트가 아니다 — 병합하지 않으면 base 가
        # 커밋을 못 받아 로컬이 되감기고 다른 머신도 못 받는다(= 동기화 실패).
        #
        # 순서가 핵심: **커밋 전에** 브랜치를 만든다. 기본 브랜치에 먼저
        # 커밋하고 그 브랜치를 push 한 뒤 PR 을 만들면 비교할 변경이 남지
        # 않는다.
        dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
        ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

        if [ "$dirty" != "0" ] || [ "$ahead" != "0" ]; then
          upstream_remote="${upstream%%/*}"
          base_branch="${upstream#*/}"

          if [ "${LENS_SYNC_PR:-1}" = "0" ]; then
            # 명시적 opt-out — 구 동작(기본 브랜치 직접 push)
            if [ "$dirty" != "0" ]; then
              git -C "$repo" add -A
              git -C "$repo" commit -m "chore: auto-sync $DATE_ISO" --quiet 2>/dev/null \
                || repo_err="commit failed (git user.name/email 미설정 확인)"
            fi
            ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
            if [ -z "$repo_err" ] && [ "$ahead" != "0" ]; then
              if git -C "$repo" push --quiet "$upstream_remote" HEAD 2>&1; then
                pushed+=("$name (+$ahead, direct)"); did_push=true
              else
                repo_err="push failed"
              fi
            fi
          elif ! command -v gh >/dev/null 2>&1; then
            # fail-closed — gh 없으면 기본 브랜치 직접 push 로 우회하지 않는다.
            # 우회하면 사용자가 요구한 "PR 보장"이 조용히 무너진다.
            repo_err="gh 미설치 — PR 생성 불가 (직접 push 로 우회하지 않음). gh 설치 후 재실행하거나 LENS_SYNC_PR=0"
          else
            # workflow 스코프 사전 감지: .github/workflows 변경이 끼면
            # 토큰에 workflow 스코프가 없을 때 GitHub 이 push 를 거부한다.
            wf=$( { git -C "$repo" status --porcelain 2>/dev/null | awk '{print $NF}';
                    git -C "$repo" diff --name-only "@{u}..HEAD" 2>/dev/null; } \
                  | grep -c '^\.github/workflows/' || true )

            branch="sync/$DATE_ISO-$(date +%H%M%S)"
            if ! git -C "$repo" checkout -q -b "$branch" 2>/dev/null; then
              repo_err="브랜치 생성 실패 ($branch)"
            else
              if [ "$dirty" != "0" ]; then
                git -C "$repo" add -A
                git -C "$repo" commit -m "chore: auto-sync $DATE_ISO" --quiet 2>/dev/null \
                  || repo_err="commit failed (git user.name/email 미설정 확인)"
              fi

              if [ -z "$repo_err" ]; then
                if git -C "$repo" push -q -u "$upstream_remote" "$branch" 2>/dev/null; then
                  # 중복 PR 방지 — 같은 head 로 열린 PR 이 있으면 재사용
                  pr=$(git -C "$repo" rev-parse --show-toplevel >/dev/null 2>&1 && \
                       (cd "$repo" && gh pr list --head "$branch" --state open \
                          --json number --jq '.[0].number' 2>/dev/null) || true)
                  if [ -z "$pr" ] || [ "$pr" = "null" ]; then
                    (cd "$repo" && gh pr create --base "$base_branch" --head "$branch" \
                        --title "chore: auto-sync $DATE_ISO" \
                        --body "\`/cs\` 자동 동기화. base: \`$base_branch\`

변경 파일:
$(git -C "$repo" diff --name-only "$upstream_remote/$base_branch..$branch" 2>/dev/null | sed 's/^/- /' | head -50)

> ⚠️ **병합 전까지 다른 머신은 이 변경을 받지 못합니다.**" >/dev/null 2>&1) \
                      || repo_err="PR 생성 실패 (gh 인증/권한 확인)"
                  fi
                  if [ -z "$repo_err" ]; then
                    # PR 은 "무엇을 올렸는지"의 기록이지 통과 게이트가 아니다 —
                    # /cs 의 1순위 목적은 전 레포를 GitHub 에 동기화하는 것이다.
                    # 병합하지 않으면 base 가 커밋을 못 받아 아래 checkout 에서
                    # 로컬이 되감기고, 다른 머신도 변경을 못 받는다(= 동기화 실패).
                    # 검토 게이트로 쓰려면 LENS_SYNC_AUTO_MERGE=0.
                    if [ "${LENS_SYNC_AUTO_MERGE:-1}" != "0" ]; then
                      if [ -z "$pr" ] || [ "$pr" = "null" ]; then
                        pr=$( (cd "$repo" && gh pr list --head "$branch" --state open \
                                 --json number --jq '.[0].number' 2>/dev/null) || true )
                      fi
                      if [ -n "$pr" ] && [ "$pr" != "null" ]; then
                        if (cd "$repo" && gh pr merge "$pr" --merge --delete-branch >/dev/null 2>&1); then
                          merged=true
                        fi
                      fi
                    fi
                    if $merged; then
                      pushed+=("$name (PR #$pr → $base_branch, 병합됨)")
                    else
                      pushed+=("$name (PR: $branch → $base_branch, 미병합)")
                    fi
                    did_push=true
                  fi
                else
                  if [ "$wf" -gt 0 ]; then
                    repo_err="push 거부 — .github/workflows 변경 포함 (gh 토큰에 workflow 스코프 없음)"
                  else
                    repo_err="브랜치 push 실패"
                  fi
                fi
              fi

              # 원래 브랜치로 복귀. push 가 성공했을 때만 로컬을 원격 기준으로
              # 되맞춘다 — 커밋은 원격 브랜치에 보존되므로 유실이 아니다.
              # push 실패 시엔 되돌리지 않는다 (아직 원격에 없으므로).
              git -C "$repo" checkout -q "$base_branch" 2>/dev/null || true
              if [ -z "$repo_err" ]; then
                if $merged; then
                  # 병합됐으면 base 를 원격에서 당겨온다 — 방금 올린 변경이
                  # 로컬 워킹트리에 그대로 남는다(되감기 없음).
                  git -C "$repo" fetch -q "$upstream_remote" 2>/dev/null || true
                fi
                git -C "$repo" reset -q --hard "$upstream_remote/$base_branch" 2>/dev/null || true
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
  if printf '%s
' "${pushed[@]}" | grep -q "미병합"; then
    log ""
    log "   ⚠️ PR 미병합 — 병합 전까지 다른 머신(Mac Mini 등)은 이 변경을 받지 못합니다."
    log "      \"동기화 완료\"가 아닙니다. gh pr list 로 확인 후 병합하세요."
  fi
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
  printf '{"action":"%s","total":%s,"success":%s,"pulled":%s,"pushed":%s,"unchanged":%s,"diverged":%s,"missing_remote":%s,"failed":%s}\n' \
    "$ACTION" "$total" "$success" \
    "$(_json_arr ${pulled[@]+"${pulled[@]}"})" "$(_json_arr ${pushed[@]+"${pushed[@]}"})" \
    "$(_json_arr ${unchanged[@]+"${unchanged[@]}"})" "$(_json_arr ${diverged[@]+"${diverged[@]}"})" \n    "$(_json_arr ${missing_remote[@]+"${missing_remote[@]}"})" "$(_json_arr ${real_failed[@]+"${real_failed[@]}"})"
fi
