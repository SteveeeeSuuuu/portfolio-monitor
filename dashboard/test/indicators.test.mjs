import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, adx, rollingPercentile, pctChange } from '../lib/indicators.mjs';
import { maCross, adxTrend, decayMonitor, rsiMomentum, summarize, analyze } from '../lib/strategies.mjs';
import { alignTo, rating } from '../lib/sentiment.mjs';

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const bars = (closes, spread = 0.5) =>
  closes.map((c, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, open: c, high: c + spread, low: c - spread, close: c, volume: 1 }));

test('sma 基本與缺值', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(sma([1, null, 3, 4, 5, 6], 3), [null, null, null, null, 4, 5]);
});

test('RSI 與 StockCharts Wilder 範例一致', () => {
  const c = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439];
  const r = rsi(c, 14);
  assert.equal(r[13], null);
  close(r[14], 70.53);
  close(r[15], 66.32);
  close(r[16], 66.55);
  close(r[17], 69.41);
  close(r[18], 66.36);
  close(r[19], 57.97);
});

test('ADX：穩定上漲 → +DI > -DI 且 ADX 高', () => {
  const c = Array.from({ length: 60 }, (_, i) => 100 + i);
  const r = adx(c.map((x) => x + 0.5), c.map((x) => x - 0.5), c, 14);
  assert.equal(r.adx[26], null);
  assert.ok(r.adx[27] !== null);
  assert.ok(r.pdi.at(-1) > r.mdi.at(-1));
  assert.ok(r.adx.at(-1) > 90);
});

test('ADX：穩定下跌 → -DI > +DI', () => {
  const c = Array.from({ length: 60 }, (_, i) => 200 - i);
  const r = adx(c.map((x) => x + 0.5), c.map((x) => x - 0.5), c, 14);
  assert.ok(r.mdi.at(-1) > r.pdi.at(-1));
});

test('rollingPercentile', () => {
  const v = Array.from({ length: 200 }, (_, i) => i);
  const p = rollingPercentile(v, 252, 120);
  assert.equal(p[118], null);
  close(p[199], (199 + 0.5) / 200 * 100);
});

test('pctChange', () => {
  assert.deepEqual(pctChange([100, 110, 121], 1).map((x) => x && Math.round(x)), [null, 10, 10]);
});

test('ma-cross：黃金交叉 / 死亡交叉 / 跌破 MA5', () => {
  // 先跌後急漲 → 最後一天 MA5 上穿 MA20
  const up = [...Array(25).fill(0).map((_, i) => 100 - i * 0.5)];
  let res;
  for (let k = 0; k < 15; k++) {
    up.push(up.at(-1) + 3);
    res = maCross({ ohlcv: bars(up) });
    if (res.signal === 'BUY') break;
  }
  assert.equal(res.signal, 'BUY');
  const down = [...Array(25).fill(0).map((_, i) => 100 + i * 0.5)];
  for (let k = 0; k < 15; k++) {
    down.push(down.at(-1) - 3);
    res = maCross({ ohlcv: bars(down) });
    if (res.signal === 'SELL') break;
  }
  assert.equal(res.signal, 'SELL');
  const c = Array.from({ length: 30 }, (_, i) => 100 + i);
  c.push(120); // 遠低於 MA5，但 MA5 仍在 MA20 之上
  res = maCross({ ohlcv: bars(c) });
  assert.equal(res.signal, 'WARN');
  assert.equal(res.trend, 'UP');
});

test('adx-trend：下跌趨勢 → WARN', () => {
  const c = Array.from({ length: 60 }, (_, i) => 200 - i);
  assert.equal(adxTrend({ ohlcv: bars(c) }).trend, 'DOWN');
  assert.equal(adxTrend({ ohlcv: bars(c) }).signal, 'WARN');
});

test('decay-monitor：剛好 2 倍區間報酬 → 耗損 0；落後 → WARN', () => {
  const und = bars(Array.from({ length: 130 }, (_, i) => 100 + i));
  const exact = und.map((b) => ({ ...b, close: 50 * (1 + 2 * (b.close / und[und.length - 61].close - 1)) }));
  const r = decayMonitor({ ohlcv: exact, position: { leverage: 2 }, underlyingOhlcv: und });
  close(r.indicators.decay_pct, 0, 1e-6);
  assert.equal(r.signal, 'HOLD');
  // ETF 完全不動 → 耗損 = 2 × 標的報酬
  const flat = und.map((b) => ({ ...b, close: 10 }));
  const r2 = decayMonitor({ ohlcv: flat, position: { leverage: 2 }, underlyingOhlcv: und });
  const undRet = (und.at(-1).close / und.at(-61).close - 1) * 100;
  close(r2.indicators.decay_pct, 2 * undRet);
  assert.equal(r2.signal, 'WARN');
});

test('rsi-momentum 門檻', () => {
  assert.equal(rsiMomentum({ ohlcv: bars(Array.from({ length: 30 }, (_, i) => 100 + i)) }).signal, 'WARN');
  assert.equal(rsiMomentum({ ohlcv: bars(Array.from({ length: 30 }, (_, i) => 100 - i)) }).signal, 'BUY');
});

test('summarize 投票規則', () => {
  const s = (...xs) => summarize(xs.map((signal) => ({ signal })));
  assert.equal(s('BUY', 'SELL', 'WARN'), 'SELL');
  assert.equal(s('BUY', 'WARN'), 'WARN');
  assert.equal(s('BUY', 'BUY', 'HOLD'), 'BUY');
  assert.equal(s('BUY', 'HOLD'), 'HOLD');
  assert.equal(s('HOLD', 'HOLD'), 'HOLD');
});

test('analyze 依 type 使用預設策略組合', () => {
  const c = bars(Array.from({ length: 130 }, (_, i) => 100 + Math.sin(i / 5) * 5));
  const r = analyze({ ticker: 'X', type: 'leveraged', ohlcv: c, position: { leverage: 2 }, underlyingOhlcv: c });
  assert.deepEqual(r.results.map((x) => x.strategy), ['ma-cross', 'adx-trend', 'decay-monitor']);
});

test('alignTo 向前補值', () => {
  assert.deepEqual(alignTo(['a', 'b', 'c', 'd'], [{ date: 'b', close: 1 }, { date: 'd', close: 2 }]), [null, 1, 1, 2]);
});

test('rating 區間', () => {
  assert.equal(rating(10), '極度恐懼');
  assert.equal(rating(30), '恐懼');
  assert.equal(rating(50), '中性');
  assert.equal(rating(60), '貪婪');
  assert.equal(rating(90), '極度貪婪');
});
