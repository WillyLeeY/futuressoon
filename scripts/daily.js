// Daily update from the TAIFEX OpenAPI (latest trading day only).
// Usage: node scripts/daily.js [--dry-run]
// Safe to run many times a day: the same day is overwritten, never duplicated.
import { fetchLatestMarket, fetchLatestInstitutional } from './lib/taifex.js';
import { upsert, MARKET_KEY, INSTITUTIONAL_KEY } from './lib/supabase.js';

const dryRun = process.argv.includes('--dry-run');

const market = await fetchLatestMarket();
const institutional = await fetchLatestInstitutional();

const dates = (rows) => [...new Set(rows.map((r) => r.trade_date))].join(', ') || '(none)';
console.log(`Market rows: ${market.length}, trade date: ${dates(market)}`);
console.log(`Institutional rows: ${institutional.length}, trade date: ${dates(institutional)}`);

if (market.length === 0 || institutional.length === 0) {
  throw new Error('Got no rows from TAIFEX OpenAPI; nothing written.');
}

if (dryRun) {
  console.log('Dry run: nothing written.');
  console.log('  market sample:', JSON.stringify(market[0]));
  console.log('  institutional sample:', JSON.stringify(institutional[0]));
} else {
  console.log(`Upserted market: ${await upsert('futures_daily', market, MARKET_KEY)}`);
  console.log(`Upserted institutional: ${await upsert('institutional_daily', institutional, INSTITUTIONAL_KEY)}`);
}
console.log('Done.');
