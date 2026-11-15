# Chrome 擴充套件

## 安裝與使用

1. 到 GitHub 的 **Releases** 下載檔名結尾為 `-chrome.zip` 的檔案並解壓縮。
2. 在 Chrome 開啟 `chrome://extensions`，打開「開發人員模式」。
3. 點「載入未封裝項目」，選擇解壓後含有 `manifest.json` 的資料夾。
4. 重新整理已開啟的 Threads 分頁。

## 查詢帳號

- **在 Threads 頁面**，點貼文、回覆或個人檔案的「⋯」，選「查看帳號註冊資訊」。入口位於「新增到動態消息」上方；自己的貼文則位於「貼文選項」上方，下方均有分隔線。圖卡會顯示在原分頁。
- **從 Chrome 工具列**，點白色 @ 圖示。若工具列找不到，先點拼圖圖示並釘選 anti-threadarmy。輸入 Threads ID 或貼上 Threads 連結，再按 Enter 或右側箭頭，圖卡會顯示在輸入框下方。

需要 Chrome 116 以上。一般視窗就能查詢名稱、ID、頭像，以及 Threads 有提供的遮罩聯絡方式，不需允許無痕模式。查詢在隱藏的背景文件內執行，不會新增視窗或分頁，也不會登出目前的 Threads 帳號。

每次查詢使用 `credentialless iframe` 的獨立暫時 Cookie 與網站儲存空間，完成或失敗後關閉整份背景文件。只有擴充套件背景文件載入的 Threads 查詢頁會套用暫時的請求規則：調整頁面類型、移除禁止嵌入的 `X-Frame-Options`；一般分頁與網站的 CSP 不變。遇到驗證或上游拒絕時會顯示錯誤。

查詢失敗時可點「查看錯誤報告」，在彈出視窗查看時間、錯誤階段、問題、堆疊與實際 HTTP response，也可複製或下載 JSON。Cookie、登入與復原權杖欄位會遮蔽；尚未收到 response 的錯誤會明確標示。更新本機建置後，請在 `chrome://extensions` 重新載入擴充套件，再重新整理 Threads 分頁。

## 從原始碼建置

需要 Node.js 22.13+ 和 pnpm 11.25.0。可用 `npm install -g pnpm@11.25.0` 安裝 pnpm。

在專案根目錄執行以下命令。建置完成後，可以直接在 Chrome 載入 `apps/extension/dist`。

```powershell
pnpm install --frozen-lockfile
pnpm --filter @anti-threadarmy/extension build
```

`pnpm test` 執行查詢與背景程序測試。`pnpm test:browser` 需先啟動網頁版，並安裝 Playwright Chromium 與 OpenSSL；Windows 預設使用 Git 隨附的 OpenSSL，也可用 `OPENSSL_PATH` 指定。擴充套件整合測試會把 Threads 網域導向本機 HTTPS 測試服務，只使用合成資料。

## 打包成 ZIP

建置完成後，在同一個目錄執行：

```powershell
Compress-Archive -Path 'apps/extension/dist/*' -DestinationPath 'apps/extension/anti-threadarmy-chrome.zip' -Force
```

分享 `apps/extension/anti-threadarmy-chrome.zip`。解壓縮後，依上方步驟載入含有 `manifest.json` 的資料夾。
