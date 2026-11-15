import { test } from "node:test";
import assert from "node:assert/strict";
let workerVersion = 0;
async function worker({ fail = false, createFail = false, stale = false, pending } = {}) {
  let listener,
    created = 0,
    closed = 0,
    queries = 0,
    rules = [];
  const result = {
    username: "example_user",
    profiles: [{ name: "Example", platform: "INSTAGRAM", avatarUrl: null }],
    contacts: [],
    fetchedAt: "2026-01-01",
  };
  const chrome = {
    runtime: {
      id: "test-extension",
      getURL: (p) => "chrome-extension://test-extension/" + p,
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getContexts: async () => (stale ? [{}] : []),
      onMessage: {
        addListener(fn) {
          listener = fn;
        },
      },
      sendMessage: async (message) => {
        assert.equal(message.type, "isolated-lookup");
        assert.ok(message.target.username === "example_user" || message.target.shareUrl);
        queries++;
        if (pending) await pending;
        return fail ? { ok: false, error: "test failure" } : { ok: true, result };
      },
    },
    tabs: { TAB_ID_NONE: -1, onRemoved: { addListener() {} } },
    offscreen: {
      Reason: { IFRAME_SCRIPTING: "IFRAME_SCRIPTING" },
      createDocument: async (options) => {
        assert.equal(options.url, "offscreen.html");
        assert.deepEqual(options.reasons, ["IFRAME_SCRIPTING"]);
        assert.equal(rules.length, 1);
        if (createFail) throw new Error("cannot create document");
        created++;
      },
      closeDocument: async () => {
        closed++;
      },
    },
    declarativeNetRequest: {
      RuleActionType: { MODIFY_HEADERS: "modifyHeaders" },
      HeaderOperation: { SET: "set", REMOVE: "remove" },
      ResourceType: { SUB_FRAME: "sub_frame" },
      updateSessionRules: async ({ removeRuleIds, addRules = [] }) => {
        rules = rules.filter((rule) => !removeRuleIds.includes(rule.id)).concat(addRules);
        for (const rule of addRules) {
          assert.deepEqual(rule.condition, {
            urlFilter: "|https://www.threads.com/reset_password|",
            initiatorDomains: [chrome.runtime.id],
            tabIds: [-1],
            resourceTypes: ["sub_frame"],
          });
          assert.deepEqual(rule.action.responseHeaders, [
            { header: "x-frame-options", operation: "remove" },
          ]);
          assert.deepEqual(rule.action.requestHeaders, [
            { header: "sec-fetch-dest", operation: "set", value: "document" },
          ]);
        }
      },
    },
  };
  globalThis.chrome = chrome;
  await import(new URL("../dist/background.js?test=" + workerVersion++, import.meta.url));
  const message = (data, sender = {}) =>
    new Promise((resolve) => listener(data, { id: chrome.runtime.id, ...sender }, resolve));
  return {
    lookup: (username = "example_user") =>
      message({ type: "lookup", username }, { url: chrome.runtime.getURL("index.html") }),
    message,
    counts: () => ({ created, closed, queries, rules: rules.length }),
  };
}

test("normal-window lookup needs no tabs, windows, scripting or incognito APIs", async () => {
  const w = await worker(),
    response = await w.lookup();
  assert.equal(response.ok, true);
  assert.equal(response.result.username, "example_user");
  assert.deepEqual(w.counts(), { created: 1, closed: 1, queries: 1, rules: 0 });
});
test("query failure closes the document and removes narrowly scoped rules", async () => {
  const w = await worker({ fail: true }),
    response = await w.lookup();
  assert.equal(response.ok, false);
  assert.equal(response.error, "test failure");
  assert.deepEqual(w.counts(), { created: 1, closed: 1, queries: 1, rules: 0 });
});
test("document creation failure still removes rules", async () => {
  const w = await worker({ createFail: true }),
    response = await w.lookup();
  assert.equal(response.ok, false);
  assert.deepEqual(w.counts(), { created: 0, closed: 0, queries: 0, rules: 0 });
});
test("a document left by a restarted worker is destroyed before the next lookup", async () => {
  const w = await worker({ stale: true });
  assert.equal((await w.lookup()).ok, true);
  assert.deepEqual(w.counts(), { created: 1, closed: 2, queries: 1, rules: 0 });
});
test("share target is passed to the isolated document", async () => {
  const w = await worker();
  assert.equal((await w.lookup("https://www.threads.com/share/ExampleShare")).ok, true);
  assert.deepEqual(w.counts(), { created: 1, closed: 1, queries: 1, rules: 0 });
});
test("external URLs are rejected before creating an environment", async () => {
  const w = await worker();
  assert.equal((await w.lookup("https://example.com/@example_user/post/Example")).ok, false);
  assert.deepEqual(w.counts(), { created: 0, closed: 0, queries: 0, rules: 0 });
});
test("overlapping lookups cannot share an anonymous session", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const w = await worker({ pending });
  const first = w.lookup();
  assert.equal((await w.lookup()).ok, false);
  release();
  assert.equal((await first).ok, true);
  assert.deepEqual(w.counts(), { created: 1, closed: 1, queries: 1, rules: 0 });
});
test("post lookup needs a one-use ticket from the same Threads tab", async () => {
  const w = await worker();
  const source = { tab: { id: 12 }, frameId: 0, url: "https://www.threads.com/" };
  const frame = {
    tab: { id: 12 },
    frameId: 1,
    url: "chrome-extension://test-extension/index.html",
  };
  const { ticket } = await w.message(
    { type: "prepare-post-lookup", username: "example_user" },
    source,
  );
  const lookup = { type: "lookup-post", ticket };
  assert.equal((await w.message(lookup, { ...frame, tab: { id: 13 } })).ok, false);
  assert.equal(w.counts().queries, 0);
  assert.equal((await w.message(lookup, frame)).ok, true);
  assert.equal((await w.message(lookup, frame)).ok, false);
  assert.equal(w.counts().queries, 1);
});
