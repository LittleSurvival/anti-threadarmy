"""Offline input/redirect tests; all identifiers are synthetic."""

import unittest
from types import SimpleNamespace
from threads_account_search import parse_input, resolve_input


class Response:
    def __init__(self, location, status=302):
        self.status = status
        self.headers = {"location": location}
        self.disposed = False

    def dispose(self):
        self.disposed = True


class InputTests(unittest.TestCase):
    def test_ids_and_full_links(self):
        for value in (
            " example_user ",
            "@example_user",
            "https://threads.com/@example_user",
            "https://www.threads.net/@example_user/post/ExamplePost?xmt=example",
        ):
            self.assertEqual(parse_input(value), {"username": "example_user"})

    def test_share_normalization(self):
        self.assertEqual(
            parse_input("https://threads.net/share/ExampleShare?xmt=example"),
            {"share_url": "https://www.threads.com/share/ExampleShare"},
        )

    def test_invalid_inputs(self):
        for value in (
            "",
            "x" * 2049,
            "invalid/id",
            "http://threads.com/@example_user",
            "https://threads.com.evil.test/@example_user",
            "https://user@threads.com/@example_user",
            "https://threads.com:8080/@example_user",
            "https://threads.com/share/",
            "https://threads.com/@example_user/post/",
            "https://threads.com/@example_\nuser",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_input(value)

    def page(self, response):
        def head(url, **options):
            self.assertEqual(url, "https://www.threads.com/share/ExampleShare")
            self.assertEqual(options["max_redirects"], 0)
            return response

        return SimpleNamespace(request=SimpleNamespace(head=head))

    def test_redirect_author_and_disposal(self):
        response = Response("https://www.threads.com/@example_user/post/ExamplePost?xmt=example")
        target = parse_input("https://threads.com/share/ExampleShare")
        self.assertEqual(resolve_input(target, self.page(response)), "example_user")
        self.assertTrue(response.disposed)

    def test_bad_redirects_stop(self):
        for location, status in [
            ("https://evil.test/@example_user/post/ExamplePost", 302),
            ("/login", 302),
            ("/@example_user", 302),
            ("", 200),
            ("/share/ExampleShare", 302),
        ]:
            response = Response(location, status)
            with self.assertRaises(ValueError):
                resolve_input(
                    parse_input("https://threads.com/share/ExampleShare"), self.page(response)
                )
            self.assertTrue(response.disposed)

    def test_direct_id_does_not_need_browser(self):
        self.assertEqual(resolve_input({"username": "example_user"}, None), "example_user")


if __name__ == "__main__":
    unittest.main()
