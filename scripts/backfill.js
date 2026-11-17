// Backfill history from the TAIFEX website CSV downloads.
// Usage: node scripts/backfill.js [--from 2025-11-17] [--to 2026-11-16] [--dry-run]
import { MARKET_CONTRACTS } from './lib/config.js';
import { fetchMarketCsv, fetchInstitutionalCsv, monthChunks, sleep } from './lib/taifex.js';
import { upsert, MARKET_KEY, INSTITUTIONAL_KEY } from './lib/supabase.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes('--dry-run');

const utcDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const today = new Date();
// End date defaults to YESTERDAY: TAIFEX rejects a range that ends today (no data yet).
// Today's data is handled by the daily job (OpenAPI).
const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
const defaultFrom = new Date(defaultTo);
defaultFrom.setUTCFullYear(defaultFrom.getUTCFullYear() - 1);

const from = arg('from') ? utcDay(arg('from')) : defaultFrom;
const to = arg('to') ? utcDay(arg('to')) : defaultTo;
const fmt = (d) => d.toISOString().slice(0, 10);

console.log(`Backfill ${fmt(from)} ~ ${fmt(to)}${dryRun ? '  (dry run: nothing is written)' : ''}`);

// 1) Institutional investors: month by month (the site rejects ranges over one year).
let institutionalTotal = 0;
for (const [start, end] of monthChunks(from, to)) {
  const rows = await fetchInstitutionalCsv(start, end);
  institutionalTotal += rows.length;
  if (!dryRun && rows.length) await upsert('institutional_daily', rows, INSTITUTIONAL_KEY);
  console.log(`  institutional ${fmt(start)} ~ ${fmt(end)}: ${rows.length} rows`);
  if (dryRun && rows.length && institutionalTotal === rows.length) console.log('  sample:', JSON.stringify(rows[0]));
  await sleep(800);
}
console.log(`Institutional rows ${dryRun ? 'fetched' : 'upserted'}: ${institutionalTotal}`);

// 2) Market data: month by month, per contract (the site limits the range per request).
let marketTotal = 0;
for (const contract of MARKET_CONTRACTS) {
  for (const [start, end] of monthChunks(from, to)) {
    const rows = await fetchMarketCsv(contract, start, end);
    marketTotal += rows.length;
    if (!dryRun && rows.length) await upsert('futures_daily', rows, MARKET_KEY);
    console.log(`  ${contract} ${fmt(start)} ~ ${fmt(end)}: ${rows.length} rows`);
    if (dryRun && rows.length && marketTotal === rows.length) console.log('  sample:', JSON.stringify(rows[0]));
    await sleep(800); // be polite to the exchange's server
  }
}
console.log(`Market rows ${dryRun ? 'fetched' : 'upserted'}: ${marketTotal}`);
console.log('Done.');
