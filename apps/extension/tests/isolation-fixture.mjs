// All identities, cookies and responses here are synthetic; no live lookup.
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function startIsolatedThreadsFixture(directory, contacts) {
  const state = { pages: 0, queries: 0, fail: false, lastUsername: "", errors: [] };
  const key = join(directory, "fixture-key.pem"),
    cert = join(directory, "fixture-cert.pem");
  const openssl =
    process.env.OPENSSL_PATH ||
    (process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
  execFileSync(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=fixture.invalid",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  const server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (request, response) => {
      const reply = ({ status = 200, contentType = "text/plain", headers = {}, body = "" }) => {
        response.writeHead(status, { "content-type": contentType, ...headers });
        response.end(body);
      };
      try {
        const url = new URL(request.url, "https://www.threads.com");
        if (url.pathname === "/reset_password") {
          assert.equal(
            request.headers.cookie,
            undefined,
            "navigation must start without the normal profile cookies",
          );
          assert.equal(request.headers["sec-fetch-dest"], "document");
          state.pages++;
          return reply({
            contentType: "text/html; charset=utf-8",
            headers: {
              "x-frame-options": "DENY",
              "content-security-policy": "script-src 'unsafe-inline'",
              "set-cookie": "guest_server=fixture; Secure; SameSite=None; Path=/",
            },
            body: `<!doctype html><html><body><script>
     if (!window.credentialless || document.cookie.includes('sessionid=') || localStorage.getItem('regular') || localStorage.getItem('guest_write')) throw new Error('Session was not isolated');
     if (!document.cookie.includes('guest_server=fixture')) throw new Error('Guest response cookie was lost');
     document.cookie='csrftoken=fixture-anonymous; Secure; SameSite=None; Path=/';
     localStorage.setItem('guest_write','fixture');
     const modules={
      CurrentUserInitialData:{USER_ID:'0'},
      RelayAPIConfigDefaults:{actorID:'0',customHeaders:{'X-IG-App-ID':'fixture-app'}},
      'CAAIGAccountSearchViewQuery.graphql':{params:{name:'CAAIGAccountSearchViewQuery',operationKind:'query',id:'fixture-query'}},
      BDHeaderConfig:{ASBD_ID:'fixture-asbd'},
      getAsyncParams:()=>({lsd:'fixture-lsd',__s:'fixture-session',__user:'0'})
     };
     window.require=name=>modules[name];
    </script></body></html>`,
          });
        }
        if (url.pathname === "/api/graphql") {
          const cookies = request.headers.cookie || "";
          assert.match(cookies, /csrftoken=fixture-anonymous/);
          assert.match(cookies, /guest_server=fixture/);
          assert.doesNotMatch(cookies, /fixture-normal|sessionid=/);
          assert.equal(request.headers["x-csrftoken"], "fixture-anonymous");
          let body = "";
          for await (const chunk of request) body += chunk;
          const params = new URLSearchParams(body);
          assert.equal(params.get("fb_api_req_friendly_name"), "CAAIGAccountSearchViewQuery");
          state.lastUsername = JSON.parse(params.get("variables")).params.search_query;
          state.queries++;
          return reply({
            status: state.fail ? 503 : 200,
            contentType: "application/json",
            body: JSON.stringify(
              state.fail
                ? {
                    errors: [{ message: "Fixture upstream unavailable", code: 503 }],
                    cipher: "fixture-recovery-secret",
                  }
                : {
                    data: {
                      caa_ar_ig_account_search: {
                        profiles: [
                          { name: "範例帳號", platform: "INSTAGRAM", profile_pic_url: null },
                        ],
                        contact_points: contacts.map((c) => ({
                          type: c.type,
                          contact_point: c.value,
                        })),
                      },
                    },
                  },
            ),
          });
        }
        if (url.pathname === "/share/ExampleShare") {
          assert.equal(request.method, "HEAD");
          assert.equal(request.headers.cookie, undefined);
          return reply({
            status: 302,
            headers: { location: "https://www.threads.com/@example_user/post/ExamplePost" },
          });
        }
        if (url.pathname === "/@example_user/post/ExamplePost")
          return reply({ status: 200, body: "" });
        if (url.pathname === "/storage-fixture") {
          assert.match(request.headers.cookie, /sessionid=fixture-normal-login/);
          assert.match(request.headers.cookie, /csrftoken=fixture-normal-csrf/);
          assert.doesNotMatch(request.headers.cookie, /guest_server|fixture-anonymous/);
          return reply({ contentType: "text/html", body: "<!doctype html><title>Fixture</title>" });
        }
        return reply({ status: 404 });
      } catch (error) {
        state.errors.push(error);
        reply({ status: 500 });
      }
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    state,
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
