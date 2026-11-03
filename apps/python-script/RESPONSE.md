# Threads 帳號搜尋：API 回應（Response）解讀指南（白話人話版）

這份文件說明當你呼叫 Threads 帳號搜尋 API（`CAAIGAccountSearchViewQuery`）後，伺服器回傳的 JSON 結果該怎麼看。


> [!CAUTION]
> **最重要的一件事：HTTP 200 不代表搜尋成功！**
> Meta 即使拒絕你的請求或報錯，HTTP 狀態碼通常也照樣給 `200 OK`。你必須深入檢查回傳的 JSON 內容，才能確認是成功找到帳號還是被伺服器拒絕。

---

## 成功回傳的 JSON 長怎樣？（範例）

成功時會拿到類似下面的資料（重要敏感資訊已替換為示意文字）：

```json
{
  "data": {
    "caa_ar_ig_account_search": {
      "search_type": "USERNAME",
      "feta_account_returned": true,
      "eligible_for_ar_code": false,
      "cipher": "<加密流程字串>",
      "redirect_uri": null,
      "recaptcha_required": false,
      "contact_points": [
        {
          "index": 0,
          "contact_point": "******1234",
          "title": "透過簡訊取得連結",
          "type": "PHONE"
        }
      ],
      "profiles": [
        {
          "name": "YOUR_THREADS_ID",
          "platform": "INSTAGRAM",
          "profile_pic_url": "https://..."
        }
      ],
      "notification_info": null,
      "error_content": null,
      "account_type_shown": "META",
      "allow_display": false,
      "cuid": "<不公開的用戶關聯碼>"
    }
  },
  "extensions": {
    "server_metadata": {
      "request_start_time_ms": 1700000000000,
      "time_at_flush_ms": 1700000000472
    },
    "is_final": true
  }
}
```

---

## 關鍵回傳欄位逐項白話說明

### 1. 核心業務結果：`data.caa_ar_ig_account_search`

| 欄位名稱 | 實際看到的值 | 白話白話說明 |
|---|---|---|
| `search_type` | `"USERNAME"` | 伺服器把你剛才輸入的字串當成「用戶名（ID）」來搜尋。 |
| `feta_account_returned` | `true` | 代表伺服器內部有找到對應的帳號資料。 |
| `eligible_for_ar_code` | `false` | 代表當前帳號不支援或不適用某種特定的恢復代碼流程（但別慌，下面還有簡訊驗證可用）。 |
| `cipher` | 一大串長字串 | **流程加密密文**。這是 Meta 給的下一步驗證上下文，如果要做下一步，必須原封不動帶給下一個 API，不要試圖去解密或竄改它。 |
| `recaptcha_required` | `false` | **是否觸發機器人驗證碼**。如果是 `false` 代表過關；如果是 `true` 代表被風控了，需要解驗證碼。 |
| `contact_points` | 陣列清單 | **找回密碼的驗證管道**。例如裡面會放遮罩後的手機號碼（`******1234`）與方式說明（「透過簡訊取得連結」）。 |
| `profiles` | 陣列清單 | **找到的帳號清單**。會列出對應的平台（如 `INSTAGRAM`）、用戶名稱以及大頭貼網址。 |
| `error_content` | `null` | 業務錯誤訊息。如果沒有錯誤就是 `null`；如果有錯會包含錯誤原因。 |
| `redirect_uri` | `null` | 是否需要轉跳到外部網址。通常是 `null`。 |

### 2. 聯絡方式清單：`contact_points[]`

每個項目代表使用者可以透過什麼方式拿回帳號：
- `contact_point`: 已經打馬賽克遮罩的電話或 Email（例如 `******1234`），保護隱私。
- `title`: 顯示在網頁按鈕上的文字（例如「透過簡訊取得連結」）。
- `type`: 類型代碼（例如 `PHONE` 代表手機簡訊，`EMAIL` 代表電子郵件）。

### 3. 帳號清單：`profiles[]`

- `name`: 帳號名稱（例如 `YOUR_THREADS_ID`）。
- `platform`: 來源平台標籤（例如 `INSTAGRAM`）。因為 Threads 帳號底層就是綁定 Instagram，所以回傳 Instagram 標記是完全正常的。
- `profile_pic_url`: 大頭貼圖片連結。

---

## 被伺服器拒絕時長怎樣？（Meta 錯誤回應）

如果你用純 Python 發送，或者參數過期，Meta 會回傳這種錯誤 JSON（同樣是 HTTP 200）：

```json
{
  "__ar": 1,
  "error": 1357054,
  "errorSummary": "無法處理你的請求",
  "errorDescription": "處理這個請求時發生問題，我們正盡快修復。",
  "isNotCritical": 1,
  "payload": null
}
```

### 白話解讀：
- `error: 1357054`：這是 Meta 非常通用的風控／請求無效代碼。它**不代表**帳號不存在，而是伺服器認為這個請求「不安全或不合法」（例如缺少瀏覽器指紋、TLS 特徵不對、Token 已經失效等）。
- `errorSummary` / `errorDescription`：雖然寫「我們正盡快修復」，但這只是客套官方話，不是伺服器壞了，而是它把你的請求擋下來了。
- `payload: null`：表示沒有取得任何資料。

---

## 如何在程式中精準判斷「搜尋到底成不成功」？

請照以下步驟依序檢查：

1. **第一關（HTTP 狀態）**：確認 HTTP 狀態碼是不是 `200`（如果不是 200，直接判定連線或伺服器錯誤）。
2. **第二關（頂層錯誤檢查）**：
   - 檢查 JSON 頂層有沒有 `error`（例如 `error: 1357054`）。如果有，代表被 Meta 攔截。
   - 檢查頂層有沒有 `errors`（標準 GraphQL 錯誤）。如果有，代表查詢語法或參數有錯。
3. **第三關（資料物件存在）**：
   - 檢查 `data` 與 `data.caa_ar_ig_account_search` 是否存在且不是 `null`。
4. **第四關（業務邏輯確認）**：
   - 確認 `error_content` 是不是 `null`。
   - 確認 `recaptcha_required` 是不是 `false`（如果是 `true` 代表被要求輸入驗證碼）。
   - 查看 `profiles` 裡有沒有包含你要搜尋的帳號名稱。

只要通過以上 4 關，就證明**成功找到了該帳號**！
