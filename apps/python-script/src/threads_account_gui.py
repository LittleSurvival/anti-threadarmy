"""Desktop GUI using the shared website UI and an isolated Chrome app window."""

import json
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from error_report import (
    ReportedError,
    create_error_report,
    error_stage,
    save_error_report,
    redact_text,
)

from threads_account_search import (
    collect_request,
    headless_page,
    parse_input,
    prepare_request,
    read_response,
    resolve_input,
    parse_account_response,
)

MODULE_DIR = (
    Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[1]
)
GUI_DIR = MODULE_DIR / "gui" / "dist"


def display_result(status, raw, username, response=None):
    """Return display fields only; session and recovery tokens stay in memory."""
    response = response or {"status": status, "body": raw}
    parsed = parse_account_response(response)
    data = parsed["data"]["caa_ar_ig_account_search"]
    profiles = [
        {
            "name": str(profile.get("name") or username),
            "platform": str(profile.get("platform") or ""),
            "avatarUrl": (
                profile.get("profile_pic_url")
                if isinstance(profile.get("profile_pic_url"), str)
                and profile["profile_pic_url"].startswith("https://")
                else None
            ),
        }
        for profile in (data.get("profiles") or [])
        if isinstance(profile, dict)
    ]
    if not profiles:
        raise ReportedError(
            create_error_report(
                ValueError("這次沒有取得帳號資料，請確認 ID 後再試。"),
                "query-result",
                response=response,
            )
        )
    return {
        "username": username,
        "profiles": profiles,
        "contacts": [
            {"type": str(contact.get("type") or ""), "value": contact["contact_point"]}
            for contact in (data.get("contact_points") or [])
            if isinstance(contact, dict)
            and isinstance(contact.get("contact_point"), str)
            and re.search(r"[*•…]", contact["contact_point"])
        ],
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def lookup_account(value):
    with error_stage("lookup", {"input": value}):
        with error_stage("input-validation"):
            target = parse_input(value)
        with headless_page() as page:
            username = resolve_input(target, page)
            with error_stage("collect-parameters"):
                captured = collect_request(username, page)
            with error_stage("prepare-request"):
                request = prepare_request(captured, username)
            response = read_response(request, page)
            return display_result(response["status"], response["body"], username, response)


class GuiServer(ThreadingHTTPServer):
    # Finish an in-flight lookup on shutdown so its Chrome process is closed.
    daemon_threads = False

    def __init__(self, assets=GUI_DIR, lookup=lookup_account, report_directory=None):
        self.assets = Path(assets).resolve()
        self.lookup = lookup
        self.token = secrets.token_urlsafe(32)
        self.lookup_lock = threading.Lock()
        self.report_directory = report_directory
        super().__init__(("127.0.0.1", 0), GuiHandler)
        self.origin = f"http://127.0.0.1:{self.server_port}"


class GuiHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, body, content_type="application/json; charset=utf-8"):
        if isinstance(body, dict):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src https: data:; frame-ancestors 'none'; base-uri 'self'",
        )
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def valid_host(self):
        return self.headers.get("Host") == urlsplit(self.server.origin).netloc

    def failure(self, status, error, stage, *, message=None, context=None):
        report = save_error_report(
            create_error_report(error, stage, context), directory=self.server.report_directory
        )
        self.reply(
            status,
            {"error": redact_text(message) if message else report["message"], "report": report},
        )

    def do_GET(self):
        if not self.valid_host():
            return self.failure(403, ValueError("僅接受本機視窗的請求。"), "gui-request-validation")
        if self.path == "/favicon.ico":
            return self.reply(204, b"", "image/x-icon")
        path = unquote(urlsplit(self.path).path)
        asset = (self.server.assets / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
        if not asset.is_relative_to(self.server.assets) or not asset.is_file():
            return self.failure(
                404, FileNotFoundError("找不到檔案。"), "gui-assets", context={"path": path}
            )
        content_type = {".js": "text/javascript", ".css": "text/css", ".html": "text/html"}.get(
            asset.suffix, mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        )
        try:
            self.reply(200, asset.read_bytes(), content_type + "; charset=utf-8")
        except Exception as error:
            self.failure(500, error, "gui-assets", context={"path": path})

    def do_POST(self):
        if (
            not self.valid_host()
            or self.headers.get("Origin") != self.server.origin
            or not secrets.compare_digest(self.headers.get("X-App-Token", ""), self.server.token)
        ):
            return self.failure(403, ValueError("僅接受本機視窗的請求。"), "gui-request-validation")
        if self.path != "/api/account":
            return self.failure(404, ValueError("找不到查詢服務。"), "gui-request-validation")
        value = None
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192 or self.headers.get_content_type() != "application/json":
                raise ValueError()
            value = json.loads(self.rfile.read(length)).get("username")
            parse_input(value)
        except (ValueError, AttributeError, TypeError) as error:
            return self.failure(
                400,
                error,
                "input-validation",
                message="請輸入有效的 Threads ID 或 Threads 連結。",
                context={"input": value},
            )
        if not self.server.lookup_lock.acquire(blocking=False):
            return self.failure(
                429,
                ValueError("目前有查詢正在進行，請稍後重試。"),
                "lookup-busy",
                context={"input": value},
            )
        try:
            self.reply(200, self.server.lookup(value))
        except Exception as error:
            message = (
                str(error)
                if isinstance(error, ValueError)
                else "查詢未完成，請確認本機已安裝 Chrome，或稍後重試。"
            )
            self.failure(502, error, "lookup", message=message, context={"input": value})
        finally:
            self.server.lookup_lock.release()


def chrome_path():
    if sys.platform == "win32":
        import winreg

        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(
                    hive, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
                ) as key:
                    path = Path(winreg.QueryValue(key, None))
                    if path.is_file():
                        return str(path)
            except OSError:
                pass
        for folder in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            path = Path(os.environ.get(folder, "")) / "Google/Chrome/Application/chrome.exe"
            if path.is_file():
                return str(path)
    raise RuntimeError("找不到 Google Chrome，請先安裝 Chrome 後再開啟程式。")


def main():
    try:
        chrome = chrome_path()
        if not (GUI_DIR / "index.html").is_file():
            raise RuntimeError("找不到 GUI 檔案，請先建置 GUI 或重新下載完整的 GUI EXE。")
        with GuiServer() as server, tempfile.TemporaryDirectory(
            prefix="anti-threadarmy-gui-"
        ) as profile:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with subprocess.Popen(
                    [
                        chrome,
                        f"--user-data-dir={profile}",
                        f"--app={server.origin}/#{server.token}",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "--disable-background-mode",
                        "--window-size=620,800",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                ) as window:
                    window.wait()
            finally:
                server.shutdown()
                thread.join()
        return 0
    except Exception as exc:
        report = save_error_report(create_error_report(exc, "gui-startup"))
        detail = (
            report["message"]
            + "\n\n"
            + (
                "錯誤報告已儲存：\n" + report["context"]["reportPath"]
                if "reportSaveError" not in report.get("context", {})
                else json.dumps(report, ensure_ascii=False, indent=2)
            )
        )
        if sys.platform == "win32":
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, detail, "anti-threadarmy 錯誤報告", 0x10)
        elif sys.stderr:
            print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
