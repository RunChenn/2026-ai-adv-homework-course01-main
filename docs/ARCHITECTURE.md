# ARCHITECTURE.md

## 目錄結構

```
.
├── app.js                      # Express app 組裝（middleware + 路由掛載）
├── server.js                   # 進入點：啟動 HTTP server，檢查 JWT_SECRET
├── generate-openapi.js         # 產生 openapi.json 的 CLI 工具
├── swagger-config.js           # swagger-jsdoc 設定（routes glob、security scheme）
├── vitest.config.js            # 測試設定（執行順序、parallel off）
├── package.json
├── .env.example
│
├── src/
│   ├── database.js             # DB 初始化 + seed + migration；export better-sqlite3 db instance
│   ├── ecpay.js                # ECPay 工具函式（CheckMacValue、QueryTradeInfo、generateEcpayForm 等）
│   ├── middleware/
│   │   ├── authMiddleware.js   # JWT Bearer token 驗證，掛到 req.user
│   │   ├── adminMiddleware.js  # 檢查 req.user.role === 'admin'
│   │   ├── sessionMiddleware.js# 讀取 X-Session-Id 標頭，掛到 req.sessionId
│   │   └── errorHandler.js     # 全域 Express 錯誤處理，統一 { data,error,message } 格式
│   └── routes/
│       ├── authRoutes.js       # POST /register, POST /login, GET /profile
│       ├── productRoutes.js    # GET /products, GET /products/:id
│       ├── cartRoutes.js       # 購物車 CRUD，雙模式認證（JWT 或 session）
│       ├── orderRoutes.js      # 訂單建立、列表、詳情、ECPay form 產生、模擬付款
│       ├── ecpayRoutes.js      # ECPay 回呼（OrderResultURL、ReturnURL）
│       ├── adminProductRoutes.js # 後台商品 CRUD（需 admin role）
│       ├── adminOrderRoutes.js # 後台訂單查詢（需 admin role）
│       └── pageRoutes.js       # SSR 頁面路由（前台 + 後台）
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs           # 前台 layout（含 head、header、footer）
│   │   └── admin.ejs           # 後台 layout（含 admin sidebar）
│   ├── pages/
│   │   ├── index.ejs           # 首頁
│   │   ├── product-detail.ejs  # 商品詳情
│   │   ├── cart.ejs            # 購物車
│   │   ├── checkout.ejs        # 結帳
│   │   ├── login.ejs           # 登入
│   │   ├── orders.ejs          # 訂單列表
│   │   ├── order-detail.ejs    # 訂單詳情（含付款結果顯示）
│   │   ├── 404.ejs             # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs    # 後台商品管理
│   │       └── orders.ejs      # 後台訂單管理
│   └── partials/
│       ├── head.ejs            # <head> 共用區塊
│       ├── header.ejs          # 前台導覽列
│       ├── footer.ejs          # 頁尾
│       ├── notification.ejs    # 全域通知提示元件
│       ├── admin-header.ejs    # 後台頂部列
│       └── admin-sidebar.ejs   # 後台側邊欄
│
├── public/
│   ├── css/
│   │   ├── input.css           # TailwindCSS 入口（@import "tailwindcss"）
│   │   └── output.css          # build 產出（git ignored）
│   ├── stylesheets/
│   │   └── style.css           # 自訂全域 CSS
│   └── js/
│       ├── api.js              # 前端 API 呼叫工具（封裝 fetch + JWT/session 標頭）
│       ├── auth.js             # 前端認證工具（localStorage token 讀寫）
│       ├── notification.js     # 通知訊息顯示邏輯
│       ├── header-init.js      # 導覽列初始化（登入狀態、購物車數量）
│       └── pages/              # 每個頁面獨立的 JS 邏輯
│           ├── index.js
│           ├── product-detail.js
│           ├── cart.js
│           ├── checkout.js
│           ├── login.js
│           ├── orders.js
│           ├── order-detail.js
│           ├── admin-products.js
│           └── admin-orders.js
│
└── tests/
    ├── setup.js                # 共用輔助：app、request、getAdminToken、registerUser
    ├── auth.test.js
    ├── products.test.js
    ├── cart.test.js
    ├── orders.test.js
    ├── adminProducts.test.js
    └── adminOrders.test.js
```

## 啟動流程

```
node server.js
  │
  ├─ require('dotenv').config()       ← 載入 .env
  ├─ 檢查 JWT_SECRET，未設定則 exit(1)
  │
  └─ require('./app')
       │
       ├─ require('./src/database')
       │    ├─ better-sqlite3 開啟 database.sqlite（自動建立）
       │    ├─ PRAGMA journal_mode = WAL
       │    ├─ PRAGMA foreign_keys = ON
       │    ├─ CREATE TABLE IF NOT EXISTS（5 張表）
       │    ├─ seedAdminUser()         ← 若 admin email 不存在則插入
       │    ├─ seedProducts()          ← 若 products 表為空則插入 8 筆商品
       │    └─ migrateDatabase()       ← ALTER TABLE 補欄位（如 ecpay_trade_no）
       │
       ├─ Express app 設定
       │    ├─ view engine: ejs，views 目錄: ./views
       │    ├─ express.static('./public')
       │    ├─ cors（允許 FRONTEND_URL）
       │    ├─ express.json() + express.urlencoded()
       │    └─ sessionMiddleware（讀 X-Session-Id → req.sessionId）
       │
       ├─ 掛載 API 路由（見 API 路由總覽）
       ├─ 掛載頁面路由
       ├─ 404 handler（API 回 JSON；頁面回 EJS）
       └─ errorHandler（全域錯誤，統一回應格式）
```

## API 路由總覽

### 認證（`/api/auth`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/api/auth/register` | 無 | 註冊新帳號，回傳 token |
| POST | `/api/auth/login` | 無 | 登入，回傳 token |
| GET | `/api/auth/profile` | JWT | 取得登入使用者資料 |

### 商品（`/api/products`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/api/products` | 無 | 商品列表（分頁） |
| GET | `/api/products/:id` | 無 | 商品詳情 |

### 購物車（`/api/cart`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/api/cart` | JWT 或 Session | 查看購物車 |
| POST | `/api/cart` | JWT 或 Session | 加入商品 |
| PATCH | `/api/cart/:itemId` | JWT 或 Session | 修改數量 |
| DELETE | `/api/cart/:itemId` | JWT 或 Session | 移除項目 |

### 訂單（`/api/orders`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/api/orders` | JWT | 從購物車建立訂單 |
| GET | `/api/orders` | JWT | 我的訂單列表 |
| GET | `/api/orders/:id` | JWT | 訂單詳情（僅本人） |
| POST | `/api/orders/:id/ecpay-form` | JWT | 產生 ECPay 信用卡付款 HTML form |
| PATCH | `/api/orders/:id/pay` | JWT | 模擬付款（success/fail，保留供測試） |

### ECPay 回呼（`/api/ecpay`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/api/ecpay/return` | 無 | OrderResultURL：瀏覽器付款後被 ECPay redirect，主動呼叫 QueryTradeInfo 確認結果 |
| POST | `/api/ecpay/notify` | 無 | ReturnURL：ECPay Server Notify（localhost 接收不到，完整實作備用） |

### 後台商品（`/api/admin/products`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/api/admin/products` | JWT + admin | 商品列表（分頁） |
| POST | `/api/admin/products` | JWT + admin | 新增商品 |
| PUT | `/api/admin/products/:id` | JWT + admin | 全量更新商品 |
| DELETE | `/api/admin/products/:id` | JWT + admin | 刪除商品 |

### 後台訂單（`/api/admin/orders`）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| GET | `/api/admin/orders` | JWT + admin | 全部訂單（分頁、可依 status 篩選） |
| GET | `/api/admin/orders/:id` | JWT + admin | 訂單詳情（含使用者資訊） |

## 統一回應格式

所有 API 均回傳以下結構：

```json
{
  "data": { ... },     // 成功時的資料；失敗時為 null
  "error": null,       // 成功時為 null；失敗時為錯誤碼字串（如 "VALIDATION_ERROR"）
  "message": "成功"    // 人類可讀的訊息
}
```

**常見錯誤碼**

| 錯誤碼 | HTTP 狀態 | 情境 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 必填欄位缺失或格式錯誤 |
| `STOCK_INSUFFICIENT` | 400 | 購物車或下單時庫存不足 |
| `CART_EMPTY` | 400 | 下單時購物車為空 |
| `INVALID_STATUS` | 400 | 付款時訂單狀態非 pending |
| `UNAUTHORIZED` | 401 | Token 缺失、無效或過期；使用者不存在 |
| `FORBIDDEN` | 403 | 已登入但 role 非 admin |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | Email 重複；商品有未完成訂單無法刪除 |
| `INTERNAL_ERROR` | 500 | 未預期的伺服器錯誤 |

## 認證與授權機制

### 標準 JWT 認證（`authMiddleware`）

適用於 `/api/auth/profile`、`/api/orders/*` 所有路由、`/api/admin/*` 所有路由。

1. 讀取 `Authorization` 標頭，必須以 `Bearer ` 開頭
2. 以 `HS256` 演算法驗證 JWT，Secret 來自環境變數 `JWT_SECRET`
3. 從 token payload 取得 `userId`，查詢資料庫確認使用者存在
4. 將 `{ userId, email, role }` 掛到 `req.user`

**JWT Payload**：`{ userId, email, role }`  
**有效期**：7 天（`expiresIn: '7d'`）  
**演算法**：HS256

### Admin 授權（`adminMiddleware`）

在 `authMiddleware` 之後執行，單純檢查 `req.user.role === 'admin'`，不符則回 403。

### 購物車雙模式認證（`dualAuth` in `cartRoutes.js`）

購物車支援未登入訪客（以 Session ID 識別）與登入使用者（以 JWT 識別）共存：

1. **優先嘗試 JWT**：若有 `Authorization: Bearer ...` 標頭，驗證 token，成功後設 `req.user`
2. **若 JWT 標頭存在但 token 無效**：立即回 401，**不** fallback 到 Session
3. **若無 JWT 標頭**：嘗試讀取 `req.sessionId`（由 `sessionMiddleware` 從 `X-Session-Id` 標頭解析）
4. **兩者皆無**：回 401

購物車項目的歸屬欄位由此決定：
- 登入使用者：`cart_items.user_id = req.user.userId`
- 訪客：`cart_items.session_id = req.sessionId`

> **重要**：訪客加入購物車的項目在登入後**不會**自動合併，兩種模式的購物車是獨立的。

### Session Middleware

`sessionMiddleware` 非常輕量，僅將 `X-Session-Id` 標頭值複製到 `req.sessionId`，不產生也不驗證 session，完全信任客戶端提供的值。Session ID 由前端自行產生並儲存於 `localStorage`。

## 資料庫 Schema

資料庫檔案路徑：`database.sqlite`（專案根目錄，由 `src/database.js` 建立）

### `users` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `email` | TEXT | UNIQUE NOT NULL | 帳號 Email |
| `password_hash` | TEXT | NOT NULL | bcrypt 雜湊 |
| `name` | TEXT | NOT NULL | 顯示名稱 |
| `role` | TEXT | NOT NULL DEFAULT 'user' CHECK(IN 'user','admin') | 角色 |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間（UTC ISO）|

### `products` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | 商品名稱 |
| `description` | TEXT | — | 商品描述 |
| `price` | INTEGER | NOT NULL CHECK(> 0) | 售價（新台幣整數） |
| `stock` | INTEGER | NOT NULL DEFAULT 0 CHECK(>= 0) | 庫存數量 |
| `image_url` | TEXT | — | 商品圖片 URL |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |
| `updated_at` | TEXT | NOT NULL DEFAULT datetime('now') | 更新時間（編輯時手動更新） |

### `cart_items` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `session_id` | TEXT | — | 訪客 Session ID（與 user_id 二選一） |
| `user_id` | TEXT | FK users(id) | 登入使用者 ID（與 session_id 二選一） |
| `product_id` | TEXT | NOT NULL FK products(id) | 商品 ID |
| `quantity` | INTEGER | NOT NULL DEFAULT 1 CHECK(> 0) | 數量 |

> `session_id` 與 `user_id` 資料庫層面允許同時有值，但業務邏輯保證只寫入其中一個。

### `orders` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `order_no` | TEXT | UNIQUE NOT NULL | 訂單編號（格式：`ORD-YYYYMMDD-XXXXX`） |
| `user_id` | TEXT | NOT NULL FK users(id) | 下單使用者 |
| `recipient_name` | TEXT | NOT NULL | 收件人姓名 |
| `recipient_email` | TEXT | NOT NULL | 收件人 Email |
| `recipient_address` | TEXT | NOT NULL | 收件地址 |
| `total_amount` | INTEGER | NOT NULL | 訂單總金額 |
| `status` | TEXT | NOT NULL DEFAULT 'pending' CHECK(IN 'pending','paid','failed') | 付款狀態 |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |
| `ecpay_trade_no` | TEXT | — | ECPay MerchantTradeNo（UUID hex 前 20 碼），`migrateDatabase()` 以 ALTER TABLE 補加 |

### `order_items` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `order_id` | TEXT | NOT NULL FK orders(id) | 所屬訂單 |
| `product_id` | TEXT | NOT NULL FK order_items | 商品 ID（保留歷史對照） |
| `product_name` | TEXT | NOT NULL | 下單時的商品名稱（快照） |
| `product_price` | INTEGER | NOT NULL | 下單時的商品售價（快照） |
| `quantity` | INTEGER | NOT NULL | 購買數量 |

> `product_name` 與 `product_price` 為**快照**，商品日後修改或刪除不影響訂單記錄。

## 資料流

### 建立訂單的 Transaction

`POST /api/orders` 使用 `db.transaction()` 確保原子性，依序執行：

1. INSERT 到 `orders`
2. 對每個購物車項目：INSERT 到 `order_items`
3. 對每個購物車項目：UPDATE `products SET stock = stock - quantity`
4. DELETE FROM `cart_items WHERE user_id = ?`（清空該使用者購物車）

若任一步驟拋出例外，better-sqlite3 的 transaction 會自動回滾。

### 購物車累加邏輯

`POST /api/cart` 在寫入前檢查相同商品是否已在購物車：
- **已存在**：`newQty = existingItem.quantity + qty`，若超過庫存則 400 錯誤；否則 UPDATE
- **不存在**：直接 INSERT

## 模板渲染機制

頁面路由（`pageRoutes.js`）使用兩層渲染：

```javascript
// 先渲染頁面 partial（取得 body HTML 字串）
res.render('pages/index', locals, function(err, body) {
  // 再渲染 layout，將 body 注入
  res.render('layouts/front', { body, ...locals });
});
```

每個頁面需傳入：
- `title`：`<title>` 標籤內容
- `pageScript`：對應 `public/js/pages/<pageScript>.js` 的 script 名稱，由 layout 在頁尾載入

後台頁面使用 `layouts/admin.ejs`，前台使用 `layouts/front.ejs`。
