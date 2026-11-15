"""Exercise the bundled GUI and local API with synthetic offline results."""

import argparse
import json
import threading
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from threads_account_gui import GuiServer, display_result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--screenshot", type=Path, help="Save a screenshot under the repository's .tmp directory."
    )
    args = parser.parse_args()
    temporary_root = Path(__file__).resolve().parents[3] / ".tmp"
    temporary_root.mkdir(exist_ok=True)
    if args.screenshot:
        args.screenshot = (temporary_root / args.screenshot).resolve()
        if not args.screenshot.is_relative_to(temporary_root):
            parser.error("Screenshots must stay inside the repository's .tmp directory.")
    calls = []

    def lookup(value):
        calls.append(value)
        time.sleep(0.15)
        if value == "error_example":
            raw = json.dumps(
                {
                    "errors": [{"message": "fixture upstream rejection", "code": 123}],
                    "cipher": "fixture-secret-cipher",
                    "cuid": "fixture-secret-cuid",
                }
            )
            return display_result(
                200,
                raw,
                value,
                {
                    "url": "https://www.threads.com/api/graphql",
                    "status": 200,
                    "headers": {"content-type": "application/json"},
                    "body": raw,
                },
            )
        raw = json.dumps(
            {
                "data": {
                    "caa_ar_ig_account_search": {
                        "profiles": [{"name": "範例帳號", "platform": "INSTAGRAM"}],
                        "contact_points": [
                            {"type": "PHONE", "contact_point": "+886******0001"},
                            {"type": "PHONE", "contact_point": "+40 *** *** *22"},
                            {"type": "EMAIL", "contact_point": "e***@pm.me"},
                            {"type": "EMAIL", "contact_point": "e***@**.com"},
                            {"type": "EMAIL", "contact_point": "e***@example.org"},
                        ],
                    }
                }
            }
        )
        return display_result(200, raw, "example_user")

    with tempfile.TemporaryDirectory(
        prefix="ata-gui-browser-", dir=temporary_root
    ) as temporary, GuiServer(
        lookup=lookup, report_directory=Path(temporary) / "reports"
    ) as server, sync_playwright() as playwright:
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
            try:
                page = browser.new_page(viewport={"width": 620, "height": 800})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"{server.origin}/#{server.token}")
                input_box = page.get_by_role("textbox", name="Threads ID 或連結")
                input_box.fill("invalid/id")
                page.get_by_role("button", name="查詢帳號", exact=True).click()
                expect(
                    page.get_by_text("請輸入有效的 Threads ID 或 Threads 連結。", exact=True)
                ).to_be_visible()
                assert calls == []
                input_box.fill("@example_user")
                input_box.press("Enter")
                expect(page.get_by_role("button", name="查詢中", exact=True)).to_be_disabled()
                expect(page.get_by_role("heading", name="範例帳號", exact=True)).to_be_visible()
                expect(page.get_by_text("+886******0001", exact=True)).to_be_visible()
                expect(page.get_by_text("台灣／羅馬尼亞", exact=True)).to_be_visible()
                expect(page.get_by_text("Proton Mail／未知", exact=True)).to_be_visible()
                expect(page.get_by_text("可能的郵件服務", exact=True)).to_be_visible()
                assert "QQ 郵箱（qq.com）" in page.get_by_label("聯絡資訊").inner_text()
                assert calls == ["example_user"]
                assert page.evaluate("location.hash") == ""
                if args.screenshot:
                    args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(args.screenshot), full_page=True)
                # The shared header reloads /. Keep authentication after this navigation.
                page.get_by_role("link", name="anti-threadarmy 首頁").click()
                input_box.fill("https://www.threads.com/share/ExampleShare")
                input_box.press("Enter")
                expect(page.get_by_role("heading", name="範例帳號", exact=True)).to_be_visible()
                assert calls[-1] == "https://www.threads.com/share/ExampleShare"
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                input_box.fill("error_example")
                input_box.press("Enter")
                expect(
                    page.get_by_text("Threads 拒絕了這次查詢，請稍後重試。", exact=True)
                ).to_be_visible()
                expect(page.get_by_role("heading", name="範例帳號", exact=True)).to_have_count(0)
                page.get_by_role("button", name="查看錯誤報告", exact=True).click()
                dialog = page.get_by_role("dialog", name="錯誤報告")
                expect(dialog).to_be_visible()
                report = json.loads(dialog.get_by_label("錯誤報告詳細內容").inner_text())
                assert report["stage"] == "query-result"
                assert report["response"]["status"] == 200
                assert "fixture upstream rejection" in report["response"]["body"]
                assert "fixture-secret" not in json.dumps(report)
                saved = json.loads(
                    Path(report["context"]["reportPath"]).read_text(encoding="utf-8")
                )
                assert saved["response"] == report["response"]
                page.context.grant_permissions(
                    ["clipboard-read", "clipboard-write"], origin=server.origin
                )
                dialog.get_by_role("button", name="複製報告", exact=True).click()
                expect(dialog.get_by_role("status")).to_have_text("已複製")
                assert json.loads(page.evaluate("navigator.clipboard.readText()")) == report
                with page.expect_download() as download:
                    dialog.get_by_role("button", name="下載 JSON", exact=True).click()
                downloaded = Path(temporary) / "download.json"
                download.value.save_as(downloaded)
                assert json.loads(downloaded.read_text(encoding="utf-8")) == report
                dialog.get_by_role("button", name="關閉錯誤報告", exact=True).click()

                # A broken local API still exposes the response that actually arrived.
                def broken_response(route):
                    route.fulfill(
                        status=502, content_type="text/plain", body="fixture gateway failure"
                    )

                page.route("**/api/account", broken_response)
                input_box.fill("malformed_example")
                input_box.press("Enter")
                page.get_by_role("button", name="查看錯誤報告", exact=True).click()
                local_report = json.loads(page.get_by_label("錯誤報告詳細內容").inner_text())
                assert local_report["stage"] == "gui-response"
                assert local_report["response"]["status"] == 502
                assert local_report["response"]["body"] == "fixture gateway failure"
                page.get_by_role("button", name="關閉錯誤報告", exact=True).click()
                page.unroute("**/api/account", broken_response)

                def missing_result(route):
                    route.fulfill(
                        status=200, content_type="application/json", body='{"unexpected":"fixture"}'
                    )

                page.route("**/api/account", missing_result)
                input_box.fill("missing_result")
                input_box.press("Enter")
                page.get_by_role("button", name="查看錯誤報告", exact=True).click()
                missing_report = json.loads(page.get_by_label("錯誤報告詳細內容").inner_text())
                assert missing_report["response"]["body"] == '{"unexpected":"fixture"}'
                page.get_by_role("button", name="關閉錯誤報告", exact=True).click()
                page.unroute("**/api/account", missing_result)

                def empty_profiles(route):
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body='{"username":"example_user","profiles":[],"contacts":[]}',
                    )

                page.route("**/api/account", empty_profiles)
                input_box.fill("empty_result")
                input_box.press("Enter")
                page.get_by_role("button", name="查看錯誤報告", exact=True).click()
                empty_report = json.loads(page.get_by_label("錯誤報告詳細內容").inner_text())
                assert json.loads(empty_report["response"]["body"])["profiles"] == []
                page.get_by_role("button", name="關閉錯誤報告", exact=True).click()
                page.unroute("**/api/account", empty_profiles)
                assert not errors, errors
            finally:
                browser.close()
        finally:
            server.shutdown()
            thread.join()
    print(
        "GUI: shared UI, lookup states, UTF-8, reload, narrow layout, error report modal/copy/download, raw and missing API responses PASS"
    )


if __name__ == "__main__":
    main()
