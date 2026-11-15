# 手機版

## IntelliJ IDEA 設定

1. 在 **Settings → Plugins → Marketplace** 安裝 **Kotlin Multiplatform**。若要從 IntelliJ 執行 Android，也啟用 **Android** 和 **Android Design Tools**。
2. 用 IntelliJ 開啟專案根目錄。在檔案樹對 `apps/mobile/build.gradle.kts` 按右鍵，選 **Import Gradle Project**。若 Gradle 面板已顯示 `anti-threadarmy-mobile`，直接按 **Reload All Gradle Projects**。
3. 到 **Settings → Build, Execution, Deployment → Gradle**，選 **Gradle Wrapper**，並將 **Gradle JVM** 設為 **JDK 21**。設定 `ANDROID_HOME` 並安裝 Android SDK API 36。

同步後，Gradle 面板會顯示 `androidApp` 和 `shared`。只開發手機版時，也可直接在 Android Studio 開啟 `apps/mobile`。

## Android 安裝

從 GitHub 的 **Releases** 下載檔名結尾為 `-android.apk` 的檔案，在 Android 7.0 以上的手機開啟並安裝。若系統要求授權，依畫面指示允許安裝。

若手機已裝過簽章不同的版本，先匯出封鎖名單，再解除安裝舊版。安裝完成後可匯入名單。

## Android 建置

需要 JDK 21 和 Android SDK API 36。讓 `ANDROID_HOME` 指向 SDK 安裝目錄，或在 Android Studio 開啟 `apps/mobile` 並設定 SDK。

在專案根目錄執行以下命令。

```powershell
cd apps/mobile
.\gradlew.bat :androidApp:assembleDebug
```

APK 位於 `apps/mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`。已連線至手機或模擬器時，可在 `apps/mobile` 執行 `.\gradlew.bat :androidApp:installDebug` 直接安裝。macOS 和 Linux 請使用 `sh gradlew`。

## iOS 建置

在 Apple Silicon Mac 安裝 Xcode 和 JDK 21。用 Xcode 開啟 `apps/mobile/iosApp/iosApp.xcodeproj`，選擇 `iosApp` scheme 和 iOS 16 以上的模擬器，按 **⌘R**。若要安裝到實體裝置，請在 **Signing & Capabilities** 選擇自己的 Team。

## 本地封鎖名單

查詢失敗時可點「查看錯誤報告」，開啟可捲動、選取與複製的報告視窗。報告包含錯誤階段、堆疊與已取得的 HTTP response；Cookie 與權杖欄位會遮蔽。名單讀取或操作失敗時，頂部也會出現「錯誤報告」入口。

在首頁查詢 Threads ID 或連結，點結果卡上的「加入封鎖名單」。從左上角選單開啟名單，可搜尋、排序、複製 ID 或移除帳號。在「自訂順序」下清空搜尋框即可拖曳排序。

用「匯出 JSON」備份名單，「匯入 JSON」會合併新帳號並保留既有項目。名單只在 App 內生效。
