# 架構與執行邊界

每個 App 在自身環境完成業務流程。Python 是已驗證過的協定參照，不是其他端的後端。

| App | 執行位置 | 瀏覽器環境 | 依賴其他 App |
| --- | --- | --- | --- |
| Web | Next.js Node route | 每次新建 headless Chrome context | 無 |
| Chrome Extension | 擴充套件 service worker | 最小化無痕視窗 + MAIN world script | 無 |
| Android | App 程序 | App 專屬 WebView | 無 |
| iOS | App 程序 | 非持久 WKWebView | 無 |
| Python CLI | Python 程序 | 原 Playwright headless Chrome | 無 |

## 共用範圍

- `packages/ui`：Web 與 Extension 的 React 畫面與樣式。
- `packages/threads-client`：純頁面 JavaScript 協定函式；查詢時才讀取目前頁面的 query artifact、LSD、CSRF、session、revision 等動態值。
- Mobile 的 `shared`：Compose UI、結果模型；Gradle 打包同一份頁面 JS，在 Android／iOS 的 WebView 執行。
- Python 維持獨立參照，不加入執行依賴。

HttpOnly Cookie（例如 ig_did）由各端瀏覽器的同源請求自動附帶，無需複製到 Node、Extension UI 或 Kotlin。CSRF header 使用當頁可讀 Cookie。只呼叫 account-search query，不實作後續發送復原訊息或更改帳號的 mutation。

## 回應與錯誤

HTTP 200 仍可能有頂層錯誤、業務錯誤或驗證要求，必須分別檢查。沒有 profiles 時呈現「沒有取得資料」，不能據此斷言帳號不存在。

只向 UI 回傳 username、profiles 的 name/platform/avatarUrl、已遮罩 contacts 與查詢時間。cipher、cuid、token 和原始回應不離開頁面查詢函式；不新增查詢歷史。尚未提供 biography、followers 等 API 沒有回傳的資訊。

## Extension 取捨

選擇 MV3，讓查詢與視窗清理留在背景 worker，不受 popup 關閉影響。使用完整頁面承載結果；不必同時啟動 Web。

content script 預設 isolated world，讀取頁面模組需要 MAIN world。此處用 `chrome.scripting.executeScript` 注入自包含的函式，不使用遠端載入程式碼或 eval。[Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)

無痕存取需要使用者在 Chrome 擴充套件設定開啟。無痕視窗共用無痕 Cookie store，因此每次在送出前驗證未登入；不自動清理使用者的 Chrome 無痕 Cookie。[Chrome incognito](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)

## 平台限制

- Web 需要 Node 與可執行 Chrome 的主機，目前為綁定 127.0.0.1 的本機工具；未完成公開多使用者部署。
- Android WebView 使用 App 的資料儲存，不使用 Chrome profile。[Android WebView](https://developer.android.com/reference/android/webkit/WebView)
- iOS 使用非持久 WKWebView；Windows 無法驗證 iOS 編譯與實際網站相容性。[Apple nonPersistent](https://developer.apple.com/documentation/webkit/wkwebsitedatastore/nonpersistent())
- 網站內部模組或 query schema 改變時可能失效；會回報錯誤，不回退到過期 token，也不繞過網站驗證。
