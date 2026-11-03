import { chromium } from "playwright";
import { queryThreads } from "@anti-threadarmy/threads-client";
export const runtime = "nodejs";
export const maxDuration = 120;
let running = false;
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== request.headers.get("host")) return reply({ error: "僅接受本站的查詢。" }, 403);
  let username: string;
  try { username = (await request.json()).username; } catch { return reply({ error: "請輸入有效的 Threads ID。" }, 400); }
  if (typeof username !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(username)) return reply({ error: "請輸入有效的 Threads ID。" }, 400);
  if (running) return reply({ error: "目前有查詢正在進行，請稍後重試。" }, 429);
  running = true;
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ locale: "zh-TW" });
    const page = await context.newPage();
    await page.goto("https://www.threads.com/reset_password", { waitUntil: "domcontentloaded", timeout: 30000 });
    return reply(await page.evaluate(queryThreads, username));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const display = message.match(/(?:Error: )?((?:Threads |查詢環境|查詢逾時|未取得|這次沒有|無法載入)[^\n]*)/)?.[1];
    return reply({ error: display || "查詢未完成，請確認本機已安裝 Chrome，或稍後重試。" }, 502);
  } finally {
    try { await browser?.close(); } finally { running = false; }
  }
}
