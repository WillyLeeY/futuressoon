// One-time (re-runnable) backfill of TAIEX daily history from TWSE's open-data download.
// Usage: node scripts/backfill-index.js [--from YYYY-MM-DD] [--dry-run]
// Default start = 2025-11-17, the earliest futures day we have, so both line up on the chart.
import { fetchTaiexOpenDataMonth } from './lib/twse.js';
import { upsert, INDEX_KEY } from './lib/supabase.js';
import { sleep } from './lib/taifex.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const from = fromIdx >= 0 ? args[fromIdx + 1] : '2025-11-17';
if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('--from must look like 2025-11-17');

// Taiwan "today", so we stop at the current month.
const tw = new Date(Date.now() + 8 * 3600 * 1000);
const endYear = tw.getUTCFullYear();
const endMonth = tw.getUTCMonth() + 1;

const rows = [];
let year = Number(from.slice(0, 4));
let month = Number(from.slice(5, 7));
while (year < endYear || (year === endYear && month <= endMonth)) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const part = (await fetchTaiexOpenDataMonth(monthStart)).filter((r) => r.trade_date >= from);
  console.log(`${monthStart.slice(0, 7)}: ${part.length} days`);
  rows.push(...part);
  await sleep(1500); // be polite to TWSE
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
}

const dates = rows.map((r) => r.trade_date).sort();
console.log(`Total TAIEX rows: ${rows.length}, ${dates[0]} ~ ${dates[dates.length - 1]}`);
if (rows.length === 0) throw new Error('Got no TAIEX rows; nothing written.');

if (dryRun) {
  console.log('Dry run: nothing written.');
} else {
  console.log(`Upserted TAIEX: ${await upsert('index_daily', rows, INDEX_KEY)}`);
}
console.log('Done.');
