import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("cu.py")
SPEC = importlib.util.spec_from_file_location("lens_cu", MODULE_PATH)
lens_cu = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(lens_cu)


class CuVersionTests(unittest.TestCase):
    def test_newer_prerelease_is_not_stale_against_older_stable(self):
        self.assertFalse(lens_cu.needs_update("0.146.0-alpha.3.1", "0.145.0"))

    def test_older_semver_is_stale(self):
        self.assertTrue(lens_cu.needs_update("3.24.0", "3.25.0"))

    def test_hash_and_semver_are_not_compared(self):
        self.assertIsNone(lens_cu.needs_update("11c74d6ba24d", "0.1.6"))

    def test_equal_hash_is_current(self):
        self.assertFalse(lens_cu.needs_update("abc123", "abc123"))


if __name__ == "__main__":
    unittest.main()
