import {
  createErrorReport,
  errorWithReport,
  parseThreadsInput,
} from "@anti-threadarmy/threads-client";
import type { AccountResult } from "@anti-threadarmy/threads-client";
let running = false;
const postRequests = new Map<number, { ticket: string; username: string; expiresAt: number }>();

chrome.tabs.onRemoved.addListener((tabId) => postRequests.delete(tabId));

async function search(input: string): Promise<{ result: AccountResult }> {
  const target = parseThreadsInput(input);
  // A new top-level offscreen document also gives credentialless a fresh partition.
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });
  if (existing.length) await chrome.offscreen.closeDocument();
  let created = false;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            // Threads otherwise serves a different page for an iframe navigation.
            requestHeaders: [
              {
                header: "sec-fetch-dest",
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: "document",
              },
            ],
            responseHeaders: [
              {
                header: "x-frame-options",
                operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
              },
            ],
          },
          condition: {
            urlFilter: "|https://www.threads.com/reset_password|",
            initiatorDomains: [chrome.runtime.id],
            tabIds: [chrome.tabs.TAB_ID_NONE],
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME],
          },
        },
      ],
    });
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: "在獨立的暫時儲存空間查詢 Threads，不使用一般分頁的登入狀態。",
    });
    created = true;
    const response = await chrome.runtime.sendMessage({ type: "isolated-lookup", target });
    if (!response?.ok || !response.result)
      throw errorWithReport(
        response?.error || "Threads 無法完成查詢，請稍後重試。",
        response?.report,
      );
    return { result: response.result };
  } finally {
    try {
      if (created) await chrome.offscreen.closeDocument();
    } finally {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const tabId = sender.tab?.id;
  let username: string;
  if (message?.type === "prepare-post-lookup") {
    if (
      tabId === undefined ||
      sender.frameId !== 0 ||
      !sender.url?.startsWith("https://www.threads.com/")
    )
      return;
    if (typeof message.username !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(message.username))
      return;
    for (const [id, entry] of postRequests) {
      if (entry.expiresAt < Date.now()) postRequests.delete(id);
    }
    const ticket = crypto.randomUUID();
    postRequests.set(tabId, { ticket, username: message.username, expiresAt: Date.now() + 30_000 });
    respond({ ticket });
    return;
  }
  if (message?.type === "lookup-post") {
    if (
      tabId === undefined ||
      !sender.frameId ||
      !sender.url?.startsWith(chrome.runtime.getURL("index.html"))
    )
      return;
    const entry = postRequests.get(tabId);
    if (!entry || entry.ticket !== message.ticket || entry.expiresAt < Date.now()) {
      respond({ ok: false, error: "請重新從貼文選單開啟查詢。" });
      return;
    }
    postRequests.delete(tabId);
    username = entry.username;
  } else if (message?.type === "lookup") {
    if (sender.url !== chrome.runtime.getURL("index.html") || (sender.frameId ?? 0) !== 0) return;
    username = message.username;
  } else return;

  if (running) {
    respond({ ok: false, error: "目前有查詢正在進行，請稍後重試。" });
    return;
  }
  running = true;
  search(username)
    .then(
      (value) => respond({ ok: true, ...value }),
      (error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "查詢失敗。",
          report: createErrorReport(error, {
            stage: "extension-background",
            context: { input: username },
          }),
        }),
    )
    .finally(() => {
      running = false;
    });
  return true;
});
