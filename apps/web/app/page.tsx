"use client";
import { SearchApp } from "@anti-threadarmy/ui";
import type { AccountResult } from "@anti-threadarmy/threads-client";
async function search(username: string): Promise<AccountResult> {
  const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "查詢失敗，請稍後重試。");
  return body;
}
export default function Home() { return <SearchApp search={search} />; }
