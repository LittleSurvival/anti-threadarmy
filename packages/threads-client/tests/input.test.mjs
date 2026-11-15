import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { parseThreadsInput, resolveThreadsInput } from "../input.js";

test("IDs and profile/post/reply URLs select only their path author", () => {
  for (const input of [
    " example_user ",
    "@example_user",
    "https://www.threads.com/@example_user",
    "https://threads.com/@example_user/post/Example_123?xmt=example",
    "https://www.threads.net/@example_user/post/Reply-123/#other_author",
  ]) {
    assert.deepEqual(parseThreadsInput(input), { username: "example_user" });
  }
});
test("share URLs normalize host and discard tracking parameters", () => {
  assert.deepEqual(
    parseThreadsInput("https://threads.net/share/ExampleShare?xmt=example#fragment"),
    { shareUrl: "https://www.threads.com/share/ExampleShare" },
  );
});
test("reject unsafe origins, credentials, paths, malformed and oversized inputs", () => {
  for (const input of [
    null,
    {},
    "",
    "invalid/id",
    "x".repeat(2049),
    "http://www.threads.com/@example_user",
    "https://www.threads.com.evil.test/@example_user",
    "https://evil.test/?url=https://www.threads.com/@example_user",
    "https://user@www.threads.com/@example_user",
    "https://www.threads.com:8080/@example_user",
    "https://www.threads.com/@example_user/unknown",
    "https://www.threads.com/share/",
    "https://www.threads.com/@example_user/post/",
    "https://www.threads.com/@bad%2Fname",
    "https://www.threads.com/@example_\nuser",
  ])
    assert.throws(() => parseThreadsInput(input));
});

function resolver(response, fail = false) {
  let calls = 0,
    cleared = false;
  const run = vm.runInNewContext("(" + resolveThreadsInput.toString() + ")", {
    location: { origin: "https://www.threads.com" },
    URL,
    AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {
      cleared = true;
    },
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, "https://www.threads.com/share/ExampleShare");
      assert.equal(options.method, "HEAD");
      assert.equal(options.mode, "same-origin");
      assert.equal(options.credentials, "omit");
      if (fail) throw fail;
      return response;
    },
  });
  return { run, calls: () => calls, cleared: () => cleared };
}
const target = { shareUrl: "https://www.threads.com/share/ExampleShare" };
test("resolved redirect supplies the post author without reading body", async () => {
  const r = resolver({
    ok: true,
    url: "https://www.threads.com/@example_user/post/ExamplePost?xmt=ignored",
  });
  assert.equal(await r.run(target), "example_user");
  assert.equal(r.calls(), 1);
  assert.equal(r.cleared(), true);
});
test("direct IDs need no resolution request", async () => {
  const r = resolver();
  assert.equal(await r.run({ username: "example_user" }), "example_user");
  assert.equal(r.calls(), 0);
});
test("no guess from login, missing links, external destinations, or non-post paths", async () => {
  for (const response of [
    { ok: false, url: "https://www.threads.com/@example_user/post/Example" },
    { ok: true, url: "https://www.threads.com/login" },
    { ok: true, url: target.shareUrl },
    { ok: true, url: "https://evil.test/@example_user/post/Example" },
    { ok: true, url: "https://www.threads.com/@example_user" },
  ]) {
    const r = resolver(response);
    await assert.rejects(r.run(target), /無法解析/);
    assert.equal(r.cleared(), true);
  }
});
test("network and timeout failures stay explicit and release timer", async () => {
  for (const [error, message] of [
    [new Error("network"), /無法解析/],
    [{ name: "AbortError" }, /逾時/],
  ]) {
    const r = resolver(null, error);
    await assert.rejects(r.run(target), message);
    assert.equal(r.cleared(), true);
  }
});
