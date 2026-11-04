// 台股籌碼與市場槓桿（依《台股籌碼與市場槓桿觀察指南》）
// 資料：TWSE（融資融券、借券賣出、三大法人、收盤行情、上市公司基本資料）、TAIFEX（三大法人期貨）
// 每日資料以「日期」為鍵快取在 chips-history.json，只補抓缺少的日期。
import { sleep } from './sources.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TWSE_DELAY = 3200; // 證交所約每 5 秒 3 次以上會封鎖 IP

const num = (s) => {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/,/g, '').replace(/<[^>]*>/g, '').trim();
  if (t === '' || t === '--' || t === '---' || t === 'X' || t === '除權息') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const ymd = (d) => d.replaceAll('-', '');

async function getJson(url, opts = {}, tries = 2) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*', ...(opts.headers || {}) }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`非 JSON 回應（可能被限流）：${text.slice(0, 80).replace(/\s+/g, ' ')}`);
      }
    } catch (e) {
      err = e;
      await sleep(5000 * (i + 1));
    }
  }
  throw err;
}

/** 把 TWSE 新版（tables）與舊版（fieldsN/dataN、creditFields/creditList）回應統一成 [{title, fields, data}] */
export function twseTables(json) {
  const out = [];
  if (Array.isArray(json?.tables)) for (const t of json.tables) if (t?.fields && t?.data) out.push({ title: t.title || '', fields: t.fields, data: t.data });
  for (const k of Object.keys(json || {})) {
    const m = k.match(/^fields(\d*)$/);
    if (m && Array.isArray(json[`data${m[1]}`])) out.push({ title: json[`subtitle${m[1]}`] || json.title || '', fields: json[k], data: json[`data${m[1]}`] });
  }
  if (json?.creditFields && json?.creditList) out.push({ title: json.creditTitle || '信用交易統計', fields: json.creditFields, data: json.creditList });
  return out;
}
const isOk = (j) => j && (j.stat === 'OK' || j.stat === 'ok');

/** 收盤行情：代號 → 收盤價 */
export function parsePrices(json) {
  const map = new Map();
  for (const t of twseTables(json)) {
    const fi = t.fields.map((f) => String(f).trim());
    const ci = fi.indexOf('證券代號');
    const pi = fi.indexOf('收盤價');
    if (ci < 0 || pi < 0) continue;
    for (const r of t.data) {
      const p = num(r[pi]);
      if (p !== null && p > 0) map.set(String(r[ci]).trim(), p);
    }
  }
  return map;
}

/** 融資融券：融資金額今日餘額（元）、各股融資餘額張數 */
export function parseMargin(json) {
  let finAmt = null;
  let shortUnits = null;
  const perStock = new Map();
  for (const t of twseTables(json)) {
    const fi = t.fields.map((f) => String(f).trim());
    const todayIdx = fi.indexOf('今日餘額');
    if (fi[0] === '項目' || t.data.some((r) => String(r[0]).includes('融資金額'))) {
      const ti = todayIdx >= 0 ? todayIdx : fi.length - 1;
      for (const r of t.data) {
        const name = String(r[0]);
        if (name.includes('融資金額')) {
          const v = num(r[ti]);
          finAmt = v === null ? null : v * 1000; // 仟元 → 元
        }
        else if (name.startsWith('融券') && !name.includes('金額')) shortUnits = num(r[ti]);
      }
    } else if (fi[0].includes('代號')) {
      const ci = 0;
      if (todayIdx < 0) continue;
      for (const r of t.data) {
        const v = num(r[todayIdx]);
        if (v !== null) perStock.set(String(r[ci]).trim(), v);
      }
    }
  }
  return { finAmt, shortUnits, perStock };
}

/** 借券賣出：各股當日餘額（股） */
export function parseSbl(json) {
  const perStock = new Map();
  for (const t of twseTables(json)) {
    const fi = t.fields.map((f) => String(f).trim());
    let idx = fi.indexOf('當日餘額');
    if (idx < 0 && fi.length >= 13 && fi[0].includes('代號')) idx = 12;
    if (idx < 0) continue;
    for (const r of t.data) {
      const code = String(r[0]).trim();
      if (!code || code.includes('合計')) continue;
      const v = num(r[idx]);
      if (v !== null) perStock.set(code, v);
    }
  }
  return perStock;
}

/** 三大法人買賣金額統計（元） */
export function parseInst(json) {
  const rows = {};
  for (const t of twseTables(json)) for (const r of t.data) rows[String(r[0]).trim()] = num(r[3]);
  const pick = (p) => Object.entries(rows).filter(([k]) => k.startsWith(p)).reduce((s, [, v]) => s + (v ?? 0), 0);
  if (!Object.keys(rows).length) return null;
  return { foreign: pick('外資'), trust: pick('投信'), dealer: pick('自營商'), total: rows['合計'] ?? null };
}

/** TAIFEX 期貨三大法人 CSV（Big5）→ { 'YYYY-MM-DD': {long, short, net} }（外資，未平倉口數） */
export function parseTaifexCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return {};
  const split = (l) => l.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
  const head = split(lines[0]);
  const find = (...keys) => head.findIndex((h) => keys.every((k) => h.includes(k)));
  const di = find('日期');
  const wi = find('身份別');
  const li = find('多方未平倉口數');
  const si = find('空方未平倉口數');
  const ni = find('多空未平倉口數淨額');
  if ([di, wi, ni].some((x) => x < 0)) throw new Error(`TAIFEX 欄位無法辨識：${head.join('|').slice(0, 120)}`);
  const out = {};
  for (const l of lines.slice(1)) {
    const r = split(l);
    if (!String(r[wi]).includes('外資')) continue;
    const date = String(r[di]).replaceAll('/', '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out[date] = { long: num(r[li]), short: num(r[si]), net: num(r[ni]) };
  }
  return out;
}

async function fetchTaifex(startDate, endDate) {
  const body = new URLSearchParams({ queryStartDate: startDate.replaceAll('-', '/'), queryEndDate: endDate.replaceAll('-', '/'), commodityId: 'TXF' });
  const res = await fetch('https://www.taifex.com.tw/cht/3/futContractsDateDown', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.taifex.com.tw/cht/3/futContractsDate' },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`TAIFEX HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  let text = new TextDecoder('big5').decode(buf);
  if (!text.includes('日期')) text = new TextDecoder('utf-8').decode(buf);
  if (/<html/i.test(text)) throw new Error('TAIFEX 回傳 HTML（查無資料或被擋）');
  return parseTaifexCsv(text);
}

/** 上市公司已發行普通股數：代號 → 股數 */
async function fetchSharesOutstanding() {
  const arr = await getJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L');
  const map = new Map();
  for (const r of arr || []) {
    const code = String(r['公司代號'] ?? '').trim();
    const key = Object.keys(r).find((k) => k.includes('已發行普通股數'));
    const v = key ? num(r[key]) : null;
    if (code && v) map.set(code, v);
  }
  return map;
}

/**
 * 更新快取。tradingDates：最近的台股交易日（由舊到新，取自 ^TWII）
 * history 結構：{ days: { 'YYYY-MM-DD': { finAmt, shortUnits, maint, mcap, sblShares, sblValue, inst:{...}, fut:{...} } } }
 */
export async function updateChips(history, tradingDates, log = console.log) {
  const days = history.days || (history.days = {});
  const errors = [];
  let shares = null;
  const need = tradingDates.slice(-22);
  let requests = 0;

  const twse = async (url) => {
    if (requests++) await sleep(TWSE_DELAY);
    return getJson(url);
  };

  for (const d of need) {
    const rec = days[d] || {};
    const complete = rec.finAmt && rec.maint && rec.sblShares !== undefined && rec.inst && rec.mcap;
    // 同一天最多嘗試 3 次，避免永久缺漏的資料每次都重抓
    if (complete || (rec.tries || 0) >= 3) continue;
    rec.tries = (rec.tries || 0) + 1;
    days[d] = rec;
    try {
      let prices = null;
      const getPrices = async () => {
        if (prices) return prices;
        const j = await twse(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ymd(d)}&type=ALLBUT0999&response=json`);
        prices = isOk(j) ? parsePrices(j) : new Map();
        return prices;
      };

      if (!rec.inst) {
        const j = await twse(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ymd(d)}&response=json`);
        if (isOk(j)) rec.inst = parseInst(j);
      }
      if (!rec.finAmt || !rec.maint) {
        const j = await twse(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ymd(d)}&selectType=ALL&response=json`);
        if (isOk(j)) {
          const m = parseMargin(j);
          if (m.finAmt && (m.finAmt < 5e10 || m.finAmt > 3e12)) errors.push(`${d} 融資金額解析異常（${m.finAmt}），已捨棄`);
          else if (m.finAmt) {
            rec.finAmt = m.finAmt;
            rec.shortUnits = m.shortUnits;
            const p = await getPrices();
            if (p.size > 500 && m.perStock.size > 500) {
              let coll = 0;
              for (const [code, lots] of m.perStock) {
                const px = p.get(code);
                if (px) coll += lots * 1000 * px;
              }
              const ratio = (coll / m.finAmt) * 100;
              // 合理範圍檢查，超出代表欄位或單位解析有誤
              if (ratio > 100 && ratio < 400) rec.maint = Number(ratio.toFixed(2));
              else errors.push(`${d} 融資維持率估算異常（${ratio.toFixed(1)}%），已捨棄`);
            }
          }
        }
      }
      if (rec.sblShares === undefined) {
        const j = await twse(`https://www.twse.com.tw/rwd/zh/marginTrading/TWT93U?date=${ymd(d)}&response=json`);
        if (isOk(j)) {
          const s = parseSbl(j);
          if (s.size > 100) {
            let sh = 0;
            let val = 0;
            const p = await getPrices();
            for (const [code, q] of s) {
              sh += q;
              const px = p.get(code);
              if (px) val += q * px;
            }
            rec.sblShares = sh;
            rec.sblValue = p.size > 500 ? val : null;
          }
        }
      }
      if (!rec.mcap) {
        const p = await getPrices();
        if (p.size > 500) {
          if (!shares) shares = await fetchSharesOutstanding().catch((e) => (errors.push(`上市公司股數取得失敗：${e.message}`), new Map()));
          if (shares.size > 500) {
            let cap = 0;
            for (const [code, n] of shares) {
              const px = p.get(code);
              if (px) cap += n * px;
            }
            // 上市市值約數十兆至百餘兆元
            if (cap > 2e13 && cap < 5e14) rec.mcap = cap;
            else errors.push(`${d} 上市市值估算異常（${(cap / 1e12).toFixed(1)} 兆），已捨棄`);
          }
        }
      }
      days[d] = rec;
    } catch (e) {
      errors.push(`${d} 證交所資料：${e.message}`);
      if (/限流|HTTP 403|HTTP 429/.test(e.message)) break;
    }
  }

  try {
    const start = need[0];
    const end = need[need.length - 1];
    // 分段查詢（每段 ≤ 25 天），避免超過期交所單次查詢區間
    const fut = {};
    let a = new Date(`${start}T00:00:00Z`);
    const z = new Date(`${end}T00:00:00Z`);
    while (a <= z) {
      const b = new Date(Math.min(a.getTime() + 24 * 864e5, z.getTime()));
      Object.assign(fut, await fetchTaifex(a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)));
      a = new Date(b.getTime() + 864e5);
      await sleep(1500);
    }
    let n = 0;
    for (const [d, v] of Object.entries(fut)) {
      (days[d] ||= {}).fut = v;
      n++;
    }
    if (!n) errors.push('TAIFEX：查詢區間內沒有外資資料');
  } catch (e) {
    errors.push(`TAIFEX 外資台指期：${e.message}`);
  }

  // 只保留最近 90 天
  const keep = Object.keys(days).sort().slice(-90);
  history.days = Object.fromEntries(keep.map((k) => [k, days[k]]));
  log(`chips: TWSE requests=${requests}, days=${keep.length}`);
  return errors;
}

// ---------- 彙總 ----------
const pctChg = (a, b) => (a !== null && b ? ((a / b) - 1) * 100 : null);

/** 由快取算出追蹤表：今日 / 5 日 / 20 日 */
export function summarizeChips(history, twii) {
  const days = history.days || {};
  const dates = Object.keys(days).sort();
  const series = (fn) => dates.map((d) => [d, fn(days[d])]).filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v));
  const row = (s, mode) => {
    // mode: 'pct'（變化率）, 'diff'（差值）, 'sum'（累計）
    if (!s.length) return null;
    const n = s.length;
    const [date, v] = s[n - 1];
    const back = (k) => (n > k ? s[n - 1 - k][1] : null);
    const sum = (k) => (n >= k ? s.slice(-k).reduce((a, [, x]) => a + x, 0) : null);
    let c5 = null;
    let c20 = null;
    if (mode === 'pct') {
      c5 = pctChg(v, back(5));
      c20 = pctChg(v, back(20));
    } else if (mode === 'diff') {
      c5 = back(5) !== null ? v - back(5) : null;
      c20 = back(20) !== null ? v - back(20) : null;
    } else if (mode === 'sum') {
      c5 = sum(5);
      c20 = sum(20);
    }
    return { date, value: v, c5, c20, spark: s.slice(-21).map(([, x]) => x), obs: n };
  };

  const tw = twii ? twii.map((b) => [b.date, b.close]) : [];
  const out = {
    taiex: row(tw, 'pct'),
    margin: row(series((r) => r.finAmt), 'pct'),
    maint: row(series((r) => r.maint), 'diff'),
    sbl: row(series((r) => r.sblShares), 'pct'),
    sblValue: row(series((r) => r.sblValue), 'pct'),
    foreignSpot: row(series((r) => r.inst?.foreign), 'sum'),
    foreignFut: row(series((r) => r.fut?.net), 'diff'),
    marginToCap: row(series((r) => (r.finAmt && r.mcap ? (r.finAmt / r.mcap) * 100 : null)), 'diff'),
  };
  if (out.taiex) out.taiex.chg1d = tw.length > 1 ? pctChg(tw[tw.length - 1][1], tw[tw.length - 2][1]) : null;
  // 情境判斷：指數 5 日變化取「融資最新資料日」為終點，兩者同一天比較
  let idxAligned = out.taiex;
  if (out.margin) {
    const i = tw.findIndex(([d]) => d === out.margin.date);
    if (i >= 5) idxAligned = { date: tw[i][0], c5: pctChg(tw[i][1], tw[i - 5][1]) };
    else idxAligned = null;
  }
  out.scenario = scenario({ taiex: idxAligned, margin: out.margin });
  if (out.scenario) out.scenario.date = out.margin.date;
  out.institutional = dates.filter((d) => days[d].inst).slice(-5).map((d) => ({ date: d, ...days[d].inst }));
  return out;
}

/** 文件第四節：四種交叉判讀情境（以 5 日變化判斷） */
export function scenario(o) {
  const idx = o.taiex?.c5;
  const mg = o.margin?.c5;
  if (idx === null || idx === undefined || mg === null || mg === undefined) return null;
  const FLAT = 0.5; // 融資 5 日變化 ±0.5% 內視為持平
  const FAST = -2; // 5 日下降超過 2% 視為快速下降
  let key = null;
  if (idx > 0 && mg > FLAT) key = 'up_lev';
  else if (idx > 0) key = 'up_nolev';
  else if (idx < 0 && mg > FLAT) key = 'down_lev';
  else if (idx < 0 && mg <= FAST) key = 'down_delev';
  else if (idx < 0) key = 'down_mild';
  return { key, idx5: idx, margin5: mg, flat: FLAT, fast: FAST };
}
