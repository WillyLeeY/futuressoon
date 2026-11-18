// Daily update. Safe to run many times a day: the same day is overwritten, never duplicated.
// Usage: node scripts/daily.js [--dry-run]
//
// Primary source: TAIFEX website CSV, last 7 days (it is published earlier than the OpenAPI,
// and the 7-day window also fills any day a previous run missed).
// Fallback: TAIFEX OpenAPI (latest trading day only).
import { MARKET_CONTRACTS } from './lib/config.js';
import {
  fetchMarketCsv,
  fetchInstitutionalCsv,
  fetchLatestMarket,
  fetchLatestInstitutional,
  monthChunks,
  sleep,
} from './lib/taifex.js';
import { fetchTaiexMonth } from './lib/twse.js';
import { upsert, MARKET_KEY, INSTITUTIONAL_KEY, INDEX_KEY } from './lib/supabase.js';

const dryRun = process.argv.includes('--dry-run');
const LOOKBACK_DAYS = 7;

// "Today" in Taiwan time (UTC+8), as a UTC-midnight Date.
const tw = new Date(Date.now() + 8 * 3600 * 1000);
const today = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const fmt = (d) => d.toISOString().slice(0, 10);

async function collectCsv(end) {
  const start = addDays(end, -LOOKBACK_DAYS);
  const institutional = [];
  const market = [];
  for (const [s, e] of monthChunks(start, end)) {
    institutional.push(...(await fetchInstitutionalCsv(s, e)));
    await sleep(800);
    for (const contract of MARKET_CONTRACTS) {
      market.push(...(await fetchMarketCsv(contract, s, e)));
      await sleep(800);
    }
  }
  return { market, institutional, source: `CSV ${fmt(start)} ~ ${fmt(end)}` };
}

async function collect() {
  // TAIFEX rejects a range ending on a day that has no data yet, so try today, then yesterday.
  for (const end of [today, addDays(today, -1)]) {
    try {
      const r = await collectCsv(end);
      if (r.market.length && r.institutional.length) return r;
    } catch (err) {
      console.warn(`CSV up to ${fmt(end)} failed: ${err.message}`);
    }
  }
  console.warn('Falling back to OpenAPI (latest trading day only).');
  return {
    market: await fetchLatestMarket(),
    institutional: await fetchLatestInstitutional(),
    source: 'OpenAPI latest day',
  };
}

const collected = await collect();
const { market, source } = collected;

// TAIFEX may publish a day's buy/sell figures before its open-interest figures (they show as 0).
// If every investor row of a day has zero open interest, treat that day as unfinished and skip it;
// the next run (the 7-day window) will fill it in once the real numbers are out.
const unfinished = new Set();
const byDate = Map.groupBy(collected.institutional, (r) => r.trade_date);
for (const [date, rows] of byDate) {
  if (rows.every((r) => !r.oi_long_volume && !r.oi_short_volume)) unfinished.add(date);
}
if (unfinished.size) console.warn(`Skipping institutional days without open interest yet: ${[...unfinished].sort().join(', ')}`);
const institutional = collected.institutional.filter((r) => !unfinished.has(r.trade_date));
const dates = (rows) => [...new Set(rows.map((r) => r.trade_date))].sort();
const range = (rows) => {
  const d = dates(rows);
  return d.length ? `${d[0]} ~ ${d[d.length - 1]} (${d.length} days)` : '(none)';
};

console.log(`Source: ${source}`);
console.log(`Market rows: ${market.length}, dates: ${range(market)}`);
console.log(`Institutional rows: ${institutional.length}, dates: ${range(institutional)}`);

if (market.length === 0 || institutional.length === 0) {
  throw new Error('Got no rows from TAIFEX; nothing written.');
}

if (!dryRun) {
  console.log(`Upserted market: ${await upsert('futures_daily', market, MARKET_KEY)}`);
  console.log(`Upserted institutional: ${await upsert('institutional_daily', institutional, INSTITUTIONAL_KEY)}`);
}

// TAIEX (spot index) from TWSE OpenAPI. Runs separately so a TWSE problem never blocks the futures data
// above; if it fails we still finish the futures part and then mark the whole run as failed.
let indexFailed = false;
try {
  const index = await fetchTaiexMonth();
  console.log(`TAIEX rows: ${index.length}, dates: ${range(index)}`);
  if (index.length === 0) throw new Error('Got no TAIEX rows from TWSE.');
  if (!dryRun) console.log(`Upserted TAIEX: ${await upsert('index_daily', index, INDEX_KEY)}`);
} catch (err) {
  indexFailed = true;
  console.error(`TAIEX step failed: ${err.message}`);
}

if (dryRun) console.log('Dry run: nothing written.');
if (indexFailed) process.exit(1);
console.log('Done.');
