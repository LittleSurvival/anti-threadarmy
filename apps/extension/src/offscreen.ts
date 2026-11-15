import type { ThreadsTarget, AccountResult } from "@anti-threadarmy/threads-client";
import { createErrorReport, errorWithReport } from "@anti-threadarmy/threads-client";

async function lookup(target: ThreadsTarget): Promise<AccountResult> {
  const frame = document.createElement("iframe");
  if (!("credentialless" in frame))
    throw new Error("請更新 Chrome 後再試，這個版本不支援隔離查詢。");
  frame.credentialless = true;
  frame.sandbox.add("allow-scripts", "allow-same-origin");
  const requestId = crypto.randomUUID();
  let receive: (event: MessageEvent) => void;
  let timeout: ReturnType<typeof setTimeout>;
  // Messages from offscreen documents keep the worker alive while the site loads.
  const heartbeat = setInterval(() => {
    void chrome.runtime.sendMessage({ type: "lookup-keepalive" }).catch(() => {});
  }, 20_000);
  try {
    return await new Promise<AccountResult>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Threads 查詢逾時，請稍後再試。")), 100_000);
      receive = (event) => {
        if (
          event.source !== frame.contentWindow ||
          event.origin !== "https://www.threads.com" ||
          event.data?.type !== "anti-threadarmy:query-result" ||
          event.data.requestId !== requestId
        )
          return;
        if (event.data.ok && event.data.result) resolve(event.data.result);
        else
          reject(
            errorWithReport(
              event.data.error || "Threads 無法完成查詢，請稍後重試。",
              event.data.report,
            ),
          );
      };
      window.addEventListener("message", receive);
      frame.addEventListener(
        "load",
        () => {
          frame.contentWindow?.postMessage(
            { type: "anti-threadarmy:query", requestId, target },
            "https://www.threads.com",
          );
        },
        { once: true },
      );
      frame.src = "https://www.threads.com/reset_password";
      document.body.append(frame);
    });
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout!);
    window.removeEventListener("message", receive!);
    frame.remove();
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL("background.js") ||
    message?.type !== "isolated-lookup"
  )
    return;
  lookup(message.target).then(
    (result) => respond({ ok: true, result }),
    (error) =>
      respond({
        ok: false,
        error: error.message,
        report: createErrorReport(error, {
          stage: "isolated-frame",
          context: { target: message.target },
        }),
      }),
  );
  return true;
});
