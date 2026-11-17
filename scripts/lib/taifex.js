// Fetch and normalize data from the Taiwan Futures Exchange (TAIFEX). Official sources only.
import {
  MARKET_CONTRACTS,
  INSTITUTIONAL_CONTRACTS,
  OPENAPI_BASE,
  CSV_MARKET_URL,
  CSV_INSTITUTIONAL_URL,
} from './config.js';

const UA = 'FuturesSoon/0.1 (personal data viewer)';

// ---------- small helpers ----------

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "1,234" -> 1234, "-" / "NULL" / "" -> null, "2.76%" -> 2.76 */
export function num(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().replace(/,/g, '').replace(/%$/, '');
  if (s === '' || s === '-' || s.toUpperCase() === 'NULL') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "2026/11/10" or "20261110" -> "2026-11-10" */
export function isoDate(value) {
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.replace(/\//g, '-');
}

export function normalizeSession(value) {
  const s = String(value ?? '').trim();
  if (s === '盤後') return 'after_hours';
  return 'regular'; // "一般" or empty
}

/** Minimal CSV parser (handles quoted fields). Returns array of rows. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

async function request(url, options = {}, tries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'User-Agent': UA, ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < tries) await sleep(2000 * attempt);
    }
  }
  throw lastError;
}

// ---------- OpenAPI (latest trading day only) ----------

async function openApiJson(path) {
  const res = await request(`${OPENAPI_BASE}/${path}`, { headers: { accept: 'application/json' } });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Unexpected response from ${path}`);
  return data;
}

export async function fetchLatestMarket() {
  const data = await openApiJson('DailyMarketReportFut');
  return data
    .filter((r) => MARKET_CONTRACTS.includes(r.Contract))
    .map((r) => ({
      trade_date: isoDate(r.Date),
      contract: r.Contract.trim(),
      contract_month: String(r['ContractMonth(Week)']).trim(),
      session: normalizeSession(r.TradingSession),
      open: num(r.Open),
      high: num(r.High),
      low: num(r.Low),
      close: num(r.Last),
      change: num(r.Change),
      change_pct: num(r['%']),
      volume: num(r.Volume),
      settlement: num(r.SettlementPrice),
      open_interest: num(r.OpenInterest),
    }))
    .filter((r) => !r.contract_month.includes('/')); // skip spread orders
}

export async function fetchLatestInstitutional() {
  const data = await openApiJson(
    'MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate',
  );
  return data
    .filter((r) => INSTITUTIONAL_CONTRACTS.includes(r.ContractCode))
    .map((r) => ({
      trade_date: isoDate(r.Date),
      contract_name: r.ContractCode.trim(),
      investor: r.Item.trim(),
      long_volume: num(r['TradingVolume(Long)']),
      long_value: num(r['TradingValue(Long)(Thousands)']),
      short_volume: num(r['TradingVolume(Short)']),
      short_value: num(r['TradingValue(Short)(Thousands)']),
      net_volume: num(r['TradingVolume(Net)']),
      net_value: num(r['TradingValue(Net)(Thousands)']),
      oi_long_volume: num(r['OpenInterest(Long)']),
      oi_long_value: num(r['ContractValueofOpenInterest(Long)(Thousands)']),
      oi_short_volume: num(r['OpenInterest(Short)']),
      oi_short_value: num(r['ContractValueofOpenInterest(Short)(Thousands)']),
      oi_net_volume: num(r['OpenInterest(Net)']),
      oi_net_value: num(r['ContractValueofOpenInterest(Net)(Thousands)']),
    }));
}

// ---------- Website CSV downloads (history) ----------

async function csvPost(url, form) {
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const text = new TextDecoder('big5').decode(await res.arrayBuffer());
  // On error (e.g. date range too long) the site returns an HTML page instead of CSV.
  if (text.trimStart().startsWith('<')) {
    throw new Error(`TAIFEX returned an HTML page instead of CSV (${form.queryStartDate} ~ ${form.queryEndDate})`);
  }
  return parseCsv(text);
}

function indexer(header) {
  const map = new Map(header.map((h, i) => [h.trim(), i]));
  return (row, name) => {
    const i = map.get(name);
    if (i === undefined) throw new Error(`CSV column not found: ${name}`);
    return row[i];
  };
}

const slashDate = (d) =>
  `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;

/** Market CSV allows about one month per request, so call this with <= 31 days. */
export async function fetchMarketCsv(contract, startDate, endDate) {
  const rows = await csvPost(CSV_MARKET_URL, {
    down_type: '1',
    commodity_id: contract,
    queryStartDate: slashDate(startDate),
    queryEndDate: slashDate(endDate),
  });
  if (rows.length < 2) return [];
  const col = indexer(rows[0]);
  return rows
    .slice(1)
    .map((r) => ({
      trade_date: isoDate(col(r, '交易日期')),
      contract: col(r, '契約').trim(),
      contract_month: col(r, '到期月份(週別)').trim(),
      session: normalizeSession(col(r, '交易時段')),
      open: num(col(r, '開盤價')),
      high: num(col(r, '最高價')),
      low: num(col(r, '最低價')),
      close: num(col(r, '收盤價')),
      change: num(col(r, '漲跌價')),
      change_pct: num(col(r, '漲跌%')),
      volume: num(col(r, '成交量')),
      settlement: num(col(r, '結算價')),
      open_interest: num(col(r, '未沖銷契約數')),
    }))
    .filter((r) => r.contract === contract && !r.contract_month.includes('/'));
}

/** Institutional CSV: one request can cover a whole year, for all products. */
export async function fetchInstitutionalCsv(startDate, endDate) {
  const rows = await csvPost(CSV_INSTITUTIONAL_URL, {
    queryStartDate: slashDate(startDate),
    queryEndDate: slashDate(endDate),
    commodityId: '',
  });
  if (rows.length < 2) return [];
  const col = indexer(rows[0]);
  return rows
    .slice(1)
    .filter((r) => INSTITUTIONAL_CONTRACTS.includes(col(r, '商品名稱').trim()))
    .map((r) => ({
      trade_date: isoDate(col(r, '日期')),
      contract_name: col(r, '商品名稱').trim(),
      investor: col(r, '身份別').trim(),
      long_volume: num(col(r, '多方交易口數')),
      long_value: num(col(r, '多方交易契約金額(千元)')),
      short_volume: num(col(r, '空方交易口數')),
      short_value: num(col(r, '空方交易契約金額(千元)')),
      net_volume: num(col(r, '多空交易口數淨額')),
      net_value: num(col(r, '多空交易契約金額淨額(千元)')),
      oi_long_volume: num(col(r, '多方未平倉口數')),
      oi_long_value: num(col(r, '多方未平倉契約金額(千元)')),
      oi_short_volume: num(col(r, '空方未平倉口數')),
      oi_short_value: num(col(r, '空方未平倉契約金額(千元)')),
      oi_net_volume: num(col(r, '多空未平倉口數淨額')),
      oi_net_value: num(col(r, '多空未平倉契約金額淨額(千元)')),
    }));
}

/** Split [from, to] into calendar-month chunks (each <= 31 days). Dates are UTC midnights. */
export function monthChunks(from, to) {
  const chunks = [];
  let cursor = new Date(from);
  while (cursor <= to) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const end = monthEnd < to ? monthEnd : new Date(to);
    chunks.push([new Date(cursor), end]);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return chunks;
}
