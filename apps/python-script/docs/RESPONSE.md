# 帳號查詢回應

HTTP 狀態碼只表示請求的傳輸結果。即使是 HTTP 200，JSON 內仍可能包含服務端錯誤或驗證要求。

## 如何判讀

1. 確認 HTTP 請求成功，且回應可解析為 JSON。
2. 檢查頂層的 `error` 或 `errors`。有錯誤時，使用回應的訊息說明查詢失敗。
3. 讀取 `data.caa_ar_ig_account_search`。有 `error_content` 或 `recaptcha_required` 為 `true` 時停止。
4. 檢查 `profiles` 是否有可顯示的資料。空陣列表示這次查詢未取得資料。

## 回應欄位

| 欄位                                                                          | 說明                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `search_type`                                                                 | 服務端採用的搜尋類型，例如 `USERNAME`                          |
| `profiles`                                                                    | 帳號資料。每筆可含 `name`、`platform` 和 `profile_pic_url`     |
| `contact_points`                                                              | 聯絡方式。每筆可含 `type`、`contact_point`、`title` 和 `index` |
| `error_content`                                                               | 查詢錯誤資訊，正常結果可為 `null`                              |
| `recaptcha_required`                                                          | 是否要求驗證                                                   |
| `feta_account_returned`、`account_type_shown`、`allow_display`                | 服務端回傳的帳號狀態與顯示標記                                 |
| `eligible_for_ar_code`、`cipher`、`cuid`、`redirect_uri`、`notification_info` | 帳號復原流程的相關欄位                                         |
| `extensions`                                                                  | 查詢結果以外的中繼資料，例如伺服器時間                         |

以下為精簡的虛構回應。

```json
{
  "data": {
    "caa_ar_ig_account_search": {
      "search_type": "USERNAME",
      "profiles": [
        {
          "name": "example_user",
          "platform": "INSTAGRAM",
          "profile_pic_url": "https://example.com/avatar.png"
        }
      ],
      "contact_points": [],
      "error_content": null,
      "recaptcha_required": false
    }
  }
}
```

若 JSON 頂層有 `error`，可搭配 `errorSummary` 或 `errorDescription` 判讀。單靠錯誤代碼無法確認服務端的拒絕原因或帳號是否存在。
