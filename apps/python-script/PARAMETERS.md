# Threads `/api/graphql`：Header 與 Payload 參數對照（白話人話版）

這份文件記錄了 Threads「忘記密碼（找回帳號）」API（操作名稱：`CAAIGAccountSearchViewQuery`）的所有請求標頭（Header）與主體參數（Payload）。

> [!TIP]
> **一句話核心觀念**：
> **千萬不要把抓包看到的參數直接寫死在程式裡！**
> Meta 的請求包含大量動態驗證碼、Session ID 與瀏覽器狀態，必須在每次發送前，透過瀏覽器動態抓取最新的一整套參數。

成功與失敗回應的 JSON 結構說明見 [RESPONSE.md](RESPONSE.md)。

---

## 參數是怎麼拿到的？（6 步取得流程）

1. **啟動全新 Chrome**：用 Playwright 開啟一個獨立的無痕 Chrome 瀏覽器（不使用你平常的 Chrome 設定檔，完全乾淨、未登入）。
2. **打開忘記密碼頁**：連到 `https://www.threads.com/reset_password`，等待帳號輸入框出現。（這時 Meta 伺服器就已經把基礎 Cookie 發給瀏覽器了）。
3. **抓取 Cookie**：透過 Playwright 的 Cookie API 抓取 Cookie。
   - *白話提醒*：關鍵的設備辨識碼 `ig_did` 被設為 `HttpOnly`，一般網頁 JavaScript（`document.cookie`）讀不到，必須從瀏覽器底層 API 拿。
4. **撈取動態參數**：直接在該頁面執行 Meta 內建的 JS 函數（例如 `getAsyncParams('POST')`）與設定模組，把當下生成的 Token、模組載入狀態一次撈出來。
   - *白話提醒*：這個 JS 函數只是用來「計算與整理參數」，並不會真的把請求發出去，放心呼叫。
5. **保持頁面一致**：必須直接使用「忘記密碼頁」當下讀到的 LSD Token、Session ID 和路由名稱，不要拿首頁或舊請求的值混在一起。
6. **送出查詢**：
   - 預設模式：只抓出這組新鮮參數顯示給你看，不送出查詢。
   - `--send` 模式：由 Python 整理好參數，直接在同一個無痕 Chrome 頁面內用 `fetch()` 發送請求（這樣最能模擬真實使用者，不會被 Meta 防爬蟲機制擋下）。

---

## Header：HTTP 基本標頭

這些是標準的 HTTP 標頭，負責告訴伺服器你要去哪裡、怎麼傳輸。

| Header | 白話意思 | 怎麼取得 | 該怎麼填／注意事項 |
|---|---|---|---|
| `:authority` | HTTP/2 目標主機 | 從 URL 得出 | `www.threads.com`（HTTP 庫會自動處理，不用手動寫進 headers 字典） |
| `:method` | 請求方法 | 呼叫端指定 | 固定為 `POST` |
| `:path` | 請求路徑 | 從 URL 得出 | `/api/graphql`（HTTP 庫自動處理） |
| `:scheme` | 通訊協定 | 從 URL 得出 | `https`（HTTP 庫自動處理） |
| `accept` | 告訴伺服器我可以接收什麼格式 | 標準設定 | 填 `*/*` 即可（代表任何格式都接受） |
| `accept-encoding` | 支援的解壓縮格式 | 客戶端能力 | 瀏覽器發送時 Chrome 會自動填；若用 Python 發送，千萬不要宣稱支援 `br, zstd` 卻沒解壓，會得到一堆亂碼 |
| `accept-language` | 瀏覽器語言偏好 | 瀏覽器語系 | 填 `zh-TW`（繁體中文）即可，不用硬抄英文範例 |
| `content-length` | 表單資料的字節長度 | 自動計算 | 依據最終打包後的資料自動計算。換了帳號或 Token 長度就會變，**絕對不能寫死固定數字** |
| `content-type` | 表單格式 | 標準設定 | 固定為 `application/x-www-form-urlencoded`（標準網頁表單編碼） |
| `cookie` | 傳送給網站的身分識別 | 從瀏覽器獲取 | 把瀏覽器拿到的所有 Cookie 串接起來帶上 |
| `origin` | 請求發起的網站來源 | 當前網站 | 固定填 `https://www.threads.com`（後面不能加網址路徑） |
| `referer` | 來自哪一個頁面 | 當前頁面 URL | 填 `https://www.threads.com/reset_password` |
| `priority` | 瀏覽器排程優先權標籤 | 瀏覽器特徵 | Python 發送時直接省略即可，不影響功能 |
| `user-agent` | 瀏覽器身分名稱（UA） | 當前瀏覽器 | 必須跟發起請求的 Chrome 一模一樣，不要拿網路上過期的 Chrome 版本硬抄 |

### Cookie 裡有哪些重要東西？

| Cookie 名稱 | 白話用途 | 怎麼填／注意事項 |
|---|---|---|
| `csrftoken` | 跨站請求防護 Token | 瀏覽器開啟頁面時由 Threads 自動配發。後續 Header 裡的 `x-csrftoken` 必須跟它**完全一致**。 |
| `ig_did` | 設備／瀏覽器識別碼 | Meta 辨識這台設備用的 UUID。直接使用伺服器發的值，不要自己隨機亂生成。因為是 `HttpOnly`，必須透過 Playwright API 取得。 |
| `mid`（有時出現） | Meta 追蹤識別 Cookie | 有出現就順便帶上，沒出現也不用硬偽造。 |

---

## Header：瀏覽器指紋與安全標頭（Client Hints & Fetch Metadata）

現代 Chrome 會自動帶上這些標頭，向伺服器證明「我真的是一個真實的 Chrome 瀏覽器」。

| Header | 白話意思 | 怎麼填 |
|---|---|---|
| `sec-ch-prefers-color-scheme` | 使用者是否偏好深色模式 | 瀏覽器自己產生（如 `dark`），一般查詢不影響，照實帶即可 |
| `sec-ch-ua` | 瀏覽器品牌與大版本號 | 真實 Chrome 自動產生，不要自己瞎編 |
| `sec-ch-ua-full-version-list` | 瀏覽器的完整版本號碼清單 | 由真實 Chrome 產生 |
| `sec-ch-ua-mobile` | 是不是手機瀏覽器 | 電腦版通常填 `?0`（Structured Field 格式，不是字串 false） |
| `sec-ch-ua-model` | 手機設備型號 | 電腦版通常是空字串 `""` |
| `sec-ch-ua-platform` | 作業系統名稱 | 例如 `"Windows"` |
| `sec-ch-ua-platform-version` | 作業系統內部版本 | 瀏覽器自己產生的內部版本號（不要硬猜） |
| `sec-fetch-dest` | 請求目的地類型 | AJAX／fetch 請求固定填 `empty`（表示不是要抓整頁網頁或圖片） |
| `sec-fetch-mode` | 跨來源請求模式 | 固定為 `cors` |
| `sec-fetch-site` | 請求目標與當前網頁的關係 | 固定為 `same-origin`（因為是在 Threads 站內發請求給 Threads API） |

> [!NOTE]
> **為什麼用純 Python（urllib）容易失敗？**
> 純 Python 發送時通常缺少這整套「瀏覽器真實特徵」，Meta 伺服器一看就知道是機器人爬蟲，因而直接拒絕（報錯 `1357054`）。所以最佳做法是讓 Chrome 瀏覽器自己發 `fetch()`。

---

## Header：Meta／Threads 專屬自訂標頭

這些是 Meta 為了前端架構自己發明的專屬 Header：

| Header | 白話意思 | 怎麼取得 | 該怎麼填／注意事項 |
|---|---|---|---|
| `x-asbd-id` | Meta 內部前端功能配置 ID | 從頁面 JS 模組讀取 | 目前固定為 `359341`，隨前端版本讀取，不要當成永久不變 |
| `x-csrftoken` | 前端提交的 CSRF 防護碼 | 從 Cookie 取出 | **必須跟 Cookie 裡的 `csrftoken` 一模一樣** |
| `x-fb-friendly-name` | 這支 GraphQL 查詢的英文名稱 | 前端查詢模組 | 固定填 `CAAIGAccountSearchViewQuery` |
| `x-fb-lsd` | Meta 頁面臨時安全 Token（LSD） | 從頁面 JS 模組讀取 | **必須跟 Payload 裡的 `lsd` 一模一樣**；頁面重整時會更新 |
| `x-ig-app-id` | Threads 網頁版的官方 App ID | 前端設定讀取 | 目前固定為 `238260118697367`（代表「我是 Threads 網頁」，不是你的用戶 ID） |
| `x-web-session-id` | 當前分頁與頁面的 Session ID | 前端模組讀取 | **必須跟 Payload 裡的 `__s` 一模一樣**，不要拿其他分頁的值 |

---

## Payload：基本識別與上下文參數

在 POST 請求的主體（Body）中，Meta 會夾帶大量當前環境的狀態資訊：

| 參數 | 白話意思 | 怎麼取得 | 該怎麼填 |
|---|---|---|---|
| `av` | 操作者身分 ID | 前端配置 | 我們處於未登入狀態，固定填 `0`（不是你要找的帳號） |
| `__user` | 當前登入的用戶 ID | 前端配置 | 未登入狀態固定填 `0` |
| `__a` | 告訴伺服器這是非同步請求 | 前端代碼自動帶入 | 固定填 `1` |
| `__req` | 本地請求計數序號（36 進位） | 每次請求遞增 | 每次呼叫加 1（例如 `1, 2... 9, a...`），不是固定填 4 |
| `__hs` | 網站當前編譯版本的 Session 碼 | 頁面配置 | 從當次頁面抓取，不要自己拼湊字串 |
| `dpr` | 螢幕像素比例 | 頁面配置 | 從頁面讀取（一般是 `1`） |
| `__ccg` | 伺服器評估的網路連線品質 | 頁面配置 | 例如 `EXCELLENT`（直接用抓到的值） |
| `__rev` | 前端發布版本號（Build Revision） | 頁面配置 | 例如 `1052601591`，Meta 更新網站時這個數字就會跳 |
| `__s` | 前端 Session ID（分頁+頁面代碼） | 前端函數 | 與 Header 的 `x-web-session-id` 必須相同 |
| `__hsi` | Haste Session ID | 頁面配置 | 從當次頁面讀取的大整數字串 |
| `__comet_req` | Comet 前端架構代號 | 頁面配置 | 目前桌面版為 `122`（不要跨環境隨便改） |
| `__crn` | 當前頁面的內部路由代稱 | 頁面自動帶入 | 代表「未登入找回帳號頁面」的專用路由字串 |

### Payload：資源載入狀態（__dyn, __csr, __hsdp 等）

很多人看到這一堆像是亂碼的字串會被嚇到，其實用一句話就能解釋：

> [!IMPORTANT]
> **白話人話**：
> 這些欄位是瀏覽器在向伺服器**打卡報備**：「報告後端，我這個網頁目前已經下載並載入了哪些 JS 模組檔案」。
> 它們**不是**密碼學簽名，也不是隨機字串。我們只需要在開啟頁面時，呼叫網頁內建的 `getAsyncParams('POST')` 函式，瀏覽器就會幫我們自動打包好，直接帶上即可。千萬不要自己在 Python 裡重寫算法去算它！

---

## Payload：驗證 Token 與版本

| 參數 | 白話意思 | 怎麼取得與算法 | 該怎麼填 |
|---|---|---|---|
| `lsd` | Meta 頁面臨時驗證 Token | 從頁面 JS 讀取 | 與 Header 的 `x-fb-lsd` 保持完全一致 |
| `jazoest` | 由 Token 算出來的數字防護碼 | 依照公式計算 | **公式超簡單**：開頭固定是 `"2"`，後面接上「LSD Token 裡所有字元的 ASCII 編碼總和」。<br>例如 LSD 字元加總為 2417，那 `jazoest` 就是 `22417`。換了 LSD 就要重新算一次，不能用舊的！ |
| `__spin_r` | 部署版本號 | 頁面配置 | 與 `__rev` 一致，直接讀取頁面值 |
| `__spin_b` | 部署代碼分支 | 頁面配置 | 目前固定為 `trunk`（主分支） |
| `__spin_t` | 伺服器下發的時間戳 | 頁面配置 | 使用伺服器給的值，**不要**自己拿 Python 的 `time.time()` 覆蓋 |

---

## Payload：GraphQL 查詢與業務欄位

| 參數 | 白話意思 | 怎麼取得 | 該怎麼填 |
|---|---|---|---|
| `fb_api_caller_class` | 呼叫端的內部網路層名稱 | 固定架構名 | 固定填 `RelayModern` |
| `fb_api_req_friendly_name` | 這次查詢的操作名稱 | 查詢定義 | 固定填 `CAAIGAccountSearchViewQuery` |
| `server_timestamps` | 是否需要伺服器時間標記 | 固定設定 | 填字串 `"true"`（注意不要寫成 Python 大寫的 `True`） |
| `variables` | GraphQL 的輸入參數字典 | JSON 字串 | 先轉成 JSON 字串，再進行標準 URL 編碼 |
| `doc_id` | Meta 伺服器預先註冊的查詢編號 | 從前端 JS 模組抓取 | 例如 `28619491897672626`。Meta 把寫好的查詢編號註冊在後端，我們直接用這個 ID 呼叫，不用傳一大串 GraphQL 語法 |
| `qpl_active_flow_ids` | 前端效能監控的流程 ID | 前端函數 | 直接用網頁產生的值，例如 `516759801` |
| `fb_api_analytics_tags` | 分析統計標籤 | 前端函數 | 例如 `["qpl_active_flow_ids=516759801"]` |
| `__jssesw` | 錯誤追蹤採樣權重 | 前端配置 | 網頁有給就帶上，沒給就不填 |

---

## `variables.params` 業務參數（真正放搜尋目標的地方）

這部分包在 `variables` 裡面的 `params` 物件中：

| 參數 | 白話意思 | 該填什麼值 |
|---|---|---|
| `account_recovery_entry_point` | 從哪裡點進忘記密碼頁面 | 直接訪問網址時填 `null` 即可 |
| `event_request_id` | 這次查詢操作的專屬 UUID | 每次送出前用 `str(uuid.uuid4())` 新生一個 UUID |
| `is_threads` | 是否為 Threads 流程 | 固定填 `true` |
| `next_uri` | 找回密碼後下一步跳轉網址 | 直接進網頁時填空字串 `""` |
| `search_query` | **你要搜尋的目標！** | 填你要查詢的 Threads / IG 帳號名稱、手機或 Email（例如 `"YOUR_THREADS_ID"`） |
| `waterfall_id` | 找回密碼整個流程的追蹤 UUID | 一次完整的找回流程使用同一個 UUID（用 `str(uuid.uuid4())` 生成） |

---

## 哪些會變？哪些可以固定？（超實用總整理）

### 1. 每次開啟網頁都要重新抓取（絕對不能寫死）
- Cookie（`csrftoken`, `ig_did`）
- `lsd` 以及跟著它算出來的 `jazoest`
- Session ID（`__s`, `x-web-session-id`, `__hsi`）
- 各種資源打卡清單（`__dyn`, `__csr`, `__hsdp` 等）

### 2. 每次送出請求都要重新產生
- `__req`（遞增序號）
- `event_request_id`（每次操作全新的 UUID）

### 3. 網站改版時才會變動（直接從頁面配置讀取）
- `doc_id`（GraphQL 查詢 ID）
- 前端版本號（`__rev`, `__spin_r`）
- 官方 App ID（`x-ig-app-id`）與 ASBD ID（`x-asbd-id`）

### 4. 幾乎永久固定
- 網址：`https://www.threads.com/api/graphql`
- HTTP 方法：`POST`
- Content-Type：`application/x-www-form-urlencoded`
- 操作名稱：`CAAIGAccountSearchViewQuery`
- `av` 和 `__user`：未登入時固定為 `0`

### 必須維持「完全一樣」的孿生參數對照表

```text
Cookie 中的 csrftoken   ==  Header 的 X-CSRFToken
Payload 中的 lsd        ==  Header 的 X-FB-LSD
Payload 中的 __s        ==  Header 的 X-Web-Session-ID
Payload 中的 doc_id     ==  前端模組查到的 params.id
當次的 lsd 加總計算      ==  Payload 中的 jazoest
```

---
