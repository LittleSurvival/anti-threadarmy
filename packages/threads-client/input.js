// Parsing is local. Share links are resolved only in the isolated Threads page.
export function parseThreadsInput(input) {
  const invalid = () => {
    throw new Error("請輸入有效的 Threads ID 或 Threads 連結。");
  };
  if (typeof input !== "string" || input.length > 2048) return invalid();
  const value = input.trim();
  if (/\s/.test(value)) return invalid();
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(value)) return { username: value.replace(/^@/, "") };
  let url;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (
    url.protocol !== "https:" ||
    !["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    return invalid();
  const author = url.pathname.match(/^\/@([A-Za-z0-9._]{1,30})(?:\/post\/[A-Za-z0-9_-]+)?\/?$/);
  if (author) return { username: author[1] };
  if (/^\/share\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))
    return { shareUrl: "https://www.threads.com" + url.pathname };
  return invalid();
}

export async function resolveThreadsInput(target) {
  // Self-contained for Playwright, MV3 MAIN-world injection and native WebViews.
  if (typeof target?.username === "string" && /^[A-Za-z0-9._]{1,30}$/.test(target.username))
    return target.username;
  if (
    location.origin !== "https://www.threads.com" ||
    typeof target?.shareUrl !== "string" ||
    !/^https:\/\/www\.threads\.com\/share\/[A-Za-z0-9_-]+\/?$/.test(target.shareUrl)
  )
    throw new Error("Threads 連結無效。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let received;
  try {
    // same-origin rejects off-site redirects; HEAD avoids downloading post content.
    const response = await fetch(target.shareUrl, {
      method: "HEAD",
      mode: "same-origin",
      credentials: "omit",
      signal: controller.signal,
    });
    received = {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers?.entries() ?? []),
    };
    const url = new URL(response.url);
    const author = url.pathname.match(/^\/@([A-Za-z0-9._]{1,30})\/post\/[A-Za-z0-9_-]+\/?$/);
    if (!response.ok || url.origin !== "https://www.threads.com" || !author)
      throw new Error("unresolved");
    return author[1];
  } catch (error) {
    const failure = new Error(
      error.name === "AbortError"
        ? "Threads 分享連結解析逾時，請稍後再試。"
        : "Threads 分享連結無法解析，請確認連結有效或改貼完整貼文連結。",
    );
    failure.report = {
      version: 1,
      timestamp: new Date().toISOString(),
      stage: "resolve-input",
      name: error.name,
      message: failure.message,
      stack: error.stack,
      context: { input: target.shareUrl, method: "HEAD", cause: error.message },
      ...(received ? { response: received } : {}),
    };
    throw failure;
  } finally {
    clearTimeout(timeout);
  }
}
