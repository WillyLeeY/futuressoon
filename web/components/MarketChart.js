'use client';

// One chart with 4 stacked panes sharing the same time axis:
//   pane 0: K-line (near-month contract) + volume
//   pane 1-3: institutional investors (dealer / investment trust / foreign):
//             bars = daily net buy/sell contracts, line = net open interest (left axis)
// Taiwan colors: red = up / net buy, green = down / net sell.

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { INVESTORS } from '../lib/data';

const UP = '#ef4444';
const DOWN = '#22c55e';
const OI_LINE = '#facc15';

const fmt = (n, d = 0) =>
  n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const sign = (n) => (n > 0 ? '+' : '');

function timeToStr(t) {
  if (typeof t === 'string') return t;
  if (t && t.year) return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  return '';
}

export default function MarketChart({ candles, institutional, contractLabel, months }) {
  const boxRef = useRef(null);
  const apiRef = useRef(null);
  const dataRef = useRef({ candleMap: new Map(), instMaps: [], lastDate: null });
  const labelRef = useRef(contractLabel);
  labelRef.current = contractLabel;
  const applyRangeRef = useRef(() => {});
  const interactedRef = useRef(false);

  // Create the chart once.
  useEffect(() => {
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#121722' },
        textColor: '#8b95a7',
        // Logo hidden; the required TradingView attribution link is in the page footer (app/page.js).
        attributionLogo: false,
        panes: { separatorColor: '#232b3a', separatorHoverColor: '#3b82f6' },
      },
      grid: { vertLines: { color: '#1a2130' }, horzLines: { color: '#1a2130' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#232b3a' },
      leftPriceScale: { visible: true, borderColor: '#232b3a' },
      // Do not allow scrolling/zooming beyond the first and last day that has data.
      timeScale: { borderColor: '#232b3a', rightOffset: 0, fixLeftEdge: true, fixRightEdge: true },
      localization: { locale: 'zh-TW' },
    });

    const candle = chart.addSeries(
      CandlestickSeries,
      {
        upColor: UP,
        downColor: DOWN,
        borderVisible: false,
        wickUpColor: UP,
        wickDownColor: DOWN,
        priceFormat: { type: 'price', precision: 0, minMove: 1 },
      },
      0,
    );
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } });

    const vol = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false },
      0,
    );
    chart.priceScale('volume', 0).applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const inst = INVESTORS.map((_, i) => {
      const hist = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false },
        i + 1,
      );
      const line = chart.addSeries(
        LineSeries,
        {
          color: OI_LINE,
          lineWidth: 2,
          priceScaleId: 'left',
          priceLineVisible: false,
          lastValueVisible: false,
          priceFormat: { type: 'volume' },
        },
        i + 1,
      );
      return { hist, line };
    });

    const panes = chart.panes();
    panes[0].setStretchFactor(3);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);

    // A text legend inside each pane (top-left). Pane HTML only exists after the first paint,
    // so the legend is created lazily the first time it is needed.
    const legends = panes.map(() => null);
    function legendFor(i) {
      if (legends[i] && legends[i].isConnected) return legends[i];
      const el = chart.panes()[i]?.getHTMLElement();
      if (!el) return null;
      const div = document.createElement('div');
      div.style.cssText =
        'position:absolute;top:4px;left:76px;right:70px;z-index:5;font-size:12px;line-height:1.5;pointer-events:none;color:#c9d1de;';
      el.style.position = 'relative';
      el.appendChild(div);
      legends[i] = div;
      return div;
    }

    function render(dateStr) {
      const { candleMap, instMaps, lastDate } = dataRef.current;
      const d = dateStr && candleMap.has(dateStr) ? dateStr : lastDate;
      const c = d ? candleMap.get(d) : null;
      const first = legendFor(0);
      if (first) {
        first.innerHTML = c
          ? `<b>${labelRef.current}</b> 近月 ${c.contract_month} ｜ ${c.trade_date} ｜ ` +
            `開 ${fmt(c.open)} 高 ${fmt(c.high)} 低 ${fmt(c.low)} 收 <b class="${cls(c.change)}">${fmt(c.close)}</b> ` +
            `<span class="${cls(c.change)}">${sign(c.change)}${fmt(c.change)} (${sign(c.change_pct)}${fmt(c.change_pct, 2)}%)</span> ｜ ` +
            `量 ${fmt(c.volume)} ｜ 未平倉 ${fmt(c.open_interest)}`
          : `<b>${labelRef.current}</b> 沒有資料`;
      }
      INVESTORS.forEach((inv, i) => {
        const row = instMaps[i]?.get(dateStr) ?? instMaps[i]?.get(instMaps[i]?.lastKey);
        const el = legendFor(i + 1);
        if (!el) return;
        el.innerHTML = row
          ? `<b>${inv.label}</b> ｜ ${row.trade_date} ｜ 買賣超 <b class="${cls(row.net_volume)}">${sign(row.net_volume)}${fmt(row.net_volume)}</b> 口 ｜ ` +
            `<span style="color:${OI_LINE}">━ 未平倉淨口數 ${sign(row.oi_net_volume)}${fmt(row.oi_net_volume)}</span>`
          : `<b>${inv.label}</b> 沒有資料`;
      });
    }

    chart.subscribeCrosshairMove((param) => render(param.time ? timeToStr(param.time) : null));
    apiRef.current = { chart, candle, vol, inst, render };

    // Re-apply the visible range when the chart gets its real size (it starts hidden/zero-width),
    // but ONLY until the user starts zooming/dragging. Otherwise zooming in changes the price-axis
    // label width, which fires a size change and would reset the user's zoom.
    const box = boxRef.current;
    const markInteracted = () => {
      interactedRef.current = true;
    };
    box.addEventListener('wheel', markInteracted, { passive: true });
    box.addEventListener('pointerdown', markInteracted, { passive: true });
    box.addEventListener('touchstart', markInteracted, { passive: true });

    const onSize = () => {
      render(null);
      if (!interactedRef.current) applyRangeRef.current();
    };
    chart.timeScale().subscribeSizeChange(onSize);
    const raf = requestAnimationFrame(() => render(null));

    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener('wheel', markInteracted);
      box.removeEventListener('pointerdown', markInteracted);
      box.removeEventListener('touchstart', markInteracted);
      chart.timeScale().unsubscribeSizeChange(onSize);
      apiRef.current = null;
      chart.remove();
    };
  }, []);

  // Update data whenever it changes.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    api.candle.setData(
      candles.map((r) => ({ time: r.trade_date, open: r.open, high: r.high, low: r.low, close: r.close })),
    );
    api.vol.setData(
      candles.map((r) => ({
        time: r.trade_date,
        value: r.volume ?? 0,
        color: r.close >= r.open ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)',
      })),
    );

    const instMaps = INVESTORS.map((inv, i) => {
      const rows = institutional[inv.name] ?? [];
      api.inst[i].hist.setData(
        rows.map((r) => ({
          time: r.trade_date,
          value: r.net_volume ?? 0,
          color: (r.net_volume ?? 0) >= 0 ? UP : DOWN,
        })),
      );
      api.inst[i].line.setData(
        rows.filter((r) => r.oi_net_volume !== null).map((r) => ({ time: r.trade_date, value: r.oi_net_volume })),
      );
      const map = new Map(rows.map((r) => [r.trade_date, r]));
      map.lastKey = rows.length ? rows[rows.length - 1].trade_date : null;
      return map;
    });

    dataRef.current = {
      candleMap: new Map(candles.map((r) => [r.trade_date, r])),
      instMaps,
      lastDate: candles.length ? candles[candles.length - 1].trade_date : null,
    };
    api.render(null);
  }, [candles, institutional, contractLabel]);

  // Visible time range (1 / 3 / 6 / 12 months, 0 = all).
  useEffect(() => {
    applyRangeRef.current = () => {
      const api = apiRef.current;
      if (!api || candles.length === 0) return;
      try {
        if (!months) {
          api.chart.timeScale().fitContent();
          return;
        }
        const last = candles[candles.length - 1].trade_date;
        const d = new Date(`${last}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - months);
        api.chart.timeScale().setVisibleRange({ from: d.toISOString().slice(0, 10), to: last });
      } catch {
        api.chart.timeScale().fitContent();
      }
    };
    interactedRef.current = false; // a new range/data selection starts fresh
    applyRangeRef.current();
  }, [months, candles]);

  return <div ref={boxRef} className="chart" style={{ height: 880 }} />;
}
