# Portfolio Monitor — 系統架構

## 定位
個人投資組合監控系統，支援多使用者，整合台股＋美股（含槓桿ETF），
透過 Telegram Bot 主動推播與雙向查詢。

## 執行環境
- Mac Server 本地常駐（幾乎不關機）
- 無線網路連線，浮動 IP，在 NAT 後面
- 因此選用 Telegram Polling 而非 Webhook

---

## 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| 執行環境 | Node.js (ESM) | Mac 本地常駐 |
| 資料庫 | SQLite + better-sqlite3 | 本地檔案，無需網路 |
| 排程 | node-cron | 美股/台股盤中各自排程 |
| 價格資料 | yahoo-finance2 | 美股、台股（.TW後綴）、匯率 |
| AI 分析 | Claude API (claude-sonnet-4-6) | 生成繁中自然語言通知 |
| 通知 | Telegram Bot API (Polling) | 不需公開 IP，斷線自動恢復 |
| Logging | Winston + daily-rotate-file | 每日切割，保留 30 天 |

---

## 專案結構

```
portfolio-monitor/
├── src/
│   ├── db/
│   │   ├── schema.js              # 建表邏輯
│   │   └── index.js               # DB 連線 singleton
│   ├── fetcher/
│   │   └── price.js               # 美股、台股、匯率抓取
│   ├── engine/
│   │   ├── strategy.interface.js  # 策略介面定義
│   │   ├── engine.js              # 核心引擎，調度策略
│   │   ├── registry.js            # 策略註冊表
│   │   ├── strategies/
│   │   │   ├── ma-cross.js        # MA5/MA20 黃金死亡交叉
│   │   │   ├── adx-trend.js       # ADX 趨勢強度
│   │   │   ├── decay-monitor.js   # 槓桿 ETF 耗損監控
│   │   │   └── rsi-momentum.js    # RSI 動能
│   │   └── indicators/
│   │       ├── ma.js
│   │       ├── adx.js
│   │       ├── rsi.js
│   │       └── index.js
│   ├── notify/
│   │   ├── claude.js              # Claude API 生成通知文字
│   │   └── telegram.js            # Telegram 推播 + Polling
│   ├── scheduler/
│   │   └── jobs.js                # node-cron 排程定義
│   ├── utils/
│   │   └── logger.js              # Winston 設定
│   └── __mocks__/
│       ├── price.mock.js          # 假價格資料（測試用）
│       ├── positions.mock.js      # 假持倉資料（測試用）
│       └── analysis.mock.js       # 假分析結果（測試用）
├── scripts/                       # 各模組獨立測試腳本
│   ├── test-db.js
│   ├── test-price.js
│   ├── test-indicators.js
│   ├── test-claude.js
│   ├── test-telegram.js
│   └── test-scheduler.js
├── data/
│   └── portfolio.db               # SQLite 資料庫檔案
├── logs/
│   ├── combined/                  # 所有層級
│   ├── error/                     # 只有 ERROR
│   └── debug/                     # 開發時開啟
├── .env
├── .env.example
├── .gitignore
└── package.json
```

---

## 資料流

### 主動推播（排程觸發）
```
node-cron 排程
  → price.js 抓取價格
  → indicators 計算技術指標
  → engine.js 策略分析（Strategy Pattern）
  → 有訊號時：
      → SQLite 寫入 daily_snapshots / system_logs
      → claude.js 生成繁中通知文字
      → telegram.js Push Message
      → 使用者手機收到通知
```

### 被動查詢（使用者指令）
```
使用者傳 Telegram 訊息
  → Polling 接收
  → 白名單驗證 + 自動註冊新用戶
  → 解析指令
  → SQLite 查詢或更新
  → 回覆結果
```

---

## 排程頻率

| 時段 | 觸發時間 | 動作 |
|------|----------|------|
| 台股盤中 | 09:00–13:30，每 30 分鐘 | 掃描台股部位 |
| 台股收盤 | 13:35 | 日線彙整 + 快照寫入 |
| 美股盤中 | 21:30–翌日 04:00，每 30 分鐘 | 掃描美股部位 |
| 美股收盤 | 04:05 | 日線彙整 + 快照寫入 |
| 每日彙整 | 依用戶設定，預設 16:00 | 推播每日持倉摘要 |

---

## 模組依賴順序（開發順序）

```
logger.js → db/schema → price fetcher → indicators
  → engine + strategies → claude notify → telegram bot → scheduler
```

logger 是橫切關注點，所有模組共用。

---

## 測試策略

每個模組有獨立測試腳本，可單獨執行：

```bash
node scripts/test-db.js          # 01 schema 建立、CRUD
node scripts/test-price.js       # 02 美股、台股、匯率抓取
node scripts/test-indicators.js  # 03 指標計算（用 mock 資料）
node scripts/test-claude.js      # 04 API 回應、格式（用 mock）
node scripts/test-telegram.js    # 05 收發訊息、白名單
node scripts/test-scheduler.js   # 06 全串接整合測試
```

分析引擎和通知層使用 `__mocks__/` 資料，不依賴真實價格抓取。
每層確認沒問題再往下，出問題馬上定位在哪層。
