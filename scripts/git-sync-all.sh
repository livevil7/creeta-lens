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

ACTION="${1:-sync}"
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
pulled=()
pushed=()
unchanged=()

log() { printf "%s\n" "$*"; }
hr() { printf "%s\n" "────────────────────────────────────────"; }

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
  repo_err=""

  # ── PULL 단계 ─────────────────────────
  if [ "$ACTION" = "pull" ] || [ "$ACTION" = "sync" ]; then
    # fetch
    if ! git -C "$repo" fetch --quiet 2>&1 | head -5; then
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
        dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

        # dirty 있으면 자동 commit
        if [ "$dirty" != "0" ]; then
          git -C "$repo" add -A
          commit_msg="chore: auto-sync $DATE_ISO"
          git -C "$repo" commit -m "$commit_msg" --quiet 2>/dev/null || repo_err="commit failed (git user.name/email 미설정 확인)"
        fi

        # ahead (방금 커밋한 것 포함) 있으면 push
        ahead=$(git -C "$repo" rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
        if [ -z "$repo_err" ] && [ "$ahead" != "0" ]; then
          upstream_remote="${upstream%%/*}"
          if git -C "$repo" push --quiet "$upstream_remote" HEAD 2>&1; then
            pushed+=("$name (+$ahead)")
            did_push=true
          else
            repo_err="push failed"
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
