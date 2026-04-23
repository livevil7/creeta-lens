#!/usr/bin/env python3
"""
Lens Upgrade — One-stop safe upgrade for the Lens Claude Code plugin.

Handles every quirk that trips up plain `git pull + claude plugin install`:
  - Marketplace git repo with local changes (stashes instead of reset --hard)
  - Stale installed_plugins.json with multi-scope duplicates
  - Orphan cache directories from old versions
  - Installer that silently keeps both old and new versions

Usage:
  python upgrade.py                  # upgrade to latest
  python upgrade.py --version v2.0.0 # pin a specific version
  python upgrade.py --dry-run        # show what would happen
  python upgrade.py --yes            # skip all confirmations
  python upgrade.py --verbose        # extra diagnostics

Exit codes:
  0 = success / already up to date
  1 = generic failure
  2 = user aborted
  3 = rollback performed (state restored from backup)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Force UTF-8 output so box-drawing characters work on Windows cp949 consoles.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PLUGIN_NAME = "lens"
MARKETPLACE = "CreetaCorp"
PLUGIN_REF = f"{PLUGIN_NAME}@{MARKETPLACE}"
REPO_URL = "https://github.com/livevil7/creeta-lens.git"

HOME = Path(os.path.expanduser("~"))
PLUGINS_ROOT = HOME / ".claude" / "plugins"
MARKETPLACE_DIR = PLUGINS_ROOT / "marketplaces" / MARKETPLACE
CACHE_DIR = PLUGINS_ROOT / "cache" / MARKETPLACE / PLUGIN_NAME
INSTALLED_JSON = PLUGINS_ROOT / "installed_plugins.json"


# ─────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────


class UI:
    """Minimal ANSI colorizer with no dependencies."""

    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"

    @classmethod
    def color(cls, code: str, text: str) -> str:
        if not sys.stdout.isatty():
            return text
        return f"{code}{text}{cls.RESET}"

    @classmethod
    def bold(cls, text: str) -> str:
        return cls.color(cls.BOLD, text)

    @classmethod
    def ok(cls, text: str) -> str:
        return cls.color(cls.GREEN, text)

    @classmethod
    def warn(cls, text: str) -> str:
        return cls.color(cls.YELLOW, text)

    @classmethod
    def err(cls, text: str) -> str:
        return cls.color(cls.RED, text)

    @classmethod
    def info(cls, text: str) -> str:
        return cls.color(cls.CYAN, text)

    @classmethod
    def dim(cls, text: str) -> str:
        return cls.color(cls.DIM, text)


def log_phase(num: int, total: int, title: str) -> None:
    bar = "━" * 60
    print()
    print(UI.bold(f"━━ Phase {num}/{total}: {title} {bar[len(title) + 12:]}"))


def log_step(msg: str) -> None:
    print(f"  {UI.dim('→')} {msg}")


def log_ok(msg: str) -> None:
    print(f"  {UI.ok('✓')} {msg}")


def log_warn(msg: str) -> None:
    print(f"  {UI.warn('!')} {msg}")


def log_err(msg: str) -> None:
    print(f"  {UI.err('✗')} {msg}")


def fatal(msg: str, code: int = 1) -> None:
    print()
    print(UI.err(f"ERROR: {msg}"))
    sys.exit(code)


# ─────────────────────────────────────────────────────────────
# Subprocess
# ─────────────────────────────────────────────────────────────


def run(
    cmd: list[str],
    cwd: Path | None = None,
    check: bool = True,
    capture: bool = True,
) -> subprocess.CompletedProcess:
    # Resolve the first token to an absolute path so Windows `.cmd`/`.bat`
    # wrappers (claude, npm, ...) work without shell=True.
    resolved = shutil.which(cmd[0])
    argv = [resolved, *cmd[1:]] if resolved else cmd
    try:
        result = subprocess.run(
            argv,
            cwd=str(cwd) if cwd else None,
            capture_output=capture,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        fatal(f"Command not found: {cmd[0]} ({exc})")
        raise  # unreachable
    if check and result.returncode != 0:
        err_out = (result.stderr or result.stdout or "").strip()
        fatal(f"Command failed ({' '.join(cmd)}):\n{err_out}")
    return result


def force_rmtree(path: Path) -> None:
    """rmtree that handles Windows read-only files (e.g. .git/objects/pack/*)."""

    def onerror(func, target, exc_info):
        try:
            os.chmod(target, stat.S_IWRITE)
        except OSError:
            pass
        try:
            func(target)
        except OSError:
            # Last resort: retry once after a short delay (for locked files).
            time.sleep(0.2)
            try:
                func(target)
            except OSError:
                raise

    # Python 3.12+ prefers `onexc`; fall back to `onerror` for older versions.
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=lambda f, p, e: onerror(f, p, e))
    else:
        shutil.rmtree(path, onerror=onerror)


# ─────────────────────────────────────────────────────────────
# Context object
# ─────────────────────────────────────────────────────────────


@dataclass
class Context:
    dry_run: bool
    yes: bool
    verbose: bool
    target_ref: str | None  # e.g. "v2.0.0" or None for latest
    backup_path: Path | None = None
    marketplace_stashed: bool = False
    target_version: str | None = None  # resolved version string "3.1.0"
    installed_versions: dict[str, list[dict]] = field(default_factory=dict)

    def confirm(self, question: str) -> bool:
        if self.yes:
            return True
        print()
        print(UI.warn(f"? {question} [y/N] "), end="", flush=True)
        try:
            answer = input().strip().lower()
        except EOFError:
            answer = ""
        return answer in ("y", "yes")


# ─────────────────────────────────────────────────────────────
# Phase 0: Preflight
# ─────────────────────────────────────────────────────────────


def phase0_preflight(ctx: Context) -> None:
    log_phase(0, 5, "Preflight")

    log_step("Checking required tools")
    for tool in ("git", "claude"):
        if shutil.which(tool) is None:
            fatal(f"Required tool not found in PATH: {tool}")
    log_ok("git, claude available")

    log_step(f"Ensuring plugins root exists: {PLUGINS_ROOT}")
    if not PLUGINS_ROOT.exists():
        fatal(f"Claude Code plugins directory missing: {PLUGINS_ROOT}")
    log_ok("plugins directory found")

    log_step("Backing up installed_plugins.json")
    if INSTALLED_JSON.exists():
        stamp = time.strftime("%Y%m%d-%H%M%S")
        backup = INSTALLED_JSON.with_suffix(f".json.bak-{stamp}")
        if ctx.dry_run:
            log_ok(f"(dry-run) would back up → {backup.name}")
        else:
            shutil.copy2(INSTALLED_JSON, backup)
            ctx.backup_path = backup
            log_ok(f"backup → {backup.name}")
    else:
        log_warn("installed_plugins.json does not exist yet (fresh install?)")

    log_step("Scanning current install state")
    state = read_installed(ctx)
    ctx.installed_versions = state
    entries = state.get(PLUGIN_REF, [])
    if not entries:
        log_warn(f"{PLUGIN_REF} not currently installed")
    else:
        for e in entries:
            scope = e.get("scope", "?")
            version = e.get("version", "?")
            project = e.get("projectPath", "")
            suffix = f"  {UI.dim(project)}" if project else ""
            log_ok(f"found: scope={scope}  version={version}{suffix}")


def read_installed(ctx: Context) -> dict[str, list[dict]]:
    if not INSTALLED_JSON.exists():
        return {}
    try:
        data = json.loads(INSTALLED_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fatal(f"installed_plugins.json is corrupt: {exc}")
    plugins = data.get("plugins", {})
    if ctx.verbose:
        log_step(f"installed_plugins.json has {len(plugins)} entries")
    return plugins


# ─────────────────────────────────────────────────────────────
# Phase 1: Marketplace safe update
# ─────────────────────────────────────────────────────────────


def phase1_marketplace(ctx: Context) -> None:
    log_phase(1, 5, "Marketplace sync (safe)")

    if not MARKETPLACE_DIR.exists():
        log_step(f"Cloning {REPO_URL}")
        if not ctx.dry_run:
            MARKETPLACE_DIR.parent.mkdir(parents=True, exist_ok=True)
            run(["git", "clone", REPO_URL, str(MARKETPLACE_DIR)])
        log_ok("cloned")
        return

    log_step("Verifying remote URL")
    remote = run(["git", "remote", "get-url", "origin"], cwd=MARKETPLACE_DIR, check=False)
    current_url = (remote.stdout or "").strip()
    if current_url and current_url != REPO_URL:
        log_warn(f"remote differs: {current_url} → {REPO_URL}")
        if not ctx.dry_run:
            run(["git", "remote", "set-url", "origin", REPO_URL], cwd=MARKETPLACE_DIR)
        log_ok("remote url corrected")
    else:
        log_ok(f"remote = {current_url or REPO_URL}")

    log_step("Checking for local changes")
    status = run(["git", "status", "--porcelain"], cwd=MARKETPLACE_DIR)
    has_changes = bool(status.stdout.strip())
    if has_changes:
        log_warn("local modifications detected in marketplace repo")
        if ctx.verbose:
            for line in status.stdout.splitlines()[:10]:
                print(f"    {UI.dim(line)}")
        if not ctx.dry_run:
            stamp = time.strftime("%Y%m%d-%H%M%S")
            stash_msg = f"lens-upgrade-backup-{stamp}"
            stash_res = run(
                ["git", "stash", "push", "-u", "-m", stash_msg],
                cwd=MARKETPLACE_DIR,
                check=False,
            )
            if stash_res.returncode == 0:
                ctx.marketplace_stashed = True
                log_ok(f"stashed as '{stash_msg}' (recoverable via `git stash list`)")
            else:
                log_err("stash failed — aborting to avoid data loss")
                fatal("Cannot safely update marketplace with dirty state")
    else:
        log_ok("working tree clean")

    log_step("Fetching origin")
    if not ctx.dry_run:
        run(["git", "fetch", "origin"], cwd=MARKETPLACE_DIR)
    log_ok("fetched")

    log_step("Fast-forward pull")
    if not ctx.dry_run:
        pull = run(
            ["git", "pull", "--ff-only", "origin", "master"],
            cwd=MARKETPLACE_DIR,
            check=False,
        )
        if pull.returncode != 0:
            log_err("fast-forward failed (divergent history)")
            log_warn(pull.stderr.strip() or pull.stdout.strip())
            fatal("Cannot ff-merge; resolve marketplace history manually")
    log_ok("marketplace up to date")


# ─────────────────────────────────────────────────────────────
# Phase 2: Version detection
# ─────────────────────────────────────────────────────────────


def phase2_detect_version(ctx: Context) -> None:
    log_phase(2, 5, "Version detection")

    marketplace_json = MARKETPLACE_DIR / ".claude-plugin" / "marketplace.json"
    if not marketplace_json.exists():
        fatal(f"marketplace.json not found at {marketplace_json}")

    try:
        data = json.loads(marketplace_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fatal(f"marketplace.json is corrupt: {exc}")

    target = None
    for plugin in data.get("plugins", []):
        if plugin.get("name") == PLUGIN_NAME:
            target = plugin
            break
    if not target:
        fatal(f"Plugin '{PLUGIN_NAME}' not listed in marketplace.json")

    latest_version = target.get("version", "").lstrip("v")
    log_ok(f"marketplace latest: v{latest_version}")

    if ctx.target_ref:
        desired = ctx.target_ref.lstrip("v")
        log_warn(f"pinned install requested: v{desired}")
        log_warn("(marketplace currently only tracks latest — pin ignored)")
        ctx.target_version = latest_version
    else:
        ctx.target_version = latest_version

    current_entries = ctx.installed_versions.get(PLUGIN_REF, [])
    current_versions = {e.get("version") for e in current_entries if e.get("version")}
    if len(current_versions) == 1 and ctx.target_version in current_versions and len(current_entries) == 1:
        log_ok(f"already at v{ctx.target_version} with a single clean entry")
        print()
        print(UI.ok("Nothing to do."))
        sys.exit(0)
    if ctx.target_version in current_versions:
        log_warn(
            f"v{ctx.target_version} is installed but registry has "
            f"{len(current_entries)} entries — will repair"
        )
    else:
        installed_list = ", ".join(sorted(current_versions)) or "(none)"
        log_ok(f"upgrading: {installed_list} → v{ctx.target_version}")


# ─────────────────────────────────────────────────────────────
# Phase 3: Cache cleanup
# ─────────────────────────────────────────────────────────────


def phase3_cache_cleanup(ctx: Context) -> None:
    log_phase(3, 5, "Cache cleanup")

    if not CACHE_DIR.exists():
        log_ok("cache directory empty — nothing to clean")
        return

    entries = sorted(p for p in CACHE_DIR.iterdir() if p.is_dir())
    if not entries:
        log_ok("no version folders in cache")
        return

    log_step(f"Found {len(entries)} cached version(s): {', '.join(p.name for p in entries)}")

    # Remove all cache folders — installer will repopulate only the target.
    # This prevents the "orphan 1.9.0 keeps coming back" problem.
    for entry in entries:
        if ctx.dry_run:
            log_step(f"would remove {entry.name}/")
            continue
        try:
            force_rmtree(entry)
            log_ok(f"removed {entry.name}/")
        except OSError as exc:
            log_err(f"failed to remove {entry.name}: {exc}")
            log_warn("continuing — installer may overwrite anyway")


# ─────────────────────────────────────────────────────────────
# Phase 4: Registry reconciliation + install
# ─────────────────────────────────────────────────────────────


def phase4_install(ctx: Context) -> None:
    log_phase(4, 5, "Registry reconcile + install")

    entries = list(ctx.installed_versions.get(PLUGIN_REF, []))
    if entries:
        scopes = [e.get("scope", "?") for e in entries]
        log_step(f"current registry entries: {', '.join(scopes)}")

        # Detect multi-scope conflict.
        unique_scopes = {e.get("scope") for e in entries}
        has_conflict = len(entries) > 1 or len(unique_scopes) > 1
        if has_conflict:
            log_warn(f"multi-entry conflict detected ({len(entries)} entries)")
            for e in entries:
                scope = e.get("scope", "?")
                version = e.get("version", "?")
                project = e.get("projectPath", "")
                suffix = f" @ {project}" if project else ""
                print(f"    - scope={scope}  v{version}{suffix}")

            if ctx.confirm(
                f"Remove all {PLUGIN_REF} entries and reinstall cleanly to user scope?"
            ):
                if not ctx.dry_run:
                    clear_plugin_from_registry()
                log_ok("cleared conflicting registry entries")
            else:
                fatal("User aborted", code=2)
        else:
            # Single entry already exists; clearing prevents "v1.9.0 lingers" bug.
            if not ctx.dry_run:
                clear_plugin_from_registry()
            log_ok("cleared single stale entry for reinstall")

    log_step(f"Running: claude plugin install {PLUGIN_REF}")
    if not ctx.dry_run:
        result = run(["claude", "plugin", "install", PLUGIN_REF], check=False)
        if result.returncode != 0:
            log_err("install command failed")
            log_err((result.stderr or result.stdout or "").strip())
            rollback(ctx)
            fatal("Install failed — rolled back", code=3)
        output = (result.stdout + result.stderr).strip()
        if output:
            for line in output.splitlines():
                print(f"    {UI.dim(line)}")
    log_ok("install command completed")


def clear_plugin_from_registry() -> None:
    if not INSTALLED_JSON.exists():
        return
    data = json.loads(INSTALLED_JSON.read_text(encoding="utf-8"))
    plugins = data.get("plugins", {})
    if PLUGIN_REF in plugins:
        del plugins[PLUGIN_REF]
        INSTALLED_JSON.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


# ─────────────────────────────────────────────────────────────
# Phase 5: Verify
# ─────────────────────────────────────────────────────────────


def phase5_verify(ctx: Context) -> None:
    log_phase(5, 5, "Verify")

    log_step("Re-reading installed_plugins.json")
    state = read_installed(ctx)
    entries = state.get(PLUGIN_REF, [])

    if len(entries) != 1:
        log_err(f"expected 1 entry, found {len(entries)}")
        for e in entries:
            print(f"    - {e}")
        rollback(ctx)
        fatal("Registry still has duplicates after install — rolled back", code=3)
    log_ok("registry has exactly 1 entry")

    entry = entries[0]
    installed_version = entry.get("version", "")
    if ctx.target_version and installed_version != ctx.target_version:
        log_err(
            f"version mismatch: expected v{ctx.target_version}, got v{installed_version}"
        )
        rollback(ctx)
        fatal("Version mismatch — rolled back", code=3)
    log_ok(f"installed version = v{installed_version}")

    log_step("Running: claude plugin list")
    if ctx.dry_run:
        log_ok("(dry-run — skipped)")
        return
    result = run(["claude", "plugin", "list"], check=False)
    output = result.stdout + result.stderr
    matches = re.findall(r"lens@CreetaCorp.*?Version:\s*(\S+).*?Scope:\s*(\S+)", output, re.DOTALL)
    if len(matches) != 1:
        log_warn(f"plugin list shows {len(matches)} lens entries")
        log_warn("registry is correct but CLI output disagrees — restart Claude Code to refresh")
        return
    version, scope = matches[0]
    log_ok(f"plugin list confirms: v{version}  scope={scope}")


# ─────────────────────────────────────────────────────────────
# Rollback
# ─────────────────────────────────────────────────────────────


def rollback(ctx: Context) -> None:
    if ctx.backup_path and ctx.backup_path.exists():
        try:
            shutil.copy2(ctx.backup_path, INSTALLED_JSON)
            log_warn(f"restored installed_plugins.json from {ctx.backup_path.name}")
        except OSError as exc:
            log_err(f"rollback failed: {exc}")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Lens plugin one-stop upgrade")
    parser.add_argument("--version", dest="target_ref", help="Target version tag (e.g. v2.0.0)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without executing")
    parser.add_argument("--yes", "-y", action="store_true", help="Assume yes to prompts")
    parser.add_argument("--verbose", "-v", action="store_true", help="Extra diagnostics")
    args = parser.parse_args()

    ctx = Context(
        dry_run=args.dry_run,
        yes=args.yes,
        verbose=args.verbose,
        target_ref=args.target_ref,
    )

    print(UI.bold("═" * 68))
    print(UI.bold(f"   Lens Upgrade — one-stop   {UI.dim('(dry-run)' if ctx.dry_run else '')}"))
    print(UI.bold("═" * 68))

    try:
        phase0_preflight(ctx)
        phase1_marketplace(ctx)
        phase2_detect_version(ctx)
        phase3_cache_cleanup(ctx)
        phase4_install(ctx)
        phase5_verify(ctx)
    except KeyboardInterrupt:
        print()
        rollback(ctx)
        fatal("Interrupted by user", code=2)

    print()
    print(UI.ok("═" * 68))
    print(UI.ok(f"   ✓ Lens upgraded to v{ctx.target_version}"))
    print(UI.ok("═" * 68))
    if ctx.marketplace_stashed:
        print()
        print(UI.warn("Note: local marketplace changes were stashed."))
        print(UI.warn(f"      Recover with: git -C {MARKETPLACE_DIR} stash list"))
    print()
    print(UI.dim("Restart Claude Code to load the new plugin version."))


if __name__ == "__main__":
    main()
