# FuturesSoon

台指期（臺灣加權股價指數期貨）每日資料網站：看 K 線圖，也看三大法人（自營商、投信、外資）的期貨買賣超。

**網站：<https://futuressoon.vercel.app/>**

> 狀態：已上線，資料每個交易日自動更新。

## 功能

- 每日 K 線圖（開高低收、成交量），使用「近月」合約（當日掛牌中最接近到期的月份）
- 三大法人（自營商、投信、外資）每日期貨買賣超，以及未平倉淨口數
- 商品：臺股期貨（大台 TX）、小型臺指期貨（小台 MTX）、微型臺指期貨（微台 TMF）
- 日盤、夜盤分開顯示
- 時間範圍：1 個月、3 個月、6 個月、1 年（資料保留約一年）
- 紅漲綠跌、深色主題；縮放與拖曳不會超出有資料的範圍
- 之後預計擴充其他指數（例如美股大盤、台灣加權指數）

## 運作方式

```
期交所 ──(平日 17:17 和 19:17)──> GitHub Actions ──寫入──> Supabase 資料庫
                                                                │
瀏覽器 <──────────────── Vercel（網站）<──────── 讀取 ──────────┘
```

| 環節 | 說明 |
|---|---|
| 資料來源 | [臺灣期貨交易所](https://www.taifex.com.tw/)官方資料：每日更新與歷史回補都用官網 CSV 下載（每天往回補抓 7 天），OpenAPI 僅作備援 |
| 每日抓取 | GitHub Actions，台灣時間週一到週五 17:17 和 19:17 各一次；同一天重複抓只會覆蓋，不會重複存 |
| 資料庫 | Supabase（PostgreSQL）。網站只用唯讀的公開金鑰，無法寫入 |
| 網站 | Next.js + [lightweight-charts](https://github.com/tradingview/lightweight-charts)，部署在 Vercel |

## 專案結構

```
futuressoon/
├── web/                     網站（Next.js）
│   ├── app/                 頁面與樣式
│   ├── components/          圖表元件
│   └── lib/data.js          從 Supabase 讀資料
├── scripts/                 抓資料的程式（Node.js，無額外套件）
│   ├── daily.js             每日更新（官網 CSV 最近 7 天，OpenAPI 備援）
│   ├── backfill.js          歷史回補（官網 CSV）
│   └── lib/                 期交所抓取與解析、寫入 Supabase
├── supabase/schema.sql      資料表與權限設定
├── .github/workflows/       排程：daily.yml（每日更新）、backfill.yml（手動回補）
├── CLAUDE.md                給 AI 助理看的專案規則
└── .env.example             環境變數範本
```

## 本機執行網站

需求：Node.js 20 以上。

```bash
cd web
npm install
cp .env.example .env.local     # Windows PowerShell: Copy-Item .env.example .env.local
# 編輯 .env.local，填入 Supabase 專案網址與「公開（anon）金鑰」
npm run dev
```

打開 <http://localhost:3000>。按 `Ctrl+C` 可停止。

> `.env.local` 已被 `.gitignore` 排除，不會被提交。網站只需要公開的唯讀金鑰，**不要**放 secret（service_role）金鑰。

## 部署與更新

- **網站**：推送到 GitHub 的 `main` 分支後，Vercel 會自動重新部署，不需要手動操作。
- **資料**：由 GitHub Actions 每日自動更新，與網站部署無關。
- **Vercel 設定**：Root Directory 選 `web`；環境變數 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- **GitHub Secrets**（Settings → Secrets and variables → Actions）：`SUPABASE_URL`、`SUPABASE_SECRET_KEY`。secret 金鑰只放這裡，絕不寫進程式碼或提交。

### 手動更新資料

在 GitHub 的 Actions 分頁：
- **Daily update** → Run workflow：立即抓最新交易日。
- **Backfill history** → Run workflow：回補歷史；起訖日期可留空（預設為過去一年到昨天）。

### 重新建立資料庫

在 Supabase 的 SQL Editor 執行 `supabase/schema.sql`（可重複執行），再手動執行一次 Backfill history。

## 資料來源與授權

資料來自[臺灣期貨交易所](https://www.taifex.com.tw/)，依[政府資料開放授權條款第 1 版](https://data.gov.tw/license)使用。圖表使用 [TradingView Lightweight Charts™](https://www.tradingview.com/)（Copyright © TradingView, Inc.）。

## 免責聲明

本網站僅整理公開資料供參考，不構成任何投資建議，也不保證資料即時或正確。投資請自行判斷並自負風險。
