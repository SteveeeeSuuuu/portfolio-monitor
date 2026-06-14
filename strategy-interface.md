# Portfolio Monitor — 策略引擎介面

## 設計原則

Strategy Pattern：每個策略實作同一個介面，引擎不在乎裡面怎麼算，只管輸入輸出。
輸出格式統一，讓 Claude API 通知層不需要知道用了哪個策略。

---

## 標準介面

### 輸入（data 物件）

```typescript
{
  ticker:    string,       // 'NVDX', '00631L', 'TSLA'
  market:    'US' | 'TW',
  type:      'leveraged' | 'stock' | 'etf',
  ohlcv:     Array<{
    date:    string,       // 'YYYY-MM-DD'
    open:    number,
    high:    number,
    low:     number,
    close:   number,
    volume:  number
  }>,
  position:  Object | null  // positions 表的該筆資料，可 null
}
```

### 輸出（result 物件）

```typescript
{
  signal:     'BUY' | 'SELL' | 'ADD' | 'REDUCE' | 'HOLD' | 'WARN',
  trend:      'UP' | 'DOWN' | 'SIDEWAYS',
  strength:   number,      // 0–100，訊號強度
  reason:     string,      // 人類可讀的中文原因
  indicators: Object,      // 計算出的指標數值（各策略自定義）
  meta:       Object        // 策略自定義的額外資料
}
```

---

## 策略模組結構

```javascript
// src/engine/strategies/[name].js
export default {
  name:    'strategy-name',   // 對應 registry key
  version: '1.0',
  analyze: async (data) => {  // 回傳 result 物件
    // ...
  }
};
```

---

## 現有策略清單

### ma-cross（所有類型適用）
- 計算 MA5、MA20
- 黃金交叉 → BUY，死亡交叉 → SELL
- 價格跌破 MA5 → WARN
- indicators: `{ ma5, ma20, price }`

### adx-trend（所有類型適用）
- 計算 ADX、+DI、-DI
- ADX > 25 確認趨勢存在
- +DI > -DI 且 ADX > 25 → 上升趨勢
- indicators: `{ adx, pdi, mdi }`

### decay-monitor（槓桿 ETF 專用）
- 計算槓桿 ETF vs 標的的報酬差距
- 需要 position.underlying 和 position.buy_date
- 耗損超過閾值 → WARN
- indicators: `{ etf_return, underlying_return, decay_pct }`

### rsi-momentum（stock / etf 適用）
- 計算 RSI(14)
- RSI > 70 → 超買 WARN，RSI < 30 → 超賣 BUY
- indicators: `{ rsi }`

---

## 預設策略組合（by type）

```javascript
const DEFAULT_STRATEGIES = {
  leveraged: ['ma-cross', 'adx-trend', 'decay-monitor'],
  stock:     ['ma-cross', 'adx-trend', 'rsi-momentum'],
  etf:       ['ma-cross', 'adx-trend']
};
```

positions 表的 `strategies` 欄位可覆蓋此預設。

---

## 多策略投票機制

engine.js 的 `summarize()` 函數：

```
有任何 SELL   → 最終訊號 SELL
有任何 WARN   → 最終訊號 WARN
BUY > HOLD   → 最終訊號 BUY
其他          → 最終訊號 HOLD
```

---

## 新增策略步驟

1. 在 `src/engine/strategies/` 新增 `my-strategy.js`
2. 實作 `{ name, version, analyze }` 介面
3. 在 `src/engine/registry.js` 加一行：
   ```javascript
   registry.set('my-strategy', myStrategy);
   ```
4. 其他模組完全不用動

---

## Registry API

```javascript
import { getStrategy, listStrategies, register } from './registry.js';

getStrategy('ma-cross')           // 取得策略
listStrategies()                  // 列出所有已註冊策略名稱
register('my-strategy', module)   // 動態新增策略
```

---

## engine.js API

```javascript
import { analyze } from './engine.js';

// 用預設策略組合
const result = await analyze(data);

// 指定策略組合
const result = await analyze(data, ['ma-cross', 'decay-monitor']);

// result 結構
{
  ticker:  'NVDX',
  results: [                    // 每個策略的個別結果
    { strategy: 'ma-cross', signal: 'HOLD', ... },
    { strategy: 'decay-monitor', signal: 'WARN', ... }
  ],
  summary: 'WARN'               // 投票後的最終訊號
}
```
