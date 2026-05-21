# CLAUDE.md

## 專案概述

花卉電商網站後端 — Node.js + Express + SQLite (better-sqlite3) + EJS + TailwindCSS

提供完整的前後台電商功能：商品瀏覽、購物車（支援訪客與登入雙模式）、訂單建立與付款模擬，以及管理員後台的商品與訂單管理。

## 常用指令

```bash
# 開發（需分兩個終端）
node server.js                  # 啟動伺服器（port 3001）
npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --watch

# 生產啟動（先 build CSS 再啟動）
npm start

# 測試（必須設定 JWT_SECRET）
JWT_SECRET=test npm test

# 產生 OpenAPI 規格
node generate-openapi.js        # 輸出至 openapi.json
```

## 關鍵規則

- **啟動前必須設定 `JWT_SECRET`**：`server.js` 在啟動時會檢查，若未設定則直接 `process.exit(1)`
- **資料庫在 `require('./src/database')` 時自動初始化**：建表 + 植入 Admin 帳號與 8 筆商品 seed data，不需手動 migration
- **所有 API 回應統一格式** `{ data, error, message }`：`error` 在成功時為 `null`，失敗時為錯誤碼字串
- **購物車雙模式認證**：Cart API 同時接受 `Authorization: Bearer <token>` 或 `X-Session-Id` 標頭，兩者不能混用（同一購物車用同一種身份識別）
- **功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`**

## 詳細文件

- [docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌
