import { chromium } from "playwright";
import {
  createErrorReport,
  errorWithReport,
  queryThreads,
  parseThreadsInput,
  resolveThreadsInput,
  type ThreadsTarget,
  type AccountResult,
  type ErrorReport,
} from "@anti-threadarmy/threads-client";
export const runtime = "nodejs";
export const maxDuration = 150;
let running = false;
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== request.headers.get("host"))
    return reply({ error: "僅接受本站的查詢。" }, 403);
  let target: ThreadsTarget;
  try {
    target = parseThreadsInput((await request.json()).username);
  } catch {
    return reply({ error: "請輸入有效的 Threads ID 或 Threads 連結。" }, 400);
  }
  if (running) return reply({ error: "目前有查詢正在進行，請稍後重試。" }, 429);
  running = true;
  let browser;
  let stage = "browser-launch";
  let navigation: import("playwright").Response | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ locale: "zh-TW" });
    const page = await context.newPage();
    stage = "page-navigation";
    navigation = await page.goto("https://www.threads.com/reset_password", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (navigation && !navigation.ok()) throw new Error("無法載入 Threads 查詢頁面。");
    stage = "resolve-input";
    // Playwright serializes Error.message only. Return an envelope to keep the report.
    const result = await page.evaluate<
      { ok: true; value: AccountResult } | { ok: false; error: string; report?: ErrorReport }
    >(`(async () => {
      try {
        const username = await (${resolveThreadsInput.toString()})(${JSON.stringify(target)});
        return { ok: true, value: await (${queryThreads.toString()})(username) };
      } catch (error) { return { ok: false, error: error.message, report: error.report }; }
    })()`);
    if (!result.ok) throw errorWithReport(result.error, result.report);
    return reply(result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const display = message.match(
      /(?:Error: )?((?:Threads |查詢環境|查詢逾時|未取得|這次沒有|無法載入)[^\n]*)/,
    )?.[1];
    const report = createErrorReport(error, { stage, context: { target } });
    if (!report.response && navigation) {
      report.response = {
        url: navigation.url(),
        status: navigation.status(),
        statusText: navigation.statusText(),
        headers: navigation.headers(),
      };
      try {
        report.response.body = await navigation.text();
      } catch (readError) {
        report.context = { ...report.context, responseReadError: String(readError) };
      }
    }
    return reply(
      {
        error: display || "查詢未完成，請確認本機已安裝 Chrome，或稍後重試。",
        report: createErrorReport({ report }),
      },
      502,
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      running = false;
    }
  }
}
