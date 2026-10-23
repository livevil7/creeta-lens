#!/usr/bin/env python3
"""prune_branches.py --finish — the /cd wrap-up against real temp repos.

Pins what snapholo-data showed on 2026-10-08: 21 merged worktree branches left
behind and the main checkout 42 commits behind. One run must

  1. fast-forward the stale local base,
  2. delete merged branches remotely and locally, removing their clean worktrees,
  3. keep a worktree with uncommitted changes, and
  4. keep a never-pushed worktree (another session may have just made it).

Then `--finish --json --only` (the /cd batch close): only the listed branches go,
an out-of-scope merged+pushed clean worktree stays, a rejected remote delete is
`failed` (exit 1), and a re-run is idempotent.

Run: python scripts/prune_finish.test.py  → exit 0 iff all pass.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("prune_branches.py")


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def setup():
    root = Path(tempfile.mkdtemp(prefix="lens-finish-"))
    origin, work = root / "origin.git", root / "work"
    git(root, "init", "--bare", "-b", "main", str(origin))
    git(root, "clone", str(origin), str(work))
    git(work, "config", "user.email", "t@example.com")
    git(work, "config", "user.name", "t")
    (work / "a.txt").write_text("a\n")
    git(work, "add", "-A")
    git(work, "commit", "-m", "base")
    git(work, "push", "-u", "origin", "main")

    def worktree(name, push=True, merge=True):
        path = root / ("work-" + name)
        git(work, "worktree", "add", "-b", "feat/" + name, str(path), "origin/main")
        git(path, "config", "user.email", "t@example.com")
        git(path, "config", "user.name", "t")
        (path / (name + ".txt")).write_text(name + "\n")
        git(path, "add", "-A")
        git(path, "commit", "-m", name)
        if push:
            git(path, "push", "-u", "origin", "feat/" + name)
        if merge:
            git(path, "push", "origin", "HEAD:main")  # fast-forward, like the overhaul merge
        return path

    return root, origin, work, worktree


def run(work, *extra):
    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(work), "--finish", "--base", "main", "--delete-without-pr-check", *extra],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    print(r.stdout)
    print(r.stderr, file=sys.stderr)
    return r


def only_checks():
    root, origin, work, worktree = setup()
    done1, done2, other, guarded = (worktree(n) for n in ("done1", "done2", "other", "guarded"))
    # 원격이 feat/guarded 삭제를 거부 → 그 원격 삭제만 failed (부분 실패)
    hook = origin / "hooks" / "pre-receive"
    hook.write_text(
        "#!/bin/sh\nwhile read old new ref; do [ \"$ref\" = refs/heads/feat/guarded ] && exit 1; done\nexit 0\n",
        newline="\n",
    )
    os.chmod(hook, 0o755)
    git(work, "fetch", "origin")
    only = "feat/done1,feat/done2,feat/guarded"
    r = run(work, "--json", "--only", only)
    out = json.loads(r.stdout)
    names = lambda key: [x["name"] for x in out[key]]
    reason = lambda key, n: next((x["reason"] for x in out[key] if x["name"] == n), "")
    checks = {
        "only: json shape": set(out) == {"removed_remote", "removed_local", "removed_worktrees", "skipped", "failed", "base_updated"}
        and all(set(x) == {"name", "reason"} for x in out["skipped"] + out["failed"]),
        "only: partial failure exits 1": r.returncode == 1,
        "only: rejected remote delete in failed": names("failed") == ["feat/guarded"],
        "only: both targets removed remote": {"feat/done1", "feat/done2"} <= set(out["removed_remote"]),
        "only: all targets removed local": sorted(out["removed_local"]) == ["feat/done1", "feat/done2", "feat/guarded"],
        "only: target worktrees removed": not done1.exists() and not done2.exists() and len(out["removed_worktrees"]) == 3,
        "only: base_updated": out["base_updated"] is True,
        "only: out-of-scope worktree kept": other.exists() and bool(git(work, "branch", "--list", "feat/other")),
        "only: out-of-scope remote kept": bool(git(work, "ls-remote", "--heads", "origin", "feat/other")),
        "only: out-of-scope reported": "범위 밖" in reason("skipped", "feat/other"),
    }
    r2 = run(work, "--json", "--only", "feat/done1,feat/done2")
    out2 = json.loads(r2.stdout)
    checks.update({
        "rerun: exit 0": r2.returncode == 0,
        "rerun: nothing removed": not out2["removed_remote"] and not out2["removed_local"] and not out2["removed_worktrees"],
        "rerun: already gone in skipped": {"feat/done1", "feat/done2"} <= {x["name"] for x in out2["skipped"]},
        "rerun: out-of-scope still kept": other.exists() and bool(git(work, "ls-remote", "--heads", "origin", "feat/other")),
    })
    return checks


def main() -> int:
    root, origin, work, worktree = setup()
    done = worktree("done")
    dirty = worktree("dirty")
    (dirty / "wip.txt").write_text("uncommitted\n")
    fresh_path = root / "work-fresh"
    git(work, "worktree", "add", "-b", "feat/fresh", str(fresh_path), "origin/main")

    git(work, "fetch", "origin")
    assert git(work, "rev-list", "--count", "main..origin/main") != "0", "setup: main should be behind"

    r = run(work)

    checks = {
        "exit 0": r.returncode == 0,
        "local main fast-forwarded": git(work, "rev-parse", "main") == git(work, "rev-parse", "origin/main"),
        "merged worktree removed": not done.exists(),
        "merged branch deleted locally": not git(work, "branch", "--list", "feat/done"),
        "merged branch deleted on origin": not git(work, "ls-remote", "--heads", "origin", "feat/done"),
        "dirty worktree kept": dirty.exists() and bool(git(work, "branch", "--list", "feat/dirty")),
        "never-pushed worktree kept": fresh_path.exists() and bool(git(work, "branch", "--list", "feat/fresh")),
    }
    checks.update(only_checks())
    failed = [k for k, ok in checks.items() if not ok]
    for k, ok in checks.items():
        print("  %s %s" % ("ok  " if ok else "FAIL", k))
    print("%d passed, %d failed" % (len(checks) - len(failed), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
