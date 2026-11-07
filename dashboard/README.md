# 每日股市情緒 Dashboard

靜態網頁，由 GitHub Actions 每個交易日自動更新並部署到 GitHub Pages（`gh-pages` 分支）。

- 網址：https://steveeeesuuuu.github.io/portfolio-monitor/
- 更新時間：台北 16:17（台股收盤後）、06:23（美股收盤後），週一至週五
- 手動更新：網頁上按「⟳ 更新」（約 1–3 分鐘後自動換新），或 Actions → 「每日股市情緒 Dashboard」→ Run workflow
- 持倉：網頁上按「持倉設定」增刪（最多 10 檔），輸入代號或名稱即可搜尋（美股、台股上市、上櫃），槓桿 ETF 自動判斷倍數與標的，儲存後自動重新計算；設定存在 `dashboard/positions.json`
- 「更新」與「持倉設定」需要一次性設定 GitHub Fine-grained token（只授權此 repo 的 Actions、Contents 讀寫），權杖只存在使用者自己的瀏覽器

## 內容
| 區塊 | 說明 |
|---|---|
| 美股 / 台股 / 半導體情緒 | 自算 0–100 分數，各成分取過去 252 交易日百分位後平均 |
| CNN Fear & Greed | 官方指數與 7 個成分（含 Put/Call、52 週新高低） |
| 持倉訊號 | 依 `strategy-interface.md`：ma-cross、adx-trend、decay-monitor（槓桿型），summarize() 投票 |
| 主動警示 | 單日跌幅 > 5%、跌破 MA5、死亡交叉、耗損 > 5%、財報 ≤ 3 天、半導體集中度 > 80% |
| 台股籌碼與市場槓桿 | 依《台股籌碼與市場槓桿觀察指南》7 項指標（加權指數、融資餘額、融資維持率估算、借券賣出餘額、外資現貨、外資台指期淨額、融資／市值）的今日 / 五日 / 二十日變化，四種交叉判讀情境，三大法人近 5 日 |
| 市場總覽 | 指數、VIX、10Y 殖利率、美元、台幣、黃金、原油、比特幣 |

## 本地開發
```bash
cd dashboard
node --test test/*.test.mjs        # 單元測試
node build.mjs --mock              # 假資料產生 dist/
node build.mjs                     # 真實資料（需可連 Yahoo Finance）
```
持倉清單在 `positions.json`（市場：US / TW 上市 / TWO 上櫃；類型：leveraged / stock / etf），市場觀察清單在 `config.mjs`。

籌碼資料逐日快取在 gh-pages 的 `chips-history.json`，每次只補抓缺少的日期（證交所有頻率限制，每次請求間隔約 3 秒）。
