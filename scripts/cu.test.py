#!/usr/bin/env python3
"""
Lens /cu — multi-source scanner unit tests (no external deps, assert only).

Focus: the safety invariants from docs/tasks/2026-07-30-cu-multi-source-autoupdate.md
  1. parse_winget_upgrade — the winget table parser trusts only the `Id` column;
     the fixture is a REAL `winget upgrade --include-unknown` capture, not
     hand-typed (hand-typed fixtures pass while real output breaks parsing).
  2. compare_versions — semver vs SHA (or any shape mismatch) must resolve to
     None, never True. This is the root cause of the agentmemory/insane-search
     false positives documented in the plan.
  3. classify_risk / upgrade_targets — three-tier risk (auto/hold/never).
     `/cu all` must never include `never` items (Pre-mortem P1: typing "all"
     is not consent to a data-loss upgrade like PostgreSQL).
  4. dedup_items — cli:claude and npm:@anthropic-ai/claude-code must not both
     appear (same tool, two sources).

Run: python scripts/cu.test.py  → prints results, exit 0 iff all pass.

NOTE: at the time this file was written, scripts/cu.py did not yet implement
these functions (a parallel worker was building them). Failures here are
expected until that work lands — that is the point of writing tests first.
"""

import importlib.util
import pathlib
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = pathlib.Path(__file__).parent
FIXTURE_DIR = SCRIPT_DIR.parent / "tests" / "fixtures"

try:
    spec = importlib.util.spec_from_file_location("cu", SCRIPT_DIR / "cu.py")
    cu = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cu)
except Exception as e:
    print(f"FATAL: failed to import scripts/cu.py: {type(e).__name__}: {e}")
    sys.exit(1)

passed = 0
failed = 0


def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print("  ok - " + name)
    except AssertionError as e:
        failed += 1
        print(f"  FAIL - {name}: {e}")
    except Exception as e:
        failed += 1
        print(f"  FAIL - {name}: {type(e).__name__}: {e}")


print("cu.test.py")

# =========================================================================
# 1. parse_winget_upgrade — real `winget upgrade --include-unknown` capture
# =========================================================================
print("\n[1] parse_winget_upgrade")

WINGET_FIXTURE = (FIXTURE_DIR / "winget-upgrade.txt").read_text(encoding="utf-8")
_winget_items = None
ALPHA_RE = re.compile(r"[A-Za-z]")


def _parsed_winget():
    global _winget_items
    if _winget_items is None:
        _winget_items = cu.parse_winget_upgrade(WINGET_FIXTURE)
    return _winget_items


def _winget_by_id(pkg_id):
    for it in _parsed_winget():
        if it["id"] == pkg_id:
            return it
    return None


def test_count():
    items = _parsed_winget()
    assert len(items) == 19, (
        f"fixture's summary line says '19 upgrades available.', got {len(items)} items"
    )


test("parses exactly 19 items (matches fixture's '19 upgrades available.')", test_count)


def test_git():
    it = _winget_by_id("Git.Git")
    assert it is not None, "Git.Git not found in parsed items"
    assert it["installed"] == "2.54.0", f"Git.Git installed expected '2.54.0', got {it['installed']!r}"
    assert it["latest"] == "2.55.0.3", f"Git.Git latest expected '2.55.0.3', got {it['latest']!r}"


test("Git.Git -> installed=2.54.0 latest=2.55.0.3", test_git)


def test_vcredist():
    it = _winget_by_id("Microsoft.VCRedist.2015+.x64")
    assert it is not None, (
        "Microsoft.VCRedist.2015+.x64 not found — name has spaces/parens/hyphen "
        "('Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.44.35211')"
    )
    assert it["installed"] == "14.44.35211.0", f"VCRedist installed expected '14.44.35211.0', got {it['installed']!r}"
    assert it["latest"] == "14.51.36247.0", f"VCRedist latest expected '14.51.36247.0', got {it['latest']!r}"


test("Microsoft.VCRedist.2015+.x64 (name has spaces/parens/hyphen) parses cleanly", test_vcredist)


def test_notion():
    it = _winget_by_id("Notion.Notion")
    assert it is not None, "Notion.Notion not found — name embeds a version number ('Notion 7.23.0')"
    assert it["installed"] == "7.23.0", f"Notion installed expected '7.23.0', got {it['installed']!r}"
    assert it["latest"] == "7.27.0", f"Notion latest expected '7.27.0', got {it['latest']!r}"


test("Notion.Notion (name embeds version '7.23.0') parses cleanly", test_notion)


def test_wechat():
    it = _winget_by_id("Tencent.WeChat.Universal")
    assert it is not None, "Tencent.WeChat.Universal not found"
    assert it["installed"] == "4.1.11.23", f"WeChat installed expected '4.1.11.23', got {it['installed']!r}"
    assert it["latest"] == "4.1.12.26", f"WeChat latest expected '4.1.12.26', got {it['latest']!r}"


test("Tencent.WeChat.Universal -> installed=4.1.11.23 latest=4.1.12.26", test_wechat)


def test_awscli():
    it = _winget_by_id("Amazon.AWSCLI")
    assert it is not None, "Amazon.AWSCLI not found"
    assert it["installed"] == "2.35.20.0", f"AWSCLI installed expected '2.35.20.0', got {it['installed']!r}"
    assert it["latest"] == "2.36.11", f"AWSCLI latest expected '2.36.11', got {it['latest']!r}"


test("Amazon.AWSCLI -> installed=2.35.20.0 latest=2.36.11", test_awscli)


def test_no_separator_or_summary_leak():
    ids = [it["id"] for it in _parsed_winget()]
    for pid in ids:
        assert "---" not in pid, f"separator line leaked into id column: {pid!r}"
        assert "upgrades" not in pid, f"summary line leaked into id column: {pid!r}"


test("no separator/summary line leaked into the id column", test_no_separator_or_summary_leak)


def test_version_shapes_are_clean():
    for it in _parsed_winget():
        for field in ("installed", "latest"):
            v = it[field]
            assert not ALPHA_RE.search(v), (
                f"{it['id']} {field}={v!r} contains alphabetic characters "
                f"— name text likely bled into the version column (parser split on wrong boundary)"
            )


test(
    "no installed/latest value has alphabetic chars bleeding in from the name column",
    test_version_shapes_are_clean,
)

# =========================================================================
# 2. compare_versions / is_major_jump — semver/SHA shape guard
# =========================================================================
print("\n[2] compare_versions / is_major_jump")


def test_semver_vs_sha_agentmemory():
    r = cu.compare_versions("0.9.28", "8c90741c633c")
    assert r is None, f"semver vs SHA must be None (unknown) — this is the agentmemory false-positive, got {r!r}"


test("compare_versions('0.9.28','8c90741c633c') is None (semver vs SHA)", test_semver_vs_sha_agentmemory)


def test_semver_vs_sha_insane_search():
    r = cu.compare_versions("0.13.0", "687824e6d5f3")
    assert r is None, f"semver vs SHA must be None — this is the insane-search false-positive, got {r!r}"


test("compare_versions('0.13.0','687824e6d5f3') is None (semver vs SHA)", test_semver_vs_sha_insane_search)


def test_equal_versions():
    r = cu.compare_versions("2.11.0", "2.11.0")
    assert r is False, f"identical versions must be False (no update needed), got {r!r}"


test("compare_versions('2.11.0','2.11.0') is False", test_equal_versions)


def test_minor_bump():
    r = cu.compare_versions("0.9.2", "0.13.0")
    assert r is True, f"expected True, got {r!r}"


test("compare_versions('0.9.2','0.13.0') is True", test_minor_bump)


def test_major_jump_railway():
    r = cu.compare_versions("4.65.0", "5.30.1")
    assert r is True, f"compare_versions expected True, got {r!r}"
    mj = cu.is_major_jump("4.65.0", "5.30.1")
    assert mj is True, f"is_major_jump('4.65.0','5.30.1') expected True, got {mj!r}"


test("4.65.0->5.30.1: compare_versions True and is_major_jump True (@railway/cli)", test_major_jump_railway)


def test_major_jump_shopify():
    r = cu.compare_versions("3.94.3", "4.5.2")
    assert r is True, f"compare_versions expected True, got {r!r}"
    mj = cu.is_major_jump("3.94.3", "4.5.2")
    assert mj is True, f"is_major_jump('3.94.3','4.5.2') expected True, got {mj!r}"


test("3.94.3->4.5.2: compare_versions True and is_major_jump True (@shopify/cli)", test_major_jump_shopify)


def test_patch_not_major():
    r = cu.compare_versions("1.1.409", "1.1.411")
    assert r is True, f"compare_versions expected True, got {r!r}"
    mj = cu.is_major_jump("1.1.409", "1.1.411")
    assert mj is False, f"is_major_jump('1.1.409','1.1.411') expected False (patch bump), got {mj!r}"


test("1.1.409->1.1.411: compare_versions True but is_major_jump False (pyright patch)", test_patch_not_major)


def test_sha_vs_sha_diff():
    r = cu.compare_versions("8c90741c633c", "687824e6d5f3")
    assert r is True, f"different SHAs (same shape) must be True, got {r!r}"


test("compare_versions(SHA, different SHA) is True", test_sha_vs_sha_diff)


def test_sha_vs_sha_same():
    r = cu.compare_versions("8c90741c633c", "8c90741c633c")
    assert r is False, f"identical SHAs must be False, got {r!r}"


test("compare_versions(SHA, same SHA) is False", test_sha_vs_sha_same)


def test_latest_none():
    r = cu.compare_versions("1.0.0", None)
    assert r is None, f"latest=None must be None, got {r!r}"


test("compare_versions(installed, None) is None", test_latest_none)


def test_latest_empty():
    r = cu.compare_versions("1.0.0", "")
    assert r is None, f"latest='' must be None, got {r!r}"


test("compare_versions(installed, '') is None", test_latest_empty)


def test_major_jump_parse_failure_conservative():
    mj = cu.is_major_jump("unknown", "2.0.0")
    assert mj is True, f"unparseable version must default is_major_jump=True (conservative), got {mj!r}"


test("is_major_jump('unknown','2.0.0') is True (parse failure -> conservative True)", test_major_jump_parse_failure_conservative)

# =========================================================================
# 3. classify_risk (auto / hold / never) + upgrade_targets
# =========================================================================
print("\n[3] classify_risk / upgrade_targets")


def _risk(source, pkg_id, installed, latest, elevated, user_scope_ids):
    return cu.classify_risk(source, pkg_id, installed, latest, elevated, user_scope_ids)


# -- never: /cu all must never touch these --
def test_never_postgres():
    risk, reason = _risk("winget", "PostgreSQL.PostgreSQL.18", "18.4-1", "18.4-2", True, set())
    assert risk == "never", f"PostgreSQL must be never (data-directory DB), got {risk!r}"
    assert reason, "never items must carry a non-empty hold_reason"


test("winget:PostgreSQL.PostgreSQL.18 -> never (data-directory DB)", test_never_postgres)


def test_never_appinstaller():
    risk, reason = _risk("winget", "Microsoft.AppInstaller", "1.29.279.0", "1.29.280.0", True, set())
    assert risk == "never", f"App Installer (winget itself) must be never, got {risk!r}"


test("winget:Microsoft.AppInstaller -> never (winget upgrading itself)", test_never_appinstaller)


def test_never_pip_all():
    risk, reason = _risk("pip", "pip:__all__", "N/A", "N/A", True, set())
    assert risk == "never", f"pip global aggregate must be never, got {risk!r}"


test("pip:pip:__all__ -> never (system python deps)", test_never_pip_all)


def test_all_mode_never_excluded():
    # needs_update is always populated by cmd_scan, so real items carry it;
    # upgrade_targets skips already-current rows, hence True here.
    items = [
        {"id": "winget:BurntSushi.ripgrep.MSVC", "risk": "auto", "needs_update": True},
        {"id": "winget:OpenJS.NodeJS.LTS", "risk": "hold", "needs_update": True},
        {"id": "winget:PostgreSQL.PostgreSQL.18", "risk": "never", "needs_update": True},
    ]
    targets = cu.upgrade_targets(items, "all")
    ids = {t["id"] for t in targets}
    assert "winget:PostgreSQL.PostgreSQL.18" not in ids, (
        "/cu all MUST NOT include never-risk items "
        "(Pre-mortem P1: typing 'all' is not consent to a data-loss upgrade)"
    )
    assert "winget:BurntSushi.ripgrep.MSVC" in ids, "auto item must be included in mode=all"
    assert "winget:OpenJS.NodeJS.LTS" in ids, "hold item must be included in mode=all"


test("upgrade_targets(mode='all') = auto+hold, never excluded (P1 guard)", test_all_mode_never_excluded)


def test_default_mode_auto_only():
    # needs_update is always populated by cmd_scan, so real items carry it;
    # upgrade_targets skips already-current rows, hence True here.
    items = [
        {"id": "winget:BurntSushi.ripgrep.MSVC", "risk": "auto", "needs_update": True},
        {"id": "winget:OpenJS.NodeJS.LTS", "risk": "hold", "needs_update": True},
        {"id": "winget:PostgreSQL.PostgreSQL.18", "risk": "never", "needs_update": True},
    ]
    targets = cu.upgrade_targets(items, "default")
    ids = {t["id"] for t in targets}
    assert ids == {"winget:BurntSushi.ripgrep.MSVC"}, f"mode=default must be auto-only, got {ids}"


test("upgrade_targets(mode='default') = auto only (no hold, no never)", test_default_mode_auto_only)


# -- hold: not run by default, run only by /cu all --
def test_hold_nodejs():
    risk, _ = _risk("winget", "OpenJS.NodeJS.LTS", "24.15.0", "24.18.0", True, set())
    assert risk == "hold", f"Node.js runtime must be hold, got {risk!r}"


test("winget:OpenJS.NodeJS.LTS -> hold (language runtime)", test_hold_nodejs)


def test_hold_python():
    risk, _ = _risk("winget", "Python.Python.3.13", "3.13.13", "3.13.14", True, set())
    assert risk == "hold", f"Python runtime must be hold, got {risk!r}"


test("winget:Python.Python.3.13 -> hold (language runtime)", test_hold_python)


def test_hold_vcredist():
    risk, _ = _risk("winget", "Microsoft.VCRedist.2015+.x64", "14.44.35211.0", "14.51.36247.0", True, set())
    assert risk == "hold", f"VC++ Redistributable must be hold (system component), got {risk!r}"


test("winget:Microsoft.VCRedist.2015+.x64 -> hold (system component)", test_hold_vcredist)


def test_hold_railway_major():
    risk, _ = _risk("npm", "@railway/cli", "4.65.0", "5.30.1", True, set())
    assert risk == "hold", f"major version jump must be hold, got {risk!r}"


test("npm:@railway/cli 4.65.0->5.30.1 -> hold (major jump)", test_hold_railway_major)


# -- auto: run without asking --
def test_auto_ripgrep():
    risk, _ = _risk("winget", "BurntSushi.ripgrep.MSVC", "15.1.0", "15.2.0", True, set())
    assert risk == "auto", f"expected auto, got {risk!r}"


test("winget:BurntSushi.ripgrep.MSVC -> auto", test_auto_ripgrep)


def test_auto_restic():
    risk, _ = _risk("winget", "restic.restic", "0.18.1", "0.19.1", True, set())
    assert risk == "auto", f"expected auto, got {risk!r}"


test("winget:restic.restic -> auto", test_auto_restic)


def test_auto_awscli():
    risk, _ = _risk("winget", "Amazon.AWSCLI", "2.35.20.0", "2.36.11", True, set())
    assert risk == "auto", f"expected auto, got {risk!r}"


test("winget:Amazon.AWSCLI -> auto", test_auto_awscli)


def test_auto_wrangler():
    risk, _ = _risk("npm", "wrangler", "4.93.0", "4.115.0", True, set())
    assert risk == "auto", f"expected auto (no major jump, not a runtime), got {risk!r}"


test("npm:wrangler 4.93.0->4.115.0 -> auto", test_auto_wrangler)


def test_auto_plugin_lens():
    risk, _ = _risk("plugin", "lens@CreetaCorp", "3.25.0", "3.26.0", True, set())
    assert risk == "auto", f"claude plugins must be auto (git-based, reverts on restart), got {risk!r}"


test("plugin:lens@CreetaCorp -> auto (claude plugins are always auto)", test_auto_plugin_lens)


# -- permission gate (non-elevated + machine-scope package) --
def test_hold_not_elevated_outside_user_scope():
    risk, reason = _risk("winget", "BurntSushi.ripgrep.MSVC", "15.1.0", "15.2.0", False, set())
    assert risk == "hold", f"non-elevated shell + machine-scope pkg must be hold, got {risk!r}"
    assert reason, "must carry a hold_reason"
    reason_l = reason.lower()
    assert ("권한" in reason) or ("admin" in reason_l) or ("elevat" in reason_l), (
        f"hold_reason must explain the permission gate, got {reason!r}"
    )


test(
    "non-elevated + id NOT in user_scope_ids -> hold with a permission-related reason",
    test_hold_not_elevated_outside_user_scope,
)


def test_auto_not_elevated_inside_user_scope():
    risk, _ = _risk("winget", "BurntSushi.ripgrep.MSVC", "15.1.0", "15.2.0", False, {"BurntSushi.ripgrep.MSVC"})
    assert risk == "auto", f"non-elevated but id IS in user_scope_ids must stay auto, got {risk!r}"


test("non-elevated + id IN user_scope_ids -> stays auto", test_auto_not_elevated_inside_user_scope)


def test_elevated_bypasses_permission_hold():
    risk, _ = _risk("winget", "BurntSushi.ripgrep.MSVC", "15.1.0", "15.2.0", True, set())
    assert risk == "auto", f"elevated shell must not be held for permission reasons, got {risk!r}"


test("elevated=True bypasses the permission hold entirely", test_elevated_bypasses_permission_hold)


# -- unparseable version: conservative hold --
def test_unparseable_version_is_hold():
    risk, _ = _risk("winget", "Some.Unknown.Package", "unknown", "2.0.0", True, set())
    assert risk == "hold", f"unparseable version must be hold (conservative default), got {risk!r}"


test("unparseable version ('unknown') -> hold (never default to auto on ambiguity)", test_unparseable_version_is_hold)

# =========================================================================
# 4. dedup_items — SPECIAL_DEDUP (cli:claude vs npm:@anthropic-ai/claude-code)
# =========================================================================
print("\n[4] dedup_items")


def test_dedup_removes_npm_when_cli_present():
    items = [
        {"id": "cli:claude", "name": "Claude Code"},
        {"id": "npm:@anthropic-ai/claude-code", "name": "claude-code (npm)"},
        {"id": "winget:Git.Git", "name": "Git"},
    ]
    result = cu.dedup_items(items)
    ids = [it["id"] for it in result]
    assert "npm:@anthropic-ai/claude-code" not in ids, (
        f"npm:@anthropic-ai/claude-code must be removed when cli:claude is present, got ids={ids}"
    )
    assert "cli:claude" in ids, f"cli:claude itself must survive dedup, got ids={ids}"
    assert len(ids) == len(set(ids)), f"result must not contain duplicate ids: {ids}"


test("cli:claude present -> npm:@anthropic-ai/claude-code removed (SPECIAL_DEDUP)", test_dedup_removes_npm_when_cli_present)


def test_dedup_keeps_npm_when_cli_absent():
    items = [
        {"id": "npm:@anthropic-ai/claude-code", "name": "claude-code (npm)"},
        {"id": "winget:Git.Git", "name": "Git"},
    ]
    result = cu.dedup_items(items)
    ids = [it["id"] for it in result]
    assert "npm:@anthropic-ai/claude-code" in ids, (
        f"without cli:claude present, the npm item must NOT be removed, got ids={ids}"
    )


test("cli:claude absent -> npm:@anthropic-ai/claude-code stays", test_dedup_keeps_npm_when_cli_absent)


def test_dedup_preserves_unrelated_items():
    items = [
        {"id": "cli:claude", "name": "Claude Code"},
        {"id": "npm:@anthropic-ai/claude-code", "name": "claude-code (npm)"},
        {"id": "winget:Git.Git", "name": "Git"},
        {"id": "plugin:lens@CreetaCorp", "name": "lens"},
    ]
    result = cu.dedup_items(items)
    ids = [it["id"] for it in result]
    assert "winget:Git.Git" in ids, f"unrelated item must survive, got ids={ids}"
    assert "plugin:lens@CreetaCorp" in ids, f"unrelated item must survive, got ids={ids}"
    assert len(result) == 3, f"expected exactly 3 items after removing 1 dup, got {len(result)}: {ids}"


test("unrelated items are preserved (no over-removal)", test_dedup_preserves_unrelated_items)


# =========================================================================
# [5] cmd_upgrade refuses `never` items on its own
#
# upgrade_targets() filters never out correctly, but cmd_upgrade is a
# SEPARATE entry point that does not pass through that filter. If the
# refusal lived only in the caller (the agent) or in SKILL.md prose, one
# wrong id would upgrade a database and the migration cannot be undone.
# These assertions prove the boundary is enforced in code, at the last
# point before the package manager actually runs.
# =========================================================================

def test_never_reason_flags_irreversible():
    for item_id, label in [
        ("winget:PostgreSQL.PostgreSQL.18", "PostgreSQL"),
        ("winget:Microsoft.AppInstaller", "winget itself"),
        ("pip:__all__", "pip global"),
        ("winget:Oracle.MySQL", "MySQL"),
        ("winget:MongoDB.Server", "MongoDB"),
        ("winget:Redis.Redis", "Redis"),
    ]:
        assert cu.never_reason(item_id), (
            f"{label} ({item_id}) must be reported as never, got None — "
            "an unguarded id here means an irreversible upgrade can dispatch"
        )


test("never_reason flags every irreversible id", test_never_reason_flags_irreversible)


def test_never_reason_does_not_overblock():
    # An over-broad guard silently blocks legitimate upgrades. Note that
    # 'vcredist' contains 'redis' as a substring — that is exactly the
    # collision token matching has to survive.
    for item_id in [
        "winget:Microsoft.VCRedist.2015+.x64",
        "winget:BurntSushi.ripgrep.MSVC",
        "winget:Git.Git",
        "npm:wrangler",
        "plugin:lens@CreetaCorp",
        "cli:claude",
        "vscode:__all__",
    ]:
        assert cu.never_reason(item_id) is None, (
            f"{item_id} is not a never item but never_reason blocked it"
        )


test("never_reason does not over-block (vcredist vs redis)", test_never_reason_does_not_overblock)


def test_cmd_upgrade_refuses_postgres():
    rc = cu.cmd_upgrade("winget:PostgreSQL.PostgreSQL.18")
    assert rc == 3, (
        f"cmd_upgrade must refuse a never item with exit 3, got {rc}. "
        "Anything else means the PostgreSQL upgrade actually dispatched."
    )


test("cmd_upgrade('winget:PostgreSQL.PostgreSQL.18') -> exit 3, no dispatch", test_cmd_upgrade_refuses_postgres)


def test_cmd_upgrade_refuses_appinstaller():
    rc = cu.cmd_upgrade("winget:Microsoft.AppInstaller")
    assert rc == 3, f"cmd_upgrade must refuse App Installer, got {rc}"


test("cmd_upgrade('winget:Microsoft.AppInstaller') -> exit 3", test_cmd_upgrade_refuses_appinstaller)


def test_cmd_upgrade_refuses_pip():
    rc = cu.cmd_upgrade("pip:__all__")
    assert rc == 3, f"cmd_upgrade must refuse pip globals, got {rc}"


test("cmd_upgrade('pip:__all__') -> exit 3", test_cmd_upgrade_refuses_pip)


def test_guard_matches_classifier():
    # The execution-boundary guard and the scan-time classifier must agree.
    # If they drift, one of them is lying to the user.
    for item_id in [
        "winget:PostgreSQL.PostgreSQL.18",
        "winget:Microsoft.AppInstaller",
        "winget:Microsoft.VCRedist.2015+.x64",
        "winget:BurntSushi.ripgrep.MSVC",
        "winget:Git.Git",
    ]:
        source, _, rest = item_id.partition(":")
        risk, _reason = cu.classify_risk(source, rest, "1.0.0", "1.0.1", True, {rest})
        blocked = cu.never_reason(item_id) is not None
        assert (risk == "never") == blocked, (
            f"{item_id}: classify_risk says {risk!r} but never_reason "
            f"{'blocks' if blocked else 'allows'} it — the two policies drifted"
        )


test("never_reason agrees with classify_risk (no policy drift)", test_guard_matches_classifier)


# =========================================================================
# [6] upgrade_targets excludes already-current items
#
# The scan emits every installed plugin and CLI regardless of freshness.
# Selecting purely on `risk` therefore reinstalls up-to-date plugins every
# time anything unrelated is stale.
# =========================================================================

def test_targets_skip_current_items():
    items = [
        {"id": "plugin:lens@CreetaCorp", "risk": "auto", "needs_update": False},
        {"id": "plugin:agentmemory@agentmemory", "risk": "auto", "needs_update": False},
        {"id": "cli:claude", "risk": "auto", "needs_update": False},
        {"id": "winget:restic.restic", "risk": "auto", "needs_update": True},
    ]
    got = [it["id"] for it in cu.upgrade_targets(items, "default")]
    assert got == ["winget:restic.restic"], (
        f"only the genuinely stale item should run, got {got} — "
        "up-to-date plugins would be reinstalled on every invocation"
    )


test("upgrade_targets skips needs_update=False items", test_targets_skip_current_items)


def test_targets_keep_aggregate_despite_null():
    items = [
        {"id": "vscode:__all__", "risk": "auto", "needs_update": None, "aggregate": True},
        {"id": "winget:Some.Thing", "risk": "auto", "needs_update": None},
    ]
    got = [it["id"] for it in cu.upgrade_targets(items, "default")]
    assert got == ["vscode:__all__"], (
        f"aggregate items run despite needs_update=None; plain unknowns do not. got {got}"
    )


test("upgrade_targets keeps aggregate items, drops plain unknowns", test_targets_keep_aggregate_despite_null)


def test_targets_all_mode_still_filters_current():
    items = [
        {"id": "winget:OpenJS.NodeJS.LTS", "risk": "hold", "needs_update": True},
        {"id": "winget:Python.Python.3.13", "risk": "hold", "needs_update": False},
        {"id": "winget:PostgreSQL.PostgreSQL.18", "risk": "never", "needs_update": True},
    ]
    got = [it["id"] for it in cu.upgrade_targets(items, "all")]
    assert got == ["winget:OpenJS.NodeJS.LTS"], (
        f"/cu all must still skip current items and never items, got {got}"
    )


test("upgrade_targets('all') filters current items and never", test_targets_all_mode_still_filters_current)


# =========================================================================
# [7] winget source failures are reported, not swallowed
#
# winget writes diagnostics to stdout even when it fails. Judging success
# by "was stdout empty" lets that case through, and with no parseable table
# the whole source vanishes — the user sees "winget is up to date".
# =========================================================================

def test_winget_nonzero_with_stdout_is_an_error():
    import unittest.mock as mock
    diagnostic = "Failed when searching source; results will not be included: winget\n"
    with mock.patch.object(cu, "run", return_value=(1, diagnostic, "")), \
         mock.patch.object(cu.platform, "system", return_value="Windows"), \
         mock.patch.object(cu.shutil, "which", return_value="winget"):
        items, err = cu.scan_winget()
    assert err, (
        "winget exiting nonzero with a stdout diagnostic must produce a "
        "source_errors entry, not a silent empty result"
    )
    assert items == [], f"no rows were parseable, so items must be empty; got {items}"


test("scan_winget: nonzero exit + stdout diagnostic -> reported error", test_winget_nonzero_with_stdout_is_an_error)


def test_winget_nonzero_but_parseable_keeps_rows():
    import unittest.mock as mock
    text = WINGET_FIXTURE
    with mock.patch.object(cu, "run", return_value=(1, text, "partial source failure")), \
         mock.patch.object(cu.platform, "system", return_value="Windows"), \
         mock.patch.object(cu.shutil, "which", return_value="winget"):
        items, err = cu.scan_winget()
    assert len(items) == 19, (
        f"rows that did parse must be preserved even on nonzero exit, got {len(items)}"
    )
    assert err is None, f"parseable output should not be reported as a failure, got {err!r}"


test("scan_winget: nonzero exit but parseable table -> rows kept", test_winget_nonzero_but_parseable_keeps_rows)


def test_winget_unparseable_locale_is_an_error():
    # Header detection keys off the English column names. On a non-English
    # locale the table is unreadable, and without this guard the source is
    # reported as "nothing to update" rather than as a failure.
    import unittest.mock as mock
    localized = (
        "이름                    아이디            버전        사용 가능\n"
        "-------------------------------------------------------------\n"
        "Git                     Git.Git             2.54.0      2.55.0.3\n"
    )
    with mock.patch.object(cu, "run", return_value=(0, localized, "")), \
         mock.patch.object(cu.platform, "system", return_value="Windows"), \
         mock.patch.object(cu.shutil, "which", return_value="winget"):
        items, err = cu.scan_winget()
    assert err, (
        "an unreadable (localized) table must surface as a source error, "
        f"not as an empty success; got items={items} err={err!r}"
    )


test("scan_winget: unreadable localized table -> reported error", test_winget_unparseable_locale_is_an_error)


# =========================================================================
# [8] upgrade_targets is fail-CLOSED on an unknown mode
#
# `mode != "default"` would make every typo ("All", "", "alll") include
# hold items — runtimes and system components. Ambiguity must narrow the
# blast radius, not widen it.
# =========================================================================

def test_unknown_mode_excludes_hold():
    items = [
        {"id": "winget:restic.restic", "risk": "auto", "needs_update": True},
        {"id": "winget:OpenJS.NodeJS.LTS", "risk": "hold", "needs_update": True},
    ]
    for mode in ("All", "ALL", "", "alll", "defaul", "true", None):
        got = [it["id"] for it in cu.upgrade_targets(items, mode)]
        assert got == ["winget:restic.restic"], (
            f"mode={mode!r} must not unlock hold items (fail-closed), got {got}"
        )


test("upgrade_targets: unknown mode is fail-closed (no hold)", test_unknown_mode_excludes_hold)


def test_exact_all_unlocks_hold():
    items = [
        {"id": "winget:restic.restic", "risk": "auto", "needs_update": True},
        {"id": "winget:OpenJS.NodeJS.LTS", "risk": "hold", "needs_update": True},
    ]
    got = {it["id"] for it in cu.upgrade_targets(items, "all")}
    assert got == {"winget:restic.restic", "winget:OpenJS.NodeJS.LTS"}, (
        f"exactly 'all' must unlock hold, got {sorted(got)}"
    )


test("upgrade_targets: exactly 'all' unlocks hold", test_exact_all_unlocks_hold)


# =========================================================================
# [9] driver ids reach `never` even as compound words
# =========================================================================

def test_driver_compound_names_are_never():
    for pkg_id in ("Intel.WirelessDriver", "NVIDIA.GeForceDriver",
                   "Realtek.AudioDriver"):
        assert cu.never_reason(f"winget:{pkg_id}"), (
            f"{pkg_id}: driver ids must be never — token-exact matching alone "
            "misses compound names like 'wirelessdriver'"
        )
        risk, _r = cu.classify_risk("winget", pkg_id, "1.0", "1.1", True, {pkg_id})
        assert risk == "never", f"{pkg_id}: classify_risk said {risk}, expected never"


test("driver compound ids -> never (both guard and classifier)", test_driver_compound_names_are_never)


def test_driver_suffix_does_not_overreach():
    # Guard against the suffix rule swallowing unrelated ids.
    for pkg_id in ("winget:Git.Git", "winget:BurntSushi.ripgrep.MSVC",
                   "winget:Microsoft.VCRedist.2015+.x64", "npm:wrangler"):
        assert cu.never_reason(pkg_id) is None, \
            f"{pkg_id} must not be caught by the driver suffix rule"


test("driver suffix rule does not over-match", test_driver_suffix_does_not_overreach)


# =========================================================================
# [10] npm scanner parses the real captured JSON
# =========================================================================

def test_npm_scanner_parses_fixture():
    import unittest.mock as mock
    raw = (FIXTURE_DIR / "npm-outdated.json").read_text(encoding="utf-8")
    with mock.patch.object(cu, "run", return_value=(1, raw, "")), \
         mock.patch.object(cu.shutil, "which", return_value="npm"):
        items, err = cu.scan_npm_global()
    assert err is None, f"npm outdated exits 1 when packages ARE outdated — that is not a failure; got {err!r}"
    by_id = {i["id"]: i for i in items}
    assert len(items) == 6, f"fixture has 6 outdated packages, got {len(items)}: {sorted(by_id)}"
    for pkg in ("npm:wrangler", "npm:pyright", "npm:mcporter", "npm:undici",
                "npm:@railway/cli", "npm:@shopify/cli"):
        assert pkg in by_id, f"{pkg} missing from npm scan: {sorted(by_id)}"
    assert by_id["npm:@railway/cli"]["installed"] == "4.65.0"
    assert by_id["npm:@railway/cli"]["latest"] == "5.30.1"
    assert by_id["npm:wrangler"]["installed"] == "4.93.0"
    assert by_id["npm:wrangler"]["latest"] == "4.115.0"


test("scan_npm_global: real fixture, exit 1 is not a failure", test_npm_scanner_parses_fixture)


# =========================================================================
# [11] CJK display-width correction
#
# winget aligns columns by display width, and a CJK character occupies two
# cells but one string index. Slicing by the header's cell offset therefore
# cuts a Korean row in the wrong place unless the width is converted back.
# This machine's winget output really does contain Korean package names, so
# the path is live, not hypothetical. Fixture rows are captured, not typed.
# =========================================================================

def test_cjk_width_correction():
    lines = (FIXTURE_DIR / "winget-cjk-rows.txt").read_text(
        encoding="utf-8").splitlines()
    header = lines[0]
    cols = cu._winget_header_cols(header)
    assert cols, f"CJK fixture header must be parseable, got {header[:60]!r}"

    rows = [l for l in lines[1:] if l.strip()]
    assert rows, "CJK fixture must contain at least one non-ASCII row"

    for line in rows:
        assert not line.isascii(), f"expected a CJK row, got ASCII: {line[:40]!r}"
        i_id = cu._cell_to_index(line, cols["Id"])
        i_ver = cu._cell_to_index(line, cols["Version"])
        pkg_id = line[i_id:i_ver].strip()
        # Without width correction the slice starts inside the Korean name,
        # so the "id" comes back carrying Hangul instead of a package id.
        assert pkg_id, f"id column came back empty for {line[:40]!r}"
        assert pkg_id.isascii(), (
            f"id column still contains non-ASCII ({pkg_id[:30]!r}) — the "
            "display-width conversion did not shift the offset correctly"
        )
        name = line[:i_id].strip()
        assert not name.isascii(), (
            f"the Korean name should stay in the name column, got {name[:30]!r}"
        )


test("_cell_to_index corrects CJK display width (real captured rows)", test_cjk_width_correction)


def test_cell_to_index_ascii_is_identity():
    line = "Git" + " " * 60 + "Git.Git"
    assert cu._cell_to_index(line, 63) == 63, \
        "ASCII rows must pass through unchanged (no width conversion)"
    assert cu._cell_to_index("short", 999) == len("short"), \
        "a cell beyond the line end must clamp to the line length"


test("_cell_to_index: ASCII identity and clamping", test_cell_to_index_ascii_is_identity)


# =========================================================================
# [12] "nothing to upgrade" is a normal result, not a source failure
#
# winget exits nonzero when there is nothing to do. Measured on winget
# 1.29.280: already-current = 43 ("No available upgrade found"),
# no match = 20 ("No installed package found matching input criteria").
# Reporting those as failures makes a fully up-to-date machine look broken.
# =========================================================================

def test_winget_nothing_to_upgrade_is_success():
    import unittest.mock as mock
    for rc, out in [
        (43, "No available upgrade found.\nNo newer package versions are available from the configured sources.\n"),
        (20, "No installed package found matching input criteria.\n"),
    ]:
        with mock.patch.object(cu, "run", return_value=(rc, out, "")), \
             mock.patch.object(cu.platform, "system", return_value="Windows"), \
             mock.patch.object(cu.shutil, "which", return_value="winget"):
            items, err = cu.scan_winget()
        assert err is None, (
            f"rc={rc} means 'nothing to upgrade', which is normal — "
            f"it must not be reported as a source failure; got {err!r}"
        )
        assert items == [], f"rc={rc} should yield no items, got {items}"


test("scan_winget: nothing-to-upgrade exit codes are not failures", test_winget_nothing_to_upgrade_is_success)


def test_winget_real_failure_still_reported():
    # The nothing-to-do allowance must not swallow genuine failures.
    import unittest.mock as mock
    with mock.patch.object(cu, "run", return_value=(1, "Failed to open source\n", "")), \
         mock.patch.object(cu.platform, "system", return_value="Windows"), \
         mock.patch.object(cu.shutil, "which", return_value="winget"):
        items, err = cu.scan_winget()
    assert err, "an actual failure must still be reported after the nothing-to-do allowance"


test("scan_winget: genuine failure still reported", test_winget_real_failure_still_reported)


# =========================================================================
# [13] a requested snapshot that cannot be written fails the scan
#
# Warning and returning 0 would let unconfirmed upgrades proceed with no
# audit record — exactly when the record matters most.
# =========================================================================

def test_snapshot_failure_is_fatal_when_requested():
    import unittest.mock as mock
    with mock.patch.object(cu.Path, "mkdir", side_effect=OSError("read-only fs")):
        rc = cu.cmd_scan(write_snapshot=True)
    assert rc == 1, (
        f"a failed --snapshot write must fail the scan (exit 1), got {rc} — "
        "otherwise upgrades run with no before/after record"
    )


test("cmd_scan(--snapshot): unwritable snapshot -> exit 1", test_snapshot_failure_is_fatal_when_requested)


def test_scan_without_snapshot_ignores_snapshot_errors():
    import unittest.mock as mock
    with mock.patch.object(cu.Path, "mkdir", side_effect=OSError("read-only fs")):
        rc = cu.cmd_scan(write_snapshot=False)
    assert rc == 0, (
        f"a plain scan writes no snapshot, so it must not be affected; got {rc}"
    )


test("cmd_scan(no flag): unaffected by snapshot path errors", test_scan_without_snapshot_ignores_snapshot_errors)


# =========================================================================
# [14] winget exit codes are HRESULTs, and the shell masks them
#
# Python's subprocess returns the full 32-bit HRESULT; a shell shows only
# the low byte. The same situation therefore appears as 2316632107 or as
# 43. Constants measured in one place and used in the other silently match
# nothing — this was hit for real during verification.
# =========================================================================

def test_nothing_to_do_accepts_both_representations():
    for rc, label in [
        (0x8A15002B, "no available upgrade (full HRESULT)"),
        (0x8A150014, "no installed package (full HRESULT)"),
        (43, "no available upgrade (shell-masked low byte)"),
        (20, "no installed package (shell-masked low byte)"),
    ]:
        assert cu._winget_nothing_to_do(rc), (
            f"{label}: rc={rc} means 'nothing to do' and must be recognised"
        )


test("_winget_nothing_to_do: full HRESULT and masked byte both accepted", test_nothing_to_do_accepts_both_representations)


def test_real_failures_are_not_nothing_to_do():
    # 0x8A15003B (low byte 59) is the transient "Rest API internal error"
    # seen from a failing msstore source — a genuine failure, not a no-op.
    for rc in (1, 2, 0x8A15003B, 59):
        assert not cu._winget_nothing_to_do(rc), (
            f"rc={rc} is a real failure and must not be treated as 'nothing to do'"
        )


test("_winget_nothing_to_do: real failures rejected", test_real_failures_are_not_nothing_to_do)


def test_upgrade_winget_maps_to_exit_contract():
    # The documented contract is 0/1/2/3. Leaking winget's raw HRESULT
    # (43, 59, 2316632107 ...) leaves the caller unable to interpret it.
    import unittest.mock as mock
    with mock.patch.object(cu.subprocess, "call", return_value=0x8A15002B):
        rc = cu._upgrade_winget("restic.restic")
    assert rc == 0, f"'nothing to do' must map to 0 per the contract, got {rc}"

    with mock.patch.object(cu.subprocess, "call", return_value=0x8A15003B) as m:
        rc = cu._upgrade_winget("restic.restic")
    assert rc == 1, f"a persistent failure must map to 1, got {rc}"
    assert m.call_count == 2, (
        f"a transient-looking failure should be retried once, got {m.call_count} call(s)"
    )


test("_upgrade_winget: maps winget HRESULTs onto the 0/1/2/3 contract", test_upgrade_winget_maps_to_exit_contract)


def test_upgrade_winget_no_retry_on_success():
    import unittest.mock as mock
    with mock.patch.object(cu.subprocess, "call", return_value=0) as m:
        rc = cu._upgrade_winget("restic.restic")
    assert rc == 0 and m.call_count == 1, (
        f"success must not retry; rc={rc} calls={m.call_count}"
    )


test("_upgrade_winget: no retry on success", test_upgrade_winget_no_retry_on_success)

# =========================================================================
total = passed + failed
print(f"\n{passed}/{total} passed" + (f", {failed} FAILED" if failed else ""))
sys.exit(1 if failed else 0)
