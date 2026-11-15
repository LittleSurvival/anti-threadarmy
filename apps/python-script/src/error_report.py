"""Portable error reports with response details and redacted credentials."""

import json
import re
import sys
import traceback
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

REDACTED = "[REDACTED]"
_SECRET_KEY = re.compile(
    r"cookie|authorization|password|passwd|secret|token|session|cipher|cuid|"
    r"^(?:lsd|fb_dtsg|jazoest|ig_did|mid|__s|__hsi|otp|passcode|nonce|recovery_code|verification_code|x-ig-www-claim)$",
    re.I,
)
_SECRET_NAME = (
    r"[\w-]*(?:cookie|authorization|password|passwd|secret|token|session|cipher|cuid)[\w-]*"
    r"|lsd|fb_dtsg|jazoest|ig_did|mid|__s|__hsi|otp|passcode|nonce|recovery_code|verification_code|x-ig-www-claim"
)


def redact_text(value):
    # Header lines, JSON/string repr fields, form/query values, and HTML inputs.
    value = re.sub(
        r"(?im)^(\s*(?:set-cookie|cookie|authorization|proxy-authorization)\s*:\s*).*$",
        lambda m: m[1] + REDACTED,
        value,
    )
    value = re.sub(
        rf"(?i)([\"'](?:{_SECRET_NAME})[\"']\s*:\s*)([\"'])(?:\\.|(?!\2).)*?\2",
        lambda m: m[1] + '"' + REDACTED + '"',
        value,
    )
    value = re.sub(
        rf"(?i)([\"'](?:{_SECRET_NAME})[\"']\s*:\s*)(?![\"'])[^,\s}}\]]+",
        lambda m: m[1] + '"' + REDACTED + '"',
        value,
    )
    value = re.sub(
        rf"(?i)((?:[?&;\s]|^)(?:{_SECRET_NAME})=)[^&;\s<>\"']+", lambda m: m[1] + REDACTED, value
    )
    value = re.sub(
        r"(?i)(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/-]+=*", lambda m: m[1] + REDACTED, value
    )
    value = re.sub(r"(?i)(https?://)[^\s/@]+:[^\s/@]+@", r"\1[REDACTED]@", value)

    def input_tag(match):
        tag = match[0]
        name = re.search(r"(?i)\b(?:name|id)\s*=\s*[\"']([^\"']+)[\"']", tag)
        if name and _SECRET_KEY.search(name[1]):
            tag = re.sub(
                r"(?i)(\bvalue\s*=\s*)([\"']).*?\2", lambda m: m[1] + '"' + REDACTED + '"', tag
            )
        return tag

    return re.sub(r"(?is)<input\b[^>]*>", input_tag, value)


def redact(value):
    if isinstance(value, dict):
        return {
            str(key): REDACTED if _SECRET_KEY.search(str(key)) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    if isinstance(value, str):
        # JSON embedded in a response body keeps its structure, including errors.
        prefix = re.match(r"^for\s*\(;;\);", value)
        body = value[prefix.end() :] if prefix else value
        try:
            parsed = json.loads(body)
        except (ValueError, TypeError):
            return redact_text(value)
        if isinstance(parsed, (dict, list)):
            return (prefix[0] if prefix else "") + json.dumps(
                redact(parsed), ensure_ascii=False, indent=2
            )
        return redact_text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return redact_text(str(value))


class ReportedError(ValueError):
    def __init__(self, report):
        self.report = report
        super().__init__(report["message"])


def create_error_report(error, stage, context=None, response=None):
    if isinstance(error, ReportedError):
        report = dict(error.report)
        report["context"] = {**(context or {}), **report.get("context", {})}
        if response is not None and "response" not in report:
            report["response"] = response
        return redact(report)
    stack = "".join(traceback.format_exception(error))
    if error.__traceback__ is None:
        stack = "".join(traceback.format_stack()[:-1]) + stack
    report = {
        "version": 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stage": stage,
        "message": str(error) or type(error).__name__,
        "name": type(error).__name__,
        "stack": stack,
    }
    if context:
        report["context"] = context
    if response is not None:
        report["response"] = response
    return redact(report)


@contextmanager
def error_stage(stage, context=None):
    try:
        yield
    except Exception as error:
        raise ReportedError(create_error_report(error, stage, context)) from error


def report_directory():
    base = (
        Path(sys.executable).resolve().parent
        if getattr(sys, "frozen", False)
        else Path(__file__).resolve().parents[1]
    )
    return base / "error-reports"


def save_error_report(report, path=None, directory=None):
    """Saving failure is part of the report; it never replaces the original error."""
    report = redact(report)
    if path is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        path = Path(directory or report_directory()) / f"error-{stamp}-{uuid.uuid4().hex[:8]}.json"
    path = Path(path).resolve()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        report.setdefault("context", {})["reportPath"] = str(path)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError as error:
        report.setdefault("context", {})["reportSaveError"] = redact_text(str(error))
    return report
