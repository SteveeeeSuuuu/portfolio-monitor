#!/usr/bin/env node
// 產生 dashboard 用的 data.json，並把網頁輸出到 dist/
// 用法：node build.mjs [--mock] [--out dist]
import { mkdir, writeFile, copyFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooDaily, nasdaqDaily, cnnFearGreed, yahooEarnings, sleep } from './lib/sources.mjs';
import { updateChips, summarizeChips } from './lib/chips.mjs';
import { analyze, DEFAULT_STRATEGIES, DECAY_THRESHOLD, DECAY_WINDOW } from './lib/strategies.mjs';
import { sma, rsi, last } from './lib/indicators.mjs';
import { usSentiment, twSentiment, semiSentiment, rating } from './lib/sentiment.mjs';
import { POSITIONS, MARKETS } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const MOCK = args.includes('--mock');
const HISTORY = args.includes('--history') ? path.resolve(args[args.indexOf('--history') + 1]) : null;
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(__dirname, 'dist'));

const r2 = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const warnings = [];

async function loadAll(symbols) {
  const out = {};
  if (MOCK) {
    const { mockDaily } = await import('./test/mock.mjs');
    for (const s of symbols) out[s] = mockDaily(s);
    return out;
  }
  // 小批次併發，避免被限流；Yahoo 失敗時，美股個股 / ETF 改用 Nasdaq
  const queue = [...symbols];
  const usPlain = (s) => /^[A-Z]{1,5}$/.test(s);
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      try {
        out[s] = await yahooDaily(s);
        if (!out[s].bars.length) throw new Error('no bars');
      } catch (e) {
        delete out[s];
        if (usPlain(s)) {
          try {
            out[s] = await nasdaqDaily(s);
            warnings.push(`${s}：Yahoo 失敗（${e.message}），改用 Nasdaq 資料（無還原股價）`);
            continue;
          } catch (e2) {
            warnings.push(`抓取 ${s} 失敗：${e.message}；${e2.message}`);
            continue;
          }
        }
        warnings.push(`抓取 ${s} 失敗：${e.message}`);
      }
      await sleep(300);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log(`價格資料：${Object.keys(out).length}/${symbols.length} 檔`);
  return out;
}

function changes(bars) {
  const c = bars.map((b) => b.close);
  const n = c.length;
  const ch = (k) => (n > k ? r2((c[n - 1] / c[n - 1 - k] - 1) * 100) : null);
  const ma = (p) => last(sma(c, p));
  const hi52 = Math.max(...c.slice(-252));
  const yStart = bars.findLast((b) => b.date < `${bars[n - 1].date.slice(0, 4)}-01-01`);
  return {
    date: bars[n - 1].date,
    close: r2(c[n - 1], 4),
    chg1d: ch(1),
    chg5d: ch(5),
    chg20d: ch(20),
    ytd: yStart ? r2((c[n - 1] / yStart.close - 1) * 100) : null,
    vsMa20: r2((c[n - 1] / ma(20) - 1) * 100),
    vsMa50: r2((c[n - 1] / ma(50) - 1) * 100),
    vsMa200: n >= 200 ? r2((c[n - 1] / ma(200) - 1) * 100) : null,
    rsi14: r2(last(rsi(c, 14)), 1),
    fromHigh52w: r2((c[n - 1] / hi52 - 1) * 100),
    spark: c.slice(-120).map((x) => r2(x, 4)),
    sparkDates: bars.slice(-120).map((b) => b.date),
  };
}

function packSentiment(res, keepDays = 260) {
  const n = res.dates.length;
  const s = Math.max(0, n - keepDays);
  const score = last(res.score);
  const at = (k) => (n > k ? r2(res.score[n - 1 - k], 1) : null);
  return {
    date: res.dates[n - 1],
    score: r2(score, 1),
    rating: rating(score),
    prev: { d1: at(1), w1: at(5), m1: at(21), y1: at(252) },
    history: { dates: res.dates.slice(s), score: res.score.slice(s).map((x) => r2(x, 1)) },
    components: res.components.map((c) => ({
      key: c.key,
      label: c.label,
      desc: c.desc,
      unit: c.unit,
      value: r2(last(c.display), c.unit === 'x' ? 3 : 2),
      score: r2(last(c.pct), 1),
      rating: rating(last(c.pct)),
    })),
  };
}

async function main() {
  const posSymbols = POSITIONS.flatMap((p) => [p.symbol, p.underlyingSymbol]);
  const marketSymbols = MARKETS.map((m) => m.symbol);
  const extra = ['SPY', 'TLT', 'HYG', 'IEF', 'RSP', '^VIX3M'];
  const symbols = [...new Set([...posSymbols, ...marketSymbols, ...extra])];
  const data = await loadAll(symbols);

  // ---- 情緒綜合分數 ----
  const sentiment = {};
  const need = (list) => list.every((s) => data[s]);
  try {
    if (need(['^GSPC', '^VIX', 'SPY', 'TLT', 'HYG', 'IEF', 'RSP'])) sentiment.us = packSentiment(usSentiment(data));
    else warnings.push('美股情緒分數：必要資料不足');
  } catch (e) {
    warnings.push(`美股情緒分數計算失敗：${e.message}`);
  }
  try {
    if (need(['^TWII', 'TWD=X'])) sentiment.tw = packSentiment(twSentiment(data));
    else warnings.push('台股情緒分數：必要資料不足');
  } catch (e) {
    warnings.push(`台股情緒分數計算失敗：${e.message}`);
  }
  try {
    if (need(['^SOX', '^GSPC'])) sentiment.semi = packSentiment(semiSentiment(data));
    else warnings.push('半導體情緒分數：必要資料不足');
  } catch (e) {
    warnings.push(`半導體情緒分數計算失敗：${e.message}`);
  }

  // ---- 市場總覽 ----
  const markets = MARKETS.filter((m) => data[m.symbol]).map((m) => ({ ...m, partial: data[m.symbol].partial, ...changes(data[m.symbol].bars) }));

  // ---- 持倉策略分析（strategy-interface.md） ----
  const positions = [];
  for (const p of POSITIONS) {
    const d = data[p.symbol];
    const u = data[p.underlyingSymbol];
    if (!d || !u) {
      warnings.push(`${p.ticker}：價格或標的資料缺漏，略過分析`);
      continue;
    }
    const ohlcv = d.bars.map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }));
    // 耗損用還原股價（含配息），避免除息造成誤判
    const adjOhlcv = d.bars.map((b) => ({ date: b.date, close: b.adjclose }));
    const adjUnder = u.bars.map((b) => ({ date: b.date, close: b.adjclose }));
    const input = { ticker: p.ticker, market: p.market, type: p.type, ohlcv, decayOhlcv: adjOhlcv, underlyingOhlcv: adjUnder, position: { ...p, strategies: null } };
    const res = analyze(input);
    const closes = ohlcv.map((b) => b.close);
    const ma5 = sma(closes, 5);
    const ma20 = sma(closes, 20);
    const k = 120;
    const ch = changes(d.bars);
    const alerts = [];
    if (ch.chg1d !== null && ch.chg1d < -5) alerts.push(`單日跌幅 ${ch.chg1d}% 超過 5%`);
    const ma = res.results.find((r) => r.strategy === 'ma-cross');
    if (ma?.signal === 'WARN') alerts.push('跌破 MA5');
    if (ma?.signal === 'SELL') alerts.push('MA5/MA20 死亡交叉');
    const dec = res.results.find((r) => r.strategy === 'decay-monitor');
    if (dec?.signal === 'WARN') alerts.push(`槓桿耗損超過 ${DECAY_THRESHOLD}%`);
    positions.push({
      ...p,
      partial: d.partial,
      currency: d.currency,
      summary: res.summary,
      results: res.results,
      rsiInfo: r2(last(rsi(closes, 14)), 1),
      alerts,
      quote: { ...ch, spark: undefined, sparkDates: undefined },
      underlyingQuote: (({ date, close, chg1d, chg5d, chg20d }) => ({ date, close, chg1d, chg5d, chg20d }))(changes(u.bars)),
      chart: {
        dates: ohlcv.slice(-k).map((b) => b.date),
        close: closes.slice(-k).map((x) => r2(x, 4)),
        ma5: ma5.slice(-k).map((x) => r2(x, 4)),
        ma20: ma20.slice(-k).map((x) => r2(x, 4)),
      },
    });
  }

  // ---- 集中度（positions.md）：無持股數，以檔數估算 ----
  const lev = positions.filter((p) => p.type === 'leveraged');
  const semiCount = lev.filter((p) => p.sector === 'semi').length;
  const concentration = {
    method: '檔數（未提供持股數，無法以市值計算）',
    semiCount,
    total: lev.length,
    pct: lev.length ? r2((semiCount / lev.length) * 100, 1) : null,
    threshold: 80,
  };

  // ---- 台股籌碼與市場槓桿 ----
  let chipsHistory = { days: {} };
  if (HISTORY) {
    try {
      chipsHistory = JSON.parse(await readFile(HISTORY, 'utf8'));
      console.log(`讀取籌碼快取：${Object.keys(chipsHistory.days || {}).length} 天`);
    } catch {
      console.log('無籌碼快取，從頭抓取');
    }
  }
  let chips = null;
  const twBars = data['^TWII']?.bars || [];
  if (MOCK) {
    const { mockChips } = await import('./test/mock.mjs');
    chipsHistory = mockChips(twBars.slice(-30).map((b) => b.date));
  } else if (twBars.length) {
    // 只用已收盤的交易日
    const dates = twBars.map((b) => b.date).filter((d, i, arr) => !(data['^TWII'].partial && i === arr.length - 1));
    const errs = await updateChips(chipsHistory, dates);
    errs.forEach((e) => warnings.push(`籌碼：${e}`));
  }
  try {
    chips = summarizeChips(chipsHistory, twBars.slice(-40));
  } catch (e) {
    warnings.push(`籌碼彙總失敗：${e.message}`);
  }

  // ---- 選用來源 ----
  let fearGreed = null;
  let earnings = null;
  if (!MOCK) {
    try {
      const start = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
      const j = await cnnFearGreed(start);
      const fg = j.fear_and_greed;
      const keys = {
        market_momentum_sp500: '市場動能',
        stock_price_strength: '股價強度（52 週新高 vs 新低）',
        stock_price_breadth: '股價廣度（McClellan 成交量）',
        put_call_options: 'Put/Call 比率',
        market_volatility_vix: '市場波動率 (VIX)',
        safe_haven_demand: '避險需求',
        junk_bond_demand: '垃圾債需求',
      };
      fearGreed = {
        score: r2(fg.score, 1),
        rating: fg.rating,
        timestamp: fg.timestamp,
        prev: { d1: r2(fg.previous_close, 1), w1: r2(fg.previous_1_week, 1), m1: r2(fg.previous_1_month, 1), y1: r2(fg.previous_1_year, 1) },
        history: (j.fear_and_greed_historical?.data || []).map((p) => [new Date(p.x).toISOString().slice(0, 10), r2(p.y, 1)]),
        components: Object.entries(keys)
          .filter(([k]) => j[k])
          .map(([k, label]) => ({ key: k, label, score: r2(j[k].score, 1), rating: j[k].rating, value: r2(last(j[k].data || [])?.y, 3) })),
      };
    } catch (e) {
      warnings.push(`CNN Fear & Greed 取得失敗（改看自算分數）：${e.message}`);
    }
    try {
      const unders = [...new Set(POSITIONS.filter((p) => p.market === 'US').map((p) => p.underlyingSymbol))];
      const raw = await yahooEarnings(unders);
      const now = Date.now() / 1000;
      earnings = Object.fromEntries(
        Object.entries(raw)
          .filter(([, v]) => v.ts > now - 864e5)
          .map(([k, v]) => [k, { date: new Date(v.ts * 1000).toISOString().slice(0, 10), daysLeft: Math.ceil((v.ts - now) / 864e5), estimated: v.estimated }]),
      );
    } catch (e) {
      warnings.push(`財報日期取得失敗：${e.message}`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    mock: MOCK,
    settings: { decayThreshold: DECAY_THRESHOLD, decayWindow: DECAY_WINDOW, defaultStrategies: DEFAULT_STRATEGIES },
    sentiment,
    fearGreed,
    markets,
    positions,
    concentration,
    chips,
    institutional: chips?.institutional?.length ? chips.institutional : null,
    earnings,
    warnings,
  };

  if (!sentiment.us && !positions.length) {
    console.error(warnings.join('\n'));
    throw new Error('主要資料全部失敗，中止部署以免覆蓋舊頁面');
  }

  await mkdir(OUT, { recursive: true });
  const siteDir = path.join(__dirname, 'site');
  for (const f of await readdir(siteDir)) await copyFile(path.join(siteDir, f), path.join(OUT, f));
  await writeFile(path.join(OUT, 'data.json'), JSON.stringify(out));
  await writeFile(path.join(OUT, 'chips-history.json'), JSON.stringify(chipsHistory));
  console.log(`OK → ${OUT}/data.json  positions=${positions.length} markets=${markets.length}`);
  if (warnings.length) console.log('警告：\n- ' + warnings.join('\n- '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
