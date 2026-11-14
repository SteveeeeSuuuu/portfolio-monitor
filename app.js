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
      <div class="muted" style="font-size:12px">${s.date ? `資料日 ${esc(s.date)}${s.partial ? '（盤中，收盤後更新）' : ''}` : ''}</div>
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
    const er = d.earnings?.[p.underlyingSymbol || p.symbol];
    const erName = p.underlying || p.ticker;
    const mkt = { US: '美股', TW: '上市', TWO: '上櫃' }[p.market] || p.market;
    const typ = p.type === 'leveraged' ? `${esc(p.underlying)} ×${p.leverage}` : p.type === 'etf' ? 'ETF' : '個股';
    const alerts = [...p.alerts.map((a) => `<li>${esc(a)}</li>`)];
    if (er && er.daysLeft >= 0 && er.daysLeft <= 3) alerts.push(`<li>${esc(erName)} 財報剩 ${er.daysLeft} 天</li>`);
    if (p.partial) alerts.push('<li class="info">盤中資料，尚未收盤</li>');
    const ccy = p.currency === 'TWD' ? 'NT$' : '$';
    const strats = p.results.map((r) => `<div class="strat"><div class="name">${esc(stratZh[r.strategy] || r.strategy)}</div><div>${badge(r.signal)} <span class="ink2">${esc(trendZh[r.trend] || '')}</span>　${esc(r.reason)}</div><div class="ind">${esc(indText(r))}${isNum(r.strength) ? `・強度 ${r.strength}` : ''}</div></div>`).join('');
    const hasRsi = p.results.some((r) => r.strategy === 'rsi-momentum');
    return `<div class="card">
      <div class="pos-head">
        <div><div class="t">${esc(p.ticker)} ${badge(p.summary)}</div><div class="u">${typ}・${esc(mkt)}・${esc(q.date)}</div></div>
        <div class="price"><b class="num">${ccy}${fmt(q.close, 2)}</b><div>${pct(q.chg1d)}</div></div>
      </div>
      ${alerts.length ? `<ul class="alerts">${alerts.join('')}</ul>` : ''}
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--s1)"></i>收盤</span><span><i style="background:var(--s2)"></i>MA5</span><span><i style="background:var(--s3)"></i>MA20</span></div>
      <div class="chart-box"><canvas id="pc${idx}" aria-label="${esc(p.ticker)} 近 120 日收盤與均線"></canvas></div>
      <div class="strats">${strats}
        ${!hasRsi ? `<div class="strat"><div class="name">RSI(14) 參考</div><div class="num">${fmt(p.rsiInfo, 1)} <span class="muted">（槓桿型預設不納入投票）</span></div></div>` : ''}
        <div class="strat"><div class="name">區間表現</div><div>5 日 ${pct(q.chg5d)}・20 日 ${pct(q.chg20d)}・距 52 週高 ${pct(q.fromHigh52w)}</div>${uq ? `<div class="ind">標的 ${esc(p.underlying)}：今日 ${pct(uq.chg1d)}・20 日 ${pct(uq.chg20d)}</div>` : ''}</div>
        ${er ? `<div class="strat"><div class="name">下次財報</div><div class="num">${esc(erName)} ${esc(er.date)}（${er.daysLeft >= 0 ? `剩 ${er.daysLeft} 天` : '已公布'}${er.estimated ? '，預估日' : ''}）</div></div>` : ''}
      </div>
      ${p.type === 'leveraged' ? `<details style="margin-top:6px"><summary class="ink2" style="cursor:pointer;font-size:13px">耗損明細（多區間）</summary>${decayTable(p.results.find((r) => r.strategy === 'decay-monitor'), p.leverage)}</details>` : ''}
      ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
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

  // ---------- 台股籌碼與市場槓桿 ----------
  const SCEN = [
    ['up_lev', '指數上漲＋融資增加', '市場風險偏好升高、槓桿同步擴張。若融資占市值也快速上升，應留意追價與過熱風險。'],
    ['up_nolev', '指數上漲＋融資持平或下降', '行情可能不是由融資槓桿推動；仍需檢查成交量、外資與產業集中度。'],
    ['down_lev', '指數下跌＋融資增加', '可能有人持續攤平，槓桿在下跌過程中累積；若維持率同步下降，風險更值得注意。'],
    ['down_delev', '指數下跌＋融資快速下降', '可能出現停損或去槓桿；若市場賣壓、維持率及成交量等訊號同時極端，才進一步評估是否接近賣壓釋放。'],
  ];
  function chipsSection(c) {
    if (!c) return '';
    const yi = (x, d = 1) => (isNum(x) ? fmt(x / 1e8, d) : '—');
    const signed = (x, txt, d) => (isNum(x) ? `<span class="num ${x > 0 ? 'up' : x < 0 ? 'down' : ''}">${x > 0 ? '+' : ''}${txt ?? fmt(x, d)}</span>` : '<span class="muted">—</span>');
    const wait = (r, k) => `<span class="muted" title="歷史資料逐日累積中">累積中（${r ? r.obs : 0}/${k + 1} 日）</span>`;
    const c5 = (r, f) => (r && isNum(r.c5) ? f(r.c5) : wait(r, 5));
    const c20 = (r, f) => (r && isNum(r.c20) ? f(r.c20) : wait(r, 20));
    const pctF = (x) => pct(x);
    const ppF = (d) => (x) => signed(x, `${fmt(x, d)} 個百分點`);
    const lotsF = (x) => signed(x, `${Math.round(x).toLocaleString('en-US')} 口`);
    const yiF = (x) => signed(x, `${fmt(x / 1e8, 1)} 億`);
    const link = (u) => `<a href="${u}" target="_blank" rel="noopener" class="ink2" style="font-size:12px">官方頁面 ↗</a>`;
    const rows = [
      { name: '加權指數漲跌幅', sub: c.taiex ? `收盤 ${fmt(c.taiex.value, 2)}` : '', r: c.taiex, today: c.taiex ? pct(c.taiex.chg1d) : '—', f5: pctF, f20: pctF, url: 'https://www.twse.com.tw/zh/indices/taiex/mi-5mins-hist.html' },
      { name: '融資餘額（上市）', sub: '金額，五日 / 二十日變化率', r: c.margin, today: c.margin ? `<b class="num">${yi(c.margin.value, 0)}</b> 億元` : '—', f5: pctF, f20: pctF, url: 'https://www.twse.com.tw/zh/trading/margin/mi-margn.html' },
      { name: '融資維持率（上市・估算）', sub: 'Σ 個股融資張數 × 收盤價 ÷ 融資金額；與證交所儀表板口徑可能不同', r: c.maint, today: c.maint ? `<b class="num">${fmt(c.maint.value, 1)}%</b>` : '—', f5: ppF(1), f20: ppF(1), url: 'https://wwwc.twse.com.tw/dashboard/zh/credit/general.html' },
      { name: '借券賣出餘額（上市）', sub: c.sblValue ? `約 ${yi(c.sblValue.value, 0)} 億元（以收盤價換算）；變化率以股數計` : '變化率以股數計', r: c.sbl, today: c.sbl ? `<b class="num">${fmt(c.sbl.value / 1e8, 2)}</b> 億股` : '—', f5: pctF, f20: pctF, url: 'https://www.twse.com.tw/zh/products/sbl/disclosures/info.html' },
      { name: '外資現貨買賣超', sub: '外資及陸資＋外資自營商；五日 / 二十日為累計', r: c.foreignSpot, today: c.foreignSpot ? signed(c.foreignSpot.value, `${fmt(c.foreignSpot.value / 1e8, 1)} 億`) : '—', f5: yiF, f20: yiF, url: 'https://www.twse.com.tw/zh/trading/foreign/t86.html' },
      { name: '外資台指期多空淨額', sub: '臺股期貨（TX）未平倉多單 − 空單；可能含避險 / 套利', r: c.foreignFut, today: c.foreignFut ? signed(c.foreignFut.value, `${Math.round(c.foreignFut.value).toLocaleString('en-US')} 口`) : '—', f5: lotsF, f20: lotsF, url: 'https://www.taifex.com.tw/cht/3/futContractsDate' },
      { name: '融資餘額／市值（上市）', sub: '融資金額 ÷ 上市公司總市值（已發行股數 × 收盤價）', r: c.marginToCap, today: c.marginToCap ? `<b class="num">${fmt(c.marginToCap.value, 3)}%</b>` : '—', f5: ppF(3), f20: ppF(3), url: 'https://www.twse.com.tw/' },
    ];
    const tr = rows.map((x) => `<tr>
      <td><b>${esc(x.name)}</b><div class="comp-desc">${esc(x.sub)}</div></td>
      <td class="r" style="white-space:nowrap">${x.today}<div class="comp-desc">${x.r ? esc(x.r.date) : '無資料'}</div></td>
      <td class="r" style="white-space:nowrap">${c5(x.r, x.f5)}</td>
      <td class="r" style="white-space:nowrap">${c20(x.r, x.f20)}</td>
      <td>${x.r ? spark(x.r.spark) : ''}</td>
      <td style="white-space:nowrap">${link(x.url)}</td></tr>`).join('');
    const sc = c.scenario;
    const scen = SCEN.map(([k, t, d]) => `<div class="scen ${sc?.key === k ? 'on' : ''}"><div class="scen-t">${sc?.key === k ? '◆ 目前' : ''} ${esc(t)}</div><div class="comp-desc">${esc(d)}</div></div>`).join('');
    const scHead = sc
      ? `以 ${esc(sc.date)} 為準：加權指數 5 日 ${pct(sc.idx5)}、融資餘額 5 日 ${pct(sc.margin5)}${sc.key === 'down_mild' ? '。<b>指數下跌、融資小幅變動，介於典型情境之間</b>' : ''}`
      : '融資資料不足，暫無法判斷';
    return `<h2>台股籌碼與市場槓桿 <small>融資、借券、外資現貨與台指期交叉觀察</small></h2>
      <div class="card scroll"><table><thead><tr><th>指標</th><th class="r">今日數值</th><th class="r">五日變化</th><th class="r">二十日變化</th><th>近 21 日</th><th>來源</th></tr></thead><tbody>${tr}</tbody></table>
      <div class="note">證交所資料僅涵蓋上市市場（未含上櫃）。融資、借券資料約於晚間公布，故資料日可能比指數晚一天。漲跌顏色依頁首設定。</div></div>
      <h2 style="margin-top:20px">交叉判讀 <small>融資 5 日變化 ±${sc ? sc.flat : 0.5}% 內視為持平，低於 ${sc ? sc.fast : -2}% 視為快速下降</small></h2>
      <div class="card"><div style="font-size:13.5px;margin-bottom:10px">${scHead}</div><div class="grid scen-grid">${scen}</div>
      <ul class="note" style="padding-left:18px;margin-bottom:0">
        <li>這些是風險監控的輔助資訊，不是直接的買賣訊號。市場槓桿升溫時，避免只因指數上漲就持續提高個人槓桿；市場快速去槓桿時，先確認自身資金需求與風險承受度再考慮分批布局。</li>
        <li>融資餘額不涵蓋所有槓桿（衍生性商品、機構融資、信貸資金等）；外資期貨空單不等於純粹看空；借券不等於放空，本頁採借券「賣出」餘額。</li>
      </ul></div>
      ${c.institutional?.length ? `<h2 style="margin-top:20px">三大法人買賣超 <small>近 ${c.institutional.length} 個交易日</small></h2>${instTable(c.institutional)}` : ''}`;
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

      ${chipsSection(d.chips)}

      ${fg ? `<h2>CNN Fear &amp; Greed <small>官方指數（含 Put/Call、52 週新高低等無法自算的成分）</small></h2>
      <div class="grid g2">
        ${gaugeCard('CNN 恐懼與貪婪指數', fg.timestamp ? '更新 ' + new Date(fg.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '', { ...fg, rating: ratingZh(fg.rating), date: '' })}
        <div class="card"><div class="hist-box" style="height:200px"><canvas id="fgChart" aria-label="CNN Fear and Greed 歷史"></canvas></div>${fg.components?.length ? compTable(fg.components, false) : ''}</div>
      </div>` : ''}

      <h2>持倉訊號 <small>${['SELL', 'WARN', 'BUY', 'HOLD'].filter((k) => counts[k]).map((k) => `${sigZh[k]} ${counts[k]}`).join('・')}</small></h2>
      <div class="grid g2">${posSorted.map((p, i) => posCard(p, d, i)).join('') || '<div class="card muted">無持倉資料</div>'}</div>


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

  // ---------- GitHub：更新按鈕 / 持倉設定 ----------
  const TOKEN_KEY = 'ghToken';
  const opStatus = (html, kind = '') => {
    const el = $('#opStatus');
    el.className = `banner ${kind}`;
    el.hidden = !html;
    el.innerHTML = html;
  };
  async function gh(path, opts = {}) {
    const tok = store.get(TOKEN_KEY);
    if (!tok) throw Object.assign(new Error('尚未設定 GitHub 權杖'), { code: 'no_token' });
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${tok}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (res.status === 401) throw new Error('權杖無效或已過期，請重新設定');
    if (res.status === 403 || res.status === 404) throw new Error(`權杖權限不足（需要此 repo 的 Actions 與 Contents 讀寫權限）［HTTP ${res.status}］`);
    if (res.status === 409) throw new Error('檔案剛被其他地方修改，請重新開啟設定再存一次');
    if (!res.ok) throw new Error(`GitHub API 錯誤 HTTP ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const b64encode = (str) => { let bin = ''; new TextEncoder().encode(str).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  let busy = false;
  function setBusy(v) {
    busy = v;
    $('#refreshBtn').disabled = v;
    $('#posSave') && ($('#posSave').disabled = v);
  }

  /** 等待 t0 之後建立的 workflow run 完成，再等 Pages 上的 data.json 換新 */
  async function waitForRebuild(event, t0, label) {
    const g = DATA.github;
    const oldGen = DATA.generatedAt;
    let run = null;
    const start = Date.now();
    while (Date.now() - start < 20 * 60e3) {
      const j = await gh(`/repos/${g.repo}/actions/workflows/${g.workflow}/runs?event=${event}&branch=${encodeURIComponent(g.branch)}&per_page=5`);
      run = (j.workflow_runs || []).find((r) => new Date(r.created_at).getTime() >= t0 - 30e3) || run;
      const sec = Math.round((Date.now() - start) / 1000);
      if (!run && sec > 90) throw new Error('GitHub 沒有開始計算，請按「⟳ 更新」再試一次');
      if (run && run.status === 'completed') break;
      opStatus(`${label}：${!run ? '等待 GitHub 建立工作' : run.status === 'in_progress' ? '抓資料、計算中' : '排隊中'}…（${sec} 秒）<span class="muted">　通常 1–3 分鐘</span>`, 'warn');
      await sleep(8000);
    }
    if (!run || run.status !== 'completed') throw new Error('等候逾時，請稍後重新整理頁面');
    if (run.conclusion !== 'success') {
      opStatus(`${label}失敗（${esc(run.conclusion)}）。<a href="${esc(run.html_url)}" target="_blank" rel="noopener">查看執行紀錄 ↗</a>`, 'crit');
      return false;
    }
    // Pages 部署需要一點時間
    for (let i = 0; i < 40; i++) {
      opStatus(`${label}：計算完成，等待網頁部署…`, 'warn');
      try {
        const d = await (await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })).json();
        if (d.generatedAt !== oldGen) {
          DATA = d;
          render(d);
          opStatus(`已更新（${new Date(d.generatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}）`, '');
          setTimeout(() => opStatus(''), 8000);
          return true;
        }
      } catch { /* 重試 */ }
      await sleep(6000);
    }
    opStatus('計算已完成，但網頁尚未部署完成，請稍後重新整理。', 'warn');
    return false;
  }

  async function refreshNow() {
    if (busy) return;
    if (!DATA?.github) return opStatus('這份資料不是由 GitHub Actions 產生（本機預覽），無法線上更新。', 'warn');
    if (!store.get(TOKEN_KEY)) return openSettings(true);
    setBusy(true);
    const t0 = Date.now();
    try {
      opStatus('送出更新請求…', 'warn');
      await gh(`/repos/${DATA.github.repo}/actions/workflows/${DATA.github.workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: DATA.github.branch }) });
      await waitForRebuild('workflow_dispatch', t0, '更新中');
    } catch (e) {
      opStatus(`更新失敗：${esc(e.message)}`, 'crit');
    } finally {
      setBusy(false);
    }
  }

  // ----- 持倉設定 -----
  const MARKET_OPTS = [['US', '美股'], ['TW', '台股上市'], ['TWO', '台股上櫃']];
  const TYPE_OPTS = [['leveraged', '槓桿 ETF'], ['stock', '個股'], ['etf', 'ETF']];
  const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;
  let editRows = [];
  let editSha = null;
  let editOriginal = null; // GitHub 上目前的 positions.json 內容（判斷有無變更）

  function rowHtml(r, i) {
    const opt = (list, v) => list.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('');
    const lev = r.type === 'leveraged';
    return `<div class="pos-row" data-i="${i}">
      <div class="pr-num">${i + 1}</div>
      <label class="ac-wrap">代號或名稱<input data-f="ticker" value="${esc(r.ticker)}" placeholder="輸入代號或名稱搜尋" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ac${i}"><ul class="ac" id="ac${i}" role="listbox" hidden></ul></label>
      <label>市場<select data-f="market">${opt(MARKET_OPTS, r.market)}</select></label>
      <label>類型<select data-f="type">${opt(TYPE_OPTS, r.type)}</select></label>
      <label${lev ? '' : ' class="off"'}>標的<input data-f="underlying" value="${esc(r.underlying ?? '')}" placeholder="NVDA" ${lev ? '' : 'disabled'} autocapitalize="characters" spellcheck="false"></label>
      <label${lev ? '' : ' class="off"'}>倍數<input data-f="leverage" type="number" step="0.5" min="-5" max="5" value="${lev ? esc(r.leverage ?? 2) : ''}" ${lev ? '' : 'disabled'}></label>
      <label class="chk"><input data-f="semi" type="checkbox"${r.semi ? ' checked' : ''}>半導體 / AI</label>
      <label class="wide">備註<input data-f="note" value="${esc(r.note ?? '')}" maxlength="200" placeholder="（選填）"></label>
      <button type="button" class="chip del" data-del="${i}" aria-label="刪除第 ${i + 1} 筆">刪除</button>
      ${r.hint ? `<div class="hint ${r.hintWarn ? 'warn' : ''}">${esc(r.hint)}</div>` : ''}
    </div>`;
  }
  function drawRows() {
    const max = DATA?.maxPositions || 10;
    $('#posRows').innerHTML = editRows.map(rowHtml).join('') || '<div class="muted" style="padding:12px 0">目前沒有持倉，按「新增一檔」開始。</div>';
    $('#posAdd').disabled = editRows.length >= max;
    $('#posCount').textContent = `${editRows.length} / ${max} 檔`;
  }
  function readRows() {
    $('#posRows').querySelectorAll('.pos-row').forEach((el) => {
      const r = editRows[Number(el.dataset.i)];
      el.querySelectorAll('[data-f]').forEach((inp) => {
        const f = inp.dataset.f;
        if (f === 'semi') r.semi = inp.checked;
        else if (f === 'leverage') r.leverage = inp.value === '' ? null : Number(inp.value);
        else if (f === 'ticker' || f === 'underlying') r[f] = inp.value.trim().toUpperCase();
        else r[f] = inp.value;
        if (f === 'ticker' && r.ticker && !TICKER_RE.test(r.ticker) && !r.hintWarn) Object.assign(r, { hint: '請從下拉清單選一檔，或直接輸入代號', hintWarn: true });
      });
    });
  }
  function validate(rows) {
    const errs = [];
    const seen = new Set();
    rows.forEach((r, i) => {
      const n = `第 ${i + 1} 筆`;
      if (!TICKER_RE.test(r.ticker)) errs.push(`${n}：代號只能是英數字（例：NVDX、00631L）`);
      if (seen.has(r.market + r.ticker)) errs.push(`${n}：${r.ticker} 重複`);
      seen.add(r.market + r.ticker);
      if (r.type === 'leveraged') {
        if (!TICKER_RE.test(r.underlying || '')) errs.push(`${n}：槓桿 ETF 需填標的代號`);
        else if (r.underlying === r.ticker) errs.push(`${n}：標的要填追蹤的股票或指數 ETF，不能是 ${r.ticker} 自己（例：SOXL → SOXX、倍數 3）`);
        if (!Number.isFinite(r.leverage) || r.leverage === 0 || Math.abs(r.leverage) > 5) errs.push(`${n}：倍數需介於 -5 ~ 5 且不為 0`);
      }
    });
    return errs;
  }

  // ----- 代號搜尋（symbols.json + lookup.js）-----
  let symIdx = null;
  let symLoading = null;
  function loadSymbols() {
    if (symIdx || symLoading || !window.Lookup) return symLoading;
    symLoading = fetch('symbols.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => (symIdx = window.Lookup.makeIndex(d)))
      .catch(() => null)
      .finally(() => (symLoading = null));
    return symLoading;
  }
  let acTimer = null;
  let acItems = [];
  let acActive = -1;
  function acClose(input) {
    const ul = input?.parentElement?.querySelector('.ac');
    if (ul) ul.hidden = true;
    input?.setAttribute('aria-expanded', 'false');
    acItems = [];
    acActive = -1;
  }
  async function acShow(input) {
    const ul = input.parentElement.querySelector('.ac');
    const q = input.value.trim();
    if (!q) return acClose(input);
    if (!symIdx) {
      ul.innerHTML = '<li class="muted">代號清單載入中…</li>';
      ul.hidden = false;
      await loadSymbols();
      if (!symIdx) {
        ul.innerHTML = '<li class="muted">代號清單暫時無法載入，請直接輸入代號</li>';
        return;
      }
    }
    acItems = window.Lookup.search(symIdx, q, 8);
    acActive = acItems.length ? 0 : -1;
    const MN = window.Lookup.MARKET_NAME;
    ul.innerHTML = acItems.length
      ? acItems.map((r, k) => `<li role="option" data-k="${k}" aria-selected="${k === acActive}"><b>${esc(r.s)}</b><span class="ac-n">${esc(r.n)}</span><span class="ac-m">${esc(MN[r.m])}${r.e ? '・ETF' : ''}</span></li>`).join('')
      : '<li class="muted">找不到符合的股票</li>';
    ul.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function acHighlight(input) {
    input.parentElement.querySelectorAll('.ac li[data-k]').forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.k) === acActive)));
  }
  function acApply(input, k) {
    const row = acItems[k];
    if (!row) return;
    readRows();
    const i = Number(input.closest('.pos-row').dataset.i);
    const sg = window.Lookup.suggest(symIdx, row);
    const r = editRows[i];
    Object.assign(r, { ticker: sg.ticker, market: sg.market, type: sg.type, underlying: sg.underlying, leverage: sg.leverage, semi: sg.semi });
    if (!r.note) r.note = sg.name;
    if (sg.type === 'leveraged' && !sg.underlying) Object.assign(r, { hint: `已判斷為 ${sg.leverage} 倍槓桿 ETF，但找不到標的，請手動填寫標的代號`, hintWarn: true });
    else if (sg.type === 'leveraged') Object.assign(r, { hint: `已自動判斷：${sg.leverage > 0 ? '' : '反向 '}${Math.abs(sg.leverage)} 倍、標的 ${sg.underlying}，請確認`, hintWarn: false });
    else Object.assign(r, { hint: `已選：${sg.name}（${sg.type === 'etf' ? 'ETF' : '個股'}）`, hintWarn: false });
    acClose(input);
    drawRows();
  }

  async function openSettings(tokenFirst = false) {
    const dlg = $('#posDialog');
    editRows = (DATA?.positionsConfig || []).map((r) => ({ ...r }));
    editSha = null;
    editOriginal = null;
    $('#posErr').textContent = '';
    $('#tokenInput').value = '';
    $('#tokenState').textContent = store.get(TOKEN_KEY) ? '已設定（只存在這台裝置的瀏覽器）' : '尚未設定';
    $('#posSrc').textContent = '目前顯示的是網頁上的持倉資料。';
    drawRows();
    dlg.showModal();
    loadSymbols();
    if (tokenFirst || !store.get(TOKEN_KEY)) {
      $('#tokenBox').open = true;
      $('#tokenInput').focus();
    }
    // 有權杖時讀 GitHub 上最新的設定（可能比網頁上的新）
    if (store.get(TOKEN_KEY) && DATA?.github) {
      try {
        const g = DATA.github;
        const f = await gh(`/repos/${g.repo}/contents/${g.positionsPath}?ref=${encodeURIComponent(g.branch)}`);
        editSha = f.sha;
        editOriginal = b64decode(f.content);
        const j = JSON.parse(editOriginal);
        editRows = (j.positions || []).map((r) => ({ ticker: '', market: 'US', type: 'stock', underlying: null, leverage: null, semi: false, note: '', ...r }));
        $('#posSrc').textContent = '已讀取 GitHub 上最新的持倉設定。';
        drawRows();
      } catch (e) {
        $('#posSrc').textContent = `讀取 GitHub 設定失敗：${e.message}`;
      }
    }
  }

  async function savePositions() {
    readRows();
    const errs = validate(editRows);
    if (errs.length) return ($('#posErr').innerHTML = errs.map(esc).join('<br>'));
    if (!DATA?.github) return ($('#posErr').textContent = '本機預覽無法儲存到 GitHub。');
    if (!store.get(TOKEN_KEY)) {
      $('#tokenBox').open = true;
      return ($('#posErr').textContent = '請先在下方設定 GitHub 權杖。');
    }
    const g = DATA.github;
    const clean = editRows.map((r) => {
      const o = { ticker: r.ticker, market: r.market, type: r.type };
      if (r.type === 'leveraged') Object.assign(o, { underlying: r.underlying, leverage: r.leverage });
      o.semi = Boolean(r.semi);
      if (r.note?.trim()) o.note = r.note.trim();
      return o;
    });
    const content = JSON.stringify({ positions: clean }, null, 2) + '\n';
    let saved = false;
    setBusy(true);
    const t0 = Date.now();
    try {
      if (!editSha) {
        const f = await gh(`/repos/${g.repo}/contents/${g.positionsPath}?ref=${encodeURIComponent(g.branch)}`);
        editSha = f.sha;
        editOriginal = b64decode(f.content);
      }
      // 內容沒變：GitHub 不會觸發重新計算，改成直接更新
      if (editOriginal !== null && editOriginal.trim() === content.trim()) {
        $('#posDialog').close();
        setBusy(false);
        opStatus('持倉設定沒有變更，直接重新計算…', 'warn');
        return await refreshNow();
      }
      await gh(`/repos/${g.repo}/contents/${g.positionsPath}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `持倉設定：${clean.map((r) => r.ticker).join(', ') || '（清空）'}`, content: b64encode(content), sha: editSha, branch: g.branch }),
      });
      saved = true;
      $('#posDialog').close();
      await waitForRebuild('push', t0, '持倉已儲存，重新計算中');
    } catch (e) {
      if (saved) return opStatus(`持倉已儲存，但${esc(e.message)}`, 'warn');
      $('#posErr').textContent = `儲存失敗：${e.message}`;
      opStatus(`儲存失敗：${esc(e.message)}`, 'crit');
    } finally {
      setBusy(false);
    }
  }

  $('#refreshBtn').addEventListener('click', refreshNow);
  $('#posBtn').addEventListener('click', () => openSettings(false));
  $('#posAdd').addEventListener('click', () => {
    readRows();
    if (editRows.length < (DATA?.maxPositions || 10)) editRows.push({ ticker: '', market: 'US', type: 'stock', underlying: null, leverage: null, semi: false, note: '' });
    drawRows();
    $('#posRows .pos-row:last-child input')?.focus();
  });
  $('#posRows').addEventListener('click', (e) => {
    const i = e.target.dataset?.del;
    if (i === undefined) return;
    readRows();
    editRows.splice(Number(i), 1);
    drawRows();
  });
  $('#posRows').addEventListener('change', (e) => {
    if (e.target.dataset?.f !== 'type') return;
    readRows();
    const r = editRows[Number(e.target.closest('.pos-row').dataset.i)];
    if (r.type === 'leveraged' && !r.leverage) r.leverage = 2;
    drawRows();
  });
  $('#posRows').addEventListener('input', (e) => {
    if (e.target.dataset?.f !== 'ticker') return;
    clearTimeout(acTimer);
    acTimer = setTimeout(() => acShow(e.target), 120);
  });
  $('#posRows').addEventListener('keydown', (e) => {
    if (e.target.dataset?.f !== 'ticker') return;
    const open = !e.target.parentElement.querySelector('.ac').hidden;
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      return acClose(e.target);
    }
    if (!acItems.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      acActive = (acActive + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length;
      acHighlight(e.target);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      acApply(e.target, acActive);
    }
  });
  $('#posRows').addEventListener('mousedown', (e) => {
    const li = e.target.closest('.ac li[data-k]');
    if (!li) return;
    e.preventDefault();
    acApply(li.closest('.ac-wrap').querySelector('input'), Number(li.dataset.k));
  });
  $('#posRows').addEventListener('focusout', (e) => {
    if (e.target.dataset?.f === 'ticker') setTimeout(() => acClose(e.target), 150);
  });
  $('#posSave').addEventListener('click', savePositions);
  $('#posCancel').addEventListener('click', () => $('#posDialog').close());
  $('#tokenSave').addEventListener('click', () => {
    const v = $('#tokenInput').value.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v)) return ($('#tokenState').textContent = '格式不像 GitHub 權杖（應以 github_pat_ 開頭）');
    store.set(TOKEN_KEY, v);
    $('#tokenInput').value = '';
    $('#tokenState').textContent = store.get(TOKEN_KEY) ? '已儲存（只存在這台裝置的瀏覽器）' : '瀏覽器不允許儲存（可能是無痕模式）';
  });
  $('#tokenClear').addEventListener('click', () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    $('#tokenState').textContent = '已清除';
  });

  fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((d) => { DATA = d; render(d); })
    .catch((e) => { $('#app').innerHTML = `<div class="card">資料載入失敗：${esc(e.message)}</div>`; $('#asof').textContent = ''; });
})();
