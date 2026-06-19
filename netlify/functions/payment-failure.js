/**
 * Netlify Function: payment-failure
 * Logs a failed Razorpay payment attempt: persists Payment ID, Order ID,
 * Failure Code and Failure Reason to Firestore, and (where possible) looks
 * up the actual payment method via the Razorpay Payments API so we can
 * give the customer an accurate, method-specific message — e.g. wallet
 * failures should suggest UPI / Net Banking instead of a generic retry.
 *
 * POST /api/payment-failure
 */

const Razorpay = require('razorpay');
const { admin, db } = require('./_firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const GENERIC_MESSAGE =
  'Your payment could not be completed. Please try again, or use Cash, WhatsApp or Call to book instead.';
const WALLET_MESSAGE =
  'Please use a UPI-linked bank account or Net Banking.';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    orderId   = '',
    paymentId = '',
    code      = '',
    description = '',
    reason    = '',
    source    = '',
    step      = '',
    userId    = '',
    vehicle   = '',
    pickup    = '',
    drop      = '',
    fare      = null,
  } = body;

  if (!orderId) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing required field: orderId' }) };
  }

  console.error('[payment-failure] ✗ Payment failed', {
    orderId, paymentId, code, description, reason, source, step,
  });

  // ── Try to fetch the actual payment method from Razorpay (best-effort) ────
  // Razorpay keeps failed payment attempts fetchable via the Payments API,
  // which tells us the real method (wallet / upi / netbanking / card) rather
  // than guessing from the error text — this is what drives the
  // wallet-specific customer message.
  let method = null;
  let walletName = null;
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (paymentId && keyId && keySecret) {
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const payment  = await razorpay.payments.fetch(paymentId);
      method     = payment.method || null;
      walletName = payment.wallet || null;
      console.log('[payment-failure] Fetched payment method:', method, walletName || '');
    } catch (fetchErr) {
      console.warn('[payment-failure] Could not fetch payment details:', fetchErr.message);
    }
  }

  const isWalletFailure =
    method === 'wallet' ||
    /wallet/i.test(description) ||
    /wallet/i.test(reason);

  const customerMessage = isWalletFailure ? WALLET_MESSAGE : GENERIC_MESSAGE;

  // ── Persist to Firestore (append-only failure log) ─────────────────────────
  if (db) {
    try {
      await db.collection('payment_failures').add({
        orderId,
        paymentId:   paymentId || null,
        code:        code || null,
        description: description || null,
        reason:      reason || null,
        source:      source || null,
        step:        step || null,
        method:      method || null,
        wallet:      walletName || null,
        userId:      userId || null,
        vehicle:     vehicle || null,
        pickup:      pickup || null,
        drop:        drop || null,
        fare:        fare !== null ? Number(fare) : null,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('[payment-failure] ✓ Logged to Firestore payment_failures');
    } catch (dbErr) {
      // Logging failure must never block the customer-facing failure UI
      console.error('[payment-failure] ✗ Firestore write failed:', dbErr.message);
    }
  } else {
    console.error('[payment-failure] Firebase Admin not initialized — failure NOT persisted to DB');
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      logged: true,
      isWalletFailure,
      customerMessage,
      method,
    }),
  };
};
