#!/usr/bin/env python3
"""Classify branches against a resolved base and delete only the merged ones.

Commit counts lie about branch state. `main..branch` counts every commit of an
unrelated lineage, and a branch inflated by repeated automation commits looks
large while carrying almost no content. Ancestry lies too: GitHub's rebase and
squash merges rewrite the commits, so a fully merged branch's tip stops being
an ancestor of the base and ancestry alone would call it live work forever.

So merge state is decided by patch equivalence (`git cherry`, which compares
patch-ids) with ancestry as the cheap fast path, and the report separately
carries how many files the branch's content actually differs by. Patch-ids
have two blind spots, both covered by a content-level recheck (`git merge-tree
--write-tree` merge simulation — merge-ort, read-only, ref/index/worktree
untouched; the mirror of lib/git-branch.js mergedState, and the two must not
diverge): a multi-commit squash merge rewrites N patches into one, so
live-looking `+` lines are re-proven merged when the simulated merge tree
equals the base tree; and `git cherry` never enumerates merge commits, so an
empty `+` list alone is NOT proof — content that arrived only in a merge
commit (evil merge / conflict resolution) shows zero unmerged patches while
carrying live content, and only the same tree comparison can clear it. A
conflicting or failing simulation (or git <2.38) never asserts "merged":
these verdicts delete branches, so a zero-`+` branch whose tree differs is
`keep` and one whose tree cannot be computed is `unknown` — exactly the
states lib/git-branch.js returns ('unmerged' / 'unknown') for the same
evidence.

Verdicts:
  delete          every patch on the branch is already in the base — nothing to
                  lose, whether it arrived by fast-forward, merge, rebase, or
                  squash
  archive         no merge base with the base ref — unrelated lineage; preserve
                  as a tag, never merge (merging would delete the current tree)
                  and never auto-delete
  archive_review  live patches, but the commit count is wildly out of scale with
                  the number of files changed — the automation-commit pile-up
                  that docs/rules/branch-hygiene.md says to move by hand and
                  then archive as a tag. A signal for a human, never a deletion.
  keep            at least one patch is not in the base
  unknown         a git query failed for this branch, or the content-level
                  merge proof could not be computed (merge-tree conflict /
                  failure with zero unmerged patch-ids) — state unproven, so
                  it is reported and left alone

A branch whose patch was edited on the way in (a conflict resolved during
rebase) is reported as `keep`: its patch-id no longer matches, so the tool
cannot prove the content landed. That is deliberate — it asks for a human look
rather than deleting on a guess.

Deletion requires an explicit --apply, matching the repository's posture that
orphaned state is never removed without one. `--apply` only ever removes the
two `delete` verdicts; `archive`, `archive_review`, `keep`, `unknown` and the
head branch of any open PR are never touched. See docs/rules/branch-hygiene.md.

Three further guards back `--apply`, all fail-closed:

* The open-PR check runs through `gh`, pinned to the repo the *selected*
  remote's URL resolves to (`--repo OWNER/REPO`; local mode proxies through
  origin, like the default-branch guard below). Unpinned, gh picks its own
  base repo (`gh repo set-default` / multi-remote resolution), and a query
  that "succeeds" against a different repo passes the protection check while
  this remote's open PR heads go unprotected — a failure no fail-closed
  guard on the gh call itself can see. A remote whose GitHub repo cannot be
  resolved (non-GitHub host, unreadable URL) means the tool does not know
  whose PRs it would be checking, so it is treated exactly like a failed
  check. When the check cannot run (gh missing, unauthenticated, transient
  failure) a judgment-only run warns and continues — it deletes nothing —
  but `--apply` refuses to delete in that repo, because an open PR's head
  can look merged and would be removed unseen.
  The query is capped (OPEN_PR_LIMIT); a reply that reaches the cap may be
  truncated, so it is treated exactly like a failed check — warning plus
  blocked `--apply` — never accepted as complete. `--delete-without-pr-check`
  is the explicit override for when the PR list has been verified by hand.
  Same posture as /cs (skills/cs/SKILL.md): no gh, no silent bypass.
* The protected default branch is read from the *selected* remote's HEAD
  (`refs/remotes/<remote>/HEAD`; local mode uses origin as the proxy) — not
  hard-wired to origin/HEAD, which under `--remote upstream` could be absent
  or point at a different branch while upstream's own default judges
  `delete` (a base like staging has main as an ancestor). When that HEAD
  cannot be resolved the tool does not know which branch the remote
  considers default, so `--apply` is blocked for that repo
  (`git remote set-head <remote> --auto`, then rerun). Judgment-only runs
  warn and continue — they delete nothing.
* Remote deletion is leased to the judged SHA. Verdicts are computed from the
  local tracking ref, which another machine may have outrun since the last
  fetch; a plain `push --delete` would then remove commits this run never
  examined. So the delete pushes `--force-with-lease=refs/heads/<branch>:<sha>`
  and a moved remote tip rejects it, reported as "원격이 진전됨 — fetch 후
  재판정". The tool never fetches on its own: judgment stays read-only
  (branch-lifecycle.md prescribes `git fetch --prune` before running), and a
  stale judgment is safe because the lease turns it into a refusal, not a
  deletion. Local deletion carries the same expectation — `update-ref -d`
  with the judged SHA — so a branch another process advanced after the
  judgment is refused ("로컬이 진전됨"), never deleted. See prune().

The base and the remote's HEAD are not the only refs off limits. namane-cms
carries a residual `origin/main` whose base resolves to `master` and whose
remote HEAD is `master` too, so neither protection fires — yet `main` is an
ancestor of `master` and proves `delete`. branch-lifecycle.md §4.2 says its
deletion is the repo owner's call and Lens must not touch it. So a third,
name-level protection demotes such verdicts to `keep`: branches listed in
lens.config.json `protectedBranches[<repo dir name>]`, and — as the fallback
when that key is absent — any ref whose *name* is an integration-branch name
(every value of the `baseBranch` map plus git's defaults main|master). A ref
named like an integration branch that is not the resolved base is a state
for a human to look at; a name collision is not proof of a task branch, and
this tool's posture is "증명 못 하면 유지".

Base is resolved, never assumed. `--base` overrides; otherwise the same rule
as lib/git-branch.js `resolveBase()` (single source of truth for base
judgment — mirrored here because this is Python and cannot require that
module): (1) lens.config.json `baseBranch[<repo dir name>]`, (2) upstream of
the current branch, (3) origin/HEAD. Nothing resolvable means the repo is
skipped with a reason — `main` is never guessed.

Usage:
  python scripts/prune_branches.py --repo <path> --remote origin --base main
  python scripts/prune_branches.py --repo-root <workspace>      # every repo
"""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path

PROTECTED = frozenset({"HEAD"})

# git 의 역사적 기본 브랜치 이름. 이 이름을 단 ref 가 base 도 remote HEAD 도
# 아니라면(namane-cms 의 잔여 origin/main — base=master) 그 삭제는 레포
# 소유자의 판단이다(branch-lifecycle.md §4.2). 여기 없는 통합 브랜치 이름
# (staging 등)은 lens.config.json baseBranch 맵의 값에서 합류한다 —
# _protected_branch_names() 참조.
GIT_DEFAULT_BRANCH_NAMES = frozenset({"main", "master"})

# gh pr list 조회 한도. 응답 개수가 이 값에 닿으면 목록이 잘렸을 수 있다 —
# 잘려 나간 열린 PR 의 head 는 보호받지 못한 채 삭제될 수 있으므로, 한도
# 도달은 "보호 검사 불완전"으로 취급해 --apply 를 fail-closed 로 차단한다.
OPEN_PR_LIMIT = 200

# lens.config.json sits next to the executing code (parent of scripts/), the
# same convention lib/git-branch.js uses for PLUGIN_ROOT.
PLUGIN_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PLUGIN_ROOT / "lens.config.json"

# Automation pile-up threshold (`archive_review`).
#
# Measured over all 21 live branches of this workspace (27 repos, 2026-07-25):
#   backup/macmini-preIA-20260723  169 commits /  4 files = 42.25 per file
#   every other live branch                              ≤  1.00 per file
#                                                        ≤  8 commits total
# The flagged branch is the one branch-hygiene.md was written about ("반복 커밋
# 168개 ... 실제 고유 변경은 4파일"). The gap is clean — nothing sits between
# 1.00 and 42.25 per file, and nothing between 8 and 169 commits — so both
# thresholds are placed inside it: 10 per file leaves 10x headroom above the
# healthy maximum and stays 4.2x below the known-bad case, and the 30-commit
# floor (3.75x above the healthy maximum) keeps small branches out, where a
# ratio computed from 1-2 commits is noise.
AUTOMATION_MIN_COMMITS = 30
AUTOMATION_COMMITS_PER_FILE = 10


def _force_utf8_output() -> None:
    """Make this report printable on a Windows cp949 console.

    The report is Korean and contains em dashes; under the default locale
    encoding printing it dies with UnicodeEncodeError. Requiring callers to
    export PYTHONIOENCODING every time is not a fix, so the script reconfigures
    its own streams and degrades unprintable characters instead of crashing.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stdout.strip()


def _git_ok(repo: Path, *args: str) -> bool:
    return (
        subprocess.run(
            ["git", *args],
            cwd=repo,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        ).returncode
        == 0
    )


def _git_maybe(repo: Path, *args: str) -> str | None:
    """Read-only query whose failure is an answer, not an error."""
    try:
        return _git(repo, *args) or None
    except (subprocess.CalledProcessError, OSError):
        return None


def _read_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _protected_branch_names(repo_name: str) -> frozenset[str]:
    """Branch names exempt from auto-delete in ``repo_name``, beyond base/HEAD.

    Two layers, so the protection works with or without config:

    * lens.config.json ``protectedBranches[<repo dir name>]`` — the explicit
      per-repo list. branch-lifecycle.md §4.2 documents the case this exists
      for: namane-cms's residual ``origin/main`` is fully absorbed into
      ``master`` (proven ancestor → would verdict `delete`), but its deletion
      is the repo owner's call and Lens must not touch it.
    * Fallback when that key is absent: every *value* of the ``baseBranch``
      map (the integration-branch names this workspace actually uses, e.g.
      staging) plus git's default names main|master. A ref that merely
      *shares a name* with an integration branch cannot be proven a task
      branch, and unproven means keep — never delete.

    Only names, never patterns: a broad match would start protecting real
    task branches and silently disable the tool.
    """
    config = _read_config()
    explicit = (config.get("protectedBranches") or {}).get(repo_name) or []
    workspace_bases = (config.get("baseBranch") or {}).values()
    return frozenset(explicit) | frozenset(workspace_bases) | GIT_DEFAULT_BRANCH_NAMES


# Prefixes the rules already list as *not* integration branches (§3). The
# allowed four are what we write today; these are the forbidden ones that still
# exist from before. Measured: livevil-research sat checked out on an open PR's
# head (claude/…), and that branch resolved as the repo's base — planning there
# would have aimed the PR at another PR's branch instead of main.
NON_INTEGRATION_PREFIXES = ["sync", "agent", "claude", "codex", "task", "feature", "backup"]


def _is_task_shaped_branch(name: str) -> bool:
    """Is ``name`` a task branch rather than an integration branch?

    Mirrors ``isTaskShapedBranch`` in lib/git-branch.js: the allowed task
    prefixes plus the forbidden-but-extant ones above. Kept as an intentional
    duplicate because Python cannot import that module — if the JS rule
    changes, change this too.
    """
    prefixes = _read_config().get("branchPrefixes") or ["feat", "fix", "ops", "docs"]
    return any(
        name.startswith("%s/" % p)
        for p in list(prefixes) + NON_INTEGRATION_PREFIXES
    )


def resolve_base(repo: Path) -> dict:
    """Resolve the integration branch of ``repo``.

    Same priority as lib/git-branch.js resolveBase(): config → upstream →
    origin/HEAD. Never guesses main|master from a name; an unresolvable repo
    returns base None so the caller can fail closed.
    """
    repo_name = repo.resolve().name

    configured = (_read_config().get("baseBranch") or {}).get(repo_name)
    if configured:
        return {
            "base": configured,
            "source": "config",
            "reason": 'lens.config.json baseBranch["%s"] 명시값' % repo_name,
        }

    rejected = None
    current = _git_maybe(repo, "rev-parse", "--abbrev-ref", "HEAD")
    if current and current != "HEAD":
        upstream = _git_maybe(
            repo, "for-each-ref", "--format=%(upstream:short)", "refs/heads/%s" % current
        )
        if upstream:
            stripped = upstream.split("/", 1)[1] if "/" in upstream else ""
            if stripped and _is_task_shaped_branch(stripped):
                # A pushed task branch tracks itself, so its upstream is not an
                # integration branch. Taking it as base would stack the next task
                # on top of the previous one. Fall through to origin/HEAD.
                # Mirrors lib/git-branch.js resolveBase().
                rejected = stripped
                stripped = ""
            else:
                rejected = None
            if stripped:
                return {
                    "base": stripped,
                    "source": "upstream",
                    "reason": "현재 브랜치(%s)의 upstream %s" % (current, upstream),
                }

    rejected_note = ""
    if rejected:
        rejected_note = "upstream %s 는 task 브랜치라 base 로 채택 안 함 → " % rejected

    origin_head = _git_maybe(repo, "symbolic-ref", "refs/remotes/origin/HEAD")
    if origin_head:
        stripped = origin_head.replace("refs/remotes/origin/", "", 1)
        if stripped:
            return {
                "base": stripped,
                "source": "origin-head",
                "reason": "%sorigin/HEAD → %s" % (rejected_note, stripped),
            }

    return {
        "base": None,
        "source": None,
        "reason": "%sconfig 명시 없음 + 채택 가능한 upstream 없음 + origin/HEAD 미설정 — base 판정 불가 (main/master 추정 금지)"
        % rejected_note,
    }


def _remote_github_repo(repo: Path, remote: str) -> tuple[str | None, str | None]:
    """Resolve ``remote`` to the OWNER/REPO identifier ``gh --repo`` accepts.

    Returns (identifier, None) or (None, why-not). gh 에는 git remote *이름*
    을 받는 옵션이 없다 — `gh pr list --help` (gh 2.86.0) 기준 레포 지정
    수단은 상속 플래그 `-R/--repo [HOST/]OWNER/REPO` 하나뿐이므로, 선택한
    remote 의 URL 에서 그 식별자를 직접 해석한다. 해석 실패(= None)는
    호출자가 gh 실패와 동일하게 fail-closed 로 다룬다: 어느 레포의 PR 인지
    모르는 채로 보호 검사를 "성공"으로 칠 수 없다.

    github.com 이 아닌 호스트(사설 git 서버·로컬 경로 원격)도 None 이다 —
    이 도구가 아는 PR 조회 수단은 gh(GitHub)뿐이고, 증명 못 하면 유지가
    이 도구의 자세다.
    """
    url = _git_maybe(repo, "remote", "get-url", remote)
    if not url:
        return None, "remote %s 의 URL 을 읽지 못했다" % remote
    # scheme 형식(https://·ssh://·git://, 선택적 user@·포트) 또는 scp 형식
    # (git@host:path). scp 분기의 (?!//) 는 미지 scheme 의 `://` 를 호스트로
    # 오인하지 않기 위한 가드 — 해석 실패는 어차피 fail-closed 로 떨어진다.
    m = re.match(r"^(?:git\+)?(?:https?|ssh|git)://(?:[^/@]+@)?([^/:]+)(?::\d+)?/(.*)$", url)
    if not m:
        m = re.match(r"^(?:[^@/]+@)?([^:/]+):(?!//)(.*)$", url)
    if not m:
        return None, "remote %s 의 URL(%s)에서 호스트를 해석하지 못했다" % (remote, url)
    host, path = m.group(1).lower(), m.group(2)
    if host not in ("github.com", "ssh.github.com"):
        return None, "remote %s 의 URL(%s)이 github.com 레포가 아니다" % (remote, url)
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) == 2 and parts[1].endswith(".git"):
        parts[1] = parts[1][: -len(".git")]
    if len(parts) != 2 or not all(parts):
        return None, "remote %s 의 URL(%s)에서 OWNER/REPO 를 해석하지 못했다" % (remote, url)
    return "/".join(parts), None


def _open_pr_heads(repo: Path, remote: str | None) -> tuple[dict[str, int], str | None]:
    """Head branches of open PRs, which must never be deleted.

    Returns (head -> PR number, warning). A missing or failing `gh` yields an
    empty map and a warning: the protection is unavailable and the caller has
    to know that rather than assume it held. A reply whose item count reaches
    OPEN_PR_LIMIT may be truncated by gh — the missing open PRs' heads would
    go unprotected — so it carries the same warning (the known heads are
    still protected, but the check is incomplete). main() fails closed on the
    warning for --apply (override: --delete-without-pr-check); judgment-only
    runs just carry it.

    The query is pinned to the repo the *selected* remote's URL resolves to
    (local mode proxies through origin, the same proxy the default-branch
    guard uses). Unpinned, gh resolves its own base repo — set-default /
    multi-remote — which can be a different repo entirely; that reply comes
    back as a *success*, so no gh-failure guard catches it, and the selected
    remote's open PR heads would be judged unprotected. An unresolvable
    remote therefore gets the same warning as a failed gh run: the tool
    cannot name the repo whose PRs it would be checking.
    """
    pr_remote = remote or "origin"
    repo_id, why = _remote_github_repo(repo, pr_remote)
    if repo_id is None:
        return {}, (
            "PR 조회 대상 레포 미해석(%s) — 어느 GitHub 레포의 열린 PR 을 확인해야 하는지 알 수 없어 "
            "열린 PR head 보호 검사를 못 했다. --apply 전에 PR 목록을 직접 확인하라." % why
        )
    try:
        raw = _gh_pr_list(repo, repo_id)
    except FileNotFoundError:
        return {}, "gh 없음 — 열린 PR head 보호 검사를 못 했다. --apply 전에 PR 목록을 직접 확인하라."
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        return {}, "gh pr list 실패(%s) — 열린 PR head 보호 검사를 못 했다." % (
            detail[-1] if detail else "원인 불명"
        )
    try:
        items = json.loads(raw)
        heads = {item["headRefName"]: item["number"] for item in items}
    except (ValueError, KeyError, TypeError):
        return {}, "gh pr list 출력을 해석하지 못했다 — 열린 PR head 보호 검사를 못 했다."
    if len(items) >= OPEN_PR_LIMIT:
        # 조회가 한도에 닿았다 = 그 뒤가 잘렸을 수 있다. 잘린 열린 PR 의
        # head 는 이 맵에 없어 보호받지 못하므로, 검사 실패와 동일하게 취급.
        return heads, (
            "열린 PR %d개가 조회 한도(%d)에 도달 — 목록이 잘렸을 수 있어 열린 PR head 보호 검사가 불완전하다."
            % (len(items), OPEN_PR_LIMIT)
        )
    return heads, None


def _gh_pr_list(repo: Path, repo_id: str) -> str:
    # --repo 로 조회 레포를 못 박는다. 없으면 gh 가 자체 규칙(set-default /
    # 다중 remote)으로 base 레포를 골라, --remote 가 가리키는 것과 *다른*
    # 레포의 PR 목록이 성공으로 돌아올 수 있다 — 그 목록으로는 이 remote 의
    # 열린 PR head 를 보호하지 못한다. repo_id 는 _remote_github_repo() 가
    # 선택한 remote 의 URL 에서 해석한 값.
    return subprocess.run(
        ["gh", "pr", "list", "--repo", repo_id, "--state", "open", "--limit", str(OPEN_PR_LIMIT), "--json", "number,headRefName"],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stdout.strip()


def _branches(repo: Path, remote: str | None) -> list[tuple[str, str, str]]:
    """Return (display_name, ref, sha) triples for the namespace being pruned.

    Symbolic refs are excluded. git abbreviates refs/remotes/origin/HEAD to
    plain `origin`, so the old `ref[len(remote) + 1:]` produced an *empty*
    branch name that slipped past the PROTECTED guard, was reported as a
    deletion, and made `--apply` abort on its first item
    (`git push origin --delete ""` → fatal, exit 128).

    ``sha`` is the tip this very listing saw — the value every verdict is
    computed from — and is what prune() leases the remote deletion to.
    """
    namespace = "refs/remotes/%s" % remote if remote else "refs/heads"
    refs = _git(repo, "for-each-ref", "--format=%(refname:short)%09%(objectname)%09%(symref)", namespace)
    pairs = []
    for line in refs.split("\n"):
        if not line:
            continue
        ref, _, rest = line.partition("\t")
        sha, _, symref = rest.partition("\t")
        if symref:  # refs/remotes/origin/HEAD and friends
            continue
        name = ref[len(remote) + 1 :] if remote else ref
        if not name or name in PROTECTED:
            continue
        if remote and ref == remote:  # HEAD's short form, on gits without %(symref)
            continue
        pairs.append((name, ref, sha))
    return pairs


def _unmerged_patches(repo: Path, base_ref: str, ref: str) -> list[str]:
    """Commits on ``ref`` whose patch is not in ``base_ref``.

    `git cherry` marks a commit `-` when an equivalent patch exists upstream
    and `+` when it does not, so this survives the commit rewriting that
    rebase and squash merges do.
    """
    output = _git(repo, "cherry", base_ref, ref)
    return [line[2:] for line in output.split("\n") if line.startswith("+")]


def _tree_merged(repo: Path, base_ref: str, ref: str) -> bool | None:
    """Does merging ``ref`` into ``base_ref`` leave the base tree unchanged?

    `git merge-tree --write-tree` (merge-ort, read-only — ref/index/worktree
    untouched) simulates the merge; a result tree identical to the base tree
    means the branch has nothing to add. Mirror of lib/git-branch.js
    mergedState's tree recheck — the two implementations must not diverge.

    True  = 병합 시뮬레이션 tree == base tree (브랜치 내용 전부 base 에 반영됨)
    False = tree 다름 — base 에 없는 내용이 있다
    None  = 증명 불가: 충돌(exit 1)·구버전 git(<2.38, --write-tree 없음)·실행
            실패. 이 판정으로 브랜치가 삭제되므로 증명 불가는 절대 '병합됨'이
            되지 않는다 (fail-safe).
    """
    merged_tree = _git_maybe(repo, "merge-tree", "--write-tree", base_ref, ref)
    base_tree = _git_maybe(repo, "rev-parse", "%s^{tree}" % base_ref)
    if merged_tree is None or base_tree is None:
        return None
    return merged_tree == base_tree


def _classify_one(repo: Path, name: str, ref: str, base_ref: str) -> dict:
    if _git_ok(repo, "merge-base", "--is-ancestor", ref, base_ref):
        return {
            "branch": name,
            "ref": ref,
            "verdict": "delete",
            "reason": "merged",
            "commits_ahead": 0,
            "files_changed": 0,
        }
    if not _git_ok(repo, "merge-base", base_ref, ref):
        return {
            "branch": name,
            "ref": ref,
            "verdict": "archive",
            "reason": "unrelated_history",
            "commits_ahead": int(_git(repo, "rev-list", "--count", "%s..%s" % (base_ref, ref))),
            "files_changed": None,
        }
    unmerged = _unmerged_patches(repo, base_ref, ref)
    tree_merged = _tree_merged(repo, base_ref, ref)
    if not unmerged:
        # `git cherry` 는 머지 커밋을 열거하지 않는다. 머지 커밋으로만 들어온
        # 변경(evil merge·충돌 해결분)은 `+` 0개로 보이므로, patch-id 만으로
        # 병합을 단정하면 그 내용이 삭제된다. patch_merged 는 tree 동일까지
        # 증명돼야 한다 — lib/git-branch.js mergedState 와 같은 원칙.
        if tree_merged is True:
            return {
                "branch": name,
                "ref": ref,
                "verdict": "delete",
                "reason": "patch_merged",
                "commits_ahead": 0,
                "files_changed": 0,
            }
        if tree_merged is False:
            changed = _git(repo, "diff", "--name-only", "%s...%s" % (base_ref, ref))
            return {
                "branch": name,
                "ref": ref,
                "verdict": "keep",
                "reason": "merge_commit_content",
                "commits_ahead": 0,
                "files_changed": len([line for line in changed.split("\n") if line]),
            }
        # tree_merged is None — 증명 불가(충돌·구버전 git·실패). 머지 커밋에만
        # 존재하는 변경 가능성을 배제할 수 없으므로 병합 단정 금지 = 판정 불가.
        # lib/git-branch.js 는 같은 증거에서 'unknown' 을 반환한다.
        return {
            "branch": name,
            "ref": ref,
            "verdict": "unknown",
            "reason": "tree_unverified",
            "commits_ahead": None,
            "files_changed": None,
        }
    if tree_merged is True:
        # 다중 커밋 squash 병합: 원본 patch-id 들이 합쳐진 단일 커밋과 달라
        # `+` 로 남지만, 병합 시뮬레이션 tree 가 base 와 같으면 base 에 더할
        # 내용이 없다 = 이미 반영됨.
        return {
            "branch": name,
            "ref": ref,
            "verdict": "delete",
            "reason": "tree_merged",
            "commits_ahead": 0,
            "files_changed": 0,
        }
    changed = _git(repo, "diff", "--name-only", "%s...%s" % (base_ref, ref))
    files_changed = len([line for line in changed.split("\n") if line])
    commits_ahead = len(unmerged)
    if (
        commits_ahead >= AUTOMATION_MIN_COMMITS
        and commits_ahead >= AUTOMATION_COMMITS_PER_FILE * max(files_changed, 1)
    ):
        # branch-hygiene.md: 커밋 수가 변경 파일 수보다 훨씬 크면 자동 커밋이
        # 쌓인 것이므로 고유 변경만 옮기고 브랜치는 태그로 아카이브한다.
        return {
            "branch": name,
            "ref": ref,
            "verdict": "archive_review",
            "reason": "automation_commits",
            "commits_ahead": commits_ahead,
            "files_changed": files_changed,
        }
    return {
        "branch": name,
        "ref": ref,
        "verdict": "keep",
        "reason": "unmerged_content",
        "commits_ahead": commits_ahead,
        "files_changed": files_changed,
    }


def classify(
    repo: Path,
    *,
    base: str,
    remote: str | None,
    open_prs: dict[str, int] | None = None,
    default_branch: str | None = None,
) -> list[dict]:
    base_ref = "%s/%s" % (remote, base) if remote else base
    open_prs = open_prs or {}
    protected_names = _protected_branch_names(repo.resolve().name)
    report = []
    for name, ref, sha in _branches(repo, remote):
        if name == base:
            continue
        try:
            item = _classify_one(repo, name, ref, base_ref)
        except (subprocess.CalledProcessError, OSError, ValueError) as exc:
            item = {
                "branch": name,
                "ref": ref,
                "verdict": "unknown",
                "reason": "git_query_failed: %s" % type(exc).__name__,
                "commits_ahead": None,
                "files_changed": None,
            }
        item["sha"] = sha  # 판정 근거가 된 tip — prune() 의 lease 기준값
        if name == default_branch and item["verdict"] == "delete":
            # base 가 staging 으로 해석되는 레포(Returns_ERP_v20)에서 origin/main 은
            # staging 의 조상이라 '병합됨'으로 증명된다. 그러나 그것은 그 레포의
            # 기본·운영 브랜치다. 병합 증명 여부와 무관하게 지우지 않는다.
            item["verdict"] = "keep"
            item["reason"] = "default_branch"
        if name in protected_names and item["verdict"] == "delete":
            # namane-cms: base 와 remote HEAD 가 둘 다 master 라 잔여 origin/main 은
            # 어느 보호에도 안 걸린 채 조상으로 증명돼 delete 가 된다. 그러나
            # branch-lifecycle.md §4.2 — 그 삭제는 레포 소유자의 판단이고 Lens 는
            # 건드리지 않는다. 통합 브랜치 이름을 단 ref 는 base 가 아니어도
            # 자동 삭제 대상에서 뺀다 (protectedBranches 명시 + 이름 폴백).
            item["verdict"] = "keep"
            item["reason"] = "protected_name"
        if name in open_prs:
            item["open_pr"] = open_prs[name]
            if item["verdict"] == "delete":
                # 열린 PR 의 head 는 병합이 증명돼도 지우지 않는다: PR 이 먼저 닫혀야 한다.
                item["verdict"] = "keep"
                item["reason"] = "open_pr"
        report.append(item)
    return sorted(report, key=lambda item: item["branch"])


def _detail(item: dict) -> str:
    verdict = item["verdict"]
    if verdict == "delete":
        if item["reason"] == "merged":
            return "MERGED — 삭제"
        if item["reason"] == "tree_merged":
            return "MERGED(squash — 병합 시뮬레이션 tree 가 base 와 동일) — 삭제"
        return "MERGED(patch 동일 + tree 동일) — 삭제"
    if verdict == "archive":
        return "계보 다름 — 태그로 아카이브 (커밋 %d, 병합 대상 아님)" % item["commits_ahead"]
    if verdict == "archive_review":
        return "아카이브 검토 — 자동커밋 누적 의심 (커밋 %d / 변경 파일 %d = 파일당 %.0f커밋, 삭제 대상 아님)" % (
            item["commits_ahead"],
            item["files_changed"],
            item["commits_ahead"] / max(item["files_changed"], 1),
        )
    if verdict == "unknown":
        if item["reason"] == "tree_unverified":
            return "판정 불가 — patch-id 미병합 0개지만 merge-tree 검사 실패(충돌/구버전 git), 병합 단정 금지 — 손대지 않는다"
        return "판정 불가 (%s) — 손대지 않는다" % item["reason"]
    if item["reason"] == "open_pr":
        return "열린 PR #%d head — 유지 (병합 증명돼도 삭제 안 함)" % item["open_pr"]
    if item["reason"] == "default_branch":
        return "레포 기본 브랜치 — 유지 (병합 증명돼도 삭제 안 함)"
    if item["reason"] == "protected_name":
        return "보호 브랜치(base 아닌 통합 브랜치 이름/명시 보호 목록) — 유지, 삭제는 레포 소유자 판단"
    if item["reason"] == "merge_commit_content":
        return "머지 커밋에만 있는 변경 (patch-id 미병합 0개지만 tree 상이, 변경 파일 %d) — 병합 미증명, 유지" % item["files_changed"]
    detail = "커밋 %d / 변경 파일 %d" % (item["commits_ahead"], item["files_changed"])
    if "open_pr" in item:
        detail += " (열린 PR #%d)" % item["open_pr"]
    return detail


def _counts(report: list[dict]) -> dict[str, int]:
    counts = {"delete": 0, "archive": 0, "archive_review": 0, "keep": 0, "unknown": 0}
    for item in report:
        counts[item["verdict"]] = counts.get(item["verdict"], 0) + 1
    return counts


def _summary_line(report: list[dict]) -> str:
    counts = _counts(report)
    return "삭제 대상 %d개, 아카이브 %d개, 아카이브 검토 %d개, 유지 %d개, 판정 불가 %d개" % (
        counts["delete"],
        counts["archive"],
        counts["archive_review"],
        counts["keep"],
        counts["unknown"],
    )


def _render(report: list[dict], remote: str | None, base_ref: str) -> str:
    if not report:
        return "정리할 브랜치가 없다."
    width = max(len(item["branch"]) for item in report)
    lines = ["%-*s  %s" % (width, item["branch"], _detail(item)) for item in report]
    lines.append("")
    lines.append(_summary_line(report))

    archive = [item for item in report if item["verdict"] == "archive"]
    if archive:
        lines.append("")
        if remote:
            lines.append("아카이브는 삭제하지 않는다. 태그를 먼저 밀어 커밋을 보존한 뒤 브랜치를 지운다.")
            # 태그 대상과 lease 기대값은 둘 다 판정 시점 tip(item["sha"])이다. ref
            # 이름을 태그하면 실행 시점의 tip 이 잡혀 판정 안 된 커밋이 보존 대상인
            # 척하게 되고, lease 없는 --delete 는 분류 후 진전된 원격 커밋을 지운다
            # (branch-lifecycle.md §7.1 — lease 없는 삭제 금지, 아카이브도 예외 아님).
            lines.append(
                "태그·lease 의 SHA 는 판정 시점 tip 이다 — 그 뒤 원격이 진전됐다면 태그는 최신 커밋을 보존하지 않으며, lease 가 삭제를 거부한다(fetch 후 재판정)."
            )
            lines.append(
                "각 줄은 태그 생성 && 태그 push && 브랜치 삭제를 && 로 묶은 하나의 명령이다 — 태그가 원격에 올라가야만 삭제가 실행된다. 줄을 쪼개 실행하지 말 것:"
            )
        else:
            # --remote 없음 = 판정도 --apply 도 로컬 refs/heads 만 대상이다.
            # 여기서 origin 을 박은 원격 삭제를 안내하면, 로컬만 정리하려던
            # 사용자가 이 블록을 복사해 실행하는 순간 같은 이름의 *원격*
            # 브랜치가 예고 없이 사라진다. 로컬 모드의 안내는 prune() 과 같은
            # 원자적 로컬 삭제(update-ref -d <ref> <판정SHA>)만 내보내고,
            # 원격 쓰기는 태그 push 까지 포함해 일절 하지 않는다 — 로컬 태그만
            # 으로도 GC 로부터 tip 이 보존되고(아카이브의 목적), 원격을 만지는
            # 결정은 --remote 를 명시한 실행의 몫이다.
            lines.append("아카이브는 삭제하지 않는다. 태그를 먼저 만들어 커밋을 보존한 뒤 브랜치를 지운다.")
            lines.append(
                "로컬 모드(--remote 없음) — 아래는 로컬 브랜치만 지운다. 태그도 로컬에만 만들며 원격에는 아무것도 쓰지 않는다. 원격 정리는 --remote 로 재판정하라."
            )
            lines.append(
                "태그·삭제 기대값의 SHA 는 판정 시점 tip 이다 — 그 뒤 로컬이 진전됐다면 update-ref 가 삭제를 거부한다(재판정 필요)."
            )
            lines.append(
                "각 줄은 태그 생성 && 브랜치 삭제를 && 로 묶은 하나의 명령이다 — 태그가 만들어져야만 삭제가 실행된다. 줄을 쪼개 실행하지 말 것:"
            )
            lines.append(
                "체크아웃된 브랜치에 update-ref -d 를 쓰면 HEAD 가 깨진다 — 그 브랜치는 다른 브랜치로 이동한 뒤 실행할 것."
            )
        for item in archive:
            # 태그 이름 = archive/<전체 브랜치 경로>-<판정 SHA 12자리>. 첫 경로
            # 요소를 버리면 backup/foo 와 legacy/foo 가 같은 archive/foo 로
            # 충돌하고, 이 블록을 순서대로 실행하면 두 번째 태그 생성이 실패한
            # 채 삭제만 성공해 그 tip 이 어디에도 보존되지 않는다. SHA 접미사는
            # 같은 브랜치를 tip 이 진전된 뒤 다시 아카이브할 때의 재충돌까지
            # 막고, 이름 자체가 어느 tip 을 보존했는지 남긴다(§6 의 archive/
            # 네임스페이스는 유지). 명령은 && 로 묶는다 — 태그 보존이 성공해야
            # 만 삭제가 실행된다. 보존 없는 삭제 경로를 만들지 않는다. 동적
            # 값은 전부 셸 인용한다: git 은 브랜치 이름에 ;·$()·백틱을
            # 허용하므로, 인용 없이 보간하면 이 블록을 복사해 실행하는 순간
            # 임의 셸 코드가 된다 (shlex.quote 는 안전한 이름은 그대로 두므로
            # 평범한 이름의 출력은 달라지지 않는다).
            tag = "archive/%s-%s" % (item["branch"], item["sha"][:12])
            if remote:
                lines.append(
                    "  git tag -a %s %s -m '<보존 이유>' && git push %s %s && git push %s %s %s"
                    % (
                        shlex.quote(tag),
                        shlex.quote(item["sha"]),
                        shlex.quote(remote),
                        shlex.quote(tag),
                        shlex.quote(
                            "--force-with-lease=refs/heads/%s:%s" % (item["branch"], item["sha"])
                        ),
                        shlex.quote(remote),
                        shlex.quote(":refs/heads/%s" % item["branch"]),
                    )
                )
            else:
                lines.append(
                    "  git tag -a %s %s -m '<보존 이유>' && git update-ref -d %s %s"
                    % (
                        shlex.quote(tag),
                        shlex.quote(item["sha"]),
                        shlex.quote("refs/heads/%s" % item["branch"]),
                        shlex.quote(item["sha"]),
                    )
                )

    review = [item for item in report if item["verdict"] == "archive_review"]
    if review:
        lines.append("")
        lines.append("아카이브 검토는 사람이 판단한다 (--apply 는 지우지 않는다). 고유 변경만 확인해 옮긴 뒤 태그로 보존하라:")
        for item in review:
            # ref 이름도 셸 메타문자를 담을 수 있다 — 아카이브 안내와 같은 이유로 인용.
            lines.append("  git diff --stat %s" % shlex.quote("%s...%s" % (base_ref, item["ref"])))
    return "\n".join(lines)


def prune(repo: Path, report: list[dict], *, remote: str | None) -> tuple[list[str], list[str]]:
    """Delete only the `delete` verdicts. Returns (deleted, skipped-with-reason).

    Per-item guards and per-item error capture: one unusable ref must not abort
    the run and leave every other merged branch behind.

    Remote deletion is leased to the SHA the verdict was computed from
    (item["sha"], captured by the same for-each-ref the judgment read). The
    tracking ref can be stale — another machine may have pushed since the last
    fetch — and an unleased `push --delete` would remove the *current* remote
    tip, commits this run never examined. With the lease the remote rejects
    the delete when its tip moved ("stale info"); that is reported as a
    refusal to re-judge, never retried with force.

    Local deletion carries the same expected value: `update-ref -d <ref>
    <judged sha>` (branch-lifecycle.md §7.1 — 로컬 tip = 판정 SHA 일 때만).
    Even within this one process another process can advance the branch
    between the listing and the delete, and an unconditional `branch -D`
    would then remove commits this run never judged. Putting the expectation
    inside the delete itself is atomic — a compare-then-delete would leave
    the same window open, just smaller. A moved tip makes git refuse ("but
    expected"), reported as "로컬이 진전됨 — 재판정 필요", never retried.
    One guard `branch -D` had for free must be explicit now: `update-ref -d`
    deletes the checked-out branch without complaint and leaves HEAD dangling
    (probed on git 2.53), so the current branch is skipped, never deleted.
    """
    deleted: list[str] = []
    skipped: list[str] = []
    # classify() 가 이미 protected_name 으로 강등하지만, prune() 은 삭제를
    # 실행하는 마지막 지점이므로 여기서도 같은 목록을 다시 검사한다 —
    # open_pr 이 verdict 강등 + prune 재검사로 이중 가드인 것과 같은 패턴.
    protected_names = _protected_branch_names(repo.resolve().name)
    for item in report:
        if item["verdict"] != "delete":
            continue
        name = item["branch"]
        if not name or name in PROTECTED or (remote and name == remote):
            skipped.append("%s: 보호 대상/빈 이름 — 건너뜀" % (name or "<빈 이름>"))
            continue
        if name in protected_names:
            skipped.append("%s: 보호 브랜치(통합 브랜치 이름/명시 보호 목록) — 삭제 안 함, 건너뜀" % name)
            continue
        if "open_pr" in item:
            skipped.append("%s: 열린 PR #%d head — 건너뜀" % (name, item["open_pr"]))
            continue
        sha = item.get("sha")
        if not sha:
            skipped.append("%s: 판정 시점 SHA 없음 — 판정 근거 없이는 삭제하지 않는다, 건너뜀" % name)
            continue
        try:
            if remote:
                _git(
                    repo,
                    "push",
                    "--force-with-lease=refs/heads/%s:%s" % (name, sha),
                    remote,
                    ":refs/heads/%s" % name,
                )
            else:
                if _git_maybe(repo, "symbolic-ref", "--quiet", "HEAD") == "refs/heads/%s" % name:
                    # update-ref -d 는 branch -D 와 달리 체크아웃된 브랜치도
                    # 지워 HEAD 를 깨뜨린다(실측). 현재 브랜치는 삭제하지 않는다.
                    skipped.append(
                        "%s: 현재 체크아웃된 브랜치 — 삭제하면 HEAD 가 깨진다. 건너뜀, 다른 브랜치로 이동 후 재실행" % name
                    )
                    continue
                # 판정 SHA 를 기대값으로 실은 원자적 삭제(branch-lifecycle.md §7.1).
                # 판정과 삭제 사이에 다른 프로세스가 이 브랜치를 진전시켰으면
                # git 이 거부한다 — 비교-후-삭제는 그 사이 창이 남으므로 안 쓴다.
                _git(repo, "update-ref", "-d", "refs/heads/%s" % name, sha)
            deleted.append(name)
        except (subprocess.CalledProcessError, OSError) as exc:
            stderr = getattr(exc, "stderr", "") or str(exc)
            if remote and "stale info" in stderr:
                skipped.append(
                    "%s: 원격이 진전됨 — 판정 SHA %s 가 더는 원격 tip 이 아니다. 삭제 거부, fetch 후 재판정 필요"
                    % (name, sha[:12])
                )
            elif not remote and "but expected" in stderr:
                skipped.append(
                    "%s: 로컬이 진전됨 — 판정 SHA %s 가 더는 로컬 tip 이 아니다. 삭제 거부, 재판정 필요"
                    % (name, sha[:12])
                )
            else:
                detail = stderr.strip().splitlines()
                skipped.append("%s: 삭제 실패 — %s" % (name, detail[-1] if detail else "원인 불명"))
    return deleted, skipped


def _find_repos(root: Path) -> tuple[list[Path], list[str]]:
    """Git repos directly under ``root``, plus the names skipped.

    One level only: this workspace is flat, and containers of third-party
    clones (hellomarket/) are not workspace repos.
    """
    repos, skipped = [], []
    for child in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        if (child / ".git").exists():
            repos.append(child)
        else:
            skipped.append(child.name)
    return repos, skipped


def _judge_repo(repo: Path, *, base: str | None, remote: str | None) -> dict:
    """Classify one repo, or explain why it was skipped."""
    resolved = {"base": base, "source": "flag", "reason": "--base %s" % base} if base else resolve_base(repo)
    result = {
        "repo": repo.name,
        "path": str(repo),
        "base": resolved["base"],
        "base_source": resolved["source"],
        "base_reason": resolved["reason"],
        "remote": remote,
        "skipped": None,
        "warnings": [],
        "pr_guard_ok": None,
        "default_guard_ok": None,
        "branches": [],
    }
    if not resolved["base"]:
        result["skipped"] = resolved["reason"]
        return result

    base_ref = "%s/%s" % (remote, resolved["base"]) if remote else resolved["base"]
    if not _git_ok(repo, "rev-parse", "--verify", "--quiet", base_ref):
        result["skipped"] = "base ref %s 가 없다 (fetch 안 됨 / 이름 불일치) — 판정 불가" % base_ref
        return result

    open_prs, warning = _open_pr_heads(repo, remote)
    result["pr_guard_ok"] = warning is None
    if warning:
        result["warnings"].append(warning)
    # 보호할 기본 브랜치는 *선택한 remote* 의 HEAD 에서 읽는다. origin/HEAD 를
    # 고정으로 보면 --remote upstream 일 때 upstream 의 default(예: main)가
    # base(예: staging)의 조상이라는 이유로 삭제 대상으로 분류된다. 해석 불가면
    # 어느 브랜치가 default 인지 모르는 상태 — --apply 는 fail-closed 로 차단.
    head_remote = remote or "origin"
    remote_head = _git_maybe(repo, "symbolic-ref", "refs/remotes/%s/HEAD" % head_remote)
    default_branch = None
    if remote_head:
        stripped = remote_head.replace("refs/remotes/%s/" % head_remote, "", 1)
        if stripped and stripped != remote_head:
            default_branch = stripped
    result["default_branch"] = default_branch
    result["default_guard_ok"] = default_branch is not None
    if default_branch is None:
        result["warnings"].append(
            "refs/remotes/%s/HEAD 미해석 — 이 remote 의 기본 브랜치를 알 수 없어 기본 브랜치 보호가 불가하다. "
            "--apply 는 차단된다 (git remote set-head %s --auto 후 재실행)." % (head_remote, head_remote)
        )
    result["branches"] = classify(
        repo,
        base=resolved["base"],
        remote=remote,
        open_prs=open_prs,
        default_branch=default_branch,
    )
    return result


def _render_multi(results: list[dict], skipped_dirs: list[str]) -> str:
    lines = []
    total = {"delete": 0, "archive": 0, "archive_review": 0, "keep": 0, "unknown": 0}
    for result in results:
        header = "=== %s ===" % result["repo"]
        if result["skipped"]:
            lines.append(header)
            lines.append("  건너뜀: %s" % result["skipped"])
            lines.append("")
            continue
        lines.append(
            "%s base=%s (%s), remote=%s" % (header, result["base"], result["base_source"], result["remote"] or "local")
        )
        for warning in result["warnings"]:
            lines.append("  ⚠ %s" % warning)
        if not result["branches"]:
            lines.append("  정리할 브랜치가 없다.")
        else:
            width = max(len(item["branch"]) for item in result["branches"])
            for item in result["branches"]:
                lines.append("  %-*s  %s" % (width, item["branch"], _detail(item)))
        counts = _counts(result["branches"])
        for key in total:
            total[key] += counts.get(key, 0)
        lines.append("  " + _summary_line(result["branches"]))
        lines.append("")

    judged = [r for r in results if not r["skipped"]]
    lines.append("── 워크스페이스 집계 ──")
    lines.append(
        "레포 %d개 판정 / %d개 건너뜀 (git 레포 아님 %d개는 대상 외: %s)"
        % (
            len(judged),
            len(results) - len(judged),
            len(skipped_dirs),
            ", ".join(skipped_dirs) if skipped_dirs else "없음",
        )
    )
    lines.append(
        "삭제 대상 %d개, 아카이브 %d개, 아카이브 검토 %d개, 유지 %d개, 판정 불가 %d개"
        % (total["delete"], total["archive"], total["archive_review"], total["keep"], total["unknown"])
    )
    base_mix: dict[str, int] = {}
    for result in judged:
        base_mix[result["base"]] = base_mix.get(result["base"], 0) + 1
    lines.append("base 분포: %s" % ", ".join("%s %d개" % kv for kv in sorted(base_mix.items())))
    for result in results:
        if result["skipped"]:
            lines.append("건너뜀 %s: %s" % (result["repo"], result["skipped"]))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    _force_utf8_output()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=None)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="judge every git repo directly under this directory (one level)",
    )
    parser.add_argument(
        "--base",
        default=None,
        help="base branch; without it the base is resolved per repo "
        "(lens.config.json baseBranch → upstream → origin/HEAD), never guessed",
    )
    parser.add_argument(
        "--remote",
        help="prune this remote's branches instead of local ones (e.g. origin); "
        "defaults to origin in --repo-root mode",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually delete the merged branches; without it nothing is removed",
    )
    parser.add_argument(
        "--delete-without-pr-check",
        action="store_true",
        help="열린 PR head 보호 검사(gh)를 수행하지 못한 레포에서도 --apply 삭제를 강행한다. "
        "기본은 fail-closed: 검사가 안 된 레포에서는 아무것도 지우지 않는다. "
        "PR 목록을 직접 확인한 뒤에만 쓸 것",
    )
    parser.add_argument("--json", action="store_true", help="emit the report as JSON")
    args = parser.parse_args(argv)

    if args.repo and args.repo_root:
        parser.error("--repo 와 --repo-root 는 함께 쓸 수 없다")
    if args.delete_without_pr_check and not args.apply:
        parser.error("--delete-without-pr-check 는 --apply 와 함께만 의미가 있다")

    if args.repo_root:
        root = args.repo_root
        if not root.is_dir():
            parser.error("--repo-root 경로가 없다: %s" % root)
        remote = args.remote or "origin"
        repos, skipped_dirs = _find_repos(root)
        results = [_judge_repo(repo, base=args.base, remote=remote) for repo in repos]
        if args.json:
            print(json.dumps({"repos": results, "not_git": skipped_dirs}, ensure_ascii=False, indent=2))
        else:
            print(_render_multi(results, skipped_dirs))
        if args.apply:
            lines = []
            blocked = False
            for result in results:
                if result["skipped"]:
                    continue
                if not result["pr_guard_ok"] and not args.delete_without_pr_check:
                    # fail-closed: 열린 PR head 보호를 증명하지 못한 레포에서는 지우지 않는다.
                    blocked = True
                    lines.append(
                        "%s: --apply 차단 (fail-closed) — 열린 PR 보호 검사 불가: %s"
                        % (result["repo"], "; ".join(result["warnings"]) or "원인 불명")
                    )
                    lines.append("  PR 목록을 직접 확인한 뒤에만 --delete-without-pr-check 로 강행하라. 삭제 실행 안 함.")
                    continue
                if not result["default_guard_ok"]:
                    # fail-closed: 기본 브랜치가 무엇인지 모르는 상태로 삭제하지 않는다.
                    blocked = True
                    lines.append(
                        "%s: --apply 차단 (fail-closed) — refs/remotes/%s/HEAD 미해석, 기본 브랜치 보호 불가"
                        % (result["repo"], remote)
                    )
                    lines.append("  git remote set-head %s --auto 로 HEAD 를 설정한 뒤 재실행하라. 삭제 실행 안 함." % remote)
                    continue
                deleted, skipped = prune(Path(result["path"]), result["branches"], remote=remote)
                if deleted or skipped:
                    lines.append("%s: 삭제 %s" % (result["repo"], ", ".join(deleted) if deleted else "없음"))
                    lines.extend("  %s" % note for note in skipped)
            if not args.json:
                print("")
                print("\n".join(lines) if lines else "삭제 완료: 없음")
            if blocked:
                return 1
        return 0

    repo = args.repo or Path.cwd()
    result = _judge_repo(repo, base=args.base, remote=args.remote)
    if result["skipped"]:
        print("건너뜀 %s: %s" % (result["repo"], result["skipped"]), file=sys.stderr)
        return 1
    for warning in result["warnings"]:
        print("⚠ %s" % warning, file=sys.stderr)
    report = result["branches"]
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("base=%s (%s), remote=%s" % (result["base"], result["base_source"], args.remote or "local"))
        base_ref = "%s/%s" % (args.remote, result["base"]) if args.remote else result["base"]
        print(_render(report, args.remote, base_ref))

    if args.apply:
        if not result["pr_guard_ok"] and not args.delete_without_pr_check:
            # fail-closed: 열린 PR 의 head 가 병합된 것처럼 보이면 그대로 지워질 수 있다.
            print(
                "--apply 차단 (fail-closed): 열린 PR head 보호 검사를 수행하지 못했다 — 아무것도 삭제하지 않았다.",
                file=sys.stderr,
            )
            print("PR 목록을 직접 확인한 뒤에만 --delete-without-pr-check 로 강행하라.", file=sys.stderr)
            return 1
        if not result["default_guard_ok"]:
            # fail-closed: 기본 브랜치가 무엇인지 모르는 상태로 삭제하지 않는다.
            print(
                "--apply 차단 (fail-closed): refs/remotes/%s/HEAD 를 해석하지 못해 기본 브랜치 보호가 불가하다 — 아무것도 삭제하지 않았다."
                % (args.remote or "origin"),
                file=sys.stderr,
            )
            print("git remote set-head %s --auto 로 HEAD 를 설정한 뒤 재실행하라." % (args.remote or "origin"), file=sys.stderr)
            return 1
        deleted, skipped = prune(repo, report, remote=args.remote)
        if not args.json:
            print("")
            print("삭제 완료: %s" % (", ".join(deleted) if deleted else "없음"))
            for note in skipped:
                print("  %s" % note)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
