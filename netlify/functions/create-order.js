/**
 * Netlify Function: create-order
 * Creates a Razorpay order for payment processing.
 * POST /api/create-order
 */

const Razorpay = require('razorpay');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // ── Credentials come from env vars ONLY (never hardcoded) ─────────────────
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error('[create-order] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Payment is not configured. Please contact support.' }),
    };
  }

  const isLive = keyId.startsWith('rzp_live_');
  console.log(`[create-order] mode: ${isLive ? 'LIVE' : 'TEST'} | key: ${keyId.slice(0, 12)}…`);

  // Lazy-init inside the handler so a missing key returns a clean 500
  // instead of crashing the function at load time.
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  try {
    const { amount, currency = 'INR', notes = {} } = JSON.parse(event.body || '{}');

    if (!amount || amount < 100) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid amount. Minimum ₹1.' }),
      };
    }

    const order = await razorpay.orders.create({
      amount:   Math.round(amount), // in paise
      currency,
      notes,
      receipt:  `GR_${Date.now()}`,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        id:       order.id,
        amount:   order.amount,
        currency: order.currency,
        receipt:  order.receipt,
        // Publishable key_id — safe to send to the browser. The frontend uses
        // this so the checkout key is never hardcoded in client code.
        key:      keyId,
      }),
    };
  } catch (err) {
    console.error('create-order error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to create order', details: err.message }),
    };
  }
};
