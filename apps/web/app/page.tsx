"use client";
import { SearchApp } from "@anti-threadarmy/ui";
import {
  createErrorReport,
  errorWithReport,
  type AccountResult,
} from "@anti-threadarmy/threads-client";
async function search(username: string): Promise<AccountResult> {
  const response = await fetch("/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const raw = await response.text();
  const received = {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    headers: { "content-type": response.headers.get("content-type") || "" },
    body: raw,
  };
  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    throw errorWithReport(
      "查詢服務回傳了無法辨識的內容。",
      createErrorReport(error, { stage: "api-response", response: received }),
    );
  }
  if (
    !response.ok ||
    !body ||
    typeof body.username !== "string" ||
    !Array.isArray(body.profiles) ||
    !body.profiles.length ||
    !Array.isArray(body.contacts)
  ) {
    const error = new Error(body?.error || "查詢結果不完整，請稍後重試。");
    throw errorWithReport(
      error.message,
      body?.report ?? createErrorReport(error, { stage: "api-response", response: received }),
    );
  }
  return body;
}
export default function Home() {
  return <SearchApp search={search} />;
}
