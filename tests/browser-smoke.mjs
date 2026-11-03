// Offline UI checks. Fixtures below are synthetic, never real account responses.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const {chromium} = createRequire(new URL("../apps/web/package.json", import.meta.url))("playwright");
const executablePath = process.env.CHROMIUM_PATH;
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const output = resolve("output/playwright");
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,...(executablePath ? {executablePath} : {})});
try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 let requests=0, fail=false;
 await page.route("**/api/account",async route=>{
  requests++;
  await new Promise(resolve=>setTimeout(resolve,150));
  await route.fulfill({status:fail ? 502 : 200,contentType:"application/json",body:JSON.stringify(fail ? {error:"Threads 拒絕了這次查詢，請稍後重試。"} : {username:"example_user",profiles:[{name:"範例帳號",platform:"INSTAGRAM",avatarUrl:null}],contacts:[{type:"PHONE",value:"******0000"}],fetchedAt:"2026-01-01T00:00:00Z"})});
 });
 await page.goto(baseURL);
 await page.getByRole("textbox",{name:"Threads ID"}).fill("invalid/id");
 await page.getByRole("button",{name:"查詢帳號",exact:true}).click();
 await page.getByText("請輸入 1–30 個英文字母、數字、底線或句點。",{exact:true}).waitFor();
 assert.equal(requests,0);
 await page.getByRole("textbox",{name:"Threads ID"}).fill("@example_user");
 await page.getByRole("button",{name:"查詢帳號",exact:true}).click();
 await page.getByRole("heading",{name:"範例帳號",exact:true}).waitFor();
 assert.equal(await page.getByText("******0000",{exact:true}).count(),1);
 assert.equal(requests,1);
 await page.screenshot({path:join(output,"web-success-fixture.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
 await page.screenshot({path:join(output,"web-mobile-fixture.png"),fullPage:true});
 fail=true;
 await page.getByRole("textbox",{name:"Threads ID"}).fill("another_example");
 await page.getByRole("button",{name:"查詢帳號",exact:true}).click();
 await page.getByText("Threads 拒絕了這次查詢，請稍後重試。",{exact:true}).waitFor();
 assert.equal(await page.getByRole("heading",{name:"範例帳號",exact:true}).count(),0);
 console.log("Web: invalid ID, fixture success, stale result removal, upstream error, 390px layout PASS");
} finally {await browser.close();}

const profile=await mkdtemp(join(tmpdir(),"anti-threadarmy-extension-"));
const extension=resolve("apps/extension/dist");
const context=await chromium.launchPersistentContext(profile,{
 headless:true,...(executablePath ? {executablePath} : {}),
 args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
});
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent("serviceworker",{timeout:15000});
 const id=new URL(worker.url()).host;
 const page=await context.newPage();
 await page.goto(`chrome-extension://${id}/index.html`);
 await page.getByRole("textbox",{name:"Threads ID"}).fill("example_user");
 await page.getByRole("button",{name:"查詢帳號",exact:true}).click();
 await page.getByText(/請先在擴充套件詳細資料開啟/).waitFor({timeout:10000});
 await page.screenshot({path:join(output,"extension-permission.png"),fullPage:true});
 assert.equal(context.pages().some(p=>p.url().includes("threads.com")),false);
 console.log("Extension: actual unpacked MV3 loaded, background message and incognito prerequisite PASS");
} finally {await context.close();}
console.log("Temporary isolated extension test profile: "+profile);
