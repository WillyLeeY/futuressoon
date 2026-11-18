// TWSE (Taiwan Stock Exchange) OpenAPI: daily TAIEX values (發行量加權股價指數).
// The OpenAPI returns the CURRENT month only, so history builds up day by day.
import { TWSE_INDEX_URL, TWSE_INDEX_OPEN_DATA_URL } from './config.js';

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};

/** TWSE dates are ROC years: "1151117" -> "2026-11-17". */
export function rocToIso(s) {
  const t = String(s).trim();
  if (!/^\d{6,7}$/.test(t)) return null;
  const year = Number(t.slice(0, -4)) + 1911;
  return `${year}-${t.slice(-4, -2)}-${t.slice(-2)}`;
}

export async function fetchTaiexMonth(attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(TWSE_INDEX_URL, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('unexpected response (not a list)');
      return data
        .map((r) => ({
          trade_date: rocToIso(r.Date),
          index_code: 'TAIEX',
          open: num(r.OpeningIndex),
          high: num(r.HighestIndex),
          low: num(r.LowestIndex),
          close: num(r.ClosingIndex),
        }))
        .filter((r) => r.trade_date && r.close !== null);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`TWSE index request failed: ${lastErr.message}`);
}

/**
 * One month of TAIEX from TWSE's "open data" download (the same format that the government open data
 * platform links to). `monthStart` is "YYYY-MM-DD"; any day inside the month returns that whole month.
 */
export async function fetchTaiexOpenDataMonth(monthStart, attempts = 3) {
  const url = `${TWSE_INDEX_OPEN_DATA_URL}?response=open_data&date=${monthStart.replaceAll('-', '')}`;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines[0]?.includes('日期')) throw new Error('unexpected response (no CSV header)');
      return lines
        .slice(1)
        .map((line) => line.split(',').map((c) => c.replace(/"/g, '').trim()))
        .map(([date, open, high, low, close]) => ({
          trade_date: rocToIso(date),
          index_code: 'TAIEX',
          open: num(open),
          high: num(high),
          low: num(low),
          close: num(close),
        }))
        .filter((r) => r.trade_date && r.close !== null);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`TWSE open data request failed for ${monthStart}: ${lastErr.message}`);
}
