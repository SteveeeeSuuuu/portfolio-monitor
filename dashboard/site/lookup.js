'use strict';
// 代號搜尋與槓桿 ETF 自動判斷（瀏覽器與測試共用，掛在 globalThis.Lookup）
(function (root) {
  // 追蹤指數的槓桿 ETF：以追蹤同一指數的 ETF 當標的
  const CURATED = {
    SOXL: ['SOXX', 3], SOXS: ['SOXX', -3],
    TQQQ: ['QQQ', 3], SQQQ: ['QQQ', -3], QLD: ['QQQ', 2], QID: ['QQQ', -2], PSQ: ['QQQ', -1],
    UPRO: ['SPY', 3], SPXU: ['SPY', -3], SPXL: ['SPY', 3], SPXS: ['SPY', -3], SSO: ['SPY', 2], SDS: ['SPY', -2], SH: ['SPY', -1],
    TNA: ['IWM', 3], TZA: ['IWM', -3],
    TECL: ['XLK', 3], TECS: ['XLK', -3],
    LABU: ['XBI', 3], LABD: ['XBI', -3],
    TMF: ['TLT', 3], TMV: ['TLT', -3],
    UDOW: ['DIA', 3], SDOW: ['DIA', -3],
    YINN: ['FXI', 3], YANG: ['FXI', -3],
    NUGT: ['GDX', 2], DUST: ['GDX', -2],
  };
  const STOP = new Set(['ETF', 'ETFS', 'DAILY', 'LONG', 'SHORT', 'BULL', 'BEAR', 'TARGET', 'SHARES', 'TRUST', 'FUND', 'INDEX', 'INVERSE', 'LEVERAGED', 'ULTRA', 'ULTRAPRO', 'USD', 'US', 'THE', 'AND', 'OF', 'NYSE', 'NASDAQ', 'SP', 'DOW', 'ETN', 'II', 'III', 'REX', 'MSCI']);
  const SEMI = new Set(['NVDA', 'AMD', 'MU', 'MRVL', 'AVGO', 'TSM', 'SNDK', 'INTC', 'QCOM', 'ARM', 'SMCI', 'SOXX', 'SMH', 'ASML', 'AMAT', 'LRCX', 'KLAC', 'TXN', 'ON', 'MCHP', 'ADI', 'NXPI', 'WDC', 'STX', '2330', '2454', '2303', '3711', '2379', '3034', '0050']);
  const MARKET_NAME = { US: '美股', TW: '上市', TWO: '上櫃' };

  /** symbols.json → 搜尋用索引 */
  function makeIndex(data) {
    const rows = [];
    const usSet = new Map();
    for (const [s, n, e] of data.US || []) {
      rows.push({ s, n, m: 'US', e: e === 1 });
      usSet.set(s, n);
    }
    for (const [s, n] of data.TW || []) rows.push({ s, n, m: 'TW', e: s.startsWith('00') });
    for (const [s, n] of data.TWO || []) rows.push({ s, n, m: 'TWO', e: s.startsWith('00') });
    rows.forEach((r) => (r.lc = r.n.toLowerCase()));
    return { rows, usSet };
  }

  /** 輸入代號或名稱 → 最多 limit 筆，代號完全相符 > 代號開頭相符 > 名稱開頭 > 名稱包含 */
  function search(idx, q, limit = 8) {
    const raw = String(q || '').trim();
    if (!raw) return [];
    const up = raw.toUpperCase();
    const lc = raw.toLowerCase();
    const scored = [];
    for (const r of idx.rows) {
      let sc = 0;
      if (r.s === up) sc = 100;
      else if (r.s.startsWith(up)) sc = 80 - Math.min(r.s.length - up.length, 10);
      else if (r.lc.startsWith(lc)) sc = 50;
      else if (lc.length >= 2 && r.lc.includes(lc)) sc = 30;
      if (sc) scored.push([sc - (r.m === 'US' && /^\d/.test(raw) ? 20 : 0), r]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].s.length - b[1].s.length || a[1].s.localeCompare(b[1].s));
    return scored.slice(0, limit).map(([, r]) => r);
  }

  /** 從名稱判斷槓桿倍數與方向；不是槓桿型回傳 null */
  function parseLeverage(name) {
    const n = String(name || '');
    let lev = null;
    const m = n.match(/(\d+(?:\.\d+)?)\s*[xX](?![a-z])/);
    if (m) lev = Number(m[1]);
    else if (/UltraPro/i.test(n)) lev = 3;
    else if (/\bUltra\b/i.test(n)) lev = 2;
    const tw = n.match(/([正反])\s*(\d)/);
    if (tw) lev = Number(tw[2]) * (tw[1] === '反' ? -1 : 1);
    if (!lev || lev === 1 && !tw) return null;
    if (!tw && /\b(Short|Bear|Inverse)\b/i.test(n)) lev = -Math.abs(lev);
    return lev;
  }

  /** 找槓桿 ETF 的標的；找不到回傳 null */
  function findUnderlying(idx, row) {
    if (CURATED[row.s]) return CURATED[row.s][0];
    const n = row.n;
    if (row.m !== 'US') {
      if (/[台臺]灣\s*50/.test(n)) return '0050';
      if (/加權/.test(n)) return '^TWII';
      return null;
    }
    // 名稱裡直接寫代號（例：GraniteShares 2x Long MRVL Daily ETF）
    for (const tok of n.split(/[\s,()&/+]+/)) {
      if (/^[A-Z][A-Z0-9]{1,4}$/.test(tok) && !STOP.has(tok) && tok !== row.s && idx.usSet.has(tok)) return tok;
    }
    // 名稱寫公司名（例：T-Rex 2X Long NVIDIA Daily Target ETF）→ 找名稱以該字開頭的非 ETF 股票
    const mm = n.match(/\b(?:Long|Short|Bull|Bear)\s+([A-Za-z][A-Za-z0-9.&'-]+)/i);
    if (mm && !STOP.has(mm[1].toUpperCase())) {
      const w = mm[1].toLowerCase();
      const hits = idx.rows.filter((r) => r.m === 'US' && !r.e && (r.lc === w || r.lc.startsWith(w + ' ') || r.lc.startsWith(w + ',')));
      if (hits.length) return hits.sort((a, b) => a.s.length - b.s.length || a.n.length - b.n.length)[0].s;
    }
    return null;
  }

  /** 選了一筆搜尋結果 → 持倉欄位建議值 */
  function suggest(idx, row) {
    if (CURATED[row.s]) {
      const [u, l] = CURATED[row.s];
      return { ticker: row.s, market: row.m, type: 'leveraged', underlying: u, leverage: l, semi: SEMI.has(u) || /semiconductor|半導體/i.test(row.n), name: row.n, resolved: true };
    }
    const lev = row.e || /正\d|反\d/.test(row.n) ? parseLeverage(row.n) : null;
    if (lev !== null) {
      const u = findUnderlying(idx, row);
      return { ticker: row.s, market: row.m, type: 'leveraged', underlying: u, leverage: lev, semi: (u && SEMI.has(u)) || /semiconductor|半導體/i.test(row.n), name: row.n, resolved: Boolean(u) };
    }
    return { ticker: row.s, market: row.m, type: row.e ? 'etf' : 'stock', underlying: null, leverage: null, semi: SEMI.has(row.s) || /semiconductor|半導體/i.test(row.n), name: row.n, resolved: true };
  }

  root.Lookup = { makeIndex, search, parseLeverage, findUnderlying, suggest, MARKET_NAME, CURATED };
})(typeof globalThis !== 'undefined' ? globalThis : this);
