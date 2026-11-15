// Keep this function self-contained: mobile also embeds it in its query page.
export function createErrorReport(error, details = {}) {
  const previous = error?.report;
  const sensitive =
    /^(?:cookie|set-cookie|authorization|proxy-authorization|password|passwd|access_token|refresh_token|token|csrf_token|csrftoken|x-csrftoken|lsd|x-fb-lsd|sessionid|x-web-session-id|__s|fb_dtsg|jazoest|cipher|cuid)$/i;
  function clean(value, key = "") {
    if (sensitive.test(key)) return "[REDACTED]";
    if (Array.isArray(value)) return value.map((item) => clean(item));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
    if (typeof value !== "string") return value;
    return value
      .replace(
        /("(?:cookie|set-cookie|authorization|password|access_token|refresh_token|token|csrftoken|csrf_token|lsd|sessionid|__s|fb_dtsg|jazoest|cipher|cuid)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
        '$1"[REDACTED]"',
      )
      .replace(
        /((?:[?&]|\b)(?:access_token|refresh_token|token|csrftoken|lsd|sessionid|fb_dtsg|cipher|cuid)=)[^&\s"<>]+/gi,
        "$1[REDACTED]",
      )
      .replace(
        /((?:cookie|set-cookie|authorization|x-csrftoken|x-fb-lsd|x-web-session-id)\s*:\s*)[^\r\n]+/gi,
        "$1[REDACTED]",
      );
  }
  return clean({
    version: 1,
    timestamp: new Date().toISOString(),
    stage: "lookup",
    name: error?.name || "Error",
    message: error?.message || String(error || "查詢失敗，請稍後重試。"),
    ...(error?.stack ? { stack: error.stack } : {}),
    ...details,
    ...previous,
    context: { ...details.context, ...previous?.context },
  });
}

export function errorWithReport(message, report) {
  const error = new Error(message);
  if (report && typeof report === "object") error.report = report;
  error.report = createErrorReport(error);
  return error;
}
