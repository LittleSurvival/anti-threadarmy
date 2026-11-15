# 發布新版本

推送一個版本 tag 後，GitHub Actions 會建置 Chrome ZIP、Android 簽署 APK、Windows GUI EXE 和 Windows headless EXE。四個產物都建置成功後，會一起出現在 GitHub 的 **Releases**，並附有 `SHA256SUMS.txt` 校驗檔。GUI 可雙擊開啟；headless 版使用命令列，須加上 `--send` 才能送出查詢。

## 1. 更新版本

假設上一版是 `0.1.0`、`versionCode` 是 `1`，要發 `0.1.1` 時，專案根目錄的 [manifest.json](../manifest.json) 完整內容如下。

```json
{
  "id": "anti-threadarmy",
  "name": "anti-threadarmy",
  "version": "0.1.1",
  "versionCode": 2,
  "android": {
    "applicationId": "io.github.littlesurvival.antithreadarmy"
  }
}
```

平常發版只需改兩個欄位。

| 欄位          | 怎麼填                                       |
| ------------- | -------------------------------------------- |
| `version`     | 填這次的三段式版本，例如 `"0.1.1"`           |
| `versionCode` | 上一個已發行版本的編號加 1，填整數，例如 `2` |

沿用現有的 `id`、`name` 和 `android.applicationId`。Git tag 會由版本自動推導，`0.1.1` 對應 `v0.1.1`。

## 2. 推送 tag

先提交這次要發版的程式碼與版本設定，再從專案根目錄執行以下 PowerShell 命令。

```powershell
$version = (Get-Content manifest.json -Encoding UTF8 -Raw | ConvertFrom-Json).version
$tag = "v$version"
python .github/scripts/check-release.py $tag
if ($LASTEXITCODE -ne 0) { throw "版本檢查失敗" }
git tag -a $tag -m "Release $tag"
if ($LASTEXITCODE -ne 0) { throw "建立 tag 失敗" }
git push origin "refs/tags/$tag"
```

到 **Actions → Release** 查看建置結果。若只是 Secrets 設定錯誤，修正後可重跑失敗的 job。若要修正程式碼，請用新版本與新 tag 發布。

## Android 簽署設定

在 GitHub 的 **Settings → Secrets and variables → Actions** 查看下列 Repository Secrets。只有首次設定或從備份恢復時需要填寫。

| Secret                      | 填入的內容               |
| --------------------------- | ------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | 簽署金鑰檔的 Base64 文字 |
| `ANDROID_KEYSTORE_PASSWORD` | 金鑰庫密碼               |
| `ANDROID_KEY_ALIAS`         | 金鑰別名                 |
| `ANDROID_KEY_PASSWORD`      | 金鑰密碼                 |

可用 PowerShell 將金鑰檔轉成 Base64 並複製到剪貼簿。將路徑換成實際檔案。

```powershell
$keyFile = (Resolve-Path '.\release.keystore').Path
[Convert]::ToBase64String([IO.File]::ReadAllBytes($keyFile)) | Set-Clipboard
```

備份原始金鑰和密碼，並在每次發版沿用同一把金鑰，讓 Android 能覆蓋安裝新版。金鑰、Base64 文字和密碼應存放在安全的位置。[Android 簽署說明](https://developer.android.com/studio/publish/app-signing)
