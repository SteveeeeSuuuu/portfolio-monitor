// 診斷：檢查線上 GitHub Pages 實際提供的內容
const site = 'https://steveeeesuuuu.github.io/portfolio-monitor/';
for (const u of ['', 'data.json?t=' + Date.now(), 'data.json']) {
  try {
    const r = await fetch(site + u, { cache: 'no-store' });
    const body = await r.text();
    const h = ['cache-control', 'age', 'x-cache', 'last-modified', 'etag'].map((k) => `${k}=${r.headers.get(k)}`).join(' ');
    console.log(`${r.status} /${u}  ${h}`);
    if (u.startsWith('data.json')) {
      const d = JSON.parse(body);
      console.log('   generatedAt', d.generatedAt, 'positions', d.positions.map((p) => p.ticker).join(','), 'warnings', d.warnings.length);
    } else {
      console.log('   scripts', body.match(/<script src="[^"]+"/g)?.join(' '));
    }
  } catch (e) {
    console.log('ERR', u, e.message);
  }
}
