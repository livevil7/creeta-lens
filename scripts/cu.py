#!/usr/bin/env python3
"""
Lens /cu — Claude/CLI/Plugin updater.

Two modes:
  cu.py scan              Emit JSON array describing every installed CLI/plugin
                          we know how to track, with installed/latest versions.
  cu.py upgrade <id>      Run the upgrade for one item by id.

Item shape (scan output):
  {
    "id":        "cli:claude" | "cli:codex" | "cli:gh" |
                 "plugin:<name>@<marketplace>",
    "kind":      "cli" | "plugin",
    "name":      human label,
    "installed": version string,
    "latest":    version string or null (network/parse failure),
    "needs_update": true | false | null,
    "upgrade_cmd": shell hint (always shown to the user),
    "can_auto":  true if this script can run the upgrade itself,
    "note":      optional one-liner shown alongside the item
  }

Exit codes:
  scan:    0 on success, 1 on unrecoverable error
  upgrade: 0 success, 1 failure, 2 unknown id, 3 auto-upgrade not supported
           (user must run the printed command themselves)
"""

import json
import os
import platform
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Force UTF-8 stdout on Windows so Korean labels don't mojibake in bash output.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

HOME = Path.home()
PLUGINS_DIR = HOME / ".claude" / "plugins"


def _resolve(exe):
    """Resolve an executable name to a full path; needed on Windows where
    subprocess.run([\"claude\"]) without shell=True cannot find a .cmd shim."""
    found = shutil.which(exe)
    return found or exe


def run(cmd, **kw):
    if cmd and isinstance(cmd, list):
        cmd = [_resolve(cmd[0])] + cmd[1:]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=120, **kw)
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", "not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"


def github_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "lens-cu"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None


def _strip_v(v):
    if not v:
        return v
    return v.lstrip("v").removeprefix("rust-v")


def github_latest_tag(repo):
    data = github_json(f"https://api.github.com/repos/{repo}/releases/latest")
    if data and isinstance(data, dict):
        return _strip_v(data.get("tag_name"))
    # Some repos (e.g. openai/codex) tag releases without using GitHub "latest"
    tags = github_json(f"https://api.github.com/repos/{repo}/tags?per_page=1")
    if tags and isinstance(tags, list) and tags:
        return _strip_v(tags[0].get("name"))
    return None


# ---------- CLI scanners ----------

def scan_claude():
    rc, out, _ = run(["claude", "--version"])
    if rc != 0 or not out:
        return None
    installed = out.split()[0]
    return {
        "id": "cli:claude",
        "kind": "cli",
        "name": "Claude Code",
        "installed": installed,
        "latest": github_latest_tag("anthropics/claude-code"),
        "upgrade_cmd": "claude update",
        "can_auto": True,
        "note": None,
    }


def scan_codex():
    rc, out, _ = run(["codex", "--version"])
    if rc != 0 or not out:
        return None
    parts = out.split()
    installed = parts[-1] if parts else "?"
    sysname = platform.system()
    if sysname == "Windows":
        cmd = "VSCode 확장 'openai.chatgpt' 업데이트 (코덱스 번들)"
    else:
        cmd = "npm install -g @openai/codex@latest"
    return {
        "id": "cli:codex",
        "kind": "cli",
        "name": "Codex CLI",
        "installed": installed,
        "latest": github_latest_tag("openai/codex"),
        "upgrade_cmd": cmd,
        "can_auto": False,
        "note": "Windows는 VSCode 확장 번들이라 수동 안내",
    }


def scan_gh():
    rc, out, _ = run(["gh", "--version"])
    if rc != 0 or not out:
        return None
    # "gh version 2.92.0 (2026-04-28)"
    first = out.splitlines()[0]
    tokens = first.split()
    installed = tokens[2] if len(tokens) >= 3 else "?"
    sysname = platform.system()
    if sysname == "Windows":
        cmd = "winget upgrade --id GitHub.cli"
    elif sysname == "Darwin":
        cmd = "brew upgrade gh"
    else:
        cmd = "(distro package manager — e.g. apt/dnf/pacman)"
    return {
        "id": "cli:gh",
        "kind": "cli",
        "name": "GitHub CLI (gh)",
        "installed": installed,
        "latest": github_latest_tag("cli/cli"),
        "upgrade_cmd": cmd,
        "can_auto": False,
        "note": None,
    }


# ---------- Plugin scanner ----------

def _marketplace_origin_head(marketplace):
    """Return short SHA of marketplace remote HEAD, or None."""
    mp_root = PLUGINS_DIR / "marketplaces" / marketplace
    if not mp_root.exists():
        return None
    rc, url, _ = run(["git", "-C", str(mp_root), "remote", "get-url", "origin"])
    if rc != 0 or not url:
        return None
    rc, out, _ = run(["git", "ls-remote", url, "HEAD"])
    if rc != 0 or not out:
        return None
    sha = out.split()[0]
    return sha[:12] if sha else None


def _marketplace_latest(name, marketplace):
    """Look up latest version of plugin <name> in marketplace <marketplace>.

    Resolution order:
      1. plugin.version in marketplace.json
      2. plugin.source.ref (github source pinned to a tag)
      3. marketplace remote HEAD short SHA (commit-SHA-as-version marketplaces)
    """
    mp_root = PLUGINS_DIR / "marketplaces" / marketplace
    if not mp_root.exists():
        return None
    candidates = [
        mp_root / ".claude-plugin" / "marketplace.json",
        mp_root / "marketplace.json",
    ]
    for mf in candidates:
        if not mf.exists():
            continue
        try:
            data = json.loads(mf.read_text(encoding="utf-8"))
        except Exception:
            continue
        plugins = data.get("plugins")
        if isinstance(plugins, list):
            for p in plugins:
                if p.get("name") == name:
                    ver = p.get("version")
                    if ver:
                        return _strip_v(ver)
                    src = p.get("source")
                    if isinstance(src, dict):
                        ref = src.get("ref")
                        if ref:
                            return _strip_v(ref)
                    # Plugin exists but has no explicit version (local-path source).
                    # Fall through to the marketplace's own HEAD SHA.
                    break
        if isinstance(plugins, dict):
            entry = plugins.get(name)
            if entry:
                ver = entry.get("version") or entry.get("ref")
                if ver:
                    return _strip_v(ver)
    return _marketplace_origin_head(marketplace)


def scan_plugins():
    reg = PLUGINS_DIR / "installed_plugins.json"
    if not reg.exists():
        return []
    try:
        data = json.loads(reg.read_text(encoding="utf-8"))
    except Exception:
        return []
    out = []
    for full_name, entries in (data.get("plugins") or {}).items():
        if not entries:
            continue
        entry = entries[0]
        if "@" in full_name:
            name, marketplace = full_name.split("@", 1)
        else:
            name, marketplace = full_name, ""
        installed = entry.get("version") or "?"
        latest = _marketplace_latest(name, marketplace) if marketplace else None
        # claude-plugins-official uses git SHAs; truncate for display parity
        if installed and len(installed) > 12 and all(c in "0123456789abcdef" for c in installed):
            installed = installed[:12]
        if latest and len(latest) > 12 and all(c in "0123456789abcdef" for c in latest):
            latest = latest[:12]
        is_lens = (name == "lens")
        out.append({
            "id": f"plugin:{full_name}",
            "kind": "plugin",
            "name": full_name,
            "installed": _strip_v(installed) or installed,
            "latest": latest,
            "upgrade_cmd": (
                f"claude plugin update {full_name}"
                if not is_lens else
                "/lens-upgrade (위임)"
            ),
            "can_auto": True,
            "note": "lens 자체는 /lens-upgrade 스크립트로 위임" if is_lens else None,
        })
    return out


# ---------- Aggregate ----------

def cmd_scan():
    items = []
    for fn in (scan_claude, scan_codex, scan_gh):
        it = fn()
        if it:
            items.append(it)
    items.extend(scan_plugins())
    for it in items:
        i, l = it.get("installed"), it.get("latest")
        if not l:
            it["needs_update"] = None
        elif i and l and _strip_v(i) != _strip_v(l):
            it["needs_update"] = True
        else:
            it["needs_update"] = False
    print(json.dumps(items, indent=2, ensure_ascii=False))
    return 0


# ---------- Upgrade dispatch ----------

def _upgrade_claude():
    claude = _resolve("claude")
    print(f">>> {claude} update")
    return subprocess.call([claude, "update"])


def _upgrade_lens():
    # Find the active lens install path from installed_plugins.json
    reg = PLUGINS_DIR / "installed_plugins.json"
    if not reg.exists():
        print("ERR: installed_plugins.json missing", file=sys.stderr)
        return 1
    data = json.loads(reg.read_text(encoding="utf-8"))
    entries = (data.get("plugins") or {}).get("lens@CreetaCorp") or []
    if not entries:
        print("ERR: lens@CreetaCorp not installed", file=sys.stderr)
        return 1
    install_path = Path(entries[0].get("installPath", ""))
    script = install_path / "scripts" / "upgrade.sh"
    if not script.exists():
        # fall back to repo-local copy (dev mode)
        repo_script = Path(__file__).resolve().parent / "upgrade.sh"
        if repo_script.exists():
            script = repo_script
        else:
            print(f"ERR: upgrade.sh not found at {script}", file=sys.stderr)
            return 1
    print(f">>> bash {script} --yes")
    return subprocess.call(["bash", str(script), "--yes"])


def _upgrade_plugin_generic(full_name):
    claude = _resolve("claude")
    print(f">>> {claude} plugin update {full_name}")
    return subprocess.call([claude, "plugin", "update", full_name])


def cmd_upgrade(item_id):
    if item_id == "cli:claude":
        return _upgrade_claude()
    if item_id in ("cli:codex", "cli:gh"):
        # not auto — show command and exit 3 so caller knows
        items = []
        for fn in (scan_codex, scan_gh):
            it = fn()
            if it:
                items.append(it)
        match = next((x for x in items if x["id"] == item_id), None)
        if match:
            print(f"수동 업데이트 필요: {match['name']}")
            print(f"  $ {match['upgrade_cmd']}")
        return 3
    if item_id.startswith("plugin:"):
        full_name = item_id[len("plugin:"):]
        if full_name == "lens@CreetaCorp":
            return _upgrade_lens()
        return _upgrade_plugin_generic(full_name)
    print(f"ERR: unknown id {item_id}", file=sys.stderr)
    return 2


# ---------- Entry ----------

def main():
    if len(sys.argv) < 2:
        print("usage: cu.py scan | cu.py upgrade <id>", file=sys.stderr)
        return 1
    mode = sys.argv[1]
    if mode == "scan":
        return cmd_scan()
    if mode == "upgrade":
        if len(sys.argv) < 3:
            print("usage: cu.py upgrade <id>", file=sys.stderr)
            return 1
        return cmd_upgrade(sys.argv[2])
    print(f"unknown mode: {mode}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
