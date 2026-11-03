# Mobile

Kotlin Multiplatform + Compose Multiplatform。Android 與 iOS 共用黑色輸入框、結果卡與錯誤狀態，各自使用平台 WebView 執行查詢，不需要啟動 Web 或 Python。

## Android

需要 JDK 21、Android SDK 36，設定 `ANDROID_HOME` 或本目錄 `local.properties` 的 `sdk.dir`。

```powershell
.\gradlew.bat :androidApp:assembleDebug
.\gradlew.bat :androidApp:installDebug
```

macOS / Linux 使用 `sh gradlew`。Android Studio 可直接開啟本目錄，選擇 `androidApp`。application ID 為 `io.github.littlesurvival.antithreadarmy`。

查詢時建立 App 自己的 WebView，啟用 JavaScript 與 DOM storage，在當頁取得參數及送出搜尋。查詢前後清除本 App WebView Cookie，關閉 WebView；不接觸 Chrome Cookie。加入 INTERNET 權限，僅允許 HTTPS。

## iOS

需要 macOS、Xcode、JDK 21。開啟 `iosApp/iosApp.xcodeproj`，選擇 `iosApp` scheme 與 iOS 16+ Apple Silicon 模擬器。

- 包含 `iosArm64`、`iosSimulatorArm64`；未設定 Intel 模擬器。
- Xcode build phase 會執行 `:shared:embedAndSignAppleFrameworkForXcode`。
- 真機需設定自己的 Signing Team。
- 使用 `WKWebsiteDataStore.nonPersistentDataStore()`，查詢資料不寫入 Safari store。
- Windows 無法編譯／執行 iOS，本次只完成來源實作，尚待 macOS 驗證。

## 共用查詢

Gradle 的 `generateThreadsQuery` 會將 `packages/threads-client/page-query.js` 打包成 Kotlin 字串，各平台在自己的 Threads 頁面執行同一份協定程式。Android 與 iOS adapter 負責建立、等待、逾時和釋放平台 WebView；不跨程序呼叫 Python。

畫面不保存查詢歷史或 raw response。只呈現 API 實際提供的名稱、頭像、平台和遮罩聯絡資訊，不推算追蹤數或個人簡介。
