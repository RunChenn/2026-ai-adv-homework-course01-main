# CHANGELOG.md

## [1.1.0] — 2026-05-21

### 新增

**ECPay 金流串接**
- `src/ecpay.js`：ECPay 工具函式庫（`ecpayUrlEncode`、`generateCheckMacValue`、`verifyCheckMacValue`、`getTaiwanDateString`、`generateEcpayForm`、`queryTradeInfo`）
- `src/routes/ecpayRoutes.js`：ECPay 回呼路由
  - `POST /api/ecpay/return`：OrderResultURL — 付款後主動呼叫 QueryTradeInfo/V5 確認結果，更新訂單狀態後 redirect
  - `POST /api/ecpay/notify`：ReturnURL — 完整實作但 localhost 接收不到
- `POST /api/orders/:id/ecpay-form`：產生 ECPay 信用卡付款 HTML form（含 CheckMacValue）
- `orders.ecpay_trade_no` 欄位：儲存 MerchantTradeNo，供回呼時查詢訂單
- 資料庫自動遷移（`migrateDatabase()`）以 `ALTER TABLE ... ADD COLUMN` 方式新增欄位

**前端**
- 訂單詳情頁改為「前往綠界付款」按鈕，取代原模擬付款按鈕
- 前端付款流程：POST ecpay-form → 取得 HTML → 插入 DOM → `form.submit()` 自動跳轉

所有重要變更依版本記錄於此，格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

---

## [1.0.0] — 2026-05-21

### 新增

**後端 API**
- `POST /api/auth/register`：使用者註冊，bcrypt 雜湊密碼，回傳 JWT
- `POST /api/auth/login`：使用者登入，回傳 JWT（有效期 7 天）
- `GET /api/auth/profile`：取得登入使用者資料（需 JWT）
- `GET /api/products`：商品列表，支援 page/limit 分頁
- `GET /api/products/:id`：商品詳情
- `GET /api/cart`：查看購物車（支援 JWT 或 X-Session-Id 雙模式）
- `POST /api/cart`：加入商品（累加邏輯 + 庫存驗證）
- `PATCH /api/cart/:itemId`：修改數量（覆蓋語意）
- `DELETE /api/cart/:itemId`：移除購物車項目
- `POST /api/orders`：從購物車建立訂單（Transaction：建立訂單 + 扣庫存 + 清購物車）
- `GET /api/orders`：個人訂單列表
- `GET /api/orders/:id`：訂單詳情（僅本人可查）
- `PATCH /api/orders/:id/pay`：模擬付款（success → paid，fail → failed）
- `GET /api/admin/products`：後台商品列表（需 admin）
- `POST /api/admin/products`：新增商品（需 admin）
- `PUT /api/admin/products/:id`：編輯商品（需 admin）
- `DELETE /api/admin/products/:id`：刪除商品，含 pending 訂單防護（需 admin）
- `GET /api/admin/orders`：後台訂單列表，支援 status 篩選（需 admin）
- `GET /api/admin/orders/:id`：後台訂單詳情，含購買者資訊（需 admin）

**資料庫**
- SQLite 資料庫，自動初始化建表（users、products、cart_items、orders、order_items）
- WAL 模式 + foreign_keys ON
- 啟動時 seed 管理員帳號與 8 筆花卉商品

**前台頁面（SSR EJS）**
- 首頁、商品詳情、購物車、結帳、登入、訂單列表、訂單詳情、404

**後台頁面（SSR EJS）**
- 商品管理、訂單管理

**工具**
- `generate-openapi.js`：從 JSDoc 產生 OpenAPI 3.0 規格（`openapi.json`）
- TailwindCSS 4.x 整合，支援 build 與 watch

**測試**
- Vitest + supertest 測試套件，6 個測試檔，覆蓋所有 API 路由
- 固定執行順序（auth → products → cart → orders → adminProducts → adminOrders）
