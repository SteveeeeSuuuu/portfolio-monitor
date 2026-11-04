// 在 GitHub Actions 上測試各資料來源是否可連（診斷用）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const t = async (name, url, opts = {}) => {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    console.log(`${r.status}  ${name}  ${body.slice(0, 160).replace(/\s+/g, ' ')}`);
    return { r, body };
  } catch (e) {
    console.log(`ERR  ${name}  ${e.message}`);
    return {};
  }
};
const yq = 'v8/finance/chart/NVDA?range=1mo&interval=1d';
await t('yahoo q1 UA', `https://query1.finance.yahoo.com/${yq}`, { headers: { 'User-Agent': UA } });
await t('yahoo q2 UA', `https://query2.finance.yahoo.com/${yq}`, { headers: { 'User-Agent': UA } });
await t('yahoo q1 noUA', `https://query1.finance.yahoo.com/${yq}`);
const fc = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' }).catch(() => null);
const cookie = (fc?.headers?.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
console.log('yahoo cookie', fc?.status, cookie ? 'yes' : 'no');
const cr = await t('yahoo crumb', 'https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
await t('yahoo q1 cookie+crumb', `https://query1.finance.yahoo.com/${yq}&crumb=${encodeURIComponent(cr.body || '')}`, { headers: { 'User-Agent': UA, Cookie: cookie } });
await t('stooq nvda', 'https://stooq.com/q/d/l/?s=nvda.us&i=d', { headers: { 'User-Agent': UA } });
await t('stooq ^spx', 'https://stooq.com/q/d/l/?s=^spx&i=d', { headers: { 'User-Agent': UA } });
await t('nasdaq NVDA', 'https://api.nasdaq.com/api/quote/NVDA/historical?assetclass=stocks&fromdate=2026-09-01&limit=10', { headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } });
await t('nasdaq TSLL etf', 'https://api.nasdaq.com/api/quote/TSLL/historical?assetclass=etf&fromdate=2026-09-01&limit=10', { headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } });
await t('nasdaq SPX index', 'https://api.nasdaq.com/api/quote/SPX/historical?assetclass=index&fromdate=2026-09-01&limit=10', { headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } });
await t('cboe vix', 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { headers: { 'User-Agent': UA } });
await t('fred SP500', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500', { headers: { 'User-Agent': UA } });
await t('twse MI_MARGN', 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?selectType=MS&response=json', { headers: { 'User-Agent': UA } });
await t('twse STOCK_DAY 0050', 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=0050&response=json', { headers: { 'User-Agent': UA } });
await t('twse TAIEX hist', 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json', { headers: { 'User-Agent': UA } });
await t('taifex', 'https://www.taifex.com.tw/cht/3/futContractsDateDown', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'queryStartDate=2026/10/20&queryEndDate=2026/11/03&commodityId=TXF' });
await t('cnn fg', 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2026-10-01', { headers: { 'User-Agent': UA, Referer: 'https://www.cnn.com/', Origin: 'https://www.cnn.com' } });
