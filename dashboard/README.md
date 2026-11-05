# 每日股市情緒 Dashboard

靜態網頁，由 GitHub Actions 每個交易日自動更新並部署到 GitHub Pages（`gh-pages` 分支）。

- 網址：https://steveeeesuuuu.github.io/portfolio-monitor/
- 更新時間：台北 16:17（台股收盤後）、06:23（美股收盤後），週一至週五
- 手動更新：Actions → 「每日股市情緒 Dashboard」→ Run workflow

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
持倉清單在 `config.mjs`。

籌碼資料逐日快取在 gh-pages 的 `chips-history.json`，每次只補抓缺少的日期（證交所有頻率限制，每次請求間隔約 3 秒）。
