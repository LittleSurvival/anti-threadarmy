// Offline extension checks; the Threads host resolves only to the local fixture server.
import assert from "node:assert/strict";
import { startIsolatedThreadsFixture } from "./isolation-fixture.mjs";
import {
  exampleContacts,
  verifyContactDetails,
} from "../../../packages/ui/tests/browser-fixtures.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(new URL("../../web/package.json", import.meta.url))(
  "playwright",
);
const executablePath = process.env.CHROMIUM_PATH;
const temporaryRoot = fileURLToPath(new URL("../../../.tmp", import.meta.url));
await mkdir(temporaryRoot, { recursive: true });
const profile = await mkdtemp(join(temporaryRoot, "anti-threadarmy-extension-"));
const extension = fileURLToPath(new URL("../dist", import.meta.url));
const fixtureServer = await startIsolatedThreadsFixture(profile, exampleContacts);
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    `--host-resolver-rules=MAP www.threads.com 127.0.0.1:${fixtureServer.port}, MAP * ~NOTFOUND, EXCLUDE localhost`,
    "--ignore-certificate-errors",
    "--no-proxy-server",
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const fixture = fixtureServer.state;
  await context.addCookies([
    { name: "sessionid", value: "fixture-normal-login", url: "https://www.threads.com" },
    { name: "csrftoken", value: "fixture-normal-csrf", url: "https://www.threads.com" },
  ]);
  const storage = await context.newPage();
  await storage.goto("https://www.threads.com/storage-fixture");
  await storage.evaluate(() => localStorage.setItem("regular", "normal-profile"));
  const originalPages = context.pages().length;
  const verifyIsolationCleanup = async () => {
    assert.deepEqual(fixture.errors, []);
    assert.equal(context.pages().length, originalPages);
    assert.deepEqual(
      await worker.evaluate(() =>
        chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }),
      ),
      [],
    );
    assert.deepEqual(
      await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()),
      [],
    );
    // CDP lists cookies from opaque credentialless partitions too; inspect the normal page itself.
    await storage.reload();
    const cookies = Object.fromEntries(
      (await storage.evaluate(() => document.cookie)).split("; ").map((value) => value.split("=")),
    );
    assert.equal(cookies.sessionid, "fixture-normal-login");
    assert.equal(cookies.csrftoken, "fixture-normal-csrf");
    assert.equal(cookies.guest_server, undefined);
    assert.deepEqual(
      await storage.evaluate(() => [
        localStorage.getItem("regular"),
        localStorage.getItem("guest_write"),
      ]),
      ["normal-profile", null],
    );
  };
  const extensionManifest = await worker.evaluate(() => chrome.runtime.getManifest());
  const popup = extensionManifest.action.default_popup;
  assert.equal(popup, "index.html");
  assert.equal(extensionManifest.action.default_icon["32"], "icons/icon-32.png");
  assert.equal(extensionManifest.icons["128"], "icons/icon-128.png");
  await page.setViewportSize({ width: 135, height: 165 });
  await page.goto(`chrome-extension://${id}/${popup}`);
  const toolbarInput = page.getByRole("textbox", { name: "Threads ID 或連結" });
  assert.ok((await toolbarInput.boundingBox()).width >= 220);
  assert.equal(await page.locator("body").evaluate((body) => body.clientWidth), 380);
  await page.setViewportSize({ width: 380, height: 600 });
  // A rebuilt UI can still talk to the previous worker until the extension is reloaded.
  await page.evaluate(() => {
    chrome.runtime.sendMessage = async () => ({
      ok: true,
      publicTarget: { username: "example_user" },
    });
  });
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("example_user");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page
    .getByText("查詢結果不完整。請重新載入擴充套件，再重新整理 Threads 分頁後重試。", {
      exact: true,
    })
    .waitFor({ timeout: 3000 });
  await page.reload();
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("example_user");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByRole("heading", { name: "範例帳號", exact: true }).waitFor({ timeout: 15000 });
  await verifyContactDetails(page);
  await verifyIsolationCleanup();
  assert.equal(fixture.queries, 1);
  await page
    .getByRole("textbox", { name: "Threads ID 或連結" })
    .fill("https://www.threads.com/share/ExampleShare");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByRole("button", { name: "查詢帳號", exact: true }).waitFor();
  await page.getByRole("heading", { name: "範例帳號", exact: true }).waitFor();
  assert.equal(fixture.queries, 2);
  assert.equal(fixture.lastUsername, "example_user");
  await verifyIsolationCleanup();
  fixture.fail = true;
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("failed_example");
  await page.getByRole("button", { name: "查詢帳號", exact: true }).click();
  await page.getByText("Threads 暫時無法回應，請稍後重試。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "查看錯誤報告" }).click();
  const errorDialog = page.getByRole("dialog", { name: "錯誤報告" });
  await errorDialog.waitFor();
  const report = JSON.parse(await errorDialog.locator("pre").innerText());
  assert.equal(report.stage, "graphql-request");
  assert.equal(report.response.status, 503);
  assert.match(report.response.body, /Fixture upstream unavailable/);
  assert.doesNotMatch(
    JSON.stringify(report),
    /fixture-recovery-secret|fixture-anonymous|fixture-lsd/,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    errorDialog.getByRole("button", { name: "下載 JSON" }).click(),
  ]);
  let exported = "";
  for await (const chunk of await download.createReadStream()) exported += chunk;
  assert.deepEqual(JSON.parse(exported), report);
  await errorDialog.getByRole("button", { name: "關閉錯誤報告" }).click();
  await errorDialog.waitFor({ state: "hidden" });
  await verifyIsolationCleanup();
  fixture.fail = false;
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).fill("popup_example");
  await page.getByRole("textbox", { name: "Threads ID 或連結" }).press("Enter");
  await page.getByText("@popup_example", { exact: true }).first().waitFor();
  assert.equal(await page.getByText(/允許在無痕模式/).count(), 0);
  await verifyContactDetails(page);
  await verifyIsolationCleanup();
  const threads = await context.newPage();
  threads.setDefaultTimeout(8000);
  await threads.route("https://www.threads.com/extension-fixture", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body>
  <article data-pressable-container data-interactive-id="post">
    <header><a href="/@parent_example/post/ParentPost"><time>1h</time></a>
    <button aria-label="貼文選單" aria-haspopup="menu" aria-expanded="false">⋯</button></header>
    <article data-pressable-container data-interactive-id="reply">
      <header><a href="/@reply_example/post/ReplyPost"><time>1m</time></a>
      <button aria-label="回覆選單" aria-haspopup="menu" aria-expanded="false">⋯</button></header>
      <a href="/@mention_example">提及帳號</a>
      <article><a href="/@quoted_example/post/QuotedPost"><time>5h</time></a></article>
    </article>
  </article>
  <article data-pressable-container data-interactive-id="other-post">
    <header><a href="/@other_example/post/OtherPost"><time>2h</time></a>
    <button aria-label="別人貼文選單" aria-haspopup="menu" aria-expanded="false">⋯</button></header>
  </article>
  <article data-pressable-container data-interactive-id="unresolved-post">
    <button aria-label="無作者貼文選單" aria-haspopup="menu" aria-expanded="false">⋯</button>
  </article>
  <header><h1>範例個人檔案</h1><button aria-label="個人檔案選單" aria-haspopup="menu" aria-expanded="false">⋯</button></header>
  <div data-pressable-container data-interactive-id="profile-header">
    <div role="button" tabindex="0" aria-label="個人檔案更多選單"><svg aria-label="更多" width="24" height="24"><circle cx="12" cy="12" r="10" /></svg></div>
  </div>
  <div id="reused-profile-menu" role="menu" hidden>
    <div data-menu-panel style="background:#242424;color:white;width:242px;border-radius:16px">
      <div><div role="button" tabindex="0">複製連結</div></div>
      <div><div role="button" tabindex="0">關於此個人檔案</div></div>
      <div><div role="button" tabindex="0">新增到動態消息</div></div>
      <div role="separator" style="height:1px;background:#383838;margin:8px 0"></div>
      <div><div role="button" tabindex="0">封鎖</div></div>
      <div><div role="button" tabindex="0">檢舉</div></div>
    </div>
  </div>
  <button aria-label="網站選單" aria-haspopup="menu" aria-expanded="false">⋯</button>
  <script>
    const reusedProfileMenu = document.getElementById('reused-profile-menu');
    const profileMore = document.querySelector('[aria-label="個人檔案更多選單"]');
    function toggleProfileMenu() {
      document.querySelectorAll('[role=menu]').forEach(menu => { if (menu !== reusedProfileMenu) menu.remove(); });
      reusedProfileMenu.hidden = !reusedProfileMenu.hidden;
    }
    // Profile controls can open on pointerdown without either ARIA state attribute.
    profileMore.addEventListener('pointerdown', toggleProfileMenu);
    profileMore.addEventListener('keydown', event => { if (event.key === 'Enter') toggleProfileMenu(); });
    reusedProfileMenu.addEventListener('keydown', event => { if (event.key === 'Escape') reusedProfileMenu.hidden = true; });
    for (const trigger of document.querySelectorAll('[aria-haspopup=menu]')) {
      trigger.onclick = () => {
        const open = trigger.getAttribute('aria-expanded') === 'true';
        document.querySelectorAll('[role=menu]').forEach(menu => { if (menu !== reusedProfileMenu) menu.remove(); });
        reusedProfileMenu.hidden = true;
        for (const other of document.querySelectorAll('[aria-haspopup=menu]')) other.setAttribute('aria-expanded', 'false');
        if (open) return;
        trigger.setAttribute('aria-expanded', 'true');
        const menu = document.createElement('div');
        menu.setAttribute('role','menu');
        const item = label => '<div><button role="menuitem">' + label + '</button></div>';
        const copy = item('複製連結');
        const ai = item('萬事問 Meta AI');
        const embed = item('取得內嵌程式碼');
        const save = item('儲存');
        const feed = '<div><button role="button" aria-label="動態選單" aria-haspopup="menu">新增到動態消息</button></div>';
        const postOptions = '<div><button role="button" aria-label="貼文選項" aria-haspopup="menu">貼文選項</button></div>';
        const group = html => '<div role="group">' + html + '</div>';
        const panel = html => '<div data-menu-panel style="background:#242424;color:white;overflow:hidden;width:242px;border-radius:16px">' + html + '</div>';
        const divider = '<div role="separator" style="height:1px;background:#383838;margin:8px 0"></div>';
        const name = trigger.getAttribute('aria-label');
        menu.innerHTML = name === '貼文選單'
          ? panel(group(ai) + divider + group(item('洞察報告')) + divider + group(copy + embed) + divider +
            group(save + item('在個人檔案置頂') + item('典藏') + item('隱藏按讚數和分享次數') + postOptions) + divider + group(item('刪除')))
          : name === '回覆選單' || name === '別人貼文選單' || name === '無作者貼文選單'
          ? group(panel(ai + divider + copy + embed + divider + save + item('不感興趣') + divider + feed + divider +
            item('通知我') + item('噤聲') + item('限制') + item('取消追蹤') + item('檢舉')))
          : name === '個人檔案選單'
          ? panel(group(copy + item('關於此個人檔案') + feed) + divider + group(item('噤聲') + item('限制')) + divider + group(item('封鎖') + item('檢舉')))
          : panel(group(copy + feed));
        document.body.append(menu);
      };
    }
  </script></body></html>`,
    }),
  );
  await threads.goto("https://www.threads.com/extension-fixture");
  await threads.getByRole("button", { name: "網站選單" }).click();
  await threads.getByRole("menuitem", { name: "複製連結" }).waitFor();
  const menuAction = threads.getByRole("menuitem", { name: "查看帳號註冊資訊" });
  assert.equal(await menuAction.count(), 0);
  const postTrigger = threads.getByRole("button", { name: "貼文選單", exact: true });
  await postTrigger.click();
  await menuAction.waitFor();
  const verifyMenuPlacement = async (previous, next) => {
    assert.equal(await menuAction.count(), 1);
    const placement = await menuAction.evaluate((el) => {
      const panel = el.closest("[data-menu-panel]");
      const rows = [
        ...panel.querySelectorAll(
          'button, [role="menuitem"], [role="button"], [aria-haspopup="menu"]',
        ),
      ];
      const index = rows.indexOf(el);
      return {
        previous: rows[index - 1]?.innerText,
        next: rows[index + 1]?.innerText,
        dividerBelow: getComputedStyle(el, "::after").height,
        gapBelow: rows[index + 1].getBoundingClientRect().top - el.getBoundingClientRect().bottom,
      };
    });
    assert.equal(placement.previous, previous);
    assert.equal(placement.next, next);
    assert.equal(placement.dividerBelow, "1px");
    assert.ok(placement.gapBelow >= 8, "The divider must have space below the query row");
  };
  await verifyMenuPlacement("隱藏按讚數和分享次數", "貼文選項");
  const [publicCard] = await Promise.all([
    threads.waitForEvent("framenavigated", {
      predicate: (frame) => frame.url().startsWith("chrome-extension://" + id + "/"),
      timeout: 10000,
    }),
    menuAction.click(),
  ]);
  await verifyContactDetails(publicCard);
  await publicCard.getByText("@parent_example", { exact: true }).waitFor();
  await Promise.all([
    threads.waitForEvent("framedetached", {
      predicate: (frame) => frame === publicCard,
      timeout: 5000,
    }),
    publicCard.locator("body").press("Escape"),
  ]);

  await threads.getByRole("button", { name: "回覆選單" }).click();
  await menuAction.waitFor();
  await verifyMenuPlacement("不感興趣", "新增到動態消息");
  await menuAction.evaluate((element) => element.click());
  assert.equal(threads.frames().length, 1);
  const [card] = await Promise.all([
    threads.waitForEvent("framenavigated", {
      predicate: (frame) => frame.url().startsWith(`chrome-extension://${id}/`),
      timeout: 10000,
    }),
    menuAction.click(),
  ]);
  await card.getByText("@reply_example", { exact: true }).first().waitFor();
  await verifyContactDetails(card);
  assert.equal(await card.getByText("@quoted_example", { exact: true }).count(), 0);
  assert.equal(await threads.getByText("@reply_example", { exact: true }).count(), 0);
  await Promise.all([
    threads.waitForEvent("framedetached", { predicate: (frame) => frame === card, timeout: 5000 }),
    card.locator("body").press("Escape"),
  ]);

  // A profile's own menu uses the profile URL; posts on that page still use their author.
  await threads.evaluate(() => history.pushState(null, "", "/@profile_example"));
  await threads.getByRole("button", { name: "網站選單" }).click();
  await threads.getByRole("menuitem", { name: "複製連結" }).waitFor();
  assert.equal(await menuAction.count(), 0);
  await threads.getByRole("button", { name: "無作者貼文選單" }).click();
  await threads.getByRole("menuitem", { name: "不感興趣" }).waitFor();
  assert.equal(await menuAction.count(), 0);
  for (const [triggerName, username, previous, next] of [
    ["別人貼文選單", "other_example", "不感興趣", "新增到動態消息"],
    ["個人檔案選單", "profile_example", "關於此個人檔案", "新增到動態消息"],
  ]) {
    await threads.getByRole("button", { name: triggerName, exact: true }).click();
    await menuAction.waitFor();
    await verifyMenuPlacement(previous, next);
    const [resultCard] = await Promise.all([
      threads.waitForEvent("framenavigated", {
        predicate: (frame) => frame.url().startsWith(`chrome-extension://${id}/`),
        timeout: 10000,
      }),
      menuAction.click(),
    ]);
    await resultCard
      .getByText("@" + username, { exact: true })
      .first()
      .waitFor();
    assert.equal(fixture.lastUsername, username);
    await Promise.all([
      threads.waitForEvent("framedetached", {
        predicate: (frame) => frame === resultCard,
        timeout: 5000,
      }),
      resultCard.locator("body").press("Escape"),
    ]);
  }
  const profileMore = threads.getByRole("button", { name: "個人檔案更多選單", exact: true });
  for (const [username, role, keyboard] of [
    ["profile_example", "menu", false],
    ["second_profile", "dialog", true],
    ["third_profile", "presentation", false],
  ]) {
    await threads.evaluate(
      ({ username, role }) => {
        history.pushState(null, "", "/@" + username);
        const menu = document.getElementById("reused-profile-menu");
        menu.hidden = true;
        menu.setAttribute("role", role);
      },
      { username, role },
    );
    if (keyboard) await profileMore.press("Enter");
    else await profileMore.click();
    await menuAction.waitFor();
    await verifyMenuPlacement("關於此個人檔案", "新增到動態消息");
    // The site can keep the same popover node across closes and later opens.
    if (keyboard) await profileMore.press("Enter");
    else await profileMore.click();
    await menuAction.waitFor({ state: "hidden" });
    if (keyboard) await profileMore.press("Enter");
    else await profileMore.click();
    await menuAction.waitFor();
    await verifyMenuPlacement("關於此個人檔案", "新增到動態消息");
    const [profileCard] = await Promise.all([
      threads.waitForEvent("framenavigated", {
        predicate: (frame) => frame.url().startsWith(`chrome-extension://${id}/`),
        timeout: 10000,
      }),
      menuAction.click(),
    ]);
    await profileCard.getByText("@" + username, { exact: true }).waitFor();
    assert.equal(fixture.lastUsername, username);
    await Promise.all([
      threads.waitForEvent("framedetached", { predicate: (frame) => frame === profileCard }),
      profileCard.locator("body").press("Escape"),
    ]);
  }
  await context.addInitScript((extensionOrigin) => {
    if (location.origin !== extensionOrigin || window.parent === window) return;
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message) =>
      message.type === "lookup-post"
        ? Promise.resolve({ ok: true, publicTarget: { username: "example_user" } })
        : send(message);
  }, `chrome-extension://${id}`);
  await postTrigger.click();
  const [staleCard] = await Promise.all([
    threads.waitForEvent("framenavigated", {
      predicate: (frame) => frame.url().startsWith(`chrome-extension://${id}/`),
      timeout: 10000,
    }),
    menuAction.click(),
  ]);
  await staleCard
    .getByText("查詢結果不完整。請重新載入擴充套件，再重新整理 Threads 分頁後重試。", {
      exact: true,
    })
    .waitFor({ timeout: 3000 });
  assert.equal(await staleCard.getByText("查詢帳號中…", { exact: true }).count(), 0);
  await staleCard.getByRole("button", { name: "查看錯誤報告" }).click();
  const staleDialog = staleCard.getByRole("dialog", { name: "錯誤報告" });
  await staleDialog.waitFor();
  const staleReport = JSON.parse(await staleDialog.locator("pre").innerText());
  assert.equal(staleReport.stage, "extension-result");
  assert.equal(staleReport.context.response.publicTarget.username, "example_user");
  await staleDialog.press("Escape");
  await staleDialog.waitFor({ state: "hidden" });
  assert.equal(
    staleCard.isDetached(),
    false,
    "Escape closes only the error report, preserving the lookup card",
  );
  console.log(
    "Extension: isolation, cleanup, own/other/reply/profile menus, lower dividers, author selection, stale-worker errors PASS",
  );
} finally {
  await context.close();
  await fixtureServer.close();
  assert.equal(dirname(profile), temporaryRoot);
  await rm(profile, { recursive: true, force: true });
}
