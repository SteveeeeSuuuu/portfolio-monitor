'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const fmt = (x, d = 2) => (isNum(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const pct = (x, d = 2) => (isNum(x) ? `<span class="num ${x > 0 ? 'up' : x < 0 ? 'down' : ''}">${x > 0 ? '+' : ''}${fmt(x, d)}%</span>` : '<span class="muted">—</span>');
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // ---------- 主題與漲跌顏色 ----------
  const themes = ['auto', 'light', 'dark'];
  const themeLabel = { auto: '主題：自動', light: '主題：淺色', dark: '主題：深色' };
  let theme = store.get('theme') || 'auto';
  let colorMode = store.get('color') || 'tw';
  function applyPrefs() {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    if (colorMode === 'us') root.setAttribute('data-color', 'us');
    else root.removeAttribute('data-color');
    $('#themeBtn').textContent = themeLabel[theme];
    $('#colorBtn').textContent = colorMode === 'us' ? '綠漲紅跌' : '紅漲綠跌';
  }
  $('#themeBtn').addEventListener('click', () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    store.set('theme', theme);
    applyPrefs();
    if (DATA) render(DATA);
  });
  $('#colorBtn').addEventListener('click', () => {
    colorMode = colorMode === 'us' ? 'tw' : 'us';
    store.set('color', colorMode);
    applyPrefs();
    if (DATA) render(DATA);
  });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => theme === 'auto' && DATA && render(DATA));
  applyPrefs();

  // ---------- 儀表 ----------
  function arc(cx, cy, r, v0, v1) {
    const p = (v) => {
      const t = Math.PI * (1 - v / 100);
      return [cx + r * Math.cos(t), cy - r * Math.sin(t)];
    };
    const [x0, y0] = p(v0);
    const [x1, y1] = p(v1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function gauge(score) {
    const segs = [
      [0, 25, 'var(--fear)'],
      [25, 45, 'color-mix(in srgb, var(--fear) 45%, var(--surface))'],
      [45, 55, 'var(--neutral)'],
      [55, 75, 'color-mix(in srgb, var(--greed) 45%, var(--surface))'],
      [75, 100, 'var(--greed)'],
    ];
    const cx = 110, cy = 112, r = 88;
    const paths = segs.map(([a, b, c]) => `<path d="${arc(cx, cy, r, a + 0.6, b - 0.6)}" stroke="${c}" stroke-width="18" fill="none"/>`).join('');
    let needle = '';
    if (isNum(score)) {
      const t = Math.PI * (1 - score / 100);
      const x = cx + (r - 26) * Math.cos(t);
      const y = cy - (r - 26) * Math.sin(t);
      needle = `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>`;
    }
    const ticks = [0, 25, 50, 75, 100].map((v) => {
      const t = Math.PI * (1 - v / 100);
      return `<text x="${(cx + (r + 18) * Math.cos(t)).toFixed(1)}" y="${(cy - (r + 18) * Math.sin(t) + 4).toFixed(1)}" font-size="10" fill="var(--muted)" text-anchor="middle">${v}</text>`;
    }).join('');
    return `<svg viewBox="0 0 220 128" role="img" aria-label="情緒分數 ${isNum(score) ? score : '無資料'}">${paths}${ticks}${needle}</svg>`;
  }
  function gaugeCard(title, desc, s) {
    if (!s) return `<div class="card gauge-card"><h3>${esc(title)}</h3><div class="desc">${esc(desc)}</div><div class="muted" style="padding:40px 0">今日無資料</div></div>`;
    const prev = (label, v) => `<div>${label}<b class="num">${isNum(v) ? fmt(v, 0) : '—'}</b></div>`;
    return `<div class="card gauge-card">
      <h3>${esc(title)}</h3><div class="desc">${esc(desc)}</div>
      <div class="gauge">${gauge(s.score)}</div>
      <div class="score num">${isNum(s.score) ? fmt(s.score, 0) : '—'}</div>
      <div class="rating">${esc(s.rating ?? '')}</div>
      <div class="muted" style="font-size:12px">資料日 ${esc(s.date ?? '')}</div>
      <div class="prevs">${prev('前一日', s.prev?.d1)}${prev('一週前', s.prev?.w1)}${prev('一個月前', s.prev?.m1)}${prev('一年前', s.prev?.y1)}</div>
    </div>`;
  }

  // ---------- 成分表 ----------
  function compTable(comps, showValue = true) {
    const rows = comps.map((c) => `<div class="comp">
      <div class="comp-text"><div class="comp-label">${esc(c.label)}</div>${c.desc ? `<div class="comp-desc">${esc(c.desc)}</div>` : ''}</div>
      <div class="comp-val num">${showValue && isNum(c.value) ? fmt(c.value, c.unit === 'x' ? 3 : 2) + (c.unit === '%' ? '%' : '') : ''}</div>
      <div class="bar" role="img" aria-label="分數 ${isNum(c.score) ? fmt(c.score, 0) : '無'}">${isNum(c.score) ? `<i style="left:${c.score}%"></i>` : ''}</div>
      <div class="comp-score num"><b>${isNum(c.score) ? fmt(c.score, 0) : '—'}</b> <span class="ink2">${esc(ratingZh(c.rating))}</span></div>
    </div>`).join('');
    return `<div class="comp-head"><span>成分</span><span>${showValue ? '當前值' : ''}</span><span>恐懼 ← → 貪婪</span><span>分數</span></div>${rows}`;
  }
  const ratingMap = { 'extreme fear': '極度恐懼', fear: '恐懼', neutral: '中性', greed: '貪婪', 'extreme greed': '極度貪婪' };
  const ratingZh = (r) => ratingMap[String(r || '').toLowerCase()] || r || '';

  // ---------- 圖表 ----------
  const charts = [];
  function destroyCharts() { while (charts.length) charts.pop().destroy(); }
  const bandsPlugin = {
    id: 'bands',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { y } } = chart;
      if (!a || !y) return;
      const bands = [[0, 25, '--fear', 0.10], [75, 100, '--greed', 0.10]];
      ctx.save();
      for (const [lo, hi, v, al] of bands) {
        ctx.globalAlpha = al;
        ctx.fillStyle = css(v);
        ctx.fillRect(a.left, y.getPixelForValue(hi), a.right - a.left, y.getPixelForValue(lo) - y.getPixelForValue(hi));
      }
      ctx.restore();
    },
  };
  function baseOpts() {
    const grid = css('--grid'), muted = css('--muted');
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: css('--ink-2'), borderColor: css('--axis'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true },
      },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } }, grid: { display: false }, border: { color: css('--axis') } },
        y: { ticks: { color: muted, font: { size: 11 } }, grid: { color: grid }, border: { display: false } },
      },
      elements: { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 2, tension: 0 } },
    };
  }
  function historyChart(canvas, sent, days) {
    const series = [['us', '美股', '--s1'], ['tw', '台股', '--s2'], ['semi', '半導體', '--s3']].filter(([k]) => sent[k]);
    const all = new Set();
    series.forEach(([k]) => sent[k].history.dates.forEach((d) => all.add(d)));
    let dates = [...all].sort();
    dates = dates.slice(-days);
    const ds = series.map(([k, label, color]) => {
      const m = new Map(sent[k].history.dates.map((d, i) => [d, sent[k].history.score[i]]));
      return { label, data: dates.map((d) => (m.has(d) ? m.get(d) : null)), borderColor: css(color), backgroundColor: css(color), spanGaps: true };
    });
    const o = baseOpts();
    o.scales.y.min = 0; o.scales.y.max = 100;
    o.scales.y.ticks.stepSize = 25;
    charts.push(new Chart(canvas, { type: 'line', data: { labels: dates, datasets: ds }, options: o, plugins: [bandsPlugin] }));
  }
  function posChart(canvas, c) {
    const o = baseOpts();
    o.scales.x.ticks.maxTicksLimit = 4;
    o.scales.y.ticks.maxTicksLimit = 4;
    charts.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels: c.dates,
        datasets: [
          { label: '收盤', data: c.close, borderColor: css('--s1'), backgroundColor: css('--s1') },
          { label: 'MA5', data: c.ma5, borderColor: css('--s2'), backgroundColor: css('--s2'), borderWidth: 1.5 },
          { label: 'MA20', data: c.ma20, borderColor: css('--s3'), backgroundColor: css('--s3'), borderWidth: 1.5 },
        ],
      },
      options: o,
    }));
  }
  function fgChart(canvas, hist) {
    const o = baseOpts();
    o.scales.y.min = 0; o.scales.y.max = 100; o.scales.y.ticks.stepSize = 25;
    const h = hist.slice(-260);
    charts.push(new Chart(canvas, { type: 'line', data: { labels: h.map((p) => p[0]), datasets: [{ label: 'CNN Fear & Greed', data: h.map((p) => p[1]), borderColor: css('--s1'), backgroundColor: css('--s1') }] }, options: o, plugins: [bandsPlugin] }));
  }
  function spark(values) {
    const v = values.filter(isNum);
    if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v);
    const w = 110, h = 30;
    const pts = values.map((x, i) => (isNum(x) ? `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}` : null)).filter(Boolean).join(' ');
    const cls = v.at(-1) >= v[0] ? 'up' : 'down';
    return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // ---------- 持倉 ----------
  const sigZh = { SELL: '賣出', WARN: '警示', BUY: '買進', HOLD: '持有', ADD: '加碼', REDUCE: '減碼' };
  const trendZh = { UP: '↑ 上升', DOWN: '↓ 下跌', SIDEWAYS: '→ 盤整' };
  const badge = (s) => `<span class="badge sig-${esc(s)}">${esc(sigZh[s] || s)} ${esc(s)}</span>`;
  const stratZh = { 'ma-cross': 'MA 交叉', 'adx-trend': 'ADX 趨勢', 'decay-monitor': '槓桿耗損', 'rsi-momentum': 'RSI 動能' };
  function indText(r) {
    const i = r.indicators || {};
    if (r.strategy === 'ma-cross') return `收盤 ${fmt(i.price, 2)}・MA5 ${fmt(i.ma5, 2)}・MA20 ${fmt(i.ma20, 2)}`;
    if (r.strategy === 'adx-trend') return `ADX ${fmt(i.adx, 1)}・+DI ${fmt(i.pdi, 1)}・−DI ${fmt(i.mdi, 1)}`;
    if (r.strategy === 'rsi-momentum') return `RSI ${fmt(i.rsi, 1)}`;
    if (r.strategy === 'decay-monitor') return `ETF ${fmt(i.etf_return)}%・標的 ${fmt(i.underlying_return)}%`;
    return '';
  }
  function decayTable(r, lev) {
    const w = r?.meta?.windows;
    if (!w) return '';
    const rows = Object.entries(w).filter(([, v]) => v).map(([k, v]) => `<tr><td class="num">${k} 日</td><td class="r">${pct(v.etf_return)}</td><td class="r">${pct(v.underlying_return)}</td><td class="r">${pct(v.theoretical)}</td><td class="r num"><b>${fmt(v.decay_pct)}%</b></td></tr>`).join('');
    return `<div class="scroll" style="margin-top:6px"><table><thead><tr><th>區間</th><th class="r">ETF 報酬</th><th class="r">標的報酬</th><th class="r">理論 ×${lev}</th><th class="r">耗損</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function posCard(p, d, idx) {
    const q = p.quote, uq = p.underlyingQuote;
    const er = d.earnings?.[p.underlyingSymbol];
    const alerts = [...p.alerts.map((a) => `<li>${esc(a)}</li>`)];
    if (er && er.daysLeft >= 0 && er.daysLeft <= 3) alerts.push(`<li>${esc(p.underlying)} 財報剩 ${er.daysLeft} 天</li>`);
    if (p.partial) alerts.push('<li class="info">盤中資料，尚未收盤</li>');
    const ccy = p.currency === 'TWD' ? 'NT$' : '$';
    const strats = p.results.map((r) => `<div class="strat"><div class="name">${esc(stratZh[r.strategy] || r.strategy)}</div><div>${badge(r.signal)} <span class="ink2">${esc(trendZh[r.trend] || '')}</span>　${esc(r.reason)}</div><div class="ind">${esc(indText(r))}${isNum(r.strength) ? `・強度 ${r.strength}` : ''}</div></div>`).join('');
    const hasRsi = p.results.some((r) => r.strategy === 'rsi-momentum');
    return `<div class="card">
      <div class="pos-head">
        <div><div class="t">${esc(p.ticker)} ${badge(p.summary)}</div><div class="u">${esc(p.underlying)} ×${p.leverage}・${esc(p.market === 'TW' ? '台股' : '美股')}・${esc(q.date)}</div></div>
        <div class="price"><b class="num">${ccy}${fmt(q.close, 2)}</b><div>${pct(q.chg1d)}</div></div>
      </div>
      ${alerts.length ? `<ul class="alerts">${alerts.join('')}</ul>` : ''}
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--s1)"></i>收盤</span><span><i style="background:var(--s2)"></i>MA5</span><span><i style="background:var(--s3)"></i>MA20</span></div>
      <div class="chart-box"><canvas id="pc${idx}" aria-label="${esc(p.ticker)} 近 120 日收盤與均線"></canvas></div>
      <div class="strats">${strats}
        ${!hasRsi ? `<div class="strat"><div class="name">RSI(14) 參考</div><div class="num">${fmt(p.rsiInfo, 1)} <span class="muted">（槓桿型預設不納入投票）</span></div></div>` : ''}
        <div class="strat"><div class="name">區間表現</div><div>5 日 ${pct(q.chg5d)}・20 日 ${pct(q.chg20d)}・距 52 週高 ${pct(q.fromHigh52w)}</div><div class="ind">標的 ${esc(p.underlying)}：今日 ${pct(uq.chg1d)}・20 日 ${pct(uq.chg20d)}</div></div>
        ${er ? `<div class="strat"><div class="name">下次財報</div><div class="num">${esc(p.underlying)} ${esc(er.date)}（${er.daysLeft >= 0 ? `剩 ${er.daysLeft} 天` : '已公布'}${er.estimated ? '，預估日' : ''}）</div></div>` : ''}
      </div>
      <details style="margin-top:6px"><summary class="ink2" style="cursor:pointer;font-size:13px">耗損明細（多區間）</summary>${decayTable(p.results.find((r) => r.strategy === 'decay-monitor'), p.leverage)}</details>
      <div class="note">${esc(p.note)}</div>
    </div>`;
  }

  // ---------- 市場總覽 ----------
  function marketTable(ms) {
    const groups = [...new Set(ms.map((m) => m.group))];
    const body = groups.map((g) => `<tr><th colspan="11" style="padding-top:14px">${esc(g)}</th></tr>` + ms.filter((m) => m.group === g).map((m) => `<tr>
      <td><b>${esc(m.name)}</b><div class="muted" style="font-size:11.5px">${esc(m.symbol)}${m.partial ? '・盤中' : ''}</div></td>
      <td class="r num">${fmt(m.close, m.close < 10 ? 3 : 2)}</td>
      <td class="r">${pct(m.chg1d)}</td><td class="r">${pct(m.chg5d)}</td><td class="r">${pct(m.chg20d)}</td><td class="r">${pct(m.ytd)}</td>
      <td class="r">${pct(m.vsMa20, 1)}</td><td class="r">${pct(m.vsMa50, 1)}</td><td class="r">${pct(m.vsMa200, 1)}</td>
      <td class="r num">${fmt(m.rsi14, 0)}</td>
      <td>${spark(m.spark)}</td></tr>`).join('')).join('');
    return `<div class="card scroll"><table><thead><tr><th>標的</th><th class="r">收盤</th><th class="r">1 日</th><th class="r">5 日</th><th class="r">20 日</th><th class="r">今年</th><th class="r">vs MA20</th><th class="r">vs MA50</th><th class="r">vs MA200</th><th class="r">RSI</th><th>近 120 日</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function instTable(rows) {
    const yi = (x) => (isNum(x) ? `<span class="num ${x > 0 ? 'up' : x < 0 ? 'down' : ''}">${x > 0 ? '+' : ''}${fmt(x / 1e8, 1)}</span>` : '—');
    return `<div class="card scroll"><table><thead><tr><th>日期</th><th class="r">外資</th><th class="r">投信</th><th class="r">自營商</th><th class="r">合計</th></tr></thead><tbody>${rows.slice().reverse().map((r) => `<tr><td class="num">${esc(r.date)}</td><td class="r">${yi(r.foreign)}</td><td class="r">${yi(r.trust)}</td><td class="r">${yi(r.dealer)}</td><td class="r">${yi(r.total)}</td></tr>`).join('')}</tbody></table><div class="note">單位：新台幣億元（買賣超金額）。</div></div>`;
  }

  // ---------- 主畫面 ----------
  let DATA = null;
  let histDays = Number(store.get('histDays')) || 260;
  let compTab = store.get('compTab') || 'us';

  function render(d) {
    destroyCharts();
    const s = d.sentiment || {};
    const gen = new Date(d.generatedAt);
    $('#asof').textContent = `更新時間 ${gen.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台北）${d.mock ? '・⚠ 測試假資料' : ''}`;

    const banners = [];
    if (d.mock) banners.push('<div class="banner crit">目前顯示的是測試用假資料，不是真實行情。</div>');
    const ageH = (Date.now() - gen.getTime()) / 36e5;
    if (ageH > 36) banners.push(`<div class="banner warn">資料已 ${Math.floor(ageH)} 小時未更新（週末 / 假日屬正常）。</div>`);
    const c = d.concentration;
    if (c && isNum(c.pct) && c.pct > c.threshold) banners.push(`<div class="banner warn"><b>集中度警示</b>：半導體 / AI 相關槓桿部位 ${c.semiCount}/${c.total} 檔（${fmt(c.pct, 0)}%），超過 ${c.threshold}% 門檻。<span class="muted">（${esc(c.method)}）</span></div>`);
    if (d.warnings?.length) banners.push(`<details class="banner warn"><summary>部分資料來源有問題（${d.warnings.length}）</summary><ul>${d.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>`);
    $('#banners').innerHTML = banners.join('');

    const fg = d.fearGreed;
    const tabs = [['us', '美股'], ['tw', '台股'], ['semi', '半導體']].filter(([k]) => s[k]);
    if (!s[compTab] && tabs.length) compTab = tabs[0][0];

    const posSorted = [...(d.positions || [])];
    const order = { SELL: 0, WARN: 1, BUY: 2, HOLD: 3 };
    posSorted.sort((a, b) => (order[a.summary] ?? 9) - (order[b.summary] ?? 9));
    const counts = posSorted.reduce((m, p) => ((m[p.summary] = (m[p.summary] || 0) + 1), m), {});

    $('#app').innerHTML = `
      <section class="grid g3" aria-label="情緒總覽">
        ${gaugeCard('美股情緒', 'S&P 500・VIX・避險・信用・廣度', s.us)}
        ${gaugeCard('台股情緒', '加權指數・匯率・波動', s.tw)}
        ${gaugeCard('半導體 / AI 情緒', '費城半導體（持倉高度集中）', s.semi)}
      </section>

      <h2>情緒走勢 <small>0–100，藍底區 = 極度恐懼、紅底區 = 極度貪婪</small></h2>
      <div class="card">
        <div class="tabs" role="tablist" id="rangeTabs">${[[63, '3 個月'], [126, '6 個月'], [260, '1 年']].map(([v, l]) => `<button role="tab" data-v="${v}" aria-selected="${histDays === v}">${l}</button>`).join('')}</div>
        <div class="legend">${[['us', '美股', '--s1'], ['tw', '台股', '--s2'], ['semi', '半導體', '--s3']].filter(([k]) => s[k]).map(([, l, c2]) => `<span><i style="background:var(${c2})"></i>${l}</span>`).join('')}</div>
        <div class="hist-box"><canvas id="histChart" aria-label="情緒分數歷史"></canvas></div>
      </div>

      <h2>情緒成分拆解 <small>每項為過去一年的百分位</small></h2>
      <div class="card">
        <div class="tabs" role="tablist" id="compTabs">${tabs.map(([k, l]) => `<button role="tab" data-k="${k}" aria-selected="${compTab === k}">${l}</button>`).join('')}</div>
        ${s[compTab] ? compTable(s[compTab].components) : '<div class="muted">無資料</div>'}
      </div>

      ${fg ? `<h2>CNN Fear &amp; Greed <small>官方指數（含 Put/Call、52 週新高低等無法自算的成分）</small></h2>
      <div class="grid g2">
        ${gaugeCard('CNN 恐懼與貪婪指數', fg.timestamp ? '更新 ' + new Date(fg.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '', { ...fg, rating: ratingZh(fg.rating), date: '' })}
        <div class="card"><div class="hist-box" style="height:200px"><canvas id="fgChart" aria-label="CNN Fear and Greed 歷史"></canvas></div>${fg.components?.length ? compTable(fg.components, false) : ''}</div>
      </div>` : ''}

      <h2>持倉訊號 <small>${['SELL', 'WARN', 'BUY', 'HOLD'].filter((k) => counts[k]).map((k) => `${sigZh[k]} ${counts[k]}`).join('・')}</small></h2>
      <div class="grid g2">${posSorted.map((p, i) => posCard(p, d, i)).join('') || '<div class="card muted">無持倉資料</div>'}</div>

      ${d.institutional?.length ? `<h2>台股三大法人買賣超 <small>近 ${d.institutional.length} 個交易日</small></h2>${instTable(d.institutional)}` : ''}

      <h2>市場總覽</h2>
      ${marketTable(d.markets || [])}
    `;

    if (window.Chart) {
      historyChart($('#histChart'), s, histDays);
      if (fg?.history?.length) fgChart($('#fgChart'), fg.history);
      posSorted.forEach((p, i) => posChart($(`#pc${i}`), p.chart));
    }
    $('#rangeTabs')?.addEventListener('click', (e) => {
      const v = Number(e.target.dataset?.v);
      if (!v) return;
      histDays = v; store.set('histDays', String(v)); render(DATA);
    });
    $('#compTabs')?.addEventListener('click', (e) => {
      const k = e.target.dataset?.k;
      if (!k) return;
      compTab = k; store.set('compTab', k); render(DATA);
    });
  }

  fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((d) => { DATA = d; render(d); })
    .catch((e) => { $('#app').innerHTML = `<div class="card">資料載入失敗：${esc(e.message)}</div>`; $('#asof').textContent = ''; });
})();
