// Read-only data access to Supabase (uses the PUBLIC anon key; the database only allows reading).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PAGE = 1000; // Supabase returns at most 1000 rows per request

export const CONTRACTS = [
  // pointValue = NTD per index point per contract
  { code: 'TX', label: '大台', institutionalName: '臺股期貨', pointValue: 200 },
  { code: 'MTX', label: '小台', institutionalName: '小型臺指期貨', pointValue: 50 },
  { code: 'TMF', label: '微台', institutionalName: '微型臺指期貨', pointValue: 10 },
];

export const SESSIONS = [
  { code: 'regular', label: '日盤' },
  { code: 'after_hours', label: '夜盤' },
];

export const INVESTORS = [
  { name: '自營商', label: '自營商' },
  { name: '投信', label: '投信' },
  { name: '外資及陸資', label: '外資' },
];

async function fetchAll(table, query) {
  if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`讀取 ${table} 失敗（HTTP ${res.status}）`);
    const part = await res.json();
    rows.push(...part);
    if (part.length < PAGE) break;
  }
  return rows;
}

/** Daily K-line using the NEAR-MONTH contract (the earliest expiry month listed that day). */
export async function loadCandles(contract, session) {
  const rows = await fetchAll(
    'futures_daily',
    `select=trade_date,contract_month,open,high,low,close,change,change_pct,volume,open_interest` +
      `&contract=eq.${contract}&session=eq.${session}&order=trade_date.asc,contract_month.asc`,
  );
  const byDate = new Map();
  for (const r of rows) {
    if (!/^\d{6}$/.test(r.contract_month)) continue; // ignore odd month labels
    if (r.open === null || r.close === null) continue; // no trades
    if (!byDate.has(r.trade_date)) byDate.set(r.trade_date, r); // first = nearest month
  }
  return [...byDate.values()];
}

/** Institutional investors for one product, grouped by investor name. */
export async function loadInstitutional(contractName) {
  const rows = await fetchAll(
    'institutional_daily',
    `select=trade_date,investor,net_volume,oi_net_volume` +
      `&contract_name=eq.${encodeURIComponent(contractName)}&order=trade_date.asc`,
  );
  const grouped = {};
  for (const r of rows) (grouped[r.investor] ??= []).push(r);
  return grouped;
}
