"""Offline GUI API/response tests. No requests to Threads are made."""

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from threads_account_gui import GuiServer, display_result


def fixture(**changes):
    data = {
        "profiles": [
            {
                "name": "範例帳號",
                "platform": "INSTAGRAM",
                "profile_pic_url": "https://example.test/avatar.png",
            }
        ],
        "contact_points": [
            {"type": "EMAIL", "contact_point": "e***@example.test", "token": "not-for-display"},
            {"type": "EMAIL", "contact_point": "unmasked@example.test"},
        ],
        "cipher": "not-for-display",
        "cuid": "not-for-display",
    }
    data.update(changes)
    return json.dumps({"data": {"caa_ar_ig_account_search": data}})


class DisplayTests(unittest.TestCase):
    def test_only_display_fields_and_masked_contacts(self):
        result = display_result(200, "for (;;);" + fixture(), "example_user")
        self.assertEqual(result["profiles"][0]["name"], "範例帳號")
        self.assertEqual(result["contacts"], [{"type": "EMAIL", "value": "e***@example.test"}])
        self.assertNotIn("not-for-display", json.dumps(result))
        self.assertNotIn("unmasked", json.dumps(result))

    def test_business_errors_are_not_success(self):
        for raw in (
            fixture(recaptcha_required=True),
            fixture(error_content={"title": "error"}),
            fixture(profiles=[]),
            '{"errors":[{}]}',
            "<html>error</html>",
        ):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                display_result(200, raw, "example_user")
        with self.assertRaises(ValueError):
            display_result(429, fixture(), "example_user")


class GuiApiTests(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(__file__).resolve().parents[3] / ".tmp"
        temporary_root.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(prefix="ata-gui-test-", dir=temporary_root)
        self.assets = Path(self.directory.name)
        (self.assets / "index.html").write_text(
            "<!doctype html><title>fixture</title>", encoding="utf-8"
        )
        self.calls = []
        self.server = GuiServer(self.assets, self.lookup, report_directory=self.assets / "reports")
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def lookup(self, value):
        self.calls.append(value)
        return display_result(200, fixture(), "example_user")

    def post(self, username="example_user", **headers):
        defaults = {
            "Content-Type": "application/json",
            "Origin": self.server.origin,
            "X-App-Token": self.server.token,
        }
        defaults.update(headers)
        request = Request(
            self.server.origin + "/api/account",
            method="POST",
            headers=defaults,
            data=json.dumps({"username": username}).encode("utf-8"),
        )
        try:
            response = urlopen(request)
        except HTTPError as exc:
            response = exc
        with response:
            return response.status, json.loads(response.read())

    def test_local_query_and_utf8(self):
        status, result = self.post()
        self.assertEqual(status, 200)
        self.assertEqual(result["profiles"][0]["name"], "範例帳號")
        self.assertEqual(self.calls, ["example_user"])

    def test_other_origins_and_missing_token_cannot_query(self):
        self.assertEqual(self.post(**{"Origin": "https://example.test"})[0], 403)
        self.assertEqual(self.post(**{"X-App-Token": ""})[0], 403)
        self.assertEqual(self.post(**{"Host": "example.test"})[0], 403)
        self.assertEqual(self.calls, [])

    def test_bad_input_and_overlapping_query(self):
        self.assertEqual(self.post("invalid/id")[0], 400)
        with self.server.lookup_lock:
            self.assertEqual(self.post()[0], 429)
        self.assertEqual(self.calls, [])

    def test_internal_errors_have_detailed_report_and_short_banner(self):
        def fail(_value):
            raise RuntimeError("private diagnostic")

        self.server.lookup = fail
        status, result = self.post()
        self.assertEqual(status, 502)
        self.assertNotIn("private diagnostic", result["error"])
        self.assertEqual(result["report"]["message"], "private diagnostic")
        self.assertIn("RuntimeError", result["report"]["stack"])
        self.assertEqual(result["report"]["context"]["input"], "example_user")
        self.assertTrue(Path(result["report"]["context"]["reportPath"]).is_file())

    def test_asset_root_cannot_escape(self):
        with urlopen(self.server.origin + "/") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        with self.assertRaises(HTTPError) as failure:
            urlopen(self.server.origin + "/%2e%2e/test_gui.py")
        self.assertEqual(failure.exception.code, 404)
        failure.exception.close()


if __name__ == "__main__":
    unittest.main()
