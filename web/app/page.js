'use client';

import { useEffect, useMemo, useState } from 'react';
import MarketChart, { MA_LINES, OVERLAY_COLOR } from '../components/MarketChart';
import { CONTRACTS, SESSIONS, INVESTORS, loadCandles, loadInstitutional, loadIndex } from '../lib/data';

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

// Sum of net buy/sell contracts over the latest N trading days (null if fewer than N days of data).
const CUMULATIVE_DAYS = [5, 20];
const cumulative = (rows, n) =>
  rows.length < n ? null : rows.slice(-n).reduce((sum, r) => sum + (r.net_volume ?? 0), 0);

// Direction label + number, e.g. "偏多 +1,234" (red = long, green = short, like the rest of the site).
function Direction({ value }) {
  if (value === null || value === undefined) return '-';
  const text = value > 0 ? '偏多' : value < 0 ? '偏空' : '持平';
  return (
    <span className={cls(value)}>
      <b>{text}</b> {sign(value)}
      {fmt(value)}
    </span>
  );
}

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
  const [maOn, setMaOn] = useState({ 5: true, 20: true, 60: true });
  const [overlayOn, setOverlayOn] = useState(true);
  const [indexRows, setIndexRows] = useState([]);
  const [candles, setCandles] = useState([]);
  const [institutional, setInstitutional] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const meta = CONTRACTS.find((c) => c.code === contract);
  const isIndex = !!meta.isIndex;

  // Spot index (TAIEX), loaded once: drawn on futures charts and used for the basis card.
  useEffect(() => {
    loadIndex()
      .then(setIndexRows)
      .catch(() => setIndexRows([])); // the page still works without it
  }, []);
  const overlay = useMemo(() => indexRows.map((r) => ({ time: r.trade_date, value: r.close })), [indexRows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      isIndex ? loadIndex() : loadCandles(contract, session),
      isIndex ? Promise.resolve({}) : loadInstitutional(meta.institutionalName),
    ])
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
  }, [contract, session, meta.institutionalName, isIndex]);

  const last = candles[candles.length - 1];

  // Basis = futures close - spot (TAIEX) close, on the latest day that has both (day session only).
  const indexByDate = useMemo(() => new Map(indexRows.map((r) => [r.trade_date, r])), [indexRows]);
  let basis = null;
  if (!isIndex && session === 'regular') {
    for (let i = candles.length - 1; i >= 0; i--) {
      const spot = indexByDate.get(candles[i].trade_date);
      if (spot) {
        basis = { date: candles[i].trade_date, value: Math.round((candles[i].close - spot.close) * 100) / 100 };
        break;
      }
    }
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">
          FuturesSoon<small>台指期每日資料</small>
        </div>
        <Group items={CONTRACTS} value={contract} onChange={setContract} />
      </div>

      <div className="controls" style={{ marginBottom: 16 }}>
        {!isIndex && <Group items={SESSIONS} value={session} onChange={setSession} />}
        <Group
          items={RANGES.map((r) => ({ code: r.months, label: r.label }))}
          value={months}
          onChange={setMonths}
        />
        <div className="group">
          {MA_LINES.map(({ days, color }) => (
            <button
              key={days}
              className={`btn ma ${maOn[days] ? 'on' : ''}`}
              style={{ '--ma': color }}
              onClick={() => setMaOn((s) => ({ ...s, [days]: !s[days] }))}
              title={`${days} 日均線（點一下開／關）`}
            >
              {days}日線
            </button>
          ))}
        </div>
        {!isIndex && (
          <button
            className={`btn ma ${overlayOn ? 'on' : ''}`}
            style={{ '--ma': OVERLAY_COLOR }}
            onClick={() => setOverlayOn((v) => !v)}
            title="在 K 線上疊加加權指數收盤線（點一下開／關）"
          >
            加權指數線
          </button>
        )}
      </div>

      {last && (
        <div className="stats">
          <div className="stat">
            <div className="k">最新交易日{last.contract_month ? `（近月 ${last.contract_month}）` : ''}</div>
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
          {!isIndex && (
            <div className="stat">
              <div className="k">成交量（口）</div>
              <div className="v">{fmt(last.volume)}</div>
            </div>
          )}
          {basis && (
            <div className="stat">
              <div className="k">
                基差（期貨 − 現貨）{' '}
                <span style={{ whiteSpace: 'nowrap' }}>｜{basis.date.slice(5)}</span>
              </div>
              <div className={`v ${cls(basis.value)}`}>
                {sign(basis.value)}
                {fmt(basis.value, 2)}
              </div>
              <div className="k cum">{basis.value > 0 ? '正價差' : basis.value < 0 ? '逆價差' : '平價'}（點）</div>
            </div>
          )}
          {(isIndex ? [] : INVESTORS).map((inv) => {
            const rows = institutional[inv.name] ?? [];
            const row = rows[rows.length - 1];
            return (
              <div className="stat" key={inv.name}>
                <div className="k">
                  {inv.label}買賣超（口）{' '}
                  <span style={{ whiteSpace: 'nowrap' }}>｜{row?.trade_date?.slice(5) ?? '-'}</span>
                </div>
                <div className={`v ${cls(row?.net_volume)}`}>
                  {row ? `${sign(row.net_volume)}${fmt(row.net_volume)}` : '-'}
                </div>
                {CUMULATIVE_DAYS.map((n) => {
                  const total = cumulative(rows, n);
                  return (
                    <div className="k cum" key={n}>
                      近{n}日累計{' '}
                      <b className={cls(total)}>{total === null ? '-' : `${sign(total)}${fmt(total)}`}</b>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {last && !isIndex && (
        <div className="card dir">
          <h2>
            法人多空方向總覽
            <span>當日 = 買賣超（口）｜持倉 = 未平倉淨口數（口）｜偏多 = 正數，偏空 = 負數</span>
          </h2>
          <table>
            <thead>
              <tr>
                <th>法人</th>
                <th>日期</th>
                <th>當日方向</th>
                <th>持倉方向</th>
              </tr>
            </thead>
            <tbody>
              {INVESTORS.map((inv) => {
                const rows = institutional[inv.name] ?? [];
                const row = rows[rows.length - 1];
                return (
                  <tr key={inv.name}>
                    <td>{inv.label}</td>
                    <td className="muted">{row?.trade_date?.slice(5) ?? '-'}</td>
                    <td>{row ? <Direction value={row.net_volume} /> : '-'}</td>
                    <td>{row ? <Direction value={row.oi_net_volume} /> : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>
          {isIndex ? meta.label : `${meta.label}・${SESSIONS.find((s) => s.code === session).label}`}
          <span>
            {isIndex
              ? '發行量加權股價指數（現貨）｜紅漲綠跌｜資料來源：臺灣證券交易所'
              : `1 口 = ${meta.pointValue} 元／點｜紅漲綠跌｜柱狀 = 當日買賣超（口）｜黃線 = 未平倉淨口數（口，左軸）｜虛線 = 加權指數`}
          </span>
        </h2>
        {loading && <div className="msg">載入中…</div>}
        {error && <div className="msg err">{error}</div>}
        <div style={{ display: loading || error ? 'none' : 'block' }}>
          <MarketChart
            key={isIndex ? 'index' : 'futures'}
            mode={isIndex ? 'index' : 'futures'}
            overlay={overlay}
            overlayOn={overlayOn}
            candles={candles}
            institutional={institutional}
            contractLabel={meta.label}
            months={months}
            maOn={maOn}
          />
        </div>
      </div>

      <div className="footer">
        資料來源：<a href="https://www.taifex.com.tw/" target="_blank" rel="noreferrer">臺灣期貨交易所</a>
        ，依政府資料開放授權條款第 1 版使用。每日收盤後更新。
        <br />
        加權指數資料來源：<a href="https://www.twse.com.tw/" target="_blank" rel="noreferrer">臺灣證券交易所</a>
        （發行量加權股價指數每日開高低收，資料自 2025-11-17 起）。
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
