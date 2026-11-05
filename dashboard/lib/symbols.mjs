// 股票代號清單（給網頁的「輸入名稱自動搜尋」用）
// 美股：Nasdaq Trader 代號檔；台股：TWSE / TPEx OpenAPI。結果寫成 site 的 symbols.json。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return as === 'json' ? res.json() : res.text();
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// 名稱尾巴的「 - Common Stock」「Common Stock」等字樣去掉，縮小檔案
const shortName = (s) => clean(s).replace(/\s*-?\s*(Common Stock|Common Shares|Ordinary Shares|American Depositary Shares).*$/i, '').slice(0, 80);
const SKIP_NAME = /\b(Warrants?|Rights?|Units?)\b/i;

/** Nasdaq Trader 管線分隔檔 → [{s, n, e}]（依表頭名稱取欄位） */
export function parsePipeListing(text, symCol) {
  const lines = String(text).split(/\r?\n/).filter((l) => l && !l.startsWith('File Creation Time'));
  const head = lines.shift()?.split('|') || [];
  const si = head.indexOf(symCol);
  const ni = head.indexOf('Security Name');
  const ei = head.indexOf('ETF');
  const ti = head.indexOf('Test Issue');
  if (si < 0 || ni < 0) throw new Error(`代號檔欄位無法辨識：${head.join('|')}`);
  const out = [];
  for (const l of lines) {
    const c = l.split('|');
    if (ti >= 0 && c[ti] === 'Y') continue;
    const s = clean(c[si]);
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s) || SKIP_NAME.test(c[ni])) continue;
    out.push({ s, n: shortName(c[ni]), e: c[ei] === 'Y' ? 1 : 0 });
  }
  return out;
}

export async function buildSymbols() {
  const [nl, ol, tw, two] = await Promise.all([
    get('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'),
    get('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'),
    get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', 'json'),
    get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes', 'json'),
  ]);
  const us = new Map();
  for (const r of [...parsePipeListing(nl, 'Symbol'), ...parsePipeListing(ol, 'ACT Symbol')]) if (!us.has(r.s)) us.set(r.s, r);
  const twRows = (tw || []).map((r) => [clean(r.Code), clean(r.Name)]).filter(([c, n]) => /^[0-9A-Z]{4,6}$/.test(c) && n);
  const twoRows = (two || []).map((r) => [clean(r.SecuritiesCompanyCode), clean(r.CompanyName)]).filter(([c, n]) => /^[0-9A-Z]{4,6}$/.test(c) && n);
  // 合理性檢查：任何一邊明顯太少，代表來源格式變了
  if (us.size < 5000 || twRows.length < 800 || twoRows.length < 500) throw new Error(`代號清單筆數異常（美股 ${us.size}、上市 ${twRows.length}、上櫃 ${twoRows.length}）`);
  return {
    generatedAt: new Date().toISOString(),
    US: [...us.values()].map((r) => [r.s, r.n, r.e]),
    TW: twRows,
    TWO: twoRows,
  };
}
