// 市場觀察清單（Yahoo Finance 代碼）。持倉清單在 positions.json（網頁上可編輯）
export const MARKETS = [
  { symbol: '^GSPC', name: 'S&P 500', group: '美股' },
  { symbol: '^IXIC', name: 'Nasdaq 綜合', group: '美股' },
  { symbol: '^SOX', name: '費城半導體', group: '美股' },
  { symbol: '^VIX', name: 'VIX 恐慌指數', group: '波動 / 利率' },
  { symbol: '^TNX', name: '美國 10 年期殖利率', group: '波動 / 利率' },
  { symbol: 'DX-Y.NYB', name: '美元指數', group: '波動 / 利率' },
  { symbol: '^TWII', name: '台股加權指數', group: '台股' },
  { symbol: '2330.TW', name: '台積電', group: '台股' },
  { symbol: 'TWD=X', name: 'USD/TWD', group: '台股' },
  { symbol: 'GC=F', name: '黃金', group: '其他資產' },
  { symbol: 'CL=F', name: 'WTI 原油', group: '其他資產' },
  { symbol: 'BTC-USD', name: '比特幣', group: '其他資產' },
];
