# FEATURES.md

功能完成狀態與詳細行為說明。

## 功能完成狀態總覽

| 功能 | 狀態 |
|------|------|
| 使用者註冊 | 完成 |
| 使用者登入 | 完成 |
| 個人資料查詢 | 完成 |
| 商品列表（分頁） | 完成 |
| 商品詳情 | 完成 |
| 購物車（訪客模式） | 完成 |
| 購物車（登入模式） | 完成 |
| 購物車累加與庫存驗證 | 完成 |
| 建立訂單（含扣庫存 transaction） | 完成 |
| 訂單列表（個人） | 完成 |
| 訂單詳情（個人） | 完成 |
| 模擬付款（success/fail） | 完成（保留） |
| ECPay 信用卡金流串接 | 完成 |
| 後台商品 CRUD | 完成 |
| 後台商品刪除防護（pending 訂單） | 完成 |
| 後台訂單列表（含 status 篩選） | 完成 |
| 後台訂單詳情（含使用者資訊） | 完成 |
| SSR 前台頁面（9 頁） | 完成 |
| SSR 後台頁面（2 頁） | 完成 |
| OpenAPI 3.0 規格產生 | 完成 |

---

## ECPay 金流（`/api/ecpay`、`/api/orders/:id/ecpay-form`）

### 架構說明（本地端主動查詢模式）

本專案僅運行於 localhost，ECPay 無法送達 Server Notify（ReturnURL）。因此付款結果改由 **OrderResultURL** 處理：瀏覽器付款完成後被 ECPay redirect 到本地端，本地端再主動呼叫 **QueryTradeInfo/V5** 向 ECPay 確認最終狀態，不依賴 Server Notify。

```
使用者                本地伺服器                        ECPay
  │                       │                               │
  ├→ 點擊「前往綠界付款」    │                               │
  ├→ POST /api/orders/:id/ecpay-form                      │
  │       ←─ 回傳 HTML form（含 CheckMacValue）            │
  ├→ 瀏覽器自動 POST form ──────────────────────────────→ │
  │                       │      使用者在 ECPay 信用卡付款   │
  │  瀏覽器 POST ←──────────────────────────────────────── │ OrderResultURL
  ├→ POST /api/ecpay/return                               │
  │       ─→ 呼叫 QueryTradeInfo/V5 ──────────────────→  │
  │       ←─ 取得 TradeStatus ←──────────────────────── ─ │
  │       ─→ 更新 orders.status (paid/failed)              │
  │  302 redirect → /orders/:id?payment=success            │
```

### 產生付款表單 `POST /api/orders/:id/ecpay-form`

需 JWT 認證。訂單必須屬於當前使用者且 `status = 'pending'`。

**業務邏輯**：
1. 查訂單（user_id 過濾）
2. 驗證 status 為 `pending`
3. 讀取 order_items，組成 `ItemName`（多商品以 `#` 分隔，限 200 字元）
4. 計算 `MerchantTradeNo = order.id.replace(/-/g, '').slice(0, 20)`（UUID hex 20 碼）
5. 將 MerchantTradeNo 寫入 `orders.ecpay_trade_no`
6. 呼叫 `generateEcpayForm()` 計算 CheckMacValue 並組 HTML form
7. 回傳 `{ data: { html }, error: null, message: '付款表單產生成功' }`

**前端流程**：
1. 呼叫此 API 取得 HTML form 字串
2. 將 HTML 插入隱藏 div（innerHTML）
3. 呼叫 `form.submit()` 跳轉至 ECPay

**錯誤情境**：

| 情境 | HTTP | `error` |
|------|------|---------|
| 訂單不存在或不屬於當前使用者 | 404 | `NOT_FOUND` |
| 訂單非 pending 狀態 | 400 | `INVALID_STATUS` |

### ECPay 回呼 `POST /api/ecpay/return`（OrderResultURL）

瀏覽器導回時送出的 form POST，**不需認證**。處理流程：
1. 從 body 取得 `MerchantTradeNo`
2. 呼叫 `queryTradeInfo(MerchantTradeNo)` 查詢 ECPay
3. `TradeStatus === '1'` → `status = 'paid'`；其他 → `status = 'failed'`
4. 只更新 `status = 'pending'` 的訂單（防重複）
5. 302 redirect → `/orders/:id?payment=success` 或 `?payment=failed`

### ECPay Server Notify `POST /api/ecpay/notify`（ReturnURL，完整實作但 localhost 接收不到）

1. 驗證 CheckMacValue（timing-safe）
2. `RtnCode === '1'` → paid；其他 → failed
3. 回應純文字 `1|OK`

### MerchantTradeNo 格式

`order.id.replace(/-/g, '').slice(0, 20)` — UUID hex 前 20 碼，僅含 `0-9a-f`，符合 ECPay 英數字限制，且與訂單 UUID 一對一對應（永久唯一）。

### 環境切換

`ECPAY_ENV=production` 時切換至正式環境 URL；預設使用 staging。

| 環境 | CheckOut URL | QueryTradeInfo URL |
|------|-------------|-------------------|
| staging（預設） | `payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` | `payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5` |
| production | `payment.ecpay.com.tw/Cashier/AioCheckOut/V5` | `payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5` |

### 測試信用卡（staging 環境）

| 項目 | 值 |
|------|-----|
| 卡號 | `4311-9522-2222-2222` |
| 有效期 | 任意未來日期 |
| CVV | `222` |
| 3DS 驗證碼 | `1234` |

---

## 認證功能（`/api/auth`）

### 註冊 `POST /api/auth/register`

**業務邏輯**：

1. 驗證 `email`、`password`、`name` 必填
2. Email 格式驗證（正規表達式）
3. 密碼長度至少 6 字元
4. 查詢 `users` 表確認 Email 未重複
5. 以 bcrypt saltRounds=10 雜湊密碼（測試環境 saltRounds=1 加速）
6. 插入使用者，`role` 固定為 `'user'`（無法自行升級為 admin）
7. 立即產生並回傳 JWT（有效期 7 天）

**請求 Body**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `email` | string | 是 | 須符合 Email 格式 |
| `password` | string | 是 | 最少 6 字元 |
| `name` | string | 是 | 顯示名稱 |

**成功回應** `201`：

```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "name": "...", "role": "user" },
    "token": "eyJ..."
  },
  "error": null,
  "message": "註冊成功"
}
```

**錯誤情境**：

| 情境 | HTTP | `error` |
|------|------|---------|
| 必填欄位缺失 | 400 | `VALIDATION_ERROR` |
| Email 格式錯誤 | 400 | `VALIDATION_ERROR` |
| 密碼少於 6 字元 | 400 | `VALIDATION_ERROR` |
| Email 已被使用 | 409 | `CONFLICT` |

---

### 登入 `POST /api/auth/login`

**業務邏輯**：

1. 驗證 `email`、`password` 必填
2. 查詢使用者（以 email），不存在回 401（故意不區分「Email 不存在」與「密碼錯誤」以防止使用者枚舉）
3. `bcrypt.compareSync` 比對密碼
4. 回傳 JWT（有效期 7 天）

**請求 Body**：

| 欄位 | 型別 | 必填 |
|------|------|------|
| `email` | string | 是 |
| `password` | string | 是 |

**成功回應** `200`：`{ data: { user, token }, error: null, message: "登入成功" }`

**錯誤情境**：

| 情境 | HTTP | `error` |
|------|------|---------|
| 必填欄位缺失 | 400 | `VALIDATION_ERROR` |
| Email 不存在或密碼錯誤 | 401 | `UNAUTHORIZED` |

---

### 個人資料 `GET /api/auth/profile`

需 JWT。從 token 的 `userId` 查詢資料庫，回傳 `{ id, email, name, role, created_at }`。不回傳 `password_hash`。

---

## 商品功能（`/api/products`）

### 商品列表 `GET /api/products`

**查詢參數**：

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `page` | `1` | 頁碼（最小 1） |
| `limit` | `10` | 每頁筆數（最小 1，最大 100） |

**排序**：`created_at DESC`（最新在前）

**成功回應** `200`：

```json
{
  "data": {
    "products": [{ "id", "name", "description", "price", "stock", "image_url", "created_at", "updated_at" }],
    "pagination": { "total": 8, "page": 1, "limit": 10, "totalPages": 1 }
  },
  "error": null,
  "message": "成功"
}
```

無需認證，公開存取。

---

### 商品詳情 `GET /api/products/:id`

以 UUID 查詢單一商品，不存在回 404。回傳完整商品欄位。

---

## 購物車功能（`/api/cart`）

> **雙模式認證**：所有購物車 API 需提供以下其中一種身份識別，不能混用：
> - `Authorization: Bearer <JWT>` — 登入使用者
> - `X-Session-Id: <任意字串>` — 訪客（Session ID 由前端產生並存於 localStorage）

### 查看購物車 `GET /api/cart`

回傳屬於當前使用者/Session 的所有購物車項目，並即時計算總金額。

**成功回應** `200`：

```json
{
  "data": {
    "items": [
      {
        "id": "cart-item-uuid",
        "product_id": "product-uuid",
        "quantity": 2,
        "product": { "name": "粉色玫瑰花束", "price": 1680, "stock": 30, "image_url": "..." }
      }
    ],
    "total": 3360
  },
  "error": null,
  "message": "成功"
}
```

---

### 加入商品 `POST /api/cart`

**業務邏輯（累加機制）**：

1. 驗證 `productId` 必填，`quantity` 為正整數（預設 1）
2. 查詢商品存在
3. 以 `product_id + (user_id 或 session_id)` 查詢購物車是否已有該商品
4. **若已存在**：`newQty = existing.quantity + quantity`，若 `newQty > stock` 則 400；否則 UPDATE
5. **若不存在**：若 `quantity > stock` 則 400；否則 INSERT

**請求 Body**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `productId` | string | 是 | 商品 UUID |
| `quantity` | integer | 否 | 加入數量，預設 1，必須 >= 1 |

**成功回應** `200`：`{ data: { id, product_id, quantity }, message: "已加入購物車" }`

**錯誤情境**：

| 情境 | HTTP | `error` |
|------|------|---------|
| `productId` 缺失 | 400 | `VALIDATION_ERROR` |
| `quantity` 非正整數 | 400 | `VALIDATION_ERROR` |
| 商品不存在 | 404 | `NOT_FOUND` |
| 數量超過庫存 | 400 | `STOCK_INSUFFICIENT` |

---

### 修改數量 `PATCH /api/cart/:itemId`

**業務邏輯**：

以 `itemId + (user_id 或 session_id)` 查詢購物車項目（防止跨使用者篡改），驗證新數量不超過庫存，直接 UPDATE（非累加，為**覆蓋**語意）。

**請求 Body**：`{ "quantity": 5 }`（必填，正整數）

---

### 移除項目 `DELETE /api/cart/:itemId`

以 `itemId + (user_id 或 session_id)` 查詢後刪除。回應 `{ data: null, error: null, message: "已從購物車移除" }`。

---

## 訂單功能（`/api/orders`）

所有訂單 API 需 JWT 認證（不支援訪客）。

### 建立訂單 `POST /api/orders`

**業務邏輯（完整 Transaction）**：

1. 驗證 `recipientName`、`recipientEmail`（格式）、`recipientAddress` 必填
2. 讀取該使用者的購物車（必須非空）
3. 批次檢查每筆購物車項目的庫存，若有任一不足，回傳所有不足商品名稱
4. 計算 `totalAmount = Σ(price × quantity)`
5. **Transaction**（原子性）：
   - INSERT orders
   - 批次 INSERT order_items（快照當下的商品名稱與價格）
   - 批次 UPDATE products.stock（扣庫存）
   - DELETE cart_items（清空購物車）

訂單編號格式：`ORD-YYYYMMDD-XXXXX`（XXXXX 為 UUID v4 前 5 碼大寫）

**請求 Body**：

| 欄位 | 型別 | 必填 |
|------|------|------|
| `recipientName` | string | 是 |
| `recipientEmail` | string（Email 格式） | 是 |
| `recipientAddress` | string | 是 |

**成功回應** `201`：

```json
{
  "data": {
    "id": "order-uuid",
    "order_no": "ORD-20260521-A1B2C",
    "total_amount": 1680,
    "status": "pending",
    "items": [{ "product_name": "粉色玫瑰花束", "product_price": 1680, "quantity": 1 }],
    "created_at": "2026-05-21T..."
  },
  "error": null,
  "message": "訂單建立成功"
}
```

**錯誤情境**：

| 情境 | HTTP | `error` |
|------|------|---------|
| 必填欄位缺失 | 400 | `VALIDATION_ERROR` |
| Email 格式錯誤 | 400 | `VALIDATION_ERROR` |
| 購物車為空 | 400 | `CART_EMPTY` |
| 任一商品庫存不足 | 400 | `STOCK_INSUFFICIENT` |
| 未登入 | 401 | `UNAUTHORIZED` |

---

### 訂單列表 `GET /api/orders`

回傳當前登入使用者的所有訂單，以 `created_at DESC` 排序。每筆訂單包含 `{ id, order_no, total_amount, status, created_at }`，不包含 items 詳情。

---

### 訂單詳情 `GET /api/orders/:id`

查詢時以 `id + user_id` 雙重過濾，確保使用者只能查看自己的訂單（他人訂單回 404 而非 403，不洩漏訂單存在資訊）。

回應包含完整收件資訊與 `items` 陣列（含 `product_id`、`product_name`、`product_price`、`quantity`）。

---

### 模擬付款 `PATCH /api/orders/:id/pay`

**業務邏輯**：

1. 驗證 `action` 欄位必須為 `'success'` 或 `'fail'`
2. 查詢訂單（需為當前使用者的訂單）
3. 訂單 `status` 必須為 `'pending'`，否則 400（`INVALID_STATUS`）
4. 將 `action` 對應：`success → 'paid'`，`fail → 'failed'`
5. UPDATE orders.status

回傳更新後的完整訂單資料（含 items）。付款成功 message 為「付款成功」，失敗為「付款失敗」。

**請求 Body**：`{ "action": "success" }` 或 `{ "action": "fail" }`

---

## 後台商品管理（`/api/admin/products`）

所有後台 API 需 JWT + admin role，否則：
- 無 token → 401
- token 有效但 role 非 admin → 403

### 後台商品列表 `GET /api/admin/products`

與前台商品列表相同的分頁邏輯（page/limit），但需 admin 認證。

### 新增商品 `POST /api/admin/products`

**請求 Body**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `name` | string | 是 | 商品名稱 |
| `description` | string | 否 | 描述 |
| `price` | integer | 是 | 正整數，> 0 |
| `stock` | integer | 是 | 非負整數，>= 0 |
| `image_url` | string | 否 | 圖片 URL |

**成功回應** `201`：回傳完整商品資料。

### 編輯商品 `PUT /api/admin/products/:id`

部分欄位可選（未傳的欄位保留原值），但傳了就必須符合型別約束。`updated_at` 自動更新為 `datetime('now')`。

### 刪除商品 `DELETE /api/admin/products/:id`

**刪除防護**：若商品存在於任何 `status = 'pending'` 的訂單中，回傳 409（`CONFLICT`），拒絕刪除。只有 `paid` 或 `failed` 訂單中的商品才允許刪除。

---

## 後台訂單管理（`/api/admin/orders`）

### 後台訂單列表 `GET /api/admin/orders`

查詢所有使用者的訂單（不限制 user_id）。

**查詢參數**：

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `page` | `1` | 頁碼 |
| `limit` | `10` | 每頁筆數（最大 100） |
| `status` | 無（全部） | 篩選：`pending`、`paid`、`failed`。其他值忽略，不篩選 |

### 後台訂單詳情 `GET /api/admin/orders/:id`

可查詢任何使用者的訂單。回應比一般訂單詳情多一個 `user` 欄位：

```json
"user": { "name": "購買者姓名", "email": "buyer@example.com" }
```

若使用者已被刪除，`user` 為 `null`。

---

## SSR 頁面功能

所有頁面均為伺服器端渲染（EJS），前端邏輯由各頁面對應的 JavaScript 檔案處理（透過 AJAX 呼叫 API）。

| 頁面 | 路徑 | 對應 JS | 說明 |
|------|------|---------|------|
| 首頁 | `/` | `pages/index.js` | 商品列表展示 |
| 商品詳情 | `/products/:id` | `pages/product-detail.js` | 商品資訊 + 加入購物車 |
| 購物車 | `/cart` | `pages/cart.js` | 購物車管理 |
| 結帳 | `/checkout` | `pages/checkout.js` | 填寫收件資訊並下單 |
| 登入 | `/login` | `pages/login.js` | 登入表單 |
| 訂單列表 | `/orders` | `pages/orders.js` | 個人訂單 |
| 訂單詳情 | `/orders/:id` | `pages/order-detail.js` | 訂單資訊 + 付款操作 |
| 後台商品 | `/admin/products` | `pages/admin-products.js` | 商品 CRUD UI |
| 後台訂單 | `/admin/orders` | `pages/admin-orders.js` | 訂單列表 + 篩選 |
