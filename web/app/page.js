'use client';

import { useEffect, useState } from 'react';
import MarketChart from '../components/MarketChart';
import { CONTRACTS, SESSIONS, INVESTORS, loadCandles, loadInstitutional } from '../lib/data';

const RANGES = [
  { months: 1, label: '1個月' },
  { months: 3, label: '3個月' },
  { months: 6, label: '6個月' },
  { months: 12, label: '1年' },
];

const fmt = (n, d = 0) =>
  n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const sign = (n) => (n > 0 ? '+' : '');

function Group({ items, value, onChange, keyName = 'code' }) {
  return (
    <div className="group">
      {items.map((it) => (
        <button
          key={it[keyName]}
          className={`btn ${it[keyName] === value ? 'active' : ''}`}
          onClick={() => onChange(it[keyName])}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function Page() {
  const [contract, setContract] = useState('TX');
  const [session, setSession] = useState('regular');
  const [months, setMonths] = useState(6);
  const [candles, setCandles] = useState([]);
  const [institutional, setInstitutional] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const meta = CONTRACTS.find((c) => c.code === contract);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([loadCandles(contract, session), loadInstitutional(meta.institutionalName)])
      .then(([c, i]) => {
        if (cancelled) return;
        setCandles(c);
        setInstitutional(i);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contract, session, meta.institutionalName]);

  const last = candles[candles.length - 1];

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">
          FuturesSoon<small>台指期每日資料</small>
        </div>
        <Group items={CONTRACTS} value={contract} onChange={setContract} />
      </div>

      <div className="controls" style={{ marginBottom: 16 }}>
        <Group items={SESSIONS} value={session} onChange={setSession} />
        <Group
          items={RANGES.map((r) => ({ code: r.months, label: r.label }))}
          value={months}
          onChange={setMonths}
        />
      </div>

      {last && (
        <div className="stats">
          <div className="stat">
            <div className="k">最新交易日（近月 {last.contract_month}）</div>
            <div className="v">{last.trade_date}</div>
          </div>
          <div className="stat">
            <div className="k">收盤價</div>
            <div className={`v ${cls(last.change)}`}>{fmt(last.close)}</div>
          </div>
          <div className="stat">
            <div className="k">漲跌</div>
            <div className={`v ${cls(last.change)}`}>
              {sign(last.change)}
              {fmt(last.change)} ({sign(last.change_pct)}
              {fmt(last.change_pct, 2)}%)
            </div>
          </div>
          <div className="stat">
            <div className="k">成交量（口）</div>
            <div className="v">{fmt(last.volume)}</div>
          </div>
          {INVESTORS.map((inv) => {
            const rows = institutional[inv.name] ?? [];
            const row = rows[rows.length - 1];
            return (
              <div className="stat" key={inv.name}>
                <div className="k">
                  {inv.label}買賣超（口）｜{row?.trade_date?.slice(5) ?? '-'}
                </div>
                <div className={`v ${cls(row?.net_volume)}`}>
                  {row ? `${sign(row.net_volume)}${fmt(row.net_volume)}` : '-'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>
          {meta.label}・{SESSIONS.find((s) => s.code === session).label}
          <span>
            1 口 = {meta.pointValue} 元／點｜紅漲綠跌｜柱狀 = 當日買賣超（口）｜黃線 = 未平倉淨口數（口，左軸）
          </span>
        </h2>
        {loading && <div className="msg">載入中…</div>}
        {error && <div className="msg err">{error}</div>}
        <div style={{ display: loading || error ? 'none' : 'block' }}>
          <MarketChart
            candles={candles}
            institutional={institutional}
            contractLabel={meta.label}
            months={months}
          />
        </div>
      </div>

      <div className="footer">
        資料來源：<a href="https://www.taifex.com.tw/" target="_blank" rel="noreferrer">臺灣期貨交易所</a>
        ，依政府資料開放授權條款第 1 版使用。每日收盤後更新。
        <br />
        K 線為「近月」合約（當日掛牌中最接近到期的月份）。本網站僅整理公開資料供參考，不構成任何投資建議，
        也不保證資料即時或正確。
        <br />
        圖表使用 <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a>{' '}
        Lightweight Charts™（Copyright © TradingView, Inc.）。
      </div>
    </main>
  );
}
