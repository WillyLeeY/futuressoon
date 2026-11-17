# FuturesSoon 專案規則（給 Claude 看）

## 專案是什麼
台指期資料網站：每日 K 線圖 + 三大法人（自營商、投信、外資）期貨買賣超。給作者和朋友使用，不放廣告、不收費。

## 使用者
- 程式新手：每一步都要說明「做什麼、為什麼、怎麼確認成功」，用白話解釋術語。
- 主動提醒風險（尤其是金鑰外洩）。
- 一律使用繁體中文溝通。

## 技術決定
- 資料來源（只用官方）：臺灣期貨交易所
  - 每日更新：OpenAPI `https://openapi.taifex.com.tw/v1/`（只提供最新一個交易日，無需 API key）
    - 行情：`/DailyMarketReportFut`
    - 三大法人：`/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate`
  - 歷史回補：官網 CSV（Big5 編碼，POST）
    - 行情：`https://www.taifex.com.tw/cht/3/futDataDown`
    - 三大法人：`https://www.taifex.com.tw/cht/3/futContractsDateDown`
- 商品：大台 `TX`、小台 `MTX`、微台 `TMF`；之後會擴充其他指數，資料表要用通用設計（商品代碼為欄位，不寫死）。
- 資料保留約一年，每日資料。
- 資料庫：Supabase（PostgreSQL）。前端：Vercel。每日排程：GitHub Actions，台灣時間 17:00 和 19:00 各一次（Actions 用 UTC，要換算）。
- 寫入要冪等：同一天重複抓不可重複存（用 upsert）。
- K 線圖：lightweight-charts。

## 安全規則
- API 金鑰、資料庫密碼絕不寫進程式碼、不 commit。放 `.env`（已在 .gitignore）和 GitHub Secrets。
- 網站只能用唯讀的 anon key；service role key 只給排程使用。
- repo 是公開的，commit 前確認沒有任何秘密或個人資料。

## 授權與標示
- 資料來源為政府資料開放授權條款第 1 版，網站與 README 必須標示資料來源為臺灣期貨交易所。
- 公開網站前需再讀一次期交所使用條款：https://www.taifex.com.tw/cht/edu/userTerms

## 工作方式
- 一次一小步，每完成一塊就測試、commit。
- 需要使用者決定的問題，用 SendMessage 傳到側邊對話 `my-project-e8`，使用者在主對話用編號回覆。
- commit 訊息用英文簡短描述。
