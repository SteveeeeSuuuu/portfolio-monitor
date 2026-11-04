// 依 strategy-interface.md 實作的策略（輸出格式與文件一致）
import { sma, rsi, adx, last } from './indicators.mjs';

const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const round = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? null : Number(x.toFixed(d)));

export const DEFAULT_STRATEGIES = {
  leveraged: ['ma-cross', 'adx-trend', 'decay-monitor'],
  stock: ['ma-cross', 'adx-trend', 'rsi-momentum'],
  etf: ['ma-cross', 'adx-trend'],
};

export const DECAY_THRESHOLD = 5.0; // notification_settings.decay_threshold 預設值
export const DECAY_WINDOW = 60; // 未提供 buy_date 時，以近 60 個交易日估算耗損

/** ma-cross：MA5 / MA20 黃金、死亡交叉，跌破 MA5 警示 */
export function maCross({ ohlcv }) {
  const closes = ohlcv.map((b) => b.close);
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const n = closes.length;
  const price = closes[n - 1];
  const m5 = ma5[n - 1];
  const m20 = ma20[n - 1];
  const p5 = ma5[n - 2];
  const p20 = ma20[n - 2];
  if (m20 === null || p20 === null) {
    return { signal: 'HOLD', trend: 'SIDEWAYS', strength: 0, reason: '資料不足 20 日', indicators: {}, meta: {} };
  }
  const trend = m5 > m20 ? 'UP' : m5 < m20 ? 'DOWN' : 'SIDEWAYS';
  const strength = clamp(Math.abs(m5 / m20 - 1) * 1000);
  let signal = 'HOLD';
  let reason;
  if (p5 <= p20 && m5 > m20) {
    signal = 'BUY';
    reason = 'MA5 上穿 MA20（黃金交叉）';
  } else if (p5 >= p20 && m5 < m20) {
    signal = 'SELL';
    reason = 'MA5 下穿 MA20（死亡交叉）';
  } else if (price < m5) {
    signal = 'WARN';
    reason = `收盤 ${round(price)} 跌破 MA5 ${round(m5)}`;
  } else {
    reason = trend === 'UP' ? 'MA5 在 MA20 之上，站穩 MA5' : 'MA5 在 MA20 之下，但收盤站上 MA5';
  }
  return {
    signal,
    trend,
    strength: round(strength, 0),
    reason,
    indicators: { ma5: round(m5, 3), ma20: round(m20, 3), price: round(price, 3) },
    meta: {},
  };
}

/** adx-trend：ADX > 25 確認趨勢，+DI / -DI 判方向 */
export function adxTrend({ ohlcv }) {
  const r = adx(
    ohlcv.map((b) => b.high),
    ohlcv.map((b) => b.low),
    ohlcv.map((b) => b.close),
    14,
  );
  const a = last(r.adx);
  const p = last(r.pdi);
  const m = last(r.mdi);
  if (a === null) {
    return { signal: 'HOLD', trend: 'SIDEWAYS', strength: 0, reason: '資料不足', indicators: {}, meta: {} };
  }
  let trend = 'SIDEWAYS';
  let signal = 'HOLD';
  let reason;
  if (a > 25 && p > m) {
    trend = 'UP';
    reason = `ADX ${round(a, 1)} > 25 且 +DI > -DI，上升趨勢確立`;
  } else if (a > 25 && m > p) {
    trend = 'DOWN';
    signal = 'WARN';
    reason = `ADX ${round(a, 1)} > 25 且 -DI > +DI，下跌趨勢確立`;
  } else {
    reason = `ADX ${round(a, 1)} ≤ 25，無明確趨勢（盤整）`;
  }
  return {
    signal,
    trend,
    strength: round(clamp(a * 2), 0),
    reason,
    indicators: { adx: round(a, 1), pdi: round(p, 1), mdi: round(m, 1) },
    meta: {},
  };
}

/**
 * decay-monitor：耗損 = 標的報酬 × 槓桿 − ETF 實際報酬（decisions.md 公式）
 * underlyingOhlcv 依日期與 ETF 配對（只用兩邊都有的交易日）。
 */
export function decayMonitor(data, windows = [20, DECAY_WINDOW, 120]) {
  // decayOhlcv / underlyingOhlcv 可傳入還原股價（含配息），未提供則用 ohlcv
  const ohlcv = data.decayOhlcv ?? data.ohlcv;
  const { position, underlyingOhlcv } = data;
  const lev = position?.leverage ?? 1;
  const uMap = new Map(underlyingOhlcv.map((b) => [b.date, b.close]));
  const paired = ohlcv.filter((b) => uMap.has(b.date)).map((b) => ({ date: b.date, etf: b.close, und: uMap.get(b.date) }));
  const out = {};
  for (const w of windows) {
    if (paired.length <= w) {
      out[w] = null;
      continue;
    }
    const a = paired[paired.length - 1 - w];
    const b = paired[paired.length - 1];
    const etfRet = (b.etf / a.etf - 1) * 100;
    const undRet = (b.und / a.und - 1) * 100;
    const theo = undRet * lev;
    out[w] = { from: a.date, to: b.date, etf_return: round(etfRet), underlying_return: round(undRet), theoretical: round(theo), decay_pct: round(theo - etfRet) };
  }
  const main = out[DECAY_WINDOW];
  if (!main) {
    return { signal: 'HOLD', trend: 'SIDEWAYS', strength: 0, reason: '與標的重疊資料不足', indicators: {}, meta: { windows: out } };
  }
  const warn = main.decay_pct > DECAY_THRESHOLD;
  return {
    signal: warn ? 'WARN' : 'HOLD',
    trend: 'SIDEWAYS',
    strength: round(clamp((Math.abs(main.decay_pct) / DECAY_THRESHOLD) * 50), 0),
    reason: warn
      ? `近 ${DECAY_WINDOW} 日耗損 ${main.decay_pct}% 超過 ${DECAY_THRESHOLD}% 閾值`
      : `近 ${DECAY_WINDOW} 日耗損 ${main.decay_pct}%，未超過 ${DECAY_THRESHOLD}%`,
    indicators: { etf_return: main.etf_return, underlying_return: main.underlying_return, decay_pct: main.decay_pct },
    meta: { windows: out },
  };
}

/** rsi-momentum：RSI(14) > 70 超買 WARN，< 30 超賣 BUY */
export function rsiMomentum({ ohlcv }) {
  const r = last(rsi(ohlcv.map((b) => b.close), 14));
  if (r === null) return { signal: 'HOLD', trend: 'SIDEWAYS', strength: 0, reason: '資料不足', indicators: {}, meta: {} };
  let signal = 'HOLD';
  let reason = `RSI ${round(r, 1)} 位於中性區`;
  if (r > 70) {
    signal = 'WARN';
    reason = `RSI ${round(r, 1)} > 70，超買`;
  } else if (r < 30) {
    signal = 'BUY';
    reason = `RSI ${round(r, 1)} < 30，超賣`;
  }
  return {
    signal,
    trend: r > 50 ? 'UP' : r < 50 ? 'DOWN' : 'SIDEWAYS',
    strength: round(clamp(Math.abs(r - 50) * 2), 0),
    reason,
    indicators: { rsi: round(r, 1) },
    meta: {},
  };
}

export const registry = new Map([
  ['ma-cross', maCross],
  ['adx-trend', adxTrend],
  ['decay-monitor', decayMonitor],
  ['rsi-momentum', rsiMomentum],
]);

/** engine.js summarize()：SELL > WARN > (BUY 數 > HOLD 數 → BUY) > HOLD */
export function summarize(results) {
  const signals = results.map((r) => r.signal);
  if (signals.includes('SELL')) return 'SELL';
  if (signals.includes('WARN')) return 'WARN';
  const buy = signals.filter((s) => s === 'BUY').length;
  const hold = signals.filter((s) => s === 'HOLD').length;
  if (buy > hold) return 'BUY';
  return 'HOLD';
}

export function analyze(data, strategies) {
  const names = strategies ?? data.position?.strategies ?? DEFAULT_STRATEGIES[data.type];
  const results = names.map((name) => ({ strategy: name, ...registry.get(name)(data) }));
  return { ticker: data.ticker, results, summary: summarize(results) };
}
