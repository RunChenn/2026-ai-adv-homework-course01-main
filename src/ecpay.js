const crypto = require('crypto');
const https = require('https');
const qs = require('querystring');

const STAGE_CHECKOUT_URL = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
const PROD_CHECKOUT_URL  = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
const STAGE_QUERY_URL    = 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5';
const PROD_QUERY_URL     = 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

function isProduction() {
  return process.env.ECPAY_ENV === 'production';
}

/**
 * ECPay 專用 URL encode（對應 .NET HttpUtility.UrlEncode 行為）
 * 差異：空格→+；! ~ * ' ( ) 需額外編碼；所有 %XX 為小寫
 */
function ecpayUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/[!~*'()]/g, c => '%' + c.charCodeAt(0).toString(16))
    .toLowerCase();
}

/**
 * 產生 CheckMacValue（SHA256）
 * 計算流程：排序參數 → 組字串 → ecpayUrlEncode → lowercase → SHA256 → uppercase
 */
function generateCheckMacValue(params, hashKey, hashIv) {
  const sorted = Object.keys(params)
    .filter(k => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k}=${params[k]}`)
    .join('&');

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw).toLowerCase();

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

/**
 * 驗證 CheckMacValue（timing-safe，防 timing attack）
 */
function verifyCheckMacValue(params, hashKey, hashIv) {
  const expected = generateCheckMacValue(params, hashKey, hashIv);
  const actual   = (params.CheckMacValue || '').toUpperCase();
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

/**
 * 取得台灣時間字串（UTC+8），格式 yyyy/MM/dd HH:mm:ss
 * ECPay MerchantTradeDate 欄位使用
 */
function getTaiwanDateString() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const yyyy = now.getUTCFullYear();
  const MM   = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(now.getUTCDate()).padStart(2, '0');
  const HH   = String(now.getUTCHours()).padStart(2, '0');
  const mm   = String(now.getUTCMinutes()).padStart(2, '0');
  const ss   = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
}

/**
 * 產生 ECPay 自動送出的 HTML form
 * CheckMacValue 在此計算並加入 hidden input
 */
function generateEcpayForm(params, actionUrl) {
  const allParams = { ...params };
  allParams.CheckMacValue = generateCheckMacValue(
    allParams,
    process.env.ECPAY_HASH_KEY,
    process.env.ECPAY_HASH_IV
  );

  const inputs = Object.entries(allParams)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}">`)
    .join('\n');

  return `<!DOCTYPE html><html><body>
<form id="ecpay-form" action="${escapeHtml(actionUrl)}" method="POST">
${inputs}
</form>
<script>document.getElementById('ecpay-form').submit();</script>
</body></html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 呼叫 ECPay QueryTradeInfo/V5 查詢交易狀態
 * @param {string} merchantTradeNo — MerchantTradeNo（20 字元以內）
 * @returns {Promise<object>} 解析後的回應物件（含 TradeStatus、RtnCode 等）
 */
function queryTradeInfo(merchantTradeNo) {
  return new Promise((resolve, reject) => {
    const params = {
      MerchantID:      process.env.ECPAY_MERCHANT_ID,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp:       Math.floor(Date.now() / 1000).toString(),
    };
    params.CheckMacValue = generateCheckMacValue(
      params,
      process.env.ECPAY_HASH_KEY,
      process.env.ECPAY_HASH_IV
    );

    const body = qs.stringify(params);
    const queryUrl = new URL(isProduction() ? PROD_QUERY_URL : STAGE_QUERY_URL);

    const options = {
      hostname: queryUrl.hostname,
      path:     queryUrl.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(qs.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  getTaiwanDateString,
  generateEcpayForm,
  queryTradeInfo,
  STAGE_CHECKOUT_URL,
  PROD_CHECKOUT_URL,
  isProduction,
};
