// 持倉清單：讀取 positions.json、驗證並轉成 Yahoo 代碼（最多 10 檔）
export const MAX_POSITIONS = 10;
const SUFFIX = { US: '', TW: '.TW', TWO: '.TWO' };
const TYPES = ['leveraged', 'stock', 'etf'];
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

/** raw: positions.json 內容（{positions:[...]} 或陣列）→ { positions, warnings } */
export function normalizePositions(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.positions) ? raw.positions : [];
  const warnings = [];
  const out = [];
  const seen = new Set();
  for (const [i, p] of list.entries()) {
    const ticker = String(p?.ticker ?? '').trim().toUpperCase();
    const market = String(p?.market ?? 'US').trim().toUpperCase();
    const type = String(p?.type ?? 'stock').trim();
    if (!TICKER_RE.test(ticker)) {
      warnings.push(`第 ${i + 1} 筆代號「${p?.ticker ?? ''}」格式不正確，已略過`);
      continue;
    }
    if (!(market in SUFFIX)) {
      warnings.push(`${ticker}：市場「${market}」不支援（US / TW / TWO），已略過`);
      continue;
    }
    if (!TYPES.includes(type)) {
      warnings.push(`${ticker}：類型「${type}」不支援，已略過`);
      continue;
    }
    if (seen.has(`${market}:${ticker}`)) {
      warnings.push(`${ticker}：重複，已略過`);
      continue;
    }
    let underlying = null;
    let leverage = 1;
    if (type === 'leveraged') {
      underlying = String(p?.underlying ?? '').trim().toUpperCase();
      leverage = Number(p?.leverage);
      if (!TICKER_RE.test(underlying)) {
        warnings.push(`${ticker}：槓桿型需要填標的代號，已略過`);
        continue;
      }
      if (!Number.isFinite(leverage) || leverage === 0 || Math.abs(leverage) > 5) {
        warnings.push(`${ticker}：槓桿倍數「${p?.leverage}」不正確（-5 ~ 5，不可為 0），已略過`);
        continue;
      }
    }
    if (out.length >= MAX_POSITIONS) {
      warnings.push(`持倉最多 ${MAX_POSITIONS} 檔，「${ticker}」之後的已略過`);
      break;
    }
    seen.add(`${market}:${ticker}`);
    out.push({
      ticker,
      market,
      type,
      underlying,
      leverage,
      semi: Boolean(p?.semi),
      note: String(p?.note ?? '').slice(0, 200),
      symbol: ticker + SUFFIX[market],
      underlyingSymbol: underlying ? underlying + SUFFIX[market] : null,
      currency: market === 'US' ? 'USD' : 'TWD',
    });
  }
  return { positions: out, warnings };
}
