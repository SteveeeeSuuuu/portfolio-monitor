// 持倉清單（對應 positions.md）與市場觀察清單
// symbol / underlyingSymbol 為 Yahoo Finance 代碼
export const POSITIONS = [
  { ticker: '00631L', symbol: '00631L.TW', market: 'TW', type: 'leveraged', underlying: '0050', underlyingSymbol: '0050.TW', leverage: 2, currency: 'TWD', sector: 'semi', note: '台灣 50 正 2，台股大盤指數型，波動相對小' },
  { ticker: 'TSLL', symbol: 'TSLL', market: 'US', type: 'leveraged', underlying: 'TSLA', underlyingSymbol: 'TSLA', leverage: 2, currency: 'USD', sector: 'other', note: 'Elon Musk 政治因素影響走勢，波動與大盤相關性低' },
  { ticker: 'AMDL', symbol: 'AMDL', market: 'US', type: 'leveraged', underlying: 'AMD', underlyingSymbol: 'AMD', leverage: 2, currency: 'USD', sector: 'semi', note: 'AMD，CPU + GPU，財報節奏需關注' },
  { ticker: 'MVLL', symbol: 'MVLL', market: 'US', type: 'leveraged', underlying: 'MRVL', underlyingSymbol: 'MRVL', leverage: 2, currency: 'USD', sector: 'semi', note: 'Marvell，AI 網路晶片，基本面穩但跟隨 NVDA 走勢' },
  { ticker: 'MUU', symbol: 'MUU', market: 'US', type: 'leveraged', underlying: 'MU', underlyingSymbol: 'MU', leverage: 2, currency: 'USD', sector: 'semi', note: '記憶體週期股，財報前後波動大，HBM 需求強但 NAND 供過於求' },
  { ticker: 'NVDX', symbol: 'NVDX', market: 'US', type: 'leveraged', underlying: 'NVDA', underlyingSymbol: 'NVDA', leverage: 2, currency: 'USD', sector: 'semi', note: 'AI 基建需求明確，注意輝達財報是否不如預期引發板塊輪動' },
  { ticker: 'SNXX', symbol: 'SNXX', market: 'US', type: 'leveraged', underlying: 'SNDK', underlyingSymbol: 'SNDK', leverage: 2, currency: 'USD', sector: 'semi', note: 'SanDisk 剛從 WD 分拆，流動性和價格發現尚未穩定' },
];

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
