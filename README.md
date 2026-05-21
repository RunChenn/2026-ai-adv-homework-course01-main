# 花卉電商網站

花卉電商專案，包含前台購物流程（商品瀏覽、購物車、結帳）與後台管理（商品 CRUD、訂單管理），並提供完整的 REST API。

## 技術棧

| 層次 | 技術 |
|------|------|
| 執行環境 | Node.js |
| Web 框架 | Express 4.x |
| 資料庫 | SQLite（better-sqlite3，同步 API） |
| 模板引擎 | EJS 5.x（伺服器端渲染） |
| 樣式框架 | TailwindCSS 4.x |
| 認證 | JWT（jsonwebtoken）+ bcrypt 密碼雜湊 |
| 金流 | 綠界 ECPay AIO 信用卡（staging 測試環境） |
| 測試框架 | Vitest 2.x + supertest |
| API 文件 | swagger-jsdoc（JSDoc 註解自動產生 OpenAPI 3.0） |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，至少設定 JWT_SECRET

# 3. 建置 CSS
npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --minify

# 4. 啟動伺服器（預設 port 3001）
node server.js

# 或一步完成（npm start = css:build + node server.js）
npm start
```

伺服器啟動後，預設管理員帳號：
- Email：`admin@hexschool.com`（可由 `.env` 的 `ADMIN_EMAIL` 覆蓋）
- Password：`12345678`（可由 `.env` 的 `ADMIN_PASSWORD` 覆蓋）

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | 建置 CSS 後啟動生產伺服器 |
| `node server.js` | 直接啟動開發伺服器（跳過 CSS build） |
| `npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --watch` | CSS 開發熱重載 |
| `npm test` | 執行完整測試套件（需設 `JWT_SECRET`） |
| `node generate-openapi.js` | 產生 `openapi.json` API 規格檔 |

## 環境變數

| 變數 | 用途 | 必要 | 預設值 |
|------|------|------|--------|
| `JWT_SECRET` | JWT 簽名金鑰 | **是** | 無（未設定則拒絕啟動） |
| `PORT` | 伺服器埠號 | 否 | `3001` |
| `BASE_URL` | 伺服器 Base URL | 否 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許來源 | 否 | `http://localhost:3001` |
| `ADMIN_EMAIL` | 初始管理員 Email | 否 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 初始管理員密碼 | 否 | `12345678` |
| `ECPAY_MERCHANT_ID` | 綠界商店代號 | ECPay 功能必要 | `3002607`（staging 測試帳號） |
| `ECPAY_HASH_KEY` | 綠界 HashKey | ECPay 功能必要 | `pwFHCqoQZGmho4w6`（staging） |
| `ECPAY_HASH_IV` | 綠界 HashIV | ECPay 功能必要 | `EkRm7iFT261dpevs`（staging） |
| `ECPAY_ENV` | 綠界環境切換 | 否 | 無（預設 staging；`production` 切換正式） |

## 頁面路由

| 路徑 | 說明 |
|------|------|
| `/` | 首頁（商品列表） |
| `/products/:id` | 商品詳情 |
| `/cart` | 購物車 |
| `/checkout` | 結帳 |
| `/login` | 登入 |
| `/orders` | 我的訂單列表 |
| `/orders/:id` | 訂單詳情（含付款結果） |
| `/admin/products` | 後台商品管理 |
| `/admin/orders` | 後台訂單管理 |

## 文件

| 文件 | 內容 |
|------|------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架構、目錄結構、API 路由總覽、資料庫 Schema |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 開發規範、命名規則、新增功能步驟、環境變數說明 |
| [docs/FEATURES.md](./docs/FEATURES.md) | 每個功能的行為描述、請求規格、錯誤碼 |
| [docs/TESTING.md](./docs/TESTING.md) | 測試規範、執行順序、撰寫測試指南 |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | 版本更新日誌 |
