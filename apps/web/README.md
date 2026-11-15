# 網頁版

需要 Node.js 22.13+、pnpm 11.25.0 和 Google Chrome。可用 `npm install -g pnpm@11.25.0` 安裝 pnpm。

在專案根目錄執行，再開啟 [127.0.0.1:3000](http://127.0.0.1:3000)。

```powershell
pnpm install --frozen-lockfile
pnpm dev:web
```

在輸入框填入 Threads ID，或貼上個人頁、貼文、回覆或分享連結。

失敗時點「查看錯誤報告」，可在彈出視窗查看、複製或下載 JSON。報告包含時間、錯誤階段、堆疊與實際 HTTP 狀態、headers 和 response body，Cookie 與權杖欄位會遮蔽。未收到 HTTP 回應時，報告記錄可取得的例外資訊。

## 正式建置

安裝依賴後，在專案根目錄執行以下命令。若開發伺服器仍在執行，先按 Ctrl+C 停止。

```powershell
pnpm --filter @anti-threadarmy/web build
pnpm --filter @anti-threadarmy/web start
```
