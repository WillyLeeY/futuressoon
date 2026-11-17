// Minimal Supabase writer using the REST API (no extra packages needed).

/** Keep one row per primary key (last one wins). Postgres rejects duplicates inside one upsert. */
export function dedupe(rows, keyFields) {
  const map = new Map();
  for (const r of rows) map.set(keyFields.map((k) => r[k]).join('|'), r);
  return [...map.values()];
}

function credentials() {
  // Strip invisible BOM characters and whitespace that can sneak in when secrets are pasted/piped.
  const clean = (v) => (v ?? '').replace(/^﻿/, '').trim();
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SECRET_KEY);
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (set them as environment variables).');
  }
  return { url: url.replace(/\/$/, ''), key };
}

/** Insert or update rows. Same primary key => update, so running twice is safe. */
export async function upsert(table, rows, keyFields, batchSize = 500) {
  const { url, key } = credentials();
  const unique = dedupe(rows, keyFields);
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
  // Legacy JWT keys also go in Authorization; new sb_secret_ keys use apikey only.
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${keyFields.join(',')}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`Supabase upsert to ${table} failed: HTTP ${res.status} ${await res.text()}`);
    }
  }
  return unique.length;
}

export const MARKET_KEY = ['trade_date', 'contract', 'contract_month', 'session'];
export const INSTITUTIONAL_KEY = ['trade_date', 'contract_name', 'investor'];
