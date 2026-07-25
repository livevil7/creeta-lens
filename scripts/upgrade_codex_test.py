import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("upgrade-codex.py")
SPEC = importlib.util.spec_from_file_location("upgrade_codex", MODULE_PATH)
upgrade_codex = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(upgrade_codex)


class UpgradeCodexTests(unittest.TestCase):
    def test_parse_codex_cli_path_accepts_toml_literal_string(self):
        value = upgrade_codex.parse_codex_cli_path(
            "CODEX_CLI_PATH = 'C:\\\\Tools\\\\codex.exe'\n"
        )
        self.assertEqual(value, "C:\\\\Tools\\\\codex.exe")

    def test_official_marketplace_requires_git_source(self):
        official = {
            "marketplaceSource": {
                "sourceType": "git",
                "source": "https://github.com/livevil7/creeta-lens.git",
            }
        }
        local = {
            "marketplaceSource": {
                "sourceType": "local",
                "source": "C:/src/creeta-lens",
            }
        }
        self.assertTrue(upgrade_codex.is_official_git_marketplace(official))
        self.assertFalse(upgrade_codex.is_official_git_marketplace(local))

    def test_expected_version_reads_codex_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_dir = root / ".codex-plugin"
            manifest_dir.mkdir()
            (manifest_dir / "plugin.json").write_text(
                json.dumps({"name": "lens", "version": "3.26.0"}),
                encoding="utf-8",
            )
            self.assertEqual(
                upgrade_codex.expected_version({"root": str(root)}),
                "3.26.0",
            )


if __name__ == "__main__":
    unittest.main()
