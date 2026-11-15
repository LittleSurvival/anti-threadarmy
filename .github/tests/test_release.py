"""Release metadata must only be exported with matching, nonempty release notes."""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPOSITORY = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "check_release", REPOSITORY / ".github/scripts/check-release.py"
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseNotesTests(unittest.TestCase):
    def setUp(self):
        scratch = REPOSITORY / ".tmp"
        scratch.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.notes = self.root / "UPDATE.md"
        self.environment = self.root / "github-env.txt"
        (self.root / "manifest.json").write_text(
            json.dumps(
                {
                    "id": "example-app",
                    "name": "Example App",
                    "version": "1.2.3",
                    "versionCode": 4,
                    "android": {"applicationId": "org.example.app"},
                }
            ),
            encoding="utf-8",
        )

    def validate(self):
        with patch.object(
            release, "__file__", str(self.root / ".github/scripts/check-release.py")
        ), patch.object(sys, "argv", ["check-release.py", "v1.2.3"]), patch.dict(
            os.environ, {"GITHUB_ENV": str(self.environment)}
        ):
            release.main()

    def test_matching_notes_export_metadata(self):
        self.notes.write_text("# v1.2.3\n\n- 新增清除輸入。\n", encoding="utf-8")
        self.validate()
        self.assertEqual(
            self.environment.read_text(encoding="utf-8").splitlines(),
            [
                "RELEASE_TAG=v1.2.3",
                "RELEASE_TITLE=Example App v1.2.3",
                "ASSET_PREFIX=example-app-v1.2.3",
            ],
        )

    def test_missing_stale_or_empty_notes_do_not_export_metadata(self):
        for content in (None, "# v1.2.2\n\nOld notes", "# v1.2.3\n\n", ""):
            with self.subTest(content=content):
                if content is not None:
                    self.notes.write_text(content, encoding="utf-8")
                with self.assertRaises((OSError, ValueError)):
                    self.validate()
                self.assertFalse(self.environment.exists())


if __name__ == "__main__":
    unittest.main()
