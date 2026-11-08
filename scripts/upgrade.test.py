#!/usr/bin/env python3
"""upgrade.py strip_local_enables — the local-scope duplicate must not come back.

SJ-OMEN 2026-11-08: the upgrade cleared the `local` registry entry, then the next
session in the workspace folder re-created it from `.claude/settings.local.json`
`enabledPlugins["lens@CreetaCorp"]`. The fix removes that line (and only that line).

Run: python scripts/upgrade.test.py  → exit 0 iff all pass.
"""

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("upgrade", Path(__file__).with_name("upgrade.py"))
up = importlib.util.module_from_spec(spec)
sys.modules["upgrade"] = up  # dataclass 가 모듈을 sys.modules 에서 찾는다
spec.loader.exec_module(up)


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def main() -> int:
    root = Path(tempfile.mkdtemp(prefix="lens-upgrade-"))
    only = root / "only" / ".claude" / "settings.local.json"
    mixed = root / "mixed" / ".claude" / "settings.local.json"
    proj = root / "proj" / ".claude" / "settings.json"
    write(only, {"permissions": {"allow": ["Bash(*)"]}, "enabledPlugins": {up.PLUGIN_REF: True}})
    write(mixed, {"enabledPlugins": {up.PLUGIN_REF: True, "other@x": True}})
    write(proj, {"enabledPlugins": {up.PLUGIN_REF: True}})
    entries = [
        {"scope": "user"},
        {"scope": "local", "projectPath": str(root / "only")},
        {"scope": "local", "projectPath": str(root / "mixed")},
        {"scope": "project", "projectPath": str(root / "proj")},
        {"scope": "local", "projectPath": str(root / "missing")},
    ]
    changed = up.strip_local_enables(entries)
    o, m, p = (json.loads(x.read_text(encoding="utf-8")) for x in (only, mixed, proj))
    checks = {
        "local line removed, other keys kept": "enabledPlugins" not in o and o["permissions"] == {"allow": ["Bash(*)"]},
        "other plugins kept": m["enabledPlugins"] == {"other@x": True},
        "project scope untouched": p["enabledPlugins"] == {up.PLUGIN_REF: True},
        "backup written": only.with_name("settings.local.json.bak-lens-upgrade").exists(),
        "missing folder ignored": len(changed) == 2,
        "rerun is a no-op": up.strip_local_enables(entries) == [],
    }
    for k, ok in checks.items():
        print("  %s %s" % ("ok  " if ok else "FAIL", k))
    failed = [k for k, ok in checks.items() if not ok]
    print("%d passed, %d failed" % (len(checks) - len(failed), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
