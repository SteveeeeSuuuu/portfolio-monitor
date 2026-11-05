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

// ---------- 籌碼解析 ----------
import { twseTables, parseMargin, parseSbl, parseInst, parsePrices, parseTaifexCsv, summarizeChips, scenario } from '../lib/chips.mjs';

test('TWSE 新舊格式表格解析', () => {
  assert.equal(twseTables({ tables: [{ title: 'a', fields: ['x'], data: [[1]] }] }).length, 1);
  assert.equal(twseTables({ fields9: ['x'], data9: [[1]], creditFields: ['項目'], creditList: [['融資金額(仟元)']] }).length, 2);
});

test('融資：融資金額（仟元→元）與個股融資張數', () => {
  const j = {
    stat: 'OK',
    tables: [
      { title: '信用交易統計', fields: ['項目', '買進', '賣出', '現金(券)償還', '前日餘額', '今日餘額'], data: [['融資(交易單位)', '1', '2', '3', '4', '5,000'], ['融券(交易單位)', '1', '2', '3', '4', '300'], ['融資金額(仟元)', '1', '2', '3', '4', '320,000,000']] },
      { title: '融資融券彙總', fields: ['代號', '名稱', '買進', '賣出', '現金償還', '前日餘額', '今日餘額', '次一營業日限額', '買進', '賣出', '現券償還', '前日餘額', '今日餘額', '次一營業日限額', '資券互抵', '註記'], data: [['2330', '台積電', '0', '0', '0', '10', '12', '0', '0', '0', '0', '5', '7', '0', '0', '']] },
    ],
  };
  const m = parseMargin(j);
  assert.equal(m.finAmt, 320000000 * 1000);
  assert.equal(m.shortUnits, 300);
  assert.equal(m.perStock.get('2330'), 12); // 取融資的今日餘額，不是融券
});

test('借券賣出當日餘額、三大法人、收盤價', () => {
  const sbl = { stat: 'OK', tables: [{ fields: ['代號', '名稱', '前日餘額', '賣出', '買進', '現券', '今日餘額', '次一營業日限額', '前日餘額', '當日賣出', '當日還券', '當日調整', '當日餘額', '次一營業日可限額', '備註'], data: [['2330', '台積電', '1', '0', '0', '0', '99', '0', '1,000', '0', '0', '0', '2,000', '0', ''], ['合計', '', '', '', '', '', '', '', '', '', '', '', '9,999', '', '']] }] };
  assert.equal(parseSbl(sbl).get('2330'), 2000);
  assert.equal(parseSbl(sbl).has('合計'), false);
  const inst = { stat: 'OK', tables: [{ fields: ['單位名稱', '買進金額', '賣出金額', '買賣差額'], data: [['自營商(自行買賣)', '1', '1', '10'], ['自營商(避險)', '1', '1', '5'], ['投信', '1', '1', '-3'], ['外資及陸資(不含外資自營商)', '1', '1', '100'], ['外資自營商', '1', '1', '-1'], ['合計', '1', '1', '111']] }] };
  assert.deepEqual(parseInst(inst), { foreign: 99, trust: -3, dealer: 15, total: 111 });
  const px = { stat: 'OK', tables: [{ fields: ['證券代號', '證券名稱', '成交股數', '收盤價'], data: [['2330', '台積電', '1', '1,050.00'], ['9999', 'x', '0', '--']] }] };
  const p = parsePrices(px);
  assert.equal(p.get('2330'), 1050);
  assert.equal(p.has('9999'), false);
});

test('TAIFEX CSV：只取外資，未平倉淨額', () => {
  const csv = '日期,商品名稱,身份別,多方交易口數,多方交易契約金額(千元),空方交易口數,空方交易契約金額(千元),多空交易口數淨額,多空交易契約金額淨額(千元),多方未平倉口數,多方未平倉契約金額(千元),空方未平倉口數,空方未平倉契約金額(千元),多空未平倉口數淨額,多空未平倉契約金額淨額(千元)\n2026/11/03,臺股期貨,自營商,1,1,1,1,0,0,5,5,6,6,-1,-1\n2026/11/03,臺股期貨,外資,1,1,1,1,0,0,20000,1,45000,1,-25000,-1\n';
  assert.deepEqual(parseTaifexCsv(csv), { '2026-11-03': { long: 20000, short: 45000, net: -25000 } });
});

test('籌碼追蹤表：5 / 20 日變化與累計、情境判斷', () => {
  const days = {};
  const dates = Array.from({ length: 25 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  dates.forEach((d, i) => (days[d] = { finAmt: 100 + i, maint: 160 + i, sblShares: 1000, inst: { foreign: 10 }, fut: { net: -100 + i }, mcap: 10000 }));
  const twii = dates.map((d, i) => ({ date: d, close: 20000 + i * 10 }));
  const o = summarizeChips({ days }, twii);
  close(o.margin.c5, (124 / 119 - 1) * 100, 1e-9);
  close(o.margin.c20, (124 / 104 - 1) * 100, 1e-9);
  assert.equal(o.maint.c5, 5);
  assert.equal(o.foreignSpot.c5, 50);
  assert.equal(o.foreignSpot.c20, 200);
  assert.equal(o.foreignFut.c20, 20);
  close(o.marginToCap.value, 1.24, 1e-9);
  assert.equal(o.scenario.key, 'up_lev');
  assert.equal(scenario({ taiex: { c5: -1 }, margin: { c5: -3 } }).key, 'down_delev');
  assert.equal(scenario({ taiex: { c5: -1 }, margin: { c5: 1 } }).key, 'down_lev');
  assert.equal(scenario({ taiex: { c5: 1 }, margin: { c5: 0.2 } }).key, 'up_nolev');
  assert.equal(scenario({ taiex: { c5: -1 }, margin: { c5: -1 } }).key, 'down_mild');
});

import { parseNasdaqRows, parseYahooChart } from '../lib/sources.mjs';
test('Nasdaq 歷史資料解析', () => {
  const b = parseNasdaqRows([{ date: '11/03/2026', close: '$1,234.50', volume: '1,000', open: '$1,200.00', high: '$1,240.00', low: '$1,190.00' }, { date: '11/02/2026', close: '$1,200', volume: 'N/A', open: 'N/A', high: 'N/A', low: 'N/A' }]);
  assert.equal(b.length, 2);
  assert.equal(b[0].date, '2026-11-02');
  assert.equal(b[1].close, 1234.5);
  assert.equal(b[1].high, 1240);
  assert.equal(b[0].open, 1200);
});
test('Yahoo chart 解析：去除 null、台北時區日期', () => {
  const r = { meta: { gmtoffset: 28800, currency: 'TWD' }, timestamp: [1793667600, 1793754000], indicators: { quote: [{ open: [1, null], high: [2, null], low: [0.5, null], close: [1.5, null], volume: [10, null] }], adjclose: [{ adjclose: [1.4, null] }] } };
  const p = parseYahooChart('X', r, 0);
  assert.equal(p.bars.length, 1);
  assert.equal(p.bars[0].adjclose, 1.4);
  assert.match(p.bars[0].date, /^\d{4}-\d{2}-\d{2}$/);
});
import { earningsDays } from '../lib/sources.mjs';
test('財報倒數天數（秒為單位）', () => {
  const now = Date.UTC(2026, 10, 4, 16, 0) / 1000;
  const e = earningsDays({ TSLA: { ts: Date.UTC(2027, 0, 27, 21, 0) / 1000 }, NVDA: { ts: Date.UTC(2026, 10, 17, 21, 0) / 1000 }, SNDK: { ts: Date.UTC(2026, 9, 29, 21, 0) / 1000 } }, now);
  assert.equal(e.TSLA.daysLeft, 85);
  assert.equal(e.NVDA.daysLeft, 14);
  assert.equal(e.NVDA.date, '2026-11-17');
  assert.equal(e.SNDK, undefined);
});

import { normalizePositions } from '../lib/positions.mjs';
test('持倉設定：驗證、代號轉換、最多 10 檔', () => {
  const { positions, warnings } = normalizePositions({
    positions: [
      { ticker: '00631l', market: 'TW', type: 'leveraged', underlying: '0050', leverage: 2, semi: true },
      { ticker: 'AAPL', market: 'US', type: 'stock' },
      { ticker: '6488', market: 'TWO', type: 'stock' },
      { ticker: 'BAD TICKER', market: 'US', type: 'stock' },
      { ticker: 'SQQQ', market: 'US', type: 'leveraged', underlying: 'QQQ', leverage: -3 },
      { ticker: 'X1', market: 'US', type: 'leveraged', leverage: 2 },
      { ticker: 'X2', market: 'US', type: 'leveraged', underlying: 'Y', leverage: 0 },
      { ticker: 'AAPL', market: 'US', type: 'stock' },
      { ticker: 'SOXL', market: 'US', type: 'leveraged', underlying: 'SOXL', leverage: 3 },
    ],
  });
  assert.deepEqual(positions.map((p) => p.symbol), ['00631L.TW', 'AAPL', '6488.TWO', 'SQQQ']);
  assert.equal(positions[0].underlyingSymbol, '0050.TW');
  assert.equal(positions[1].underlyingSymbol, null);
  assert.equal(positions[3].leverage, -3);
  assert.equal(warnings.length, 5);
  assert.match(warnings.at(-1), /標的不能是自己/);
  const many = normalizePositions(Array.from({ length: 12 }, (_, i) => ({ ticker: `T${i}`, market: 'US', type: 'stock' })));
  assert.equal(many.positions.length, 10);
  assert.match(many.warnings[0], /最多 10 檔/);
});
