// 在 GitHub Actions 上測試各資料來源是否可連（診斷用）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const t = async (name, url, opts = {}) => {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(25000) });
    const body = await r.text();
    console.log(`${r.status}  ${name}  len=${body.length}  ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
    return { r, body };
  } catch (e) {
    console.log(`ERR  ${name}  ${e.message}`);
    return {};
  }
};
const nl = await t('nasdaqtrader nasdaqlisted', 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', { headers: { 'User-Agent': UA } });
console.log('  tail:', nl.body?.slice(-200));
const ol = await t('nasdaqtrader otherlisted', 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt', { headers: { 'User-Agent': UA } });
for (const s of ['SOXL', 'TSLL', 'NVDX', 'MVLL', 'MUU', 'SNXX', 'AMDL', 'TQQQ', 'SQQQ', 'NVDL', 'SOXS', 'UPRO']) {
  const line = (nl.body + '\n' + ol.body).split('\n').find((l) => l.startsWith(s + '|'));
  console.log('  ', s, '=>', line);
}
const tw = await t('twse openapi STOCK_DAY_ALL', 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', { headers: { 'User-Agent': UA } });
try { const j = JSON.parse(tw.body); console.log('  count', j.length, JSON.stringify(j.find((x) => x.Code === '00631L')), JSON.stringify(j.find((x) => x.Code === '2330'))); } catch (e) { console.log('  parse', e.message); }
const tp = await t('tpex openapi mainboard quotes', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes', { headers: { 'User-Agent': UA } });
try { const j = JSON.parse(tp.body); console.log('  count', j.length, 'keys', Object.keys(j[0]).join(','), JSON.stringify(j.find((x) => JSON.stringify(x).includes('6488')))); } catch (e) { console.log('  parse', e.message); }
const tpe = await t('tpex openapi etf', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', { headers: { 'User-Agent': UA } });
try { const j = JSON.parse(tpe.body); console.log('  count', j.length, 'keys', Object.keys(j[0]).join(',')); } catch (e) { console.log('  parse', e.message); }
