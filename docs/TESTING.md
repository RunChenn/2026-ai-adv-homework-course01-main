# TESTING.md

## 技術棧

- **測試框架**：Vitest 2.x（全域 API，不需 import describe/it/expect）
- **HTTP 測試**：supertest 7.x（對 Express app 發送 HTTP 請求，不需啟動真實伺服器）
- **資料庫**：使用 `database.sqlite`（與開發同一個實體資料庫，非 mock）

## 執行測試

```bash
# 執行前需設定 JWT_SECRET（否則 app 拒絕啟動）
JWT_SECRET=test npm test

# 或
JWT_SECRET=test npx vitest run
```

> bcrypt 在 `NODE_ENV=test` 時 saltRounds 降為 1（加速雜湊），但 vitest 不自動設定 `NODE_ENV`。若需要加速，手動設定：`NODE_ENV=test JWT_SECRET=test npm test`。實際上，vitest 設定了 `globals: true` 與固定執行順序，bcrypt 的效能影響可接受。

## 測試檔案與執行順序

`vitest.config.js` 指定了**固定執行順序**（`fileParallelism: false`）：

| 順序 | 檔案 | 測試的 API |
|------|------|------------|
| 1 | `tests/auth.test.js` | `/api/auth/register`、`/api/auth/login`、`/api/auth/profile` |
| 2 | `tests/products.test.js` | `/api/products`、`/api/products/:id` |
| 3 | `tests/cart.test.js` | `/api/cart`（CRUD，含 guest + auth 模式） |
| 4 | `tests/orders.test.js` | `/api/orders`（建立、列表、詳情） |
| 5 | `tests/adminProducts.test.js` | `/api/admin/products`（CRUD + 權限測試） |
| 6 | `tests/adminOrders.test.js` | `/api/admin/orders`（列表 + 篩選 + 詳情） |

**執行順序的重要性**：`orders.test.js` 的 `beforeAll` 依賴 products 已存在（seed 資料），而 `adminOrders.test.js` 的 `beforeAll` 需要先建立一筆訂單。因此不可亂序。

## 共用輔助函式（`tests/setup.js`）

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

| 函式 | 說明 | 回傳 |
|------|------|------|
| `app` | Express app 實例 | — |
| `request` | supertest 的 `request` 函式 | — |
| `getAdminToken()` | 以 seed admin 帳號登入，取得 JWT | `Promise<string>` |
| `registerUser(overrides?)` | 以亂數 email 註冊新使用者 | `Promise<{ token, user }>` |

`registerUser` 的 `overrides` 參數：

```javascript
registerUser({
  email: 'specific@example.com',  // 預設：隨機 test-<timestamp>-<random>@example.com
  password: 'mypassword',         // 預設：'password123'
  name: '自訂名稱'                 // 預設：'測試使用者'
})
```

## 撰寫新測試的步驟

1. **引入 setup**：

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

2. **基本結構**：

```javascript
describe('Feature API', () => {
  let token;

  beforeAll(async () => {
    const { token: t } = await registerUser();
    token = t;
  });

  it('should do something', async () => {
    const res = await request(app)
      .get('/api/endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
  });
});
```

3. **驗證統一回應格式**：每個測試都應驗證 `{ data, error, message }` 三個欄位同時存在（這是本專案的回應規範）：

```javascript
expect(res.body).toHaveProperty('data');
expect(res.body).toHaveProperty('error', null);    // 成功時
expect(res.body).toHaveProperty('message');

// 失敗時
expect(res.body).toHaveProperty('data', null);
expect(res.body).toHaveProperty('error');
expect(res.body.error).not.toBeNull();
```

4. **Guest 模式（購物車）**：用 `X-Session-Id` 標頭代替 `Authorization`：

```javascript
const sessionId = 'test-session-' + Date.now();

const res = await request(app)
  .post('/api/cart')
  .set('X-Session-Id', sessionId)
  .send({ productId, quantity: 1 });
```

5. **Admin 測試**：先取得 admin token，再測試 403 情境：

```javascript
beforeAll(async () => {
  adminToken = await getAdminToken();
});

it('should deny regular user', async () => {
  const { token } = await registerUser();
  const res = await request(app)
    .get('/api/admin/products')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
```

## 常見陷阱

### 測試資料庫汙染

測試直接使用 `database.sqlite`，每次 `npm test` 前後的狀態會**累積**。若需要乾淨的測試環境，在測試前手動刪除 `database.sqlite`（伺服器會自動重建 + seed）。

各測試使用時間戳確保 email 唯一性（`registerUser` 中的 `test-${Date.now()}-${random}@example.com`），避免重複執行時產生 409 衝突。

### 訂單測試依賴購物車狀態

`orders.test.js` 在 `beforeAll` 加入購物車，建立訂單後購物車自動清空。若第二次執行同一個 `describe` 區塊（不常見，但 `it.only` 情況可能發生），空購物車會導致 400 錯誤。

### Admin 帳號只有一個

`getAdminToken()` 固定使用 `admin@hexschool.com`。若測試中修改了這個帳號（如改密碼），後續所有 admin 測試都會失敗。目前沒有任何測試修改 admin 帳號，但需注意。

### fileParallelism 必須為 false

SQLite 不支援多 writer 並行，若改為 `fileParallelism: true`，多個測試檔案同時寫入資料庫會導致 `SQLITE_BUSY` 錯誤。

### bcrypt 效能

`src/database.js` 的 `seedAdminUser()` 在 `NODE_ENV=test` 時使用 saltRounds=1，但 `authRoutes.js` 的 `register` handler 固定使用 saltRounds=10。若測試中大量呼叫 `registerUser()`，會因 bcrypt 計算而變慢。`hookTimeout` 設為 10000ms（10 秒）以緩解此問題。

## 測試涵蓋情境

| 功能 | 覆蓋的情境 |
|------|------------|
| 註冊 | 成功、重複 email（409）、缺少欄位（400）|
| 登入 | 成功、密碼錯誤（401）、無 token 存取受保護路由（401）|
| 個人資料 | 成功取得、無 token（401）|
| 商品列表 | 成功、分頁參數 |
| 商品詳情 | 成功、不存在 ID（404）|
| 購物車 | 新增（guest）、查看（guest）、修改數量（guest）、刪除（guest）、新增（auth）、不存在商品（404）|
| 訂單建立 | 成功、空購物車（400）、未登入（401）|
| 訂單列表 | 成功取得 |
| 訂單詳情 | 成功、不存在 ID（404）|
| 後台商品 | 列表、新增、更新、刪除、一般用戶被拒（403）、無 token（401）|
| 後台訂單 | 列表、依 status 篩選、詳情（含 user 欄位）、一般用戶被拒（403）|
