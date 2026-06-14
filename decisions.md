# Portfolio Monitor — 設計決策記錄

## 通知方案：Telegram Bot（非 Line Bot）

**決策：** 使用 Telegram Bot + Polling

**原因：**
- Mac 連無線網路，浮動 IP，在 NAT 後面
- Line Bot 需要公開 HTTPS Webhook，外部打不進來
- Telegram 用 Polling（Mac 主動問有無新訊息），不需要公開 IP
- Mac 斷線重連後 Polling 自動恢復
- 使用者本身有在用 Telegram

**放棄的方案：**
- Line Bot + Webhook → 需要固定 IP 或 VPS，增加架構複雜度
- Line Notify → 只能單向推播，無法雙向互動
- ngrok → 每次重啟網址改變，不穩定

---

## 資料庫：SQLite（非雲端 DB）

**決策：** SQLite 本地檔案

**原因：**
- 使用人數少（小規模私人系統）
- 不需要網路連線，完全本地
- 部署簡單，無需額外服務
- 支援 SQL 查詢 log，方便除錯

---

## 分析引擎：Strategy Pattern

**決策：** 策略引擎設計成 General Interface，策略可抽換

**原因：**
- 技術分析策略會隨市場條件調整
- 槓桿 ETF 需要專用的耗損監控策略，一般股票不需要
- 新增策略只要加一個 js 檔 + registry 一行，其他模組不動

**預設策略組合：**
- leveraged: ma-cross + adx-trend + decay-monitor
- stock: ma-cross + adx-trend + rsi-momentum
- etf: ma-cross + adx-trend

---

## 多使用者設計

**決策：** 支援多用戶，白名單制存取控制

**原因：**
- 未來可能有其他人使用
- 白名單防止公開 Bot 被陌生人使用
- 每個用戶有獨立的通知設定（耗損閾值、每日彙整時間等）

**白名單機制：**
- ALLOWED_TELEGRAM_IDS 存在 .env
- 用戶 /start 時自動檢查，不在白名單直接拒絕
- 在白名單但未建帳號 → 自動建立

---

## Logging：Winston + SQLite 雙軌

**決策：** Winston 寫檔案 + system_logs 表同時記錄

**原因：**
- Winston 檔案：完整 log，開發時直接看
- system_logs 表：可以用 SQL 查詢，也可以透過 Telegram 指令查詢
- Telegram 管理員指令（`log error`、`log TSLL`）依賴 system_logs 表

---

## 測試策略：獨立腳本 + Mock 資料

**決策：** 每個模組有獨立測試腳本，使用 __mocks__ 假資料

**原因：**
- 分析引擎不應依賴真實網路請求才能測試
- 串接問題難定位，獨立測試先確認每層正常
- 測試順序：DB → price → indicators → claude → telegram → scheduler

---

## 幣別處理

**決策：** 原始資料保留原幣（USD/TWD），daily_snapshots 統一換算 TWD

**原因：**
- 原始成本需要保留原幣（對帳用）
- 總資產計算需要統一幣別
- fx_rates 表每日更新匯率，換算時取當日匯率

---

## 槓桿 ETF 耗損計算方式

**決策：** 比較 ETF 實際報酬 vs 標的理論報酬（槓桿倍數 × 標的報酬）

**公式：**
```
理論報酬 = 標的報酬 × leverage
實際報酬 = ETF 報酬
耗損 = 理論報酬 - 實際報酬
```

持有天數越長、標的波動率越高，耗損越大。
decay_threshold 預設 5%，超過才通知（可個人設定）。

---

## 排程設計

**決策：** 台股、美股各自排程，收盤後寫快照

**時區：**
- 所有時間以台灣時間（Asia/Taipei）為準
- 美股盤中 = 台灣時間 21:30–翌日 04:00（含夏令時調整）

**補跑機制：**
Mac 斷線期間漏掉的快照，下次排程觸發時補寫當日資料（以收盤價計算）。
