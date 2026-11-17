-- FuturesSoon database schema (Supabase / PostgreSQL)
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.

-- 1) Daily market data (K-line source). One row per day / contract / month / session.
create table if not exists futures_daily (
  trade_date      date        not null,
  contract        text        not null,            -- TX, MTX, TMF ...
  contract_month  text        not null,            -- e.g. 202611
  session         text        not null,            -- regular or after-hours
  open            numeric,
  high            numeric,
  low             numeric,
  close           numeric,
  change          numeric,
  change_pct      numeric,
  volume          bigint,
  settlement      numeric,
  open_interest   bigint,
  primary key (trade_date, contract, contract_month, session)
);

-- 2) Institutional investors (dealer / investment trust / foreign) per contract per day.
create table if not exists institutional_daily (
  trade_date         date   not null,
  contract_name      text   not null,              -- e.g. the TAIEX futures name from TAIFEX
  investor           text   not null,              -- dealer / investment trust / foreign
  long_volume        bigint,
  long_value         bigint,                       -- thousand NTD
  short_volume       bigint,
  short_value        bigint,
  net_volume         bigint,
  net_value          bigint,
  oi_long_volume     bigint,
  oi_long_value      bigint,
  oi_short_volume    bigint,
  oi_short_value     bigint,
  oi_net_volume      bigint,
  oi_net_value       bigint,
  primary key (trade_date, contract_name, investor)
);

create index if not exists futures_daily_contract_date_idx
  on futures_daily (contract, trade_date desc);
create index if not exists institutional_daily_contract_date_idx
  on institutional_daily (contract_name, trade_date desc);

-- 3) Security: anyone may READ, nobody may write with the public (anon) key.
--    The daily fetch job writes with the secret key, which bypasses these rules.
alter table futures_daily       enable row level security;
alter table institutional_daily enable row level security;

drop policy if exists "public read futures_daily" on futures_daily;
create policy "public read futures_daily"
  on futures_daily for select to anon, authenticated using (true);

drop policy if exists "public read institutional_daily" on institutional_daily;
create policy "public read institutional_daily"
  on institutional_daily for select to anon, authenticated using (true);
