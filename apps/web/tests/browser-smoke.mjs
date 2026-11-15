// Offline website checks using synthetic results.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  exampleContacts,
  maskedContacts,
  verifyContactDetails,
} from "../../../packages/ui/tests/browser-fixtures.mjs";
const executablePath = process.env.CHROMIUM_PATH;
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let requests = 0,
    fail = false,
    invalidJson = false,
    submitted,
    contacts = exampleContacts;
  await page.route("**/api/account", async (route) => {
    requests++;
    submitted = route.request().postDataJSON().username;
    if (invalidJson)
      return route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "<html>Fixture gateway error</html>",
      });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: fail ? 502 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        fail
          ? { error: "Threads 拒絕了這次查詢，請稍後重試。" }
          : {
              username: "example_user",
              profiles: [{ name: "範例帳號", platform: "INSTAGRAM", avatarUrl: null }],
              contacts,
              fetchedAt: "2026-01-01T00:00:00Z",
            },
      ),
    });
  });
  await page.goto(baseURL);
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("invalid/id");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByText("請輸入有效的 Threads ID 或 Threads 連結。", { exact: true }).waitFor();
  assert.equal(requests, 0);
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("@example_user");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByRole("heading", { name: "範例帳號", exact: true }).waitFor();
  assert.equal(await page.getByText("******0000", { exact: true }).count(), 1);
  assert.equal(requests, 1);
  await verifyContactDetails(page);
  contacts = maskedContacts;
  await page
    .getByRole("textbox", { name: "Threads ID 或連結" })
    .fill("https://threads.net/@example_user/post/ExamplePost?xmt=example");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByRole("heading", { name: "範例帳號", exact: true }).waitFor();
  assert.equal(submitted, "example_user");
  await page.locator('[aria-label="聯絡資訊"]').getByText("未知", { exact: true }).waitFor();
  await page
    .locator('[aria-label="聯絡資訊"]')
    .getByText("Gmail（gmail.com）", { exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Threads ID 或連結" })
    .fill("https://www.threads.com/share/ExampleShare?xmt=example");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByRole("heading", { name: "範例帳號", exact: true }).waitFor();
  assert.equal(submitted, "https://www.threads.com/share/ExampleShare");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  fail = true;
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("another_example");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByText("Threads 拒絕了這次查詢，請稍後重試。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "範例帳號", exact: true }).count(), 0);
  await page.getByRole("button", { name: "查看錯誤報告" }).click();
  const dialog = page.getByRole("dialog", { name: "錯誤報告" });
  await dialog.waitFor();
  const report = JSON.parse(await dialog.locator("pre").innerText());
  assert.equal(report.response.status, 502);
  assert.match(report.response.body, /Threads 拒絕/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await dialog.getByRole("button", { name: "關閉錯誤報告" }).click();
  invalidJson = true;
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByText("查詢服務回傳了無法辨識的內容。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "查看錯誤報告" }).click();
  const invalidReport = JSON.parse(await dialog.locator("pre").innerText());
  assert.equal(invalidReport.response.body, "<html>Fixture gateway error</html>");
  await dialog.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  console.log(
    "Web: invalid ID, full post and share input, fixture success, stale result removal, upstream error, 390px layout PASS",
  );
} finally {
  await browser.close();
}
