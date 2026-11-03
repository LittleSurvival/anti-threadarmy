import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "anti-threadarmy", description: "輸入 Threads ID，查看帳號資料。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body><a className="skip-link" href="#main">跳至主要內容</a>{children}</body></html>;
}
