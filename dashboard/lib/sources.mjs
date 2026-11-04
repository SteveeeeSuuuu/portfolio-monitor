// 外部資料來源：Yahoo Finance（必要）、CNN Fear & Greed、TWSE 三大法人、Yahoo 財報日期（皆為選用）
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

/** Yahoo 日線。回傳 { symbol, currency, bars:[{date,open,high,low,close,adjclose,volume}], partial, marketTime } */
export async function yahooDaily(symbol, range = '5y') {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let json;
  let lastErr;
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;
      json = await (await fetchWithRetry(url)).json();
      if (json?.chart?.result?.[0]) break;
      lastErr = new Error(json?.chart?.error?.description || 'empty result');
      json = null;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!json) throw new Error(`Yahoo ${symbol}: ${lastErr?.message}`);
  return parseYahooChart(symbol, json.chart.result[0]);
}

export function parseYahooChart(symbol, r, nowSec = Date.now() / 1000) {
  const meta = r.meta || {};
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const adj = r.indicators?.adjclose?.[0]?.adjclose || [];
  const offset = meta.gmtoffset ?? 0;
  const byDate = new Map();
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close === null || close === undefined || Number.isNaN(close)) continue;
    const date = new Date((ts[i] + offset) * 1000).toISOString().slice(0, 10);
    const open = q.open?.[i] ?? close;
    const high = q.high?.[i] ?? Math.max(open, close);
    const low = q.low?.[i] ?? Math.min(open, close);
    byDate.set(date, {
      date,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      adjclose: adj[i] ?? close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  const bars = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  // 盤中：目前時間落在今日交易時段內，最後一根 K 棒尚未收盤
  const reg = meta.currentTradingPeriod?.regular;
  let partial = false;
  if (reg && bars.length) {
    const regDate = new Date((reg.start + offset) * 1000).toISOString().slice(0, 10);
    partial = bars[bars.length - 1].date === regDate && nowSec >= reg.start && nowSec < reg.end;
  }
  return { symbol, currency: meta.currency || null, bars, partial, marketTime: meta.regularMarketTime || null };
}

/** CNN Fear & Greed（選用） */
export async function cnnFearGreed(startDate) {
  const url = `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`;
  const res = await fetchWithRetry(url, { headers: { Referer: 'https://www.cnn.com/', Origin: 'https://www.cnn.com', Accept: 'application/json' } }, 2);
  return res.json();
}

/** TWSE 三大法人買賣金額（單日），date: 'YYYY-MM-DD'；回傳 null 代表該日無資料 */
export async function twseInstitutional(date) {
  const d = date.replaceAll('-', '');
  const url = `https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${d}&response=json`;
  const json = await (await fetchWithRetry(url, {}, 2)).json();
  if (json.stat !== 'OK' || !Array.isArray(json.data)) return null;
  const num = (s) => Number(String(s).replaceAll(',', ''));
  const rows = Object.fromEntries(json.data.map((r) => [String(r[0]).trim(), num(r[3])]));
  const pick = (prefix) => Object.entries(rows).filter(([k]) => k.startsWith(prefix)).reduce((s, [, v]) => s + v, 0);
  return {
    date,
    foreign: pick('外資'), // 外資及陸資 + 外資自營商
    trust: pick('投信'),
    dealer: pick('自營商'),
    total: rows['合計'] ?? null,
  };
}

/** Yahoo 財報日期（需 crumb；失敗回傳 {}） */
export async function yahooEarnings(symbols) {
  const r1 = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(15000) }).catch(() => null);
  const cookies = (r1?.headers?.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!cookies) throw new Error('no yahoo cookie');
  const crumb = await (await fetchWithRetry('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { Cookie: cookies } }, 2)).text();
  if (!crumb || crumb.includes('<')) throw new Error('no crumb');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&crumb=${encodeURIComponent(crumb)}`;
  const json = await (await fetchWithRetry(url, { headers: { Cookie: cookies } }, 2)).json();
  const out = {};
  for (const q of json?.quoteResponse?.result || []) {
    const t = q.earningsTimestampStart ?? q.earningsTimestamp;
    if (t) out[q.symbol] = { ts: t, estimated: q.isEarningsDateEstimate ?? null };
  }
  return out;
}

export { sleep };
