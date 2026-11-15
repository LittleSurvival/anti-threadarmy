# 帳號查詢請求欄位

這份文件是命令列工具的請求欄位索引。使用方式見 [命令列工具](../README.md)，結果判讀見 [帳號查詢回應](RESPONSE.md)。

## HTTP 標頭

| 欄位                             | 用途                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `:authority`、`:path`、`:scheme` | 由目標網址決定的 HTTP/2 路由資訊                          |
| `:method`                        | 請求方法                                                  |
| `accept`                         | 可接受的回應格式                                          |
| `accept-encoding`                | 客戶端支援的內容壓縮格式                                  |
| `accept-language`                | 語言偏好                                                  |
| `content-length`                 | 編碼後表單的位元組數                                      |
| `content-type`                   | 表單的編碼格式                                            |
| `cookie`                         | 瀏覽器的網站狀態，可能包含 `csrftoken`、`ig_did` 和 `mid` |
| `origin`、`referer`              | 請求的來源網站與頁面                                      |
| `priority`                       | 瀏覽器的請求優先度                                        |
| `user-agent`                     | 發出請求的客戶端資訊                                      |

### 瀏覽器產生的標頭

| 欄位                                                 | 用途                     |
| ---------------------------------------------------- | ------------------------ |
| `sec-ch-prefers-color-scheme`                        | 色彩主題偏好             |
| `sec-ch-ua`、`sec-ch-ua-full-version-list`           | 瀏覽器品牌與版本         |
| `sec-ch-ua-mobile`、`sec-ch-ua-model`                | 裝置類型與機型           |
| `sec-ch-ua-platform`、`sec-ch-ua-platform-version`   | 作業系統與版本           |
| `sec-fetch-dest`、`sec-fetch-mode`、`sec-fetch-site` | 請求用途、模式與來源關係 |

### Threads 自訂標頭

| 欄位                       | 用途                            |
| -------------------------- | ------------------------------- |
| `x-asbd-id`、`x-ig-app-id` | 網頁的設定與應用程式識別值      |
| `x-csrftoken`              | 與 `csrftoken` Cookie 對應的值  |
| `x-fb-friendly-name`       | GraphQL 操作名稱                |
| `x-fb-lsd`                 | 與表單的 `lsd` 對應的頁面值     |
| `x-web-session-id`         | 與表單的 `__s` 對應的工作階段值 |

## 表單欄位

| 欄位                                                        | 用途                                   |
| ----------------------------------------------------------- | -------------------------------------- |
| `av`、`__user`                                              | 操作者與登入狀態                       |
| `__a`、`__req`                                              | 非同步請求標記與請求計數               |
| `__hs`、`__hsi`、`__s`                                      | 頁面環境及工作階段資訊                 |
| `dpr`、`__ccg`                                              | 顯示比例與連線資訊                     |
| `__rev`、`__spin_r`、`__spin_b`、`__spin_t`                 | 前端版本與部署資訊                     |
| `__comet_req`、`__crn`                                      | 前端請求類型與頁面路由                 |
| `__dyn`、`__csr`、`__hsdp` 等                               | 頁面資源載入狀態                       |
| `lsd`、`jazoest`                                            | 頁面驗證資訊                           |
| `fb_api_caller_class`、`fb_api_req_friendly_name`、`doc_id` | 呼叫端、查詢名稱與查詢識別值           |
| `variables`                                                 | 以 JSON 表示的查詢輸入                 |
| `server_timestamps`                                         | 是否要求伺服器時間資訊                 |
| `qpl_active_flow_ids`、`fb_api_analytics_tags`、`__jssesw`  | 分析與追蹤資訊，視頁面所提供的內容而定 |

### 查詢輸入 `variables.params`

| 欄位                                       | 用途                                       |
| ------------------------------------------ | ------------------------------------------ |
| `search_query`                             | 使用者輸入或由 Threads 連結解析出的帳號 ID |
| `is_threads`                               | Threads 流程標記                           |
| `account_recovery_entry_point`、`next_uri` | 入口與後續導向資訊                         |
| `event_request_id`、`waterfall_id`         | 請求與流程識別值                           |

Cookie、工作階段識別值和頁面設定依每次執行而定。若使用命令列工具的 `--save-request`，輸出檔可能包含 Cookie 或權杖，請妥善保管。
