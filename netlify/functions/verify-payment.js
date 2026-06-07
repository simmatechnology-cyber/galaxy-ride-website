/**
 * Netlify Function: verify-payment
 * Verifies Razorpay HMAC signature to prevent payment tampering.
 * Uses timing-safe comparison to prevent timing attacks.
 * POST /api/verify-payment
 */

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Missing fields: razorpay_order_id, razorpay_payment_id, razorpay_signature' }),
    };
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    console.error('[verify-payment] RAZORPAY_KEY_SECRET not set');
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const payload     = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected    = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
    const sigBuffer   = Buffer.from(razorpay_signature, 'hex');
    const expBuffer   = Buffer.from(expected, 'hex');

    // Timing-safe comparison prevents brute-force signature attacks
    const verified = sigBuffer.length === expBuffer.length &&
                     crypto.timingSafeEqual(sigBuffer, expBuffer);

    if (!verified) {
      console.warn('[verify-payment] Signature mismatch for order:', razorpay_order_id);
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ verified, paymentId: razorpay_payment_id }),
    };
  } catch (err) {
    console.error('[verify-payment] Error:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Verification failed', details: err.message }),
    };
  }
};
