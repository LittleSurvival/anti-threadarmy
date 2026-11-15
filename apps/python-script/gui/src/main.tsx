import { createRoot } from "react-dom/client";
import { SearchApp } from "@anti-threadarmy/ui";
import type { AccountResult } from "@anti-threadarmy/threads-client";
import { createErrorReport, errorWithReport } from "@anti-threadarmy/threads-client";
import "@anti-threadarmy/ui/styles.css";

// The token arrives in the fragment, never in HTTP requests or referrers.
const token = location.hash.slice(1) || sessionStorage.getItem("app-token") || "";
sessionStorage.setItem("app-token", token);
history.replaceState(null, "", "/");
async function search(username: string): Promise<AccountResult> {
  let response;
  try {
    response = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": token },
      body: JSON.stringify({ username }),
    });
  } catch (error) {
    throw errorWithReport(
      "無法連線到本機查詢服務。",
      createErrorReport(error, {
        stage: "gui-request",
        context: { input: username },
      }),
    );
  }
  const details = {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers),
    body: "",
  };
  let body;
  try {
    details.body = await response.text();
    body = JSON.parse(details.body);
  } catch (error) {
    throw errorWithReport(
      "本機查詢服務回傳了無法辨識的內容。",
      createErrorReport(error, {
        stage: "gui-response",
        context: { input: username },
        response: details,
      }),
    );
  }
  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    typeof body.username !== "string" ||
    !Array.isArray(body.profiles) ||
    body.profiles.length === 0 ||
    !Array.isArray(body.contacts)
  ) {
    const message =
      typeof body?.error === "string" ? body.error : "本機查詢服務沒有提供完整的帳號資料。";
    const report = body?.report;
    throw errorWithReport(
      message,
      report?.version === 1 &&
        typeof report.stage === "string" &&
        typeof report.message === "string"
        ? report
        : createErrorReport(new Error(message), {
            stage: "gui-response",
            context: { input: username },
            response: details,
          }),
    );
  }
  return body;
}

createRoot(document.getElementById("root")!).render(<SearchApp search={search} autoFocus />);
