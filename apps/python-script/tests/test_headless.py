"""Check the CLI's phone summary without making a network request."""

import contextlib
import io
import json
import unittest
from unittest.mock import patch

import threads_account_search as search


class HeadlessTests(unittest.TestCase):
    def test_local_phone_summary_preserves_response_json(self):
        payload = {
            "data": {
                "caa_ar_ig_account_search": {
                    "profiles": [{"name": "Example"}],
                    "contact_points": [
                        {"type": "PHONE", "contact_point": value}
                        for value in ("********75", "+40 ***22", "0040 ***22", "…75", "...75")
                    ],
                }
            }
        }
        response = {"status": 200, "headers": {}, "body": json.dumps(payload)}
        stdout = io.StringIO()
        with patch.object(search, "read_response", return_value=response):
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(search.send_request(None, None), 0)
        _, summary, body = stdout.getvalue().split("\n", 2)
        self.assertEqual(summary, "手機號碼(10碼) ********75")
        self.assertEqual(json.loads(body), payload)
