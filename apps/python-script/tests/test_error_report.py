"""Synthetic diagnostics: preserve failures and actual responses without secrets."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import error_report
import threads_account_search as search
from error_report import ReportedError, create_error_report, save_error_report


def response(
    status=200, body='{"errors":[{"message":"fixture failure"}]}', content_type="application/json"
):
    return {
        "url": search.API_URL,
        "status": status,
        "statusText": "Fixture status",
        "headers": {"content-type": content_type},
        "body": body,
    }


class ReportTests(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(__file__).resolve().parents[3] / ".tmp"
        temporary_root.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(prefix="ata-reports-test-", dir=temporary_root)
        self.path = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def test_nested_response_and_headers_are_redacted(self):
        raw = json.dumps(
            {
                "errors": [{"message": "detail", "code": 123}],
                "cipher": "secret-cipher",
                "contact_points": [{"cuid": "secret-cuid", "contact_point": "e***@example.test"}],
                "nested": {"access_token": "secret-token", "password": "secret-password"},
            }
        )
        actual = response(body=raw)
        actual["headers"]["Set-Cookie"] = "sessionid=secret-cookie"
        report = create_error_report(
            ValueError("fixture failure"), "query-result", {"input": "example_user"}, actual
        )
        serialized = json.dumps(report)
        for secret in (
            "secret-cipher",
            "secret-cuid",
            "secret-token",
            "secret-password",
            "secret-cookie",
        ):
            self.assertNotIn(secret, serialized)
        parsed = json.loads(report["response"]["body"])
        self.assertEqual(parsed["errors"], [{"message": "detail", "code": 123}])
        self.assertEqual(parsed["contact_points"][0]["contact_point"], "e***@example.test")
        self.assertEqual(report["response"]["headers"]["Set-Cookie"], "[REDACTED]")

    def test_non_json_body_and_traceback_keep_details_without_credentials(self):
        raw = '<html><h1>upstream unavailable</h1><input name="csrf_token" value="secret-form"></html>'
        try:
            raise RuntimeError(
                "request failed password=secret-pass Authorization: Bearer secret-bearer"
            )
        except RuntimeError as error:
            report = create_error_report(
                error, "query-http", response=response(503, raw, "text/html")
            )
        serialized = json.dumps(report)
        for secret in ("secret-form", "secret-pass", "secret-bearer"):
            self.assertNotIn(secret, serialized)
        self.assertIn("upstream unavailable", report["response"]["body"])
        self.assertIn("Traceback", report["stack"])
        self.assertEqual(report["response"]["status"], 503)
        self.assertEqual(report["response"]["headers"]["content-type"], "text/html")

    def test_failure_stages_keep_actual_response(self):
        cases = [
            (response(503, "upstream failed", "text/plain"), "query-http"),
            (response(body="{broken-json"), "response-json"),
            (response(), "query-result"),
            (
                response(
                    body='{"data":{"caa_ar_ig_account_search":{"error_content":{"title":"actual reason"}}}}'
                ),
                "query-result",
            ),
            (
                response(body='{"data":{"caa_ar_ig_account_search":{"recaptcha_required":true}}}'),
                "query-result",
            ),
        ]
        for actual, stage in cases:
            with self.subTest(stage=stage), self.assertRaises(ReportedError) as failure:
                search.parse_account_response(actual)
            self.assertEqual(failure.exception.report["stage"], stage)
            self.assertEqual(failure.exception.report["response"]["status"], actual["status"])
            self.assertTrue(failure.exception.report["response"]["body"])

    def test_network_failure_does_not_invent_response(self):
        request = search.Request(search.API_URL, data=b"fixture", method="POST")
        with patch.object(search, "urlopen", side_effect=OSError("fixture network unavailable")):
            with self.assertRaises(ReportedError) as failure:
                search.read_response(request)
        self.assertEqual(failure.exception.report["stage"], "query-request")
        self.assertNotIn("response", failure.exception.report)
        self.assertIn("fixture network unavailable", failure.exception.report["stack"])

    def test_write_failure_keeps_original_report(self):
        destination = self.path / "report.json"
        with patch.object(
            Path, "write_text", side_effect=PermissionError("fixture read-only directory")
        ):
            report = save_error_report(
                create_error_report(RuntimeError("original failure"), "lookup"), destination
            )
        self.assertEqual(report["message"], "original failure")
        self.assertIn("read-only directory", report["context"]["reportSaveError"])

    def test_default_source_and_frozen_report_directories(self):
        self.assertEqual(
            error_report.report_directory(),
            Path(error_report.__file__).resolve().parents[1] / "error-reports",
        )
        with patch.object(sys, "frozen", True, create=True), patch.object(
            sys, "executable", str(self.path / "app.exe")
        ):
            self.assertEqual(error_report.report_directory(), self.path / "error-reports")

    def test_cli_invalid_input_writes_report_to_requested_path(self):
        destination = self.path / "invalid.json"
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = search.main(["invalid/id", "--error-report", str(destination)])
        self.assertEqual(code, 2)
        report = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual(report["stage"], "input-validation")
        self.assertEqual(report["context"]["input"], "invalid/id")
        self.assertEqual(json.loads(stderr.getvalue())["message"], report["message"])

    def test_cli_missing_argument_honors_report_override(self):
        destination = self.path / "usage.json"
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(search.main(["--error-report", str(destination)]), 2)
        self.assertEqual(json.loads(destination.read_text(encoding="utf-8"))["name"], "UsageError")

    def test_cli_browser_setup_failure_writes_traceback(self):
        destination = self.path / "setup.json"
        with patch.object(
            search, "headless_page", side_effect=RuntimeError("fixture Chrome not installed")
        ), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(search.main(["example_user", "--error-report", str(destination)]), 1)
        report = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual(report["stage"], "browser-startup")
        self.assertEqual(report["context"]["input"], "example_user")
        self.assertIn("fixture Chrome not installed", report["stack"])

    def test_cli_domain_failure_is_failure_and_does_not_print_secrets(self):
        body = '{"data":{"caa_ar_ig_account_search":{"error_content":{"title":"actual reason"},"cipher":"secret-cipher"}}}'
        stdout = io.StringIO()
        with patch.object(
            search, "read_response", return_value=response(body=body)
        ), contextlib.redirect_stdout(stdout):
            with self.assertRaises(ReportedError) as failure:
                search.send_request(None, None)
        self.assertIn("actual reason", failure.exception.report["response"]["body"])
        self.assertNotIn("secret-cipher", str(failure.exception.report) + stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
