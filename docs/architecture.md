# 專案架構

各 App 可獨立執行查詢。以下是各端使用的執行環境。

| App             | 查詢環境                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| 網頁版          | Next.js 伺服器啟動獨立的 Chrome 工作階段                                 |
| Chrome 擴充套件 | 隱藏的 offscreen 文件內建立 credentialless iframe                        |
| Android         | App 專用的 WebView                                                       |
| iOS             | 不保留網站資料的 WKWebView                                               |
| Python GUI      | Chrome 應用程式視窗顯示共用介面；查詢另用獨立的 headless Chrome 工作階段 |
| 命令列工具      | Playwright 啟動獨立的 Chrome 工作階段                                    |

`packages/ui` 提供網頁版與擴充套件共用的介面。兩者與手機版共用 `packages/threads-client` 的連結解析與查詢程式。手機版在建置時將這些程式打包，由各平台的 WebView 執行。

Python GUI 也共用 `packages/ui`，由 Python 在 `127.0.0.1` 的隨機連接埠提供介面與查詢服務，以每次啟動產生的 token 驗證查詢請求。GUI 的 Chrome 應用程式視窗使用獨立暫存個人資料，關閉該工作階段所有視窗後停止服務並清理；headless 版透過命令列操作，兩版各自打包成 Windows EXE。

## 輸入與結果

各端接受 Threads ID、`@ID`、HTTPS 個人頁、貼文或回覆連結，以及 `/share/…` 短連結。完整網址使用路徑中的作者 ID，回覆請使用該則回覆的連結。短連結只接受 Threads 同源的轉址結果。解析失敗時停止查詢並顯示錯誤。

介面顯示帳號名稱、頭像、平台及已遮罩的聯絡資訊。伺服器回傳 HTTP 200 時仍須檢查內容是否有錯誤或驗證要求。若未取得帳號資料，介面會如實顯示結果。

失敗會附帶結構化錯誤報告，保留時間、階段、輸入、錯誤與堆疊，以及已取得的 HTTP 狀態、headers 和實際 response body。跨 WebView、Playwright 與 extension 訊息邊界時一併傳遞報告，避免只剩錯誤字串。GUI 提供報告彈窗與複製，網頁介面另可下載 JSON；Python 同時保存 JSON。Cookie、登入與復原權杖欄位會遮蔽。

## 本地資料

Android 與 iOS 的封鎖名單儲存在 App 內。匯出 JSON 時每筆只有 `id` 和 `name`，順序與自訂排序一致。匯入會驗證完整檔案，合併時去除 ID 前的 `@` 並忽略大小寫差異。

網頁版預設只監聽 `127.0.0.1`。Chrome 擴充套件需要 Chrome 116 以上，每次查詢建立獨立暫時儲存空間，不使用一般分頁的登入狀態；成功、失敗或逾時後關閉背景文件並移除暫時請求規則。一般視窗即可使用，不需開啟無痕模式。
