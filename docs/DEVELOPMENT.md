# DEVELOPMENT.md

## 命名規則對照表

| 種類 | 規則 | 範例 |
|------|------|------|
| 路由檔案 | camelCase + `Routes` 後綴 | `cartRoutes.js`、`adminProductRoutes.js` |
| Middleware 檔案 | camelCase + `Middleware` 後綴 | `authMiddleware.js`、`adminMiddleware.js` |
| 資料庫欄位 | snake_case | `user_id`、`created_at`、`order_no` |
| API 請求 Body 欄位 | camelCase | `productId`、`recipientName`、`recipientEmail` |
| API 回應 data 欄位 | snake_case（與資料庫一致） | `product_id`、`total_amount`、`order_no` |
| 環境變數 | UPPER_SNAKE_CASE | `JWT_SECRET`、`ADMIN_EMAIL` |
| EJS 模板變數 | camelCase | `pageScript`、`productId`、`orderId` |
| 前端 JS 頁面檔案 | kebab-case | `admin-products.js`、`order-detail.js` |

> **注意**：API 請求 body 用 camelCase（如 `productId`），但資料庫及回應用 snake_case（如 `product_id`）。這個不一致是現有設計，新 API 應維持此慣例。

## 模組系統

專案混用 **CommonJS**（後端）與 **ESM**（設定檔）：

- `app.js`、`src/**/*.js`、`tests/**/*.js`：CommonJS（`require` / `module.exports`）
- `vitest.config.js`：ESM（`import` / `export default`）

不可在 CommonJS 模組中使用 `import`，亦不可在 ESM 中使用 `require`。

## 環境變數完整表

| 變數 | 用途 | 必要 | 預設值 |
|------|------|------|--------|
| `JWT_SECRET` | JWT 簽名金鑰 | **必要** | 無（未設定拒絕啟動） |
| `PORT` | HTTP 伺服器埠號 | 否 | `3001` |
| `BASE_URL` | 伺服器 Base URL（供外部參考） | 否 | `http://localhost:3001` |
| `FRONTEND_URL` | CORS 允許的前端來源 | 否 | `http://localhost:3001` |
| `ADMIN_EMAIL` | Seed Admin 帳號 Email | 否 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | Seed Admin 帳號密碼 | 否 | `12345678` |
| `NODE_ENV` | 執行環境 | 否 | 無（`test` 時 bcrypt saltRounds 降為 1） |
| `ECPAY_MERCHANT_ID` | 綠界商店代號 | ECPay 功能必要 | `3002607`（staging 測試帳號） |
| `ECPAY_HASH_KEY` | 綠界 HashKey | ECPay 功能必要 | `pwFHCqoQZGmho4w6`（staging） |
| `ECPAY_HASH_IV` | 綠界 HashIV | ECPay 功能必要 | `EkRm7iFT261dpevs`（staging） |
| `ECPAY_ENV` | 綠界環境切換 | 否 | 無（預設 staging；設為 `production` 切換正式環境） |

## 新增 API 路由的步驟

1. **確認路由歸屬**：現有路由檔案對應的資源類型（auth / products / cart / orders / admin-products / admin-orders）。若是全新資源，建立 `src/routes/<resource>Routes.js`。

2. **在路由檔案中撰寫 handler**：
   - 所有 handler 直接寫在路由定義中（無獨立 controller 層）
   - 資料庫操作直接使用 `const db = require('../database')` 的同步 API
   - 以 `db.prepare(...).get()` / `.all()` / `.run()` 執行查詢

3. **加上 JSDoc / OpenAPI 註解**：每個路由需加 `@openapi` JSDoc 區塊（供 `generate-openapi.js` 解析）：

```javascript
/**
 * @openapi
 * /api/resource:
 *   post:
 *     summary: 動作描述
 *     tags: [TagName]
 *     security:
 *       - bearerAuth: []    # 需 JWT 時加此行
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fieldA]
 *             properties:
 *               fieldA:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功
 */
router.post('/', authMiddleware, (req, res) => {
  // ...
  res.json({ data: ..., error: null, message: '成功' });
});
```

4. **套用 Middleware**：
   - 僅需認證（任何登入使用者）：`authMiddleware`
   - 需管理員：`authMiddleware, adminMiddleware`（順序不可顛倒）
   - 需雙模式（購物車類）：`dualAuth`（已在 `cartRoutes.js` 中定義，不適合搬到其他路由）

5. **若是新資源，在 `app.js` 掛載路由**：

```javascript
app.use('/api/resource', require('./src/routes/resourceRoutes'));
```

6. **更新 API 路由總覽表**（`docs/ARCHITECTURE.md` 的 API 路由總覽章節）

## 新增 Middleware 的步驟

1. 建立 `src/middleware/<name>Middleware.js`
2. 實作 `function <name>Middleware(req, res, next) { ... }`
3. `module.exports = <name>Middleware`
4. 在需要的路由或 `app.js` 中 `require` 並套用

## 新增資料庫表格的步驟

1. 在 `src/database.js` 的 `db.exec()` 區塊中加入 `CREATE TABLE IF NOT EXISTS ...`
2. 若需要 seed data，新增對應的 `seed<TableName>()` 函式並在 `initializeDatabase()` 中呼叫
3. **注意**：目前無 migration 機制，修改現有表結構需手動刪除 `database.sqlite` 重新初始化（會清除所有資料）
4. 更新 `docs/ARCHITECTURE.md` 的 Schema 表

## 統一回應格式規範

所有 API 回應必須符合：

```javascript
// 成功
res.json({ data: <payload>, error: null, message: '說明文字' });
res.status(201).json({ data: <payload>, error: null, message: '建立成功' });

// 失敗
res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: '具體說明' });
res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: '請先登入' });
res.status(403).json({ data: null, error: 'FORBIDDEN', message: '權限不足' });
res.status(404).json({ data: null, error: 'NOT_FOUND', message: '資源不存在' });
res.status(409).json({ data: null, error: 'CONFLICT', message: '衝突說明' });
```

錯誤碼（`error` 欄位）只在成功時為 `null`，失敗時永遠有值且為大寫底線格式。

## JSDoc 格式說明

本專案使用 JSDoc 風格的 `@openapi` 標籤（與一般 JSDoc 文件標籤不同，這是 swagger-jsdoc 的特定語法）。

- `tags` 用於 Swagger UI 分組，現有 tags：`Auth`、`Products`、`Cart`、`Orders`、`Admin Products`、`Admin Orders`
- `security` 可引用 `swagger-config.js` 中定義的 scheme：`bearerAuth`（JWT）或 `sessionId`（X-Session-Id）
- 不需要在每個檔案頭部加 `@openapi tags` 定義，因為 swagger-jsdoc 會自動從路由的 `tags` 欄位收集

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`（範例：`2026-05-21-cart-merge.md`）
2. 新計畫存放於 `docs/plans/`
3. 計畫文件建議結構：

```markdown
# 功能名稱計畫

## User Story
作為 <角色>，我希望 <功能>，以便 <價值>。

## Spec（規格）
- 業務規則 1
- 業務規則 2

## Tasks
- [ ] 實作 X
- [ ] 撰寫測試
- [ ] 更新文件
```

4. 功能完成後：將計畫檔案移至 `docs/plans/archive/`
5. 同步更新 `docs/FEATURES.md`（功能完成狀態）與 `docs/CHANGELOG.md`（版本記錄）

## 前端 JavaScript 架構

前端 JS 分層：

- `public/js/api.js`：封裝 `fetch`，自動附加 `Authorization` 或 `X-Session-Id` 標頭，統一處理 API 錯誤
- `public/js/auth.js`：從 `localStorage` 讀寫 JWT token
- `public/js/notification.js`：操作通知 UI 元件（成功 / 錯誤提示）
- `public/js/header-init.js`：初始化導覽列（登入狀態、購物車數量 badge）
- `public/js/pages/*.js`：各頁面業務邏輯，由 EJS layout 的 `pageScript` 變數決定載入哪個

新增頁面時需：
1. 建立 `views/pages/<page>.ejs`
2. 建立 `public/js/pages/<page-name>.js`（kebab-case）
3. 在 `pageRoutes.js` 加入路由，`pageScript` 傳入對應的 JS 檔名（不含 `.js` 副檔名）
