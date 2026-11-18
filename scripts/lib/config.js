// Which products we collect. Add more here later (no database change needed).

// Market data (K-line): TAIFEX contract codes.
export const MARKET_CONTRACTS = ['TX', 'MTX', 'TMF'];

// Institutional investors: TAIFEX product names.
// TX = 臺股期貨 (big), MTX = 小型臺指期貨 (mini), TMF = 微型臺指期貨 (micro)
export const INSTITUTIONAL_CONTRACTS = ['臺股期貨', '小型臺指期貨', '微型臺指期貨'];

// TWSE OpenAPI: TAIEX daily open/high/low/close (current month only).
export const TWSE_INDEX_URL = 'https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST';

// TWSE open-data download (accepts ?date=YYYYMMDD to pick the month); used once to backfill history.
export const TWSE_INDEX_OPEN_DATA_URL = 'https://www.twse.com.tw/indicesReport/MI_5MINS_HIST';

export const OPENAPI_BASE = 'https://openapi.taifex.com.tw/v1';
export const CSV_MARKET_URL = 'https://www.taifex.com.tw/cht/3/futDataDown';
export const CSV_INSTITUTIONAL_URL = 'https://www.taifex.com.tw/cht/3/futContractsDateDown';
