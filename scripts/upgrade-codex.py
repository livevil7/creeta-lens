#!/usr/bin/env python3
"""Safely refresh Lens from the official Codex Git marketplace.

This updater intentionally uses only public Codex plugin commands. It never
replaces the Git marketplace with a local path and never touches ~/.claude.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PLUGIN_ID = "lens@CreetaCorp"
MARKETPLACE = "CreetaCorp"
OFFICIAL_REPO = "livevil7/creeta-lens"
OFFICIAL_URL_FRAGMENT = "github.com/livevil7/creeta-lens"


def configure_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()


def parse_codex_cli_path(config_text: str) -> str | None:
    match = re.search(r"CODEX_CLI_PATH\s*=\s*['\"]([^'\"]+)['\"]", config_text)
    return match.group(1) if match else None


def resolve_codex_cli() -> Path:
    env_path = os.environ.get("CODEX_CLI_PATH")
    if env_path and Path(env_path).is_file():
        return Path(env_path)

    config_path = codex_home() / "config.toml"
    try:
        configured = parse_codex_cli_path(config_path.read_text(encoding="utf-8"))
        if configured and Path(configured).is_file():
            return Path(configured)
    except OSError:
        pass

    found = shutil.which("codex")
    if found:
        return Path(found)
    raise RuntimeError(
        "Codex CLI not found. Set CODEX_CLI_PATH or run this inside Codex Desktop/CLI."
    )


def run(codex: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [str(codex), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "unknown error").strip()
        raise RuntimeError(f"codex {' '.join(args)} failed: {detail}")
    return proc


def json_output(proc: subprocess.CompletedProcess[str], label: str) -> dict[str, Any]:
    try:
        value = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{label} returned invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} returned an unexpected JSON shape")
    return value


def find_marketplace(payload: dict[str, Any]) -> dict[str, Any] | None:
    for item in payload.get("marketplaces", []):
        if isinstance(item, dict) and item.get("name") == MARKETPLACE:
            return item
    return None


def find_plugin(payload: dict[str, Any]) -> dict[str, Any] | None:
    for item in payload.get("installed", []):
        if isinstance(item, dict) and item.get("pluginId") == PLUGIN_ID:
            return item
    return None


def is_official_git_marketplace(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    source = item.get("marketplaceSource") or {}
    source_type = str(source.get("sourceType") or "").lower()
    source_value = str(source.get("source") or "").replace("\\", "/").lower()
    return source_type == "git" and (
        OFFICIAL_REPO.lower() in source_value
        or OFFICIAL_URL_FRAGMENT.lower() in source_value
    )


def expected_version(marketplace: dict[str, Any]) -> str | None:
    root = marketplace.get("root")
    if not root:
        return None
    manifest = Path(root) / ".codex-plugin" / "plugin.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        version = data.get("version")
        return str(version) if version else None
    except (OSError, json.JSONDecodeError):
        return None


def write_receipt(before: dict[str, Any] | None, after: dict[str, Any]) -> Path:
    state_dir = codex_home() / "lens"
    state_dir.mkdir(parents=True, exist_ok=True)
    target = state_dir / "upgrade-last.json"
    temp = target.with_name(f"{target.name}.tmp-{os.getpid()}")
    payload = {
        "upgradedAt": datetime.now(timezone.utc).isoformat(),
        "pluginId": PLUGIN_ID,
        "before": {
            "version": before.get("version") if before else None,
            "enabled": before.get("enabled") if before else None,
        },
        "after": {
            "version": after.get("version"),
            "enabled": after.get("enabled"),
            "marketplaceName": after.get("marketplaceName"),
            "marketplaceSource": after.get("marketplaceSource"),
        },
    }
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(target)
    return target


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upgrade Lens through the official Codex Git marketplace")
    parser.add_argument("--dry-run", action="store_true", help="show commands without changing state")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    parser.add_argument("--verbose", action="store_true", help="print resolved paths and JSON details")
    parser.add_argument(
        "--version",
        help="unsupported on Codex; retained only to reject legacy pinned-upgrade requests clearly",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    configure_utf8()
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if args.version:
        print(
            "ERROR: Codex plugin add does not expose a pinned-version flag. "
            "Use the tracked marketplace revision or configure a separate Git marketplace ref.",
            file=sys.stderr,
        )
        return 2

    try:
        codex = resolve_codex_cli()
        marketplaces = json_output(
            run(codex, ["plugin", "marketplace", "list", "--json"]),
            "codex plugin marketplace list",
        )
        marketplace = find_marketplace(marketplaces)
        if not marketplace:
            raise RuntimeError(
                f"{MARKETPLACE} marketplace is not configured. Run: "
                f"codex plugin marketplace add {OFFICIAL_REPO}"
            )
        if not is_official_git_marketplace(marketplace):
            raise RuntimeError(
                f"{MARKETPLACE} is not the official Git marketplace. "
                "Refusing to replace or upgrade a local-path source automatically."
            )

        plugins_before = json_output(
            run(codex, ["plugin", "list", "--json"]),
            "codex plugin list",
        )
        before = find_plugin(plugins_before)

        print("Lens Codex upgrade")
        print(f"  source:   {marketplace['marketplaceSource']['source']}")
        print(f"  current:  {before.get('version') if before else '(not installed)'}")
        print(f"  command:  codex plugin marketplace upgrade {MARKETPLACE}")
        print(f"  command:  codex plugin add {PLUGIN_ID}")
        if args.verbose:
            print(f"  codex:    {codex}")
            print(f"  snapshot: {marketplace.get('root')}")

        if args.dry_run:
            print("Dry run complete; no changes made.")
            return 0

        if not args.yes:
            answer = input("Refresh the official marketplace and install Lens? [y/N] ").strip().lower()
            if answer not in {"y", "yes"}:
                print("Cancelled.")
                return 2

        run(codex, ["plugin", "marketplace", "upgrade", MARKETPLACE, "--json"])
        run(codex, ["plugin", "add", PLUGIN_ID, "--json"])

        marketplaces_after = json_output(
            run(codex, ["plugin", "marketplace", "list", "--json"]),
            "codex plugin marketplace list",
        )
        marketplace_after = find_marketplace(marketplaces_after)
        if not is_official_git_marketplace(marketplace_after):
            raise RuntimeError("post-upgrade marketplace source verification failed")

        plugins_after = json_output(
            run(codex, ["plugin", "list", "--json"]),
            "codex plugin list",
        )
        after = find_plugin(plugins_after)
        if not after:
            raise RuntimeError(f"{PLUGIN_ID} is not installed after refresh")
        if after.get("enabled") is False:
            raise RuntimeError(f"{PLUGIN_ID} is installed but disabled")
        if after.get("marketplaceName") != MARKETPLACE:
            raise RuntimeError("installed plugin points to an unexpected marketplace")

        expected = expected_version(marketplace_after or {})
        actual = str(after.get("version") or "")
        if expected and actual != expected:
            raise RuntimeError(
                f"version verification failed: snapshot={expected}, installed={actual or '(missing)'}"
            )

        receipt = write_receipt(before, after)
        print(f"OK: {PLUGIN_ID} {actual} installed from the official Git marketplace.")
        print(f"Receipt: {receipt}")
        print("Start a new Codex task to load the refreshed skills.")
        return 0
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
