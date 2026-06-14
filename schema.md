# Portfolio Monitor — DB Schema

## 資料庫：SQLite
檔案位置：`data/portfolio.db`

---

## 表結構

### users
使用者帳號，以 Telegram User ID 作為識別。

```sql
CREATE TABLE users (
  id                INTEGER PRIMARY KEY,
  telegram_user_id  TEXT UNIQUE NOT NULL,  -- Telegram 永久數字 ID
  telegram_chat_id  TEXT,                  -- 推播用（通常與 user_id 相同）
  name              TEXT,                  -- Telegram first_name
  currency          TEXT DEFAULT 'TWD',    -- 預設顯示幣別
  timezone          TEXT DEFAULT 'Asia/Taipei',
  is_active         BOOLEAN DEFAULT 1,     -- 停用用
  role              TEXT DEFAULT 'user',   -- 'admin' | 'user'
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### positions
持股主表，清倉後設 is_active=0 保留歷史。

```sql
CREATE TABLE positions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  ticker      TEXT NOT NULL,           -- NVDX, 00631L, TSLA 等
  market      TEXT NOT NULL,           -- 'US' | 'TW'
  type        TEXT NOT NULL,           -- 'leveraged' | 'stock' | 'etf'
  underlying  TEXT,                    -- 槓桿 ETF 的標的，如 NVDA
  leverage    REAL DEFAULT 1,          -- 槓桿倍數，一般股票為 1
  shares      REAL NOT NULL,
  avg_cost    REAL NOT NULL,           -- 均攤成本
  currency    TEXT NOT NULL,           -- 'USD' | 'TWD'
  buy_date    DATE NOT NULL,
  stop_loss   REAL,                    -- 停損價
  take_profit REAL,                    -- 停利價
  strategies  TEXT,                    -- JSON array，null = 用預設策略組合
  is_active   BOOLEAN DEFAULT 1,
  notes       TEXT
);
```

**strategies 欄位範例：**
```json
["ma-cross", "decay-monitor"]
```
null 時由 engine.js 根據 type 選預設策略組合。

---

### transactions
每次買賣加減碼的完整歷史。

```sql
CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  position_id INTEGER REFERENCES positions(id),
  action      TEXT NOT NULL,   -- 'BUY' | 'SELL' | 'ADD' | 'REDUCE'
  shares      REAL NOT NULL,
  price       REAL NOT NULL,
  date        DATE NOT NULL,
  notes       TEXT
);
```

---

### daily_snapshots
每日收盤快照，用於績效追蹤與耗損計算。

```sql
CREATE TABLE daily_snapshots (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  date            DATE NOT NULL,
  ticker          TEXT NOT NULL,
  close_price     REAL,
  position_value  REAL,          -- shares * close_price（統一換算 TWD）
  daily_pnl       REAL,
  total_pnl       REAL,          -- 從 buy_date 至今
  decay_estimate  REAL           -- 槓桿 ETF 耗損估算，一般股票為 null
);
```

---

### notification_settings
每位使用者的通知偏好，獨立設定。

```sql
CREATE TABLE notification_settings (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER UNIQUE REFERENCES users(id),
  stop_loss_alert     BOOLEAN DEFAULT 1,
  ma_break_alert      BOOLEAN DEFAULT 1,
  decay_threshold     REAL DEFAULT 5.0,    -- 耗損超過幾 % 才通知
  earnings_days_ahead INTEGER DEFAULT 3,   -- 財報前幾天通知
  daily_summary_time  TEXT DEFAULT '16:00',-- 每日彙整推播時間（HH:MM）
  us_market_alert     BOOLEAN DEFAULT 1,
  tw_market_alert     BOOLEAN DEFAULT 1
);
```

---

### fx_rates
USD/TWD 匯率，所有用戶共用，用於統一幣別計算。

```sql
CREATE TABLE fx_rates (
  date     DATE NOT NULL,
  usd_twd  REAL NOT NULL,
  PRIMARY KEY (date)
);
```

---

### system_logs
系統 log 寫入 DB，方便用 SQL 查詢歷史，與 Winston 檔案 log 並行。

```sql
CREATE TABLE system_logs (
  id         INTEGER PRIMARY KEY,
  timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP,
  level      TEXT NOT NULL,    -- 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
  module     TEXT NOT NULL,    -- 'price-fetcher' | 'engine' | 'telegram' 等
  user_id    INTEGER,          -- 可 null（系統層級 log）
  ticker     TEXT,             -- 可 null
  message    TEXT NOT NULL,
  metadata   TEXT              -- JSON 格式的額外資料
);
```

**常用查詢：**
```sql
-- 某檔股票最近的錯誤
SELECT * FROM system_logs
WHERE ticker = 'TSLL' AND level = 'ERROR'
ORDER BY timestamp DESC LIMIT 20;

-- 某用戶今天收到哪些通知
SELECT * FROM system_logs
WHERE user_id = 1
  AND module = 'telegram'
  AND date(timestamp) = date('now');

-- 今天所有 ERROR
SELECT * FROM system_logs
WHERE level = 'ERROR'
  AND date(timestamp) = date('now')
ORDER BY timestamp DESC;
```

---

## 表關係

```
users
  ├── positions (user_id)
  │     └── transactions (position_id)
  ├── daily_snapshots (user_id)
  ├── notification_settings (user_id)
  └── system_logs (user_id, nullable)

fx_rates  ← 共用，無 user_id
```

---

## 注意事項

- `positions.is_active = 0`：清倉後不刪除，保留歷史記錄
- `daily_snapshots.position_value`：統一換算成 TWD 儲存，方便計算總資產
- `system_logs.metadata`：JSON 字串，存策略名稱、指標數值、token 用量等額外資訊
- `positions.strategies`：null 時 engine.js 按 type 選預設組合，有值時覆蓋預設
