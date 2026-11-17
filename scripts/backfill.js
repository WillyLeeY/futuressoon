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
const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
const defaultFrom = new Date(defaultTo);
defaultFrom.setUTCFullYear(defaultFrom.getUTCFullYear() - 1);

const from = arg('from') ? utcDay(arg('from')) : defaultFrom;
const to = arg('to') ? utcDay(arg('to')) : defaultTo;
const fmt = (d) => d.toISOString().slice(0, 10);

console.log(`Backfill ${fmt(from)} ~ ${fmt(to)}${dryRun ? '  (dry run: nothing is written)' : ''}`);

// 1) Institutional investors: one request for the whole range.
const institutional = await fetchInstitutionalCsv(from, to);
console.log(`Institutional rows fetched: ${institutional.length}`);
if (dryRun) console.log('  sample:', JSON.stringify(institutional[0]));
else console.log(`  upserted: ${await upsert('institutional_daily', institutional, INSTITUTIONAL_KEY)}`);

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
