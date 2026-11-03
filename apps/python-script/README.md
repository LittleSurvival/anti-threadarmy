# Python script

需要 Python 與 Google Chrome。帳號 ID 必須由使用者明確輸入，沒有預設帳號。

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe threads_account_search.py "YOUR_THREADS_ID"
```

預設只收集當頁參數。明確加入 `--send` 才送出一次搜尋。

參數說明見 [PARAMETERS.md](PARAMETERS.md)，回應欄位見 [RESPONSE.md](RESPONSE.md)。
