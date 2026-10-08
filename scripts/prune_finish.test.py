#!/usr/bin/env python3
"""prune_branches.py --finish — the /cd wrap-up against real temp repos.

Pins what snapholo-data showed on 2026-10-08: 21 merged worktree branches left
behind and the main checkout 42 commits behind. One run must

  1. fast-forward the stale local base,
  2. delete merged branches remotely and locally, removing their clean worktrees,
  3. keep a worktree with uncommitted changes, and
  4. keep a never-pushed worktree (another session may have just made it).

Run: python scripts/prune_finish.test.py  → exit 0 iff all pass.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("prune_branches.py")


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def main() -> int:
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

    done = worktree("done")
    dirty = worktree("dirty")
    (dirty / "wip.txt").write_text("uncommitted\n")
    fresh_path = root / "work-fresh"
    git(work, "worktree", "add", "-b", "feat/fresh", str(fresh_path), "origin/main")

    git(work, "fetch", "origin")
    assert git(work, "rev-list", "--count", "main..origin/main") != "0", "setup: main should be behind"

    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(work), "--finish", "--base", "main", "--delete-without-pr-check"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    print(r.stdout)
    print(r.stderr, file=sys.stderr)

    checks = {
        "exit 0": r.returncode == 0,
        "local main fast-forwarded": git(work, "rev-parse", "main") == git(work, "rev-parse", "origin/main"),
        "merged worktree removed": not done.exists(),
        "merged branch deleted locally": not git(work, "branch", "--list", "feat/done"),
        "merged branch deleted on origin": not git(work, "ls-remote", "--heads", "origin", "feat/done"),
        "dirty worktree kept": dirty.exists() and bool(git(work, "branch", "--list", "feat/dirty")),
        "never-pushed worktree kept": fresh_path.exists() and bool(git(work, "branch", "--list", "feat/fresh")),
    }
    failed = [k for k, ok in checks.items() if not ok]
    for k, ok in checks.items():
        print("  %s %s" % ("ok  " if ok else "FAIL", k))
    print("%d passed, %d failed" % (len(checks) - len(failed), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
