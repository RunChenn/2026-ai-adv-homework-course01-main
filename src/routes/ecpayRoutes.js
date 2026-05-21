const express = require('express');
const db = require('../database');
const { queryTradeInfo, verifyCheckMacValue } = require('../ecpay');

const router = express.Router();

/**
 * OrderResultURL — ECPay 付款完成後將瀏覽器 POST 到此端點。
 * 由於本地端無法接受 ECPay 的 ReturnURL（Server Notify），
 * 付款結果改由此端點主動呼叫 QueryTradeInfo/V5 向 ECPay 確認，以 TradeStatus 為準。
 */
router.post('/return', async (req, res) => {
  const { MerchantTradeNo } = req.body;

  if (!MerchantTradeNo) {
    return res.redirect('/');
  }

  try {
    const tradeInfo = await queryTradeInfo(MerchantTradeNo);
    const order = db.prepare('SELECT id, status FROM orders WHERE ecpay_trade_no = ?').get(MerchantTradeNo);

    if (!order) {
      console.error('ECPay return: order not found for MerchantTradeNo', MerchantTradeNo);
      return res.redirect('/');
    }

    // TradeStatus: '1' = 付款成功，其他為失敗
    const paid = tradeInfo.TradeStatus === '1';
    const newStatus = paid ? 'paid' : 'failed';

    // 僅允許從 pending 狀態更新（防止重複 notify 覆蓋）
    if (order.status === 'pending') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, order.id);
    }

    const paymentResult = paid ? 'success' : 'failed';
    res.redirect(`/orders/${order.id}?payment=${paymentResult}`);
  } catch (err) {
    console.error('ECPay return error:', err.message);
    res.redirect('/');
  }
});

/**
 * ReturnURL — ECPay Server Notify（本地端無法接收，但仍完整實作）
 * ECPay 要求回應 '1|OK' 表示接收成功。
 */
router.post('/notify', (req, res) => {
  const isValid = verifyCheckMacValue(
    req.body,
    process.env.ECPAY_HASH_KEY,
    process.env.ECPAY_HASH_IV
  );

  if (!isValid) {
    return res.status(200).send('0|ErrorMessage');
  }

  const { MerchantTradeNo, RtnCode } = req.body;
  const order = db.prepare('SELECT id, status FROM orders WHERE ecpay_trade_no = ?').get(MerchantTradeNo);

  if (order && order.status === 'pending') {
    const newStatus = RtnCode === '1' ? 'paid' : 'failed';
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, order.id);
  }

  res.status(200).send('1|OK');
});

module.exports = router;
