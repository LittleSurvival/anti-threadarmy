import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccountCard, LookupError, SearchApp } from "@anti-threadarmy/ui";
import "@anti-threadarmy/ui/styles.css";
import "./popup.css";
import {
  createErrorReport,
  errorWithReport,
  type AccountResult,
  type ErrorReport,
} from "@anti-threadarmy/threads-client";

async function lookup(
  message: { type: "lookup"; username: string } | { type: "lookup-post"; ticket: string },
): Promise<AccountResult> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok)
    throw errorWithReport(
      response?.error || "查詢失敗，請稍後再試。",
      response?.report ??
        createErrorReport(new Error(response?.error || "查詢失敗，請稍後再試。"), {
          stage: "extension-message",
          context: { response },
        }),
    );
  const result = response.result;
  if (
    !result ||
    typeof result.username !== "string" ||
    !Array.isArray(result.profiles) ||
    !result.profiles.length ||
    !Array.isArray(result.contacts)
  ) {
    const error = new Error("查詢結果不完整。請重新載入擴充套件，再重新整理 Threads 分頁後重試。");
    throw errorWithReport(
      error.message,
      createErrorReport(error, { stage: "extension-result", context: { response } }),
    );
  }
  return result;
}

function PostLookup({ ticket }: { ticket: string }) {
  const [result, setResult] = useState<AccountResult | null>(null);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ErrorReport>();
  useEffect(() => {
    if (!ticket) return;
    void lookup({ type: "lookup-post", ticket }).then(setResult, (error) => {
      setError(error.message);
      setReport(createErrorReport(error));
    });
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]"))
        window.parent.postMessage("anti-threadarmy:close", "https://www.threads.com");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [ticket]);

  if (!ticket) return <LookupError error="請從貼文的三點選單開啟查詢。" />;
  if (error) return <LookupError error={error} report={report} />;
  if (result) return <AccountCard result={result} />;
  return (
    <div className="post-status" role="status">
      <span className="spinner" />
      查詢帳號中…
    </div>
  );
}

const embedded = window.parent !== window;
document.body.classList.add(embedded ? "extension-card" : "extension-popup");
const ticket = new URLSearchParams(location.hash.slice(1)).get("post-lookup") ?? "";
createRoot(document.getElementById("root")!).render(
  embedded ? (
    <PostLookup ticket={ticket} />
  ) : (
    <SearchApp search={(username) => lookup({ type: "lookup", username })} autoFocus />
  ),
);
