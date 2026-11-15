# Android 自動更新規劃

App 啟動時會檢查 GitHub Releases。有新版時，畫面會顯示版本與「下載更新」按鈕。使用者按下後可看到下載進度，下載完成並驗證通過後，由 Android 顯示安裝確認。成功覆蓋安裝會保留本地封鎖名單。

## 設定與操作

更新檔存放在私人 GitHub repo。使用者須有 repo 讀取權限，並在 App 的「更新設定」填入限定此 repo、權限為 **Contents: Read** 的 GitHub 存取權杖。權杖儲存在手機上，可在設定中替換或清除。

設定後，App 每 24 小時至多在啟動時自動檢查一次。「檢查更新」可隨時手動執行。權杖失效或權限不足時，畫面會引導重新設定。若 Android 首次安裝要求授權，依系統指示開啟權限，再回 App 繼續安裝。

## 版本判定與檔案驗證

每個 GitHub Release 會一併上傳簽署 APK 與 `android-update.json`。更新檔包含版本名稱 `versionName`、Android 版本編號 `versionCode`、APK 檔名 `apk`、SHA-256 `sha256`。

App 讀取最新穩定版，只有遠端 `versionCode` 較高才提示。下載必須使用同一個 Release 的 APK。交給系統安裝前，App 會檢查檔案的 SHA-256、套件名稱、版本和簽章。若下載取消或驗證失敗，App 會清除暫存檔。

手機端的權杖以 Android Keystore 保護。GitHub API 請求會附上權杖，資產重新導向至其他主機時則以無權杖的請求下載。[GitHub Release 資產下載](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)
