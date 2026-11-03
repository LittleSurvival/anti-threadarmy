import React from "react";
import { createRoot } from "react-dom/client";
import { SearchApp } from "@anti-threadarmy/ui";
import "@anti-threadarmy/ui/styles.css";
import type { AccountResult } from "@anti-threadarmy/threads-client";
async function search(username: string): Promise<AccountResult> {
  const response = await chrome.runtime.sendMessage({type:"lookup", username});
  if (!response?.ok) throw new Error(response?.error || "查詢失敗，請稍後再試。");
  return response.result;
}
createRoot(document.getElementById("root")!).render(<SearchApp search={search} />);
