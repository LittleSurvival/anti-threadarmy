# Chrome Extension

Chrome Manifest V3 + React。工具列圖示開啟完整查詢頁，與 Web 共用相同的黑色介面，但在瀏覽器本機完成業務流程，不連線本機 Next.js 或 Python。

## 載入

1. 根目錄執行 `pnpm --filter @anti-threadarmy/extension build`。
2. Chrome 開啟 `chrome://extensions`，啟用開發人員模式，載入本目錄的 `dist`。
3. 進入擴充套件詳細資料，開啟「允許在無痕模式中執行」。
4. 點工具列圖示，輸入 Threads ID 並送出。

開發時根目錄執行 `pnpm dev:extension`，修改後在擴充套件頁按重新載入。

## 執行方式

背景 service worker 建立最小化無痕視窗，載入 `/reset_password`；透過 `chrome.scripting` 在 MAIN world 讀取當頁參數並送出一次 account-search。只傳回顯示欄位，完成或失敗後關閉自己建立的視窗。關閉查詢 UI 不會把清理工作綁在頁面生命週期內。

需要 `scripting` 與 `https://www.threads.com/*` 的主機權限，沒有 Cookie API 權限，也不讀取一般 Chrome profile。

Chrome 的無痕視窗彼此共用無痕 Cookie store；建立新視窗不代表建立獨立 store。因此若目前無痕環境已登入 Threads，查詢會停止，不會登出或清除使用者資料。請在未登入 Threads 的無痕環境使用。
