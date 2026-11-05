// 情緒綜合分數：每個成分取「過去 252 交易日的百分位」，再平均成 0–100
import { sma, pctChange, realizedVol, rollingPercentile, rsi } from './indicators.mjs';

export function rating(score) {
  if (score === null || score === undefined) return null;
  if (score < 25) return '極度恐懼';
  if (score < 45) return '恐懼';
  if (score <= 55) return '中性';
  if (score <= 75) return '貪婪';
  return '極度貪婪';
}

/** 把 series(bars) 依 dates 對齊，缺值向前補（只補之前已出現過的值） */
export function alignTo(dates, bars, field = 'close') {
  const m = new Map(bars.map((b) => [b.date, b[field]]));
  let prev = null;
  return dates.map((d) => {
    if (m.has(d)) prev = m.get(d);
    return prev;
  });
}

const div = (a, b) => a.map((x, i) => (x === null || b[i] === null || b[i] === 0 ? null : x / b[i]));
const sub = (a, b) => a.map((x, i) => (x === null || b[i] === null ? null : x - b[i]));
const neg = (a) => a.map((x) => (x === null ? null : -x));
const ratioDev = (values, period) => {
  const m = sma(values, period);
  return values.map((v, i) => (m[i] === null ? null : (v / m[i] - 1) * 100));
};
/** 允許 null 的區間報酬 */
const chg = (values, lb) => values.map((v, i) => (i >= lb && v !== null && values[i - lb] ? (v / values[i - lb] - 1) * 100 : null));

/**
 * components: [{key, label, desc, raw:number[] (高=貪婪), unit, display:number[]}]
 * 回傳 { dates, score:number[], components:[...含 pct] }
 */
export function compose(dates, components) {
  const comps = components.map((c) => ({ ...c, pct: rollingPercentile(c.raw, 252, 120) }));
  const score = dates.map((_, i) => {
    const xs = comps.map((c) => c.pct[i]).filter((x) => x !== null);
    return xs.length >= Math.ceil(comps.length / 2) ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  });
  return { dates, score, components: comps };
}

/** 美股情緒（仿 CNN Fear & Greed 的方法，全部由價格資料自算） */
export function usSentiment(s) {
  const dates = s['^GSPC'].bars.map((b) => b.date);
  const spx = alignTo(dates, s['^GSPC'].bars);
  const vix = alignTo(dates, s['^VIX'].bars);
  const vix3m = s['^VIX3M'] ? alignTo(dates, s['^VIX3M'].bars) : null;
  const spy = alignTo(dates, s.SPY.bars, 'adjclose');
  const tlt = alignTo(dates, s.TLT.bars, 'adjclose');
  const hyg = alignTo(dates, s.HYG.bars, 'adjclose');
  const ief = alignTo(dates, s.IEF.bars, 'adjclose');
  const rsp = alignTo(dates, s.RSP.bars, 'adjclose');

  const vixDev = ratioDev(vix, 50);
  const comps = [
    { key: 'momentum', label: '市場動能', desc: 'S&P 500 相對 125 日均線的乖離', unit: '%', display: ratioDev(spx, 125) },
    { key: 'volatility', label: '波動率 (VIX)', desc: 'VIX 相對 50 日均線（越高越恐懼，反向計分）', unit: '%', display: vixDev },
    { key: 'safe_haven', label: '避險需求', desc: 'SPY − TLT 近 20 日報酬差（股優於債 = 貪婪）', unit: '%', display: sub(chg(spy, 20), chg(tlt, 20)) },
    { key: 'junk_bond', label: '垃圾債需求', desc: 'HYG − IEF 近 20 日報酬差（高收益債優於公債 = 貪婪）', unit: '%', display: sub(chg(hyg, 20), chg(ief, 20)) },
    { key: 'breadth', label: '市場廣度', desc: '等權重 RSP / 市值權重 SPY 比值 20 日變化（漲勢擴散 = 貪婪）', unit: '%', display: chg(div(rsp, spy), 20) },
  ];
  comps.forEach((c) => (c.raw = c.display));
  comps[1].raw = neg(vixDev);
  if (vix3m) {
    const ts = div(vix, vix3m);
    comps.push({ key: 'vix_term', label: 'VIX 期限結構', desc: 'VIX / VIX3M（> 1 為逆價差，短期恐慌；反向計分）', unit: 'x', display: ts, raw: neg(ts) });
  }
  return compose(dates, comps);
}

/** 台股情緒 */
export function twSentiment(s) {
  const dates = s['^TWII'].bars.map((b) => b.date);
  const tw = alignTo(dates, s['^TWII'].bars);
  const fx = alignTo(dates, s['TWD=X'].bars);
  const vol = realizedVol(tw.map((x) => x ?? NaN), 20).map((x) => (Number.isNaN(x) ? null : x));
  const fxChg = chg(fx, 20);
  const comps = [
    { key: 'momentum', label: '加權指數動能', desc: '加權指數相對 125 日均線的乖離', unit: '%', display: ratioDev(tw, 125) },
    { key: 'return20', label: '近 20 日漲跌', desc: '加權指數近 20 日報酬', unit: '%', display: chg(tw, 20) },
    { key: 'twd', label: '新台幣匯率', desc: 'USD/TWD 近 20 日變化（台幣升值 = 資金流入，反向計分）', unit: '%', display: fxChg },
    { key: 'volatility', label: '實現波動率', desc: '加權指數 20 日年化波動率（越高越恐懼，反向計分）', unit: '%', display: vol },
    { key: 'rsi', label: 'RSI(14)', desc: '加權指數 14 日 RSI', unit: '', display: rsi(tw.map((x) => x ?? NaN), 14).map((x) => (Number.isNaN(x) ? null : x)) },
  ];
  comps.forEach((c) => (c.raw = c.display));
  comps[2].raw = neg(fxChg);
  comps[3].raw = neg(vol);
  return compose(dates, comps);
}

/** 半導體 / AI 板塊情緒（持倉高度集中於此） */
export function semiSentiment(s) {
  const dates = s['^SOX'].bars.map((b) => b.date);
  const sox = alignTo(dates, s['^SOX'].bars);
  const spx = alignTo(dates, s['^GSPC'].bars);
  const vol = realizedVol(sox.map((x) => x ?? NaN), 20).map((x) => (Number.isNaN(x) ? null : x));
  const comps = [
    { key: 'momentum', label: '費半動能', desc: '費城半導體指數相對 125 日均線乖離', unit: '%', display: ratioDev(sox, 125) },
    { key: 'return20', label: '近 20 日漲跌', desc: '費半近 20 日報酬', unit: '%', display: chg(sox, 20) },
    { key: 'relative', label: '相對大盤強弱', desc: '費半 / S&P 500 比值 20 日變化', unit: '%', display: chg(div(sox, spx), 20) },
    { key: 'volatility', label: '實現波動率', desc: '費半 20 日年化波動率（反向計分）', unit: '%', display: vol },
  ];
  comps.forEach((c) => (c.raw = c.display));
  comps[3].raw = neg(vol);
  return compose(dates, comps);
}

export { pctChange };
