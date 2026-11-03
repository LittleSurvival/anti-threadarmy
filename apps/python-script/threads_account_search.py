"""Fresh Threads parameters from isolated headless Chrome; POST only with --send."""
import argparse
import json
import re
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ORIGIN = "https://www.threads.com"
PAGE_URL = ORIGIN + "/reset_password"
API_URL = ORIGIN + "/api/graphql"
OPERATION = "CAAIGAccountSearchViewQuery"

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
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        # Fresh process + nonpersistent context; never attach to the user's profile.
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        try:
            context = browser.new_context(locale="zh-TW")
            page = context.new_page()
            page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=30000)
            page.get_by_role("textbox").wait_for(timeout=30000)
            yield page
        finally:
            browser.close()


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
    payload.update({
        "av": runtime["actorID"],
        "fb_api_caller_class": "RelayModern",
        "fb_api_req_friendly_name": query["name"],
        "server_timestamps": "true",
        "doc_id": query["id"],
        "variables": {"params": {
            "account_recovery_entry_point": None,
            "event_request_id": str(uuid.uuid4()),
            "is_threads": True,
            "next_uri": "",
            "search_query": username,
            "waterfall_id": str(uuid.uuid4()),
        }},
    })
    if payload.get("qpl_active_flow_ids"):
        payload["fb_api_analytics_tags"] = json.dumps(
            ["qpl_active_flow_ids=" + payload["qpl_active_flow_ids"]])
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
        key.lower(): value for key, value in captured["headers"].items()
        if not key.startswith(":") and key.lower() not in {
            "host", "content-length", "accept-encoding", "connection"}
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
    for header, field in (("x-fb-friendly-name", "fb_api_req_friendly_name"),
                          ("x-fb-lsd", "lsd"), ("x-web-session-id", "__s")):
        if not headers.get(header) or headers[header] != payload.get(field):
            raise ValueError(f"{header} and {field} must match")
    return Request(API_URL, data=urlencode(payload).encode("utf-8"),
                   headers=headers, method="POST")


def send_request(request, output, page=None):
    if page is not None:
        # Let Chrome supply its own cookies, UA, client hints, and Fetch Metadata.
        headers = {key: value for key, value in request.header_items()
                   if key.lower() not in {"cookie", "user-agent", "origin", "referer",
                                          "accept-encoding", "accept-language"}
                   and not key.lower().startswith("sec-")}
        result = page.evaluate("""async ({url, headers, body}) => {
            const response = await fetch(url, {
                method: 'POST', headers, body, credentials: 'same-origin',
                signal: AbortSignal.timeout(30000)
            });
            return {status: response.status, contentType: response.headers.get('content-type'),
                    text: await response.text()};
        }""", {"url": request.full_url, "headers": headers, "body": request.data.decode("utf-8")})
        status, raw, content_type = result["status"], result["text"], result["contentType"]
    else:
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            status = response.status
            raw = response.read().decode("utf-8", errors="replace")
            content_type = response.headers.get("Content-Type", "")
    print(f"HTTP {status}; Content-Type: {content_type}")
    if output:
        output.write_text(raw, encoding="utf-8")
    try:
        parsed = json.loads(raw.removeprefix("for (;;);").strip())
    except json.JSONDecodeError:
        print(raw)
        return 1
    print(json.dumps(parsed, ensure_ascii=False, indent=2))
    return int(not 200 <= status < 300 or
               isinstance(parsed, dict) and bool(parsed.get("errors") or parsed.get("error")))


def process_request(captured, args, page=None):
    request = prepare_request(captured, args.username)
    if args.save_request:
        args.save_request.write_text(
            json.dumps(captured, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "mode": "send" if args.send else "inspect-only",
        "source": "saved-request" if args.request_file else "isolated-headless-chrome",
        "transport": args.transport if args.send else None,
        "operation": captured["payload"]["fb_api_req_friendly_name"],
        "doc_id": captured["payload"]["doc_id"],
        "payload_fields": list(captured["payload"]),
        "csrf_present": bool(request.get_header("X-csrftoken")),
        "form_bytes": len(request.data),
    }, ensure_ascii=False, indent=2))
    if not args.send:
        return 0
    return send_request(request, args.output, page if args.transport == "browser" else None)


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username", help="Threads username to inspect or search")
    parser.add_argument("--send", action="store_true", help="Send one account-search POST")
    parser.add_argument("--transport", choices=("browser", "urllib"), default="browser",
                        help="Send through the page browser or urllib")
    parser.add_argument("--save-request", type=Path, help="Save headers/payload INCLUDING TOKENS as JSON")
    parser.add_argument("--request-file", type=Path, help="Use saved context instead of starting Chrome")
    parser.add_argument("--output", type=Path, help="Save response when --send is used")
    args = parser.parse_args()
    args.username = args.username.strip().removeprefix("@")
    if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", args.username):
        parser.error("username must contain 1-30 letters, numbers, underscores or periods")
    if args.output and not args.send:
        parser.error("--output requires --send; use --save-request to save parameters")
    if args.request_file and args.send and args.transport != "urllib":
        parser.error("Saved requests support --transport urllib only; omit --request-file for a fresh browser")
    try:
        if args.request_file:
            captured = json.loads(args.request_file.read_text(encoding="utf-8-sig"))
            return process_request(captured, args)
        with headless_page() as page:
            return process_request(collect_request(args.username, page), args, page)
    except (ValueError, KeyError, OSError, URLError) as exc:
        print(f"Failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
