# Python 桌面版與命令列工具

## 目錄

```text
python-script/
├── src/                   Python 執行程式
├── gui/                   共用網頁介面的前端與其 dist/
├── tests/                 單元測試與 GUI 瀏覽器驗證
├── assets/                應用程式圖示
├── docs/                  請求與回應欄位說明
├── dist/                  打包完成的 GUI／headless EXE
├── error-reports/         原始碼執行時自動儲存的錯誤報告（不加入 Git）
├── build_windows.ps1      建置兩個 EXE
├── requirements.txt       執行依賴
├── requirements-build.txt 建置依賴
└── README.md
```

Python 虛擬環境放在此模組的 `.venv/`。PyInstaller 的工作檔與 spec 放在專案根目錄 `.tmp/python-build/`，成功建置後自動刪除；失敗時保留以便排查。測試暫存檔也使用根目錄 `.tmp/`。pnpm 套件由專案根目錄工作區統一管理。

## 使用 Windows GUI

先安裝 Google Chrome。從 GitHub 的 **Releases** 下載檔名結尾為 `-python-windows-x64-gui.exe` 的檔案，雙擊開啟。輸入 Threads ID 或連結，按 Enter 或右側箭頭即可查詢。

GUI 直接共用網站的搜尋框、結果卡、載入與錯誤樣式。視窗使用 Chrome 的獨立應用程式模式，不會使用原本的 Chrome 個人資料。查詢服務只在本機執行；關閉這個專用 Chrome 工作階段的所有視窗後，會停止服務並清除暫存的 GUI 個人資料。「在 Threads 查看」開啟的頁面也屬於這個工作階段。每次實際查詢另開隔離的無介面 Chrome 工作階段。

## 使用 Windows headless EXE

下載檔名結尾為 `-python-windows-x64-headless.exe` 的檔案，將它命名為 `anti-threadarmy-headless.exe`。在下載資料夾開啟 PowerShell，將 `YOUR_THREADS_ID` 換成 Threads ID 或連結。

```powershell
.\anti-threadarmy-headless.exe "YOUR_THREADS_ID" --send
```

`--send` 會送出一次查詢。省略它時，工具只會解析輸入並準備請求。

失敗時會輸出完整 JSON 錯誤報告到標準錯誤輸出，並儲存一份報告。需要指定檔案時，可加 `--error-report .\my-error-report.json`。輸入錯誤退出碼為 `2`，執行或查詢失敗為 `1`。

## 從原始碼執行

兩版都需要 Python 3.14 和 Google Chrome。GUI 還需先使用專案的 Node.js／pnpm 環境建置介面。在專案根目錄執行以下命令。

```powershell
cd apps/python-script
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe src/threads_account_headless.py "YOUR_THREADS_ID" --send
```

GUI 在 `apps/python-script` 執行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @anti-threadarmy/python-gui build
.\.venv\Scripts\python.exe src/threads_account_gui.py
```

`src/threads_account_search.py` 提供查詢核心與命令列參數解析；`src/threads_account_headless.py` 是 headless 版入口。GUI 結果卡顯示帳號名稱、平台、頭像和已遮罩的聯絡方式。

## 錯誤報告

GUI 出現錯誤時，點「查看錯誤報告」可開啟報告視窗，查看問題、失敗階段、時間、traceback，以及實際收到的 HTTP 狀態、回應標頭與內容；也可複製或下載 JSON。未收到 HTTP 回應時，報告記錄連線例外資訊。

Python 服務會自動保存報告：從原始碼執行時存放在本模組的 `error-reports/`，EXE 則放在 EXE 旁的 `error-reports/`。GUI 無法啟動時，錯誤提示會提供已儲存報告的位置。若目錄無法寫入，CLI 仍輸出報告，GUI 查詢仍可查看與下載，報告另附存檔失敗原因。

報告保留實際回應結構與錯誤細節，Cookie、授權、密碼、session、恢復流程的 `cipher`／`cuid` 等敏感欄位會遮蔽。報告仍含查詢輸入及診斷資訊，分享前可先檢查內容。`--save-request` 與 `--output` 分別儲存原始請求與回應，輸出內容不套用錯誤報告的遮蔽規則。

## 測試

在 `apps/python-script` 執行以下命令。GUI 瀏覽器測試使用合成資料，不查詢真實帳號；執行前需建置 GUI。

```powershell
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -t . -p "test_*.py"
.\.venv\Scripts\python.exe -B -m tests.check_gui_browser
```

## 建置 Windows EXE

在 Windows x64 完成上述虛擬環境設定後，於 `apps/python-script` 執行以下命令。

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-build.txt
pnpm install --frozen-lockfile
.\build_windows.ps1
```

產物：

- `apps/python-script/dist/anti-threadarmy-gui.exe`：無命令列視窗的桌面版。
- `apps/python-script/dist/anti-threadarmy-headless.exe`：命令列版，不開啟可見瀏覽器。

兩個 EXE 都內含 Python 和 Playwright，GUI EXE 另含共用介面的建置檔案；不需要另外安裝 Python 或 Node.js，查詢時使用系統安裝的 Chrome。

[請求欄位](docs/PARAMETERS.md) · [回應欄位](docs/RESPONSE.md)
