"""Fresh Threads parameters from isolated headless Chrome; POST only with --send."""

import argparse
import json
import re
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit, urljoin
from urllib.request import Request, urlopen

from error_report import (
    ReportedError,
    create_error_report,
    error_stage,
    save_error_report,
    redact_text,
)

ORIGIN = "https://www.threads.com"
PAGE_URL = ORIGIN + "/reset_password"
API_URL = ORIGIN + "/api/graphql"
OPERATION = "CAAIGAccountSearchViewQuery"


def parse_input(value):
    value = value.strip()
    if len(value) > 2048 or re.search(r"\s", value):
        raise ValueError("Enter a Threads ID or HTTPS Threads profile/post/share link")
    if re.fullmatch(r"@?[A-Za-z0-9._]{1,30}", value):
        return {"username": value.removeprefix("@")}
    url = urlsplit(value)
    if (
        url.scheme != "https"
        or url.hostname not in {"threads.com", "www.threads.com", "threads.net", "www.threads.net"}
        or url.port not in (None, 443)
        or url.username
        or url.password
    ):
        raise ValueError("Enter a Threads ID or HTTPS Threads profile/post/share link")
    author = re.fullmatch(r"/@([A-Za-z0-9._]{1,30})(?:/post/[A-Za-z0-9_-]+)?/?", url.path)
    if author:
        return {"username": author[1]}
    if re.fullmatch(r"/share/[A-Za-z0-9_-]+/?", url.path):
        return {"share_url": ORIGIN + url.path}
    raise ValueError("Unsupported Threads link")


def resolve_input(target, page):
    if "username" in target:
        return target["username"]
    original_url = url = target["share_url"]
    for _ in range(5):
        with error_stage("resolve-input", {"input": original_url, "url": url}):
            response = page.request.head(url, max_redirects=0, timeout=20000)
        try:
            if response.status not in (301, 302, 303, 307, 308):
                raise ValueError("Could not resolve the Threads share link")
            destination = urljoin(url, response.headers.get("location", ""))
            parsed = urlsplit(destination)
            if parsed.scheme != "https" or parsed.netloc != "www.threads.com":
                raise ValueError("Unexpected Threads share destination")
            target = parse_input(destination)
            if "username" in target and re.fullmatch(
                r"/@[A-Za-z0-9._]{1,30}/post/[A-Za-z0-9_-]+/?", parsed.path
            ):
                return target["username"]
            if "share_url" not in target:
                raise ValueError("Could not identify the post author")
            url = target["share_url"]
        except Exception as error:
            raise ReportedError(
                create_error_report(
                    error, "resolve-input", {"input": original_url}, browser_response(response, url)
                )
            ) from error
        finally:
            response.dispose()
    raise ReportedError(
        create_error_report(
            ValueError("Too many Threads share redirects"), "resolve-input", {"input": original_url}
        )
    )


# getAsyncParams advances a local counter; it does not send a request.
READ_CONTEXT = """() => {
    const config = require('RelayAPIConfigDefaults');
    return {
        query: require('CAAIGAccountSearchViewQuery.graphql').params,
        asyncParams: require('getAsyncParams')('POST'),
        actorID: config.actorID,
        appID: config.customHeaders['X-IG-App-ID'],
        asbdID: require('BDHeaderConfig').ASBD_ID,
        userAgent: navigator.userAgent,
        language: navigator.language,
        userID: require('CurrentUserInitialData').USER_ID
    };
}"""


@contextmanager
def headless_page():
    stage, response = "browser-startup", None
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            # Fresh process + nonpersistent context; never attach to the user's profile.
            browser = playwright.chromium.launch(channel="chrome", headless=True)
            try:
                context = browser.new_context(locale="zh-TW")
                page = context.new_page()
                stage = "page-load"
                response = page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=30000)
                if response is not None and not response.ok:
                    raise ValueError(f"Threads page returned HTTP {response.status}")
                stage = "page-ready"
                page.get_by_role("textbox").wait_for(timeout=30000)
                yield page
            except Exception as error:
                needs_page = (
                    not isinstance(error, ReportedError)
                    or error.report["stage"] == "collect-parameters"
                )
                details = (
                    browser_response(response, PAGE_URL)
                    if response is not None and needs_page
                    else None
                )
                raise ReportedError(create_error_report(error, stage, response=details)) from error
            finally:
                pending_error = sys.exc_info()[1]
                try:
                    browser.close()
                except Exception as error:
                    if isinstance(pending_error, ReportedError):
                        pending_error.report.setdefault("context", {})["cleanupError"] = (
                            redact_text(str(error))
                        )
                    elif pending_error is None:
                        raise ReportedError(create_error_report(error, "browser-close")) from error
    except Exception as error:
        raise ReportedError(create_error_report(error, stage)) from error


def browser_response(response, url):
    details = {
        "url": getattr(response, "url", url),
        "status": response.status,
        "statusText": getattr(response, "status_text", ""),
        "headers": response.headers,
    }
    try:
        details["body"] = response.text()
    except Exception as error:
        details["body"] = ""
        details["bodyReadError"] = str(error)
    return details


def collect_request(username, page):
    runtime = page.evaluate(READ_CONTEXT)
    cookies = page.context.cookies(API_URL)  # Includes HttpOnly ig_did.
    if runtime["userID"] != "0":
        raise ValueError("Expected a logged-out page")
    query = runtime["query"]
    if query["name"] != OPERATION or query["operationKind"] != "query" or not query["id"]:
        raise ValueError("The expected account-search query is unavailable")
    cookie_values = {cookie["name"]: cookie["value"] for cookie in cookies}
    if not all(cookie_values.get(name) for name in ("csrftoken", "ig_did")):
        raise ValueError("Chrome did not receive both csrftoken and ig_did")
    payload = runtime["asyncParams"]
    if not payload.get("lsd") or not payload.get("__s"):
        raise ValueError("Page is missing LSD or web session state")
    payload.update(
        {
            "av": runtime["actorID"],
            "fb_api_caller_class": "RelayModern",
            "fb_api_req_friendly_name": query["name"],
            "server_timestamps": "true",
            "doc_id": query["id"],
            "variables": {
                "params": {
                    "account_recovery_entry_point": None,
                    "event_request_id": str(uuid.uuid4()),
                    "is_threads": True,
                    "next_uri": "",
                    "search_query": username,
                    "waterfall_id": str(uuid.uuid4()),
                }
            },
        }
    )
    if payload.get("qpl_active_flow_ids"):
        payload["fb_api_analytics_tags"] = json.dumps(
            ["qpl_active_flow_ids=" + payload["qpl_active_flow_ids"]]
        )
    headers = {
        "accept": "*/*",
        "accept-encoding": "identity",
        "accept-language": runtime["language"],
        "content-type": "application/x-www-form-urlencoded",
        "cookie": "; ".join(f"{c['name']}={c['value']}" for c in cookies),
        "origin": ORIGIN,
        "referer": PAGE_URL,
        "user-agent": runtime["userAgent"],
        "x-asbd-id": runtime["asbdID"],
        "x-csrftoken": cookie_values["csrftoken"],
        "x-fb-friendly-name": query["name"],
        "x-fb-lsd": payload["lsd"],
        "x-ig-app-id": runtime["appID"],
        "x-web-session-id": payload["__s"],
    }
    return {"headers": headers, "payload": payload}


def prepare_request(captured, username):
    headers = {
        key.lower(): value
        for key, value in captured["headers"].items()
        if not key.startswith(":")
        and key.lower() not in {"host", "content-length", "accept-encoding", "connection"}
    }
    headers["accept-encoding"] = "identity"
    headers["content-type"] = "application/x-www-form-urlencoded"
    payload = dict(captured["payload"])
    variables = payload["variables"]
    if isinstance(variables, str):
        variables = json.loads(variables)
    variables = {**variables, "params": {**variables["params"], "search_query": username}}
    payload["variables"] = json.dumps(variables, separators=(",", ":"))
    if payload.get("fb_api_req_friendly_name") != OPERATION:
        raise ValueError(f"Expected {OPERATION}")
    for header, field in (
        ("x-fb-friendly-name", "fb_api_req_friendly_name"),
        ("x-fb-lsd", "lsd"),
        ("x-web-session-id", "__s"),
    ):
        if not headers.get(header) or headers[header] != payload.get(field):
            raise ValueError(f"{header} and {field} must match")
    return Request(API_URL, data=urlencode(payload).encode("utf-8"), headers=headers, method="POST")


def read_response(request, page=None):
    with error_stage(
        "query-request", {"url": request.full_url, "transport": "browser" if page else "urllib"}
    ):
        return _read_response(request, page)


def _read_response(request, page=None):
    if page is not None:
        # Let Chrome supply its own cookies, UA, client hints, and Fetch Metadata.
        headers = {
            key: value
            for key, value in request.header_items()
            if key.lower()
            not in {
                "cookie",
                "user-agent",
                "origin",
                "referer",
                "accept-encoding",
                "accept-language",
            }
            and not key.lower().startswith("sec-")
        }
        result = page.evaluate(
            """async ({url, headers, body}) => {
            const response = await fetch(url, {
                method: 'POST', headers, body, credentials: 'same-origin',
                signal: AbortSignal.timeout(30000)
            });
            const result = {url: response.url, status: response.status, statusText: response.statusText,
                    headers: Object.fromEntries(response.headers), body: ''};
            try { result.body = await response.text(); }
            catch (error) { result.bodyReadError = String(error); }
            return result;
        }""",
            {"url": request.full_url, "headers": headers, "body": request.data.decode("utf-8")},
        )
        if result.get("bodyReadError"):
            raise ReportedError(
                create_error_report(
                    IOError(result["bodyReadError"]), "response-read", response=result
                )
            )
        return result
    else:
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            result = {
                "url": response.url,
                "status": response.status,
                "statusText": str(response.reason or ""),
                "headers": dict(response.headers),
                "body": "",
            }
            try:
                result["body"] = response.read().decode("utf-8", errors="replace")
            except Exception as error:
                raise ReportedError(
                    create_error_report(error, "response-read", response=result)
                ) from error
            return result


def parse_account_response(response):
    stage = "query-http"
    try:
        if not 200 <= response["status"] < 300:
            raise ValueError(
                f"Threads 暫時無法回應（HTTP {response['status']} {response.get('statusText', '')}）。"
            )
        stage = "response-json"
        parsed = json.loads(re.sub(r"^for\s*\(;;\);", "", response["body"]).strip())
        stage = "query-result"
        if not isinstance(parsed, dict) or parsed.get("error") or parsed.get("errors"):
            raise ValueError("Threads 拒絕了這次查詢，請稍後重試。")
        data = (parsed.get("data") or {}).get("caa_ar_ig_account_search")
        if not isinstance(data, dict):
            raise ValueError("未取得可辨識的帳號資料。")
        if data.get("recaptcha_required"):
            raise ValueError("Threads 要求驗證，這次查詢已停止。")
        if data.get("error_content"):
            raise ValueError("Threads 無法完成這次查詢，請確認 ID 或稍後重試。")
        if not isinstance(data.get("profiles"), list) or not any(
            isinstance(profile, dict) for profile in data["profiles"]
        ):
            raise ValueError("這次沒有取得帳號資料，請確認 ID 後再試。")
        return parsed
    except Exception as error:
        raise ReportedError(create_error_report(error, stage, response=response)) from error


def send_request(request, output, page=None):
    response = read_response(request, page)
    content_type = next(
        (value for key, value in response["headers"].items() if key.lower() == "content-type"), ""
    )
    print(f"HTTP {response['status']}; Content-Type: {content_type}")
    if output:
        with error_stage("save-response"):
            output.write_text(response["body"], encoding="utf-8")
    parsed = parse_account_response(response)
    print(json.dumps(parsed, ensure_ascii=False, indent=2))
    return 0


def process_request(captured, args, page=None):
    with error_stage("prepare-request"):
        request = prepare_request(captured, args.username)
    with error_stage("save-request"):
        if args.save_request:
            args.save_request.write_text(
                json.dumps(captured, ensure_ascii=False, indent=2), encoding="utf-8"
            )
    print(
        json.dumps(
            {
                "mode": "send" if args.send else "inspect-only",
                "source": "saved-request" if args.request_file else "isolated-headless-chrome",
                "transport": args.transport if args.send else None,
                "operation": captured["payload"]["fb_api_req_friendly_name"],
                "doc_id": captured["payload"]["doc_id"],
                "payload_fields": list(captured["payload"]),
                "csrf_present": bool(request.get_header("X-csrftoken")),
                "form_bytes": len(request.data),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if not args.send:
        return 0
    return send_request(request, args.output, page if args.transport == "browser" else None)


class UsageError(ValueError):
    pass


class ArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise UsageError(message)


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("username", help="Threads ID or profile/post/reply/share URL")
    parser.add_argument("--send", action="store_true", help="Send one account-search POST")
    parser.add_argument(
        "--transport",
        choices=("browser", "urllib"),
        default="browser",
        help="Send through the page browser or urllib",
    )
    parser.add_argument(
        "--save-request", type=Path, help="Save headers/payload INCLUDING TOKENS as JSON"
    )
    parser.add_argument(
        "--request-file", type=Path, help="Use saved context instead of starting Chrome"
    )
    parser.add_argument("--output", type=Path, help="Save response when --send is used")
    parser.add_argument(
        "--error-report", type=Path, help="Write the redacted JSON error report to this file"
    )
    report_option = argparse.ArgumentParser(add_help=False, exit_on_error=False)
    report_option.add_argument("--error-report", type=Path)
    try:
        report_path = report_option.parse_known_args(argv)[0].error_report
    except argparse.ArgumentError:
        report_path = None
    args, stage = None, "input-validation"
    original_input = None
    try:
        args = parser.parse_args(argv)
        original_input = args.username
        target = parse_input(args.username)
        if args.request_file and "share_url" in target:
            parser.error(
                "Share links need a fresh browser; omit --request-file or use a full post link"
            )
        if args.output and not args.send:
            parser.error("--output requires --send; use --save-request to save parameters")
        if args.request_file and args.send and args.transport != "urllib":
            parser.error(
                "Saved requests support --transport urllib only; omit --request-file for a fresh browser"
            )
        if args.request_file:
            args.username = target["username"]
            stage = "load-request"
            captured = json.loads(args.request_file.read_text(encoding="utf-8-sig"))
            stage = "process-request"
            return process_request(captured, args)
        stage = "browser-startup"
        with headless_page() as page:
            args.username = resolve_input(target, page)
            with error_stage("collect-parameters"):
                captured = collect_request(args.username, page)
            return process_request(captured, args, page)
    except Exception as error:
        context = {
            "input": original_input,
            "mode": "send" if args and args.send else "inspect-only",
        }
        if args is None:
            context["arguments"] = list(argv if argv is not None else sys.argv[1:])
        report = save_error_report(create_error_report(error, stage, context), report_path)
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2 if stage == "input-validation" else 1


if __name__ == "__main__":
    raise SystemExit(main())
