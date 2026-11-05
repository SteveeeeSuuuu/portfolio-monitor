// 技術指標計算（純函式，無外部依賴）
// 所有函式回傳與輸入等長的陣列，資料不足的位置為 null。

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** 簡單移動平均（視窗內有缺值則為 null） */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let bad = 0;
  for (let i = 0; i < values.length; i++) {
    if (isNum(values[i])) sum += values[i];
    else bad++;
    if (i >= period) {
      if (isNum(values[i - period])) sum -= values[i - period];
      else bad--;
    }
    if (i >= period - 1 && bad === 0) out[i] = sum / period;
  }
  return out;
}

/** RSI（Wilder 平滑） */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const toRsi = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = toRsi();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = toRsi();
  }
  return out;
}

/** ADX / +DI / -DI（Wilder 原始算法） */
export function adx(highs, lows, closes, period = 14) {
  const n = closes.length;
  const res = {
    adx: new Array(n).fill(null),
    pdi: new Array(n).fill(null),
    mdi: new Array(n).fill(null),
  };
  if (n < period * 2 + 1) return res;

  const tr = new Array(n).fill(0);
  const pdm = new Array(n).fill(0);
  const mdm = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }

  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    pS += pdm[i];
    mS += mdm[i];
  }
  const dx = new Array(n).fill(null);
  const calc = (i) => {
    const p = trS === 0 ? 0 : (100 * pS) / trS;
    const m = trS === 0 ? 0 : (100 * mS) / trS;
    res.pdi[i] = p;
    res.mdi[i] = m;
    dx[i] = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  };
  calc(period);
  for (let i = period + 1; i < n; i++) {
    trS = trS - trS / period + tr[i];
    pS = pS - pS / period + pdm[i];
    mS = mS - mS / period + mdm[i];
    calc(i);
  }

  // 第一個 ADX = 前 period 個 DX 的平均
  const first = period * 2 - 1;
  let sum = 0;
  for (let i = period; i <= first; i++) sum += dx[i];
  let a = sum / period;
  res.adx[first] = a;
  for (let i = first + 1; i < n; i++) {
    a = (a * (period - 1) + dx[i]) / period;
    res.adx[i] = a;
  }
  return res;
}

/** 區間報酬（%）：從 i-lookback 到 i */
export function pctChange(values, lookback) {
  return values.map((v, i) => (i >= lookback && values[i - lookback] ? (v / values[i - lookback] - 1) * 100 : null));
}

/** 年化歷史波動率（%），用對數報酬 */
export function realizedVol(closes, period = 20) {
  const out = new Array(closes.length).fill(null);
  const r = closes.map((c, i) => (i === 0 ? null : Math.log(c / closes[i - 1])));
  for (let i = period; i < closes.length; i++) {
    const win = r.slice(i - period + 1, i + 1);
    const mean = win.reduce((s, x) => s + x, 0) / period;
    const v = win.reduce((s, x) => s + (x - mean) ** 2, 0) / (period - 1);
    out[i] = Math.sqrt(v) * Math.sqrt(252) * 100;
  }
  return out;
}

/**
 * 滾動百分位（0–100）：當日數值在過去 window 天（含當日）中的位置。
 * 相同值算一半，避免偏差。資料不足 minObs 筆時為 null。
 */
export function rollingPercentile(values, window = 252, minObs = 120) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    let below = 0;
    let equal = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const x = values[j];
      if (x === null || x === undefined || Number.isNaN(x)) continue;
      cnt++;
      if (x < v) below++;
      else if (x === v) equal++;
    }
    if (cnt >= minObs) out[i] = ((below + 0.5 * equal) / cnt) * 100;
  }
  return out;
}

export const last = (arr) => arr[arr.length - 1];
