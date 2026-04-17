const { Router } = require('express');
const PaymentModel = require('../models/paymentModel');
const { kafka } = require('shared');
const { KAFKA_TOPICS, ERROR_CODES } = require('shared/constants');
const { AppError } = require('shared/middlewares/errorHandler');

const router = Router();

// ─── TC14: Danh sách payment method hợp lệ ──────────────────
const VALID_PAYMENT_METHODS = ['CREDIT_CARD', 'WALLET', 'CASH'];

// Xử lý thanh toán qua Payment Gateway
async function processPayment(amount, paymentMethod) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (paymentMethod === 'invalid_card') {
        return reject(new Error('Invalid payment method'));
      }
      if (amount <= 0) {
        return reject(new Error('Invalid amount: must be greater than 0'));
      }
      resolve({ success: true, transactionId: 'TXN_' + Date.now() });
    }, 500);
  });
}

// ─── POST /api/internal/payments ──────────────────────────
router.post('/payments', async (req, res, next) => {
  try {
    const { bookingId, customerId, amount, paymentMethod, simulate_payment_fail } = req.body;

    if (!bookingId || !customerId || amount == null || !paymentMethod) {
      throw new AppError(
        'bookingId, customerId, amount, paymentMethod are required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // TC14: Validate payment method
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method',
      });
    }

    // ─── TC33/TC36/TC37: Simulate payment failure (Saga trigger) ──
    if (simulate_payment_fail) {
      console.log(`[Payment] ❌ SIMULATED PAYMENT FAILURE for booking ${bookingId}`);

      // Publish payment_failed → Booking consumer will CANCEL the booking (Saga Compensation)
      try {
        await kafka.publishEvent(KAFKA_TOPICS.PAYMENT_FAILED, {
          bookingId,
          customerId,
          amount,
          reason: 'Payment declined (simulated)',
          timestamp: new Date().toISOString(),
        });
        console.log(`[Payment] Published payment.failed for booking ${bookingId}`);
      } catch (err) {
        console.error('[Payment] Failed to publish payment.failed:', err.message);
      }

      return res.status(400).json({
        success: false,
        message: 'Payment declined',
        bookingId,
      });
    }

    // 1. Lưu Payment PENDING
    let payment = await PaymentModel.createPayment({
      bookingId,
      customerId,
      amount,
      currency: 'VND',
      paymentMethod,
      status: 'PENDING',
    });

    console.log(`[Payment] Processing payment for booking ${bookingId} (${amount} VND)...`);

    // 2. Cổng Thanh Toán
    try {
      await processPayment(amount, paymentMethod);

      // Cập nhật status = SUCCESS
      const { pool } = require('../db/index');
      const { rows } = await pool.query(
        "UPDATE payments SET status = 'SUCCESS' WHERE id = $1 RETURNING *",
        [payment.id]
      );
      payment = rows[0];

      console.log(`[Payment] Payment SUCCESS for booking ${bookingId}`);

      // 3. Publish kafka event PAYMENT_COMPLETED
      await kafka.publishEvent(KAFKA_TOPICS.PAYMENT_COMPLETED, {
        bookingId: payment.booking_id,
        customerId: payment.customer_id,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      });

      res.status(201).json({
        id: payment.id,
        bookingId: payment.booking_id,
        status: payment.status,
        amount: parseFloat(payment.amount),
      });

    } catch (err) {
      console.error(`[Payment] Payment FAILED for booking ${bookingId}:`, err.message);

      const { pool } = require('../db/index');
      await pool.query(
        "UPDATE payments SET status = 'FAILED' WHERE id = $1",
        [payment.id]
      );

      // Publish payment_failed (Saga)
      await kafka.publishEvent(KAFKA_TOPICS.PAYMENT_FAILED, {
        bookingId,
        customerId,
        amount,
        reason: err.message,
      });

      throw new AppError('Payment processing failed: ' + err.message, 402, 'PAYMENT_FAILED');
    }

  } catch (err) {
    next(err);
  }
});

// ─── TC17: POST /api/internal/payment/fraud — Fraud Detection ─
router.post('/payment/fraud', (req, res) => {
  const { user_id, driver_id, booking_id, amount } = req.body;

  if (!user_id || !driver_id || !booking_id || amount == null) {
    return res.status(400).json({
      success: false,
      message: 'missing required fields',
    });
  }

  const isFraud = parseFloat(amount) > 10000000;
  const riskScore = isFraud ? 0.95 : 0.05;

  res.json({
    success: true,
    fraud_detected: isFraud,
    risk_score: riskScore,
    user_id,
    driver_id,
    booking_id,
    amount: parseFloat(amount),
    checked_at: new Date().toISOString(),
  });
});

// ─── Health Check ────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'payment-service', timestamp: new Date().toISOString() });
});

module.exports = router;
