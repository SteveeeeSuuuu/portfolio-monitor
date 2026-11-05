// 本地測試用假資料（--mock）：可重現的隨機漫步，槓桿 ETF 由標的日報酬 ×2 產生
import { readFileSync } from 'node:fs';
import { normalizePositions } from '../lib/positions.mjs';

const POSITIONS = normalizePositions(JSON.parse(readFileSync(new URL('../positions.json', import.meta.url), 'utf8'))).positions;

function rng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dates(n, end = '2026-11-03') {
  const out = [];
  const d = new Date(`${end}T00:00:00Z`);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

function returns(sym, n, vol) {
  const r = rng(sym);
  return Array.from({ length: n }, () => {
    const g = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    return 0.0003 + vol * g;
  });
}

function toBars(ds, rets, start, sym) {
  const r = rng(sym + 'hl');
  let c = start;
  return ds.map((date, i) => {
    const o = c;
    c = c * (1 + rets[i]);
    const hi = Math.max(o, c) * (1 + r() * 0.01);
    const lo = Math.min(o, c) * (1 - r() * 0.01);
    return { date, open: o, high: hi, low: lo, close: c, adjclose: c, volume: 1e6 };
  });
}

const N = 1260;
export function mockDaily(sym) {
  const ds = dates(N);
  const pos = POSITIONS.find((p) => p.symbol === sym) || (/^(AAPL|6488\.TWO|SPY|QQQ)$/.test(sym) ? null : undefined);
  if (pos && pos.underlyingSymbol) {
    const ur = returns(pos.underlyingSymbol, N, 0.025);
    return { symbol: sym, currency: pos.currency, partial: false, bars: toBars(ds, ur.map((x) => x * pos.leverage - 0.0001), 20, sym) };
  }
  const vol = sym.includes('VIX') ? 0.06 : sym === 'TLT' || sym === 'IEF' ? 0.006 : 0.012;
  const start = sym.includes('VIX') ? 18 : sym === 'TWD=X' ? 31 : 100;
  return { symbol: sym, currency: 'USD', partial: false, bars: toBars(ds, returns(sym, N, vol), start, sym) };
}

/** 假的籌碼快取（--mock） */
export function mockChips(dates) {
  const r = rng('chips');
  const days = {};
  let fin = 3.2e11;
  let sbl = 9e9;
  let fut = -25000;
  let maint = 168;
  dates.forEach((d) => {
    fin *= 1 + (r() - 0.45) * 0.02;
    sbl *= 1 + (r() - 0.5) * 0.03;
    fut += Math.round((r() - 0.5) * 6000);
    maint += (r() - 0.5) * 3;
    days[d] = {
      finAmt: fin,
      shortUnits: 300000,
      maint: Number(maint.toFixed(2)),
      mcap: 9e13 * (1 + (r() - 0.5) * 0.02),
      sblShares: sbl,
      sblValue: sbl * 85,
      inst: { foreign: (r() - 0.5) * 6e10, trust: (r() - 0.5) * 1e10, dealer: (r() - 0.5) * 8e9, total: (r() - 0.5) * 7e10 },
      fut: { long: 20000, short: 20000 - fut, net: fut },
    };
  });
  return { days };
}

/** 假的代號清單（--mock） */
export function mockSymbols() {
  return {
    generatedAt: new Date().toISOString(),
    US: [['SOXL', 'Direxion Daily Semiconductor Bull 3X ETF', 1], ['SOXX', 'iShares Semiconductor ETF', 1], ['TSLL', 'Direxion Daily TSLA Bull 2X ETF', 1], ['TSLA', 'Tesla, Inc.', 0], ['NVDX', 'T-Rex 2X Long NVIDIA Daily Target ETF', 1], ['NVDA', 'NVIDIA Corporation', 0], ['AAPL', 'Apple Inc.', 0], ['TQQQ', 'ProShares UltraPro QQQ', 1], ['QQQ', 'Invesco QQQ Trust, Series 1', 1], ['XYZL', 'Example 2X Long Something Daily ETF', 1]],
    TW: [['00631L', '元大台灣50正2'], ['0050', '元大台灣50'], ['2330', '台積電']],
    TWO: [['6488', '環球晶']],
  };
}
