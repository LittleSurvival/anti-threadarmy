import { queryThreads } from "@anti-threadarmy/threads-client";
import type { AccountResult } from "@anti-threadarmy/threads-client";
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({url:chrome.runtime.getURL("index.html")}); });
let running = false;
async function search(username: string): Promise<AccountResult> {
  if (typeof username !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new Error("請輸入有效的 Threads ID。");
  if (!await chrome.extension.isAllowedIncognitoAccess()) throw new Error("請先在擴充套件詳細資料開啟「允許在無痕模式中執行」，再重新查詢。");
  let windowId: number | undefined;
  try {
    const window = await chrome.windows.create({url:"https://www.threads.com/reset_password",incognito:true,focused:false,state:"minimized"});
    windowId = window?.id;
    const tabId = window?.tabs?.[0]?.id;
    if (tabId === undefined) throw new Error("無法開啟無痕查詢視窗。");
    const deadline = Date.now() + 30000;
    while ((await chrome.tabs.get(tabId)).status !== "complete") {
      if (Date.now() > deadline) throw new Error("Threads 頁面載入逾時。");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const results = await chrome.scripting.executeScript({target:{tabId},world:"MAIN",func:queryThreads,args:[username]});
    if (!results[0]?.result) throw new Error("Threads 無法完成查詢，請稍後重試。");
    return results[0].result;
  } finally {
    if (windowId !== undefined) await chrome.windows.remove(windowId).catch(() => {});
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "lookup" || sender.id !== chrome.runtime.id) return;
  if (running) { respond({ok:false,error:"目前有查詢正在進行，請稍後重試。"}); return; }
  running = true;
  search(message.username).then(result => respond({ok:true,result}), error => respond({ok:false,error:error instanceof Error ? error.message : "查詢失敗。"})).finally(() => { running = false; });
  return true;
});
